import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  AppState,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {ToolSheet} from '../tools';
import {useTheme} from '../../contexts/ThemeContext';
import {Fonts, FontSize, Spacing} from '../../theme';
import {localSettingsStore} from '../../../storage/localSettingsStore';
import {
  UNAVAILABLE_STATUS,
  floatingAssistantNative,
} from '../../../utils/floatingAssistantNative';
import type {FloatingAssistantStatus} from '../../../utils/floatingAssistantNative';
import {FloatingOrbAppearance} from './FloatingOrbAppearance';

const SETTING_KEY = 'floatingAssistant.enabled';

/**
 * Some phones report a newly granted overlay permission a moment late, so the
 * status is read again shortly after returning from Android settings.
 */
export const FLOATING_SECOND_READ_MS = 700;

export const FLOATING_COPY = {
  notGranted:
    'Permission not granted. Floating LAFINA stays off. You can turn it on again any time.',
  unavailable: 'Floating LAFINA is not available on this phone.',
  notificationsOff:
    'Notifications are off for LAFINA. Turn them on to get the Open and Hide buttons in the notification.',
  saveFailed: 'The setting could not be saved. Try again.',
  settingsUnavailable:
    'Android settings could not be opened. Find LAFINA under Settings → Apps → Display over other apps.',
  positionReset: 'The button will appear at its starting place.',
} as const;

/** The student's own Floating LAFINA choice on this phone (off by default). */
export const floatingAssistantSetting = {
  isEnabled(userId: string): boolean {
    try {
      return localSettingsStore.get(userId, SETTING_KEY, 'false') === 'true';
    } catch {
      return false;
    }
  },
  setEnabled(userId: string, enabled: boolean): boolean {
    return localSettingsStore.set(
      userId,
      SETTING_KEY,
      enabled ? 'true' : 'false',
    );
  },
};

/** One line for the Profile row (UX `03` §10.2 status values). */
export const floatingAssistantSummary = (
  userId: string,
  status: FloatingAssistantStatus | null,
): string => {
  if (status && !status.supported) return 'Not available on this device';
  if (!floatingAssistantSetting.isEnabled(userId)) return 'Off';
  if (status && !status.overlayGranted) return 'Permission needed';
  if (status?.hiddenUntilAppOpen) return 'Hidden until you open LAFINA';
  return 'On';
};

/**
 * The Profile row's value, kept current: read on mount, when LAFINA returns
 * to the front, and when the sheet reports a change.
 */
export const useFloatingAssistantSummary = (
  userId: string,
): {summary: string; refresh: () => void} => {
  const [summary, setSummary] = useState(() =>
    floatingAssistantSummary(userId, null),
  );
  const mounted = useRef(true);
  const refresh = useCallback(() => {
    void floatingAssistantNative.getStatus().then(status => {
      if (mounted.current) {
        setSummary(
          floatingAssistantSummary(
            userId,
            floatingAssistantNative.isAvailable() ? status : null,
          ),
        );
      }
    });
  }, [userId]);
  useEffect(() => {
    mounted.current = true;
    refresh();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') refresh();
    });
    return () => {
      mounted.current = false;
      subscription.remove();
    };
  }, [refresh]);
  return {summary, refresh};
};

interface FloatingAssistantSettingsProps {
  userId: string;
  visible: boolean;
  onClose: () => void;
  onChanged?: () => void;
}

/**
 * Profile → Floating LAFINA (ADR-036, UX `03` §10): the switch, the
 * explainer shown before Android's overlay permission page every time the
 * permission is missing, the status, Reset button position and help. Never
 * asks for anything by itself.
 */
export const FloatingAssistantSettings: React.FC<
  FloatingAssistantSettingsProps
> = ({userId, visible, onClose, onChanged}) => {
  const {colors} = useTheme();
  const [enabled, setEnabledState] = useState(() =>
    floatingAssistantSetting.isEnabled(userId),
  );
  const [status, setStatus] =
    useState<FloatingAssistantStatus>(UNAVAILABLE_STATUS);
  const [statusKnown, setStatusKnown] = useState(false);
  const [explainer, setExplainer] = useState(false);
  const [notice, setNotice] = useState('');
  const [info, setInfo] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  /** Set when the student went to Android settings from the explainer. */
  const awaitingPermission = useRef(false);
  const secondRead = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (secondRead.current) clearTimeout(secondRead.current);
    };
  }, []);

  const turnOn = useCallback(async () => {
    if (!floatingAssistantSetting.setEnabled(userId, true)) {
      setNotice(FLOATING_COPY.saveFailed);
      return;
    }
    setEnabledState(true);
    setExplainer(false);
    setNotice('');
    const nextStatus = await floatingAssistantNative.setEnabled(true, userId);
    if (!mounted.current) return;
    setStatus(nextStatus);
    setStatusKnown(true);
    onChanged?.();
  }, [userId, onChanged]);

  const read = useCallback(async (): Promise<FloatingAssistantStatus> => {
    const next = await floatingAssistantNative.getStatus();
    if (mounted.current) {
      setStatus(next);
      setStatusKnown(true);
      setEnabledState(floatingAssistantSetting.isEnabled(userId));
    }
    return next;
  }, [userId]);

  const refresh = useCallback(async () => {
    const first = await read();
    if (!awaitingPermission.current) return;
    if (first.overlayGranted) {
      awaitingPermission.current = false;
      await turnOn();
      return;
    }
    // Returned from Android settings: read once more before deciding.
    if (secondRead.current) clearTimeout(secondRead.current);
    secondRead.current = setTimeout(() => {
      secondRead.current = null;
      void read().then(async second => {
        if (!awaitingPermission.current || !mounted.current) return;
        awaitingPermission.current = false;
        if (second.overlayGranted) {
          await turnOn();
        } else {
          setExplainer(false);
          // The switch and the message agree: without the grant it is off
          // (also when the student came here to fix a revoked permission).
          if (floatingAssistantSetting.isEnabled(userId)) {
            floatingAssistantSetting.setEnabled(userId, false);
            setEnabledState(false);
            const stopped = await floatingAssistantNative.setEnabled(
              false,
              userId,
            );
            if (mounted.current) setStatus(stopped);
            onChanged?.();
          }
          if (mounted.current) setNotice(FLOATING_COPY.notGranted);
        }
      });
    }, FLOATING_SECOND_READ_MS);
  }, [read, turnOn, userId, onChanged]);

  useEffect(() => {
    if (!visible) {
      setExplainer(false);
      setHelpOpen(false);
      setInfo('');
      awaitingPermission.current = false;
      return undefined;
    }
    void read();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void refresh();
    });
    return () => subscription.remove();
  }, [visible, read, refresh]);

  const toggle = async (next: boolean) => {
    setNotice('');
    setInfo('');
    if (!next) {
      if (!floatingAssistantSetting.setEnabled(userId, false)) {
        setNotice(FLOATING_COPY.saveFailed);
        return;
      }
      setEnabledState(false);
      setExplainer(false);
      awaitingPermission.current = false;
      setStatus(await floatingAssistantNative.setEnabled(false, userId));
      onChanged?.();
      return;
    }
    const current = await floatingAssistantNative.getStatus();
    setStatus(current);
    setStatusKnown(true);
    if (!floatingAssistantNative.isAvailable() || !current.supported) {
      setNotice(FLOATING_COPY.unavailable);
      return;
    }
    if (!current.overlayGranted) {
      // The explainer always comes before Android's permission page.
      setExplainer(true);
      return;
    }
    await turnOn();
  };

  const openPermission = async () => {
    awaitingPermission.current = true;
    const opened = await floatingAssistantNative.openOverlaySettings();
    if (!opened) {
      awaitingPermission.current = false;
      setNotice(FLOATING_COPY.settingsUnavailable);
    }
  };

  const resetPosition = async () => {
    await floatingAssistantNative.resetOrbPosition();
    setInfo(FLOATING_COPY.positionReset);
  };

  const unsupported = statusKnown && !status.supported;
  const statusLine = unsupported
    ? 'Not available on this device.'
    : !enabled
    ? 'Off.'
    : !statusKnown
    ? 'On.'
    : !status.overlayGranted
    ? 'Permission needed: allow "Display over other apps" for LAFINA.'
    : status.hiddenUntilAppOpen
    ? 'Hidden until you open LAFINA.'
    : 'On. The button appears when you leave LAFINA.';

  return (
    <ToolSheet visible={visible} title="Floating LAFINA" onClose={onClose}>
      <Text style={[styles.note, {color: colors.textSecondary}]}>
        A small LAFINA button that stays on screen so you can add schedules,
        reminders and notes from any app. Nothing is saved until you tap
        Confirm.
      </Text>

      <View style={styles.switchRow}>
        <Text style={[styles.label, {color: colors.textPrimary}]}>
          Show floating button
        </Text>
        <Switch
          value={enabled}
          onValueChange={next => void toggle(next)}
          disabled={unsupported && !enabled}
          accessibilityLabel="Show floating button"
          testID="floating-enabled-switch"
          trackColor={{false: colors.switchTrackOff, true: colors.red}}
          thumbColor={colors.switchThumb}
        />
      </View>

      <Text
        style={[styles.status, {color: colors.textPrimary}]}
        testID="floating-status"
      >
        {statusLine}
      </Text>

      {enabled &&
      statusKnown &&
      !unsupported &&
      !status.overlayGranted &&
      !explainer ? (
        <TouchableOpacity
          onPress={() => {
            setNotice('');
            setExplainer(true);
          }}
          accessibilityRole="button"
          accessibilityLabel="Allow Display over other apps"
          testID="floating-fix-permission"
          style={styles.textButton}
        >
          <Text style={[styles.textButtonLabel, {color: colors.primary}]}>
            Allow
          </Text>
        </TouchableOpacity>
      ) : null}

      {explainer ? (
        <View
          style={[styles.box, {borderColor: colors.border}]}
          testID="floating-explainer"
        >
          <Text style={[styles.boxTitle, {color: colors.textPrimary}]}>
            Allow LAFINA to appear on top
          </Text>
          <Text style={[styles.note, {color: colors.textSecondary}]}>
            Why: to keep the LAFINA button visible over your other apps.
          </Text>
          <Text style={[styles.note, {color: colors.textSecondary}]}>
            What it does not do: read your screen, listen, or track your other
            apps.
          </Text>
          <Text style={[styles.note, {color: colors.textSecondary}]}>
            Next: Android opens a list. Find LAFINA and turn it on, then come
            back.
          </Text>
          <View style={styles.actions}>
            <TouchableOpacity
              onPress={() => setExplainer(false)}
              accessibilityRole="button"
              testID="floating-explainer-cancel"
              style={styles.textButton}
            >
              <Text
                style={[styles.textButtonLabel, {color: colors.textSecondary}]}
              >
                Not now
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => void openPermission()}
              accessibilityRole="button"
              testID="floating-explainer-continue"
              style={styles.textButton}
            >
              <Text style={[styles.textButtonLabel, {color: colors.primary}]}>
                Continue
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {notice ? (
        <Text
          style={[styles.notice, {color: colors.error}]}
          testID="floating-notice"
          accessibilityLiveRegion="polite"
        >
          {notice}
        </Text>
      ) : null}

      {statusKnown && !unsupported && !status.notificationsGranted ? (
        <Text
          style={[styles.notice, {color: colors.warning}]}
          testID="floating-notifications-off"
        >
          {FLOATING_COPY.notificationsOff}
        </Text>
      ) : null}

      <Text style={[styles.sectionTitle, {color: colors.textSecondary}]}>
        When on
      </Text>
      <Text style={[styles.note, {color: colors.textSecondary}]}>
        {'• LAFINA shows a notification while the button is on.\n' +
          '• The button never listens and never reads your screen.\n' +
          '• Drag it to the X to hide it until you next open LAFINA (for the edge bar, press and hold first).\n' +
          '• Some screens, such as Android settings, permission prompts and banking apps, hide floating buttons.'}
      </Text>

      {unsupported ? null : <FloatingOrbAppearance visible={visible} />}

      <TouchableOpacity
        onPress={() => void resetPosition()}
        accessibilityRole="button"
        testID="floating-reset-position"
        style={styles.row}
      >
        <Text style={[styles.label, {color: colors.textPrimary}]}>
          Reset button position
        </Text>
        <Text style={{color: colors.textSecondary}}>›</Text>
      </TouchableOpacity>
      {info ? (
        <Text
          style={[styles.note, {color: colors.textSecondary}]}
          testID="floating-info"
        >
          {info}
        </Text>
      ) : null}

      <TouchableOpacity
        onPress={() => setHelpOpen(open => !open)}
        accessibilityRole="button"
        accessibilityState={{expanded: helpOpen}}
        testID="floating-help-toggle"
        style={styles.row}
      >
        <Text style={[styles.label, {color: colors.textPrimary}]}>
          Trouble seeing the button?
        </Text>
        <Text style={{color: colors.textSecondary}}>
          {helpOpen ? '⌄' : '›'}
        </Text>
      </TouchableOpacity>
      {helpOpen ? (
        <View testID="floating-help">
          <Text style={[styles.note, {color: colors.textSecondary}]}>
            {'• The button shows only after you leave LAFINA, and not on the lock screen.\n' +
              '• If you hid it, open LAFINA once and it comes back.\n' +
              '• If notifications are off, the Open and Hide buttons in the notification are missing.\n' +
              '• Battery savers can stop apps in the background. If the button disappears on its own, allow LAFINA to run in the background in your phone’s battery settings.'}
          </Text>
          {status.launchBlockedSeen ? (
            <Text
              style={[styles.note, {color: colors.textSecondary}]}
              testID="floating-help-blocked"
            >
              Your phone blocked Quick Chat from opening. Tap Open in the LAFINA
              notification, or allow pop-ups for LAFINA in your phone's
              settings.
            </Text>
          ) : null}
          <TouchableOpacity
            onPress={() =>
              void floatingAssistantNative.openAppDetailsSettings()
            }
            accessibilityRole="button"
            testID="floating-open-app-settings"
            style={styles.textButton}
          >
            <Text style={[styles.textButtonLabel, {color: colors.primary}]}>
              Open app settings
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </ToolSheet>
  );
};

const styles = StyleSheet.create({
  note: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    lineHeight: 18,
    marginBottom: Spacing.sm,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: Spacing.sm,
  },
  row: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
    flex: 1,
  },
  sectionTitle: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.small,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  box: {
    borderWidth: 1,
    borderRadius: 12,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  boxTitle: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.body,
    marginBottom: Spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  textButton: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  textButtonLabel: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.body,
  },
  status: {
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
    marginBottom: Spacing.md,
  },
  notice: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    marginBottom: Spacing.sm,
  },
});
