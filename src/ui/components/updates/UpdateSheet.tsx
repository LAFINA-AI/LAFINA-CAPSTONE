import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Fonts, FontSize, Layout, Spacing, useThemedStyles } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import type { ThemeColors } from '../../contexts/ThemeContext';
import type { UpdateService, UpdateState } from '../../../updates';
import type { NetworkKind, WhatsNew } from '../../../updates/updatePrompt';
import { ReleaseNotes } from './ReleaseNotes';

export type UpdateSheetMode =
  | { mode: 'update' }
  | { mode: 'whats-new'; whatsNew: WhatsNew };

interface UpdateSheetProps {
  visible: boolean;
  sheet: UpdateSheetMode;
  service: UpdateService;
  state: UpdateState;
  network: NetworkKind | null;
  /** Closed without updating; `later` when the person chose to be reminded later. */
  onClose: (later: boolean) => void;
  /** Called just before the app restarts or Android installs, to keep the notes. */
  onApplying: (state: UpdateState) => void;
}

const megabytes = (bytes: number | null): string =>
  bytes ? `${Math.max(1, Math.round(bytes / 1024 / 1024))} MB` : '';

/** "LAFINA v1.1.0 — In-app updates" → "In-app updates". */
export const releaseSubtitle = (title: string | null, version: string | null): string | null => {
  if (!title) return null;
  let stripped = title.trim().replace(/^LAFINA\s+/i, '');
  if (version) {
    for (const prefix of [`v${version}`, version]) {
      if (stripped.startsWith(prefix)) {
        stripped = stripped.slice(prefix.length).replace(/^\s*[:—–-]?\s*/, '');
        break;
      }
    }
  }
  return stripped || null;
};

interface Action {
  label: string;
  onPress: () => void;
  testID: string;
}

export const UpdateSheet: React.FC<UpdateSheetProps> = ({
  visible,
  sheet,
  service,
  state,
  network,
  onClose,
  onApplying,
}) => {
  const { colors } = useTheme();
  const themed = useThemedStyles(getThemedStyles);
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [needsPermission, setNeedsPermission] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /** The person tapped "Update now": carry on to restart/install when the download ends. */
  const continueAfterDownload = useRef(false);

  useEffect(() => {
    if (!visible) {
      setNeedsPermission(false);
      setNotice(null);
      continueAfterDownload.current = false;
    }
  }, [visible]);

  const install = async (): Promise<void> => {
    setNotice(null);
    onApplying(service.getState());
    const outcome = await service.install();
    if (outcome === 'needs-permission') setNeedsPermission(true);
    else if (outcome === 'installing') setNeedsPermission(false);
  };

  const restart = async (): Promise<void> => {
    onApplying(service.getState());
    const after = await service.restart();
    if (after.message) setNotice(after.message);
  };

  // Download finished while the sheet is open after "Update now": go on.
  useEffect(() => {
    if (!visible || state.phase !== 'ready' || !continueAfterDownload.current) return;
    continueAfterDownload.current = false;
    if (state.kind === 'apk') void install();
    else void restart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, state.phase, state.kind]);

  // Back from Android's "Install unknown apps" setting: install if it is now allowed.
  useEffect(() => {
    if (!visible || !needsPermission) return;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      void service.canInstallApks().then((allowed) => {
        if (allowed) void install();
      });
    });
    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, needsPermission, service]);

  const close = (later: boolean) => () => onClose(later);

  const updateNow = (): void => {
    continueAfterDownload.current = true;
    void service.download();
  };

  let badge = '';
  let heading = '';
  let body: React.ReactNode = null;
  let primary: Action | null = null;
  let secondary: Action | null = null;
  let notes: string | null = null;
  let busy = false;

  if (sheet.mode === 'whats-new') {
    badge = "What's new";
    heading = `LAFINA ${sheet.whatsNew.version} is installed`;
    notes = sheet.whatsNew.notes;
    primary = { label: 'Got it', onPress: close(false), testID: 'update-sheet-done' };
  } else {
    const version = state.version ? `LAFINA ${state.version}` : 'LAFINA';
    const onMobileData = network !== null && network.connected && !network.unmetered;
    notes = state.notes;

    switch (state.phase) {
      case 'checking':
      case 'idle':
        badge = 'Updates';
        heading = 'Checking for updates…';
        busy = true;
        notes = null;
        secondary = { label: 'Close', onPress: close(false), testID: 'update-sheet-close' };
        break;
      case 'up-to-date':
        badge = 'Updates';
        heading = "You're up to date";
        body = (
          <Text style={[styles.body, themed.muted]}>
            {state.message ?? `LAFINA ${state.currentVersion} is the latest version.`}
          </Text>
        );
        primary = { label: 'Done', onPress: close(false), testID: 'update-sheet-done' };
        break;
      case 'unsupported':
        badge = 'Updates';
        heading = 'Updates are not available here';
        body = <Text style={[styles.body, themed.muted]}>{state.message}</Text>;
        primary = { label: 'Close', onPress: close(false), testID: 'update-sheet-close' };
        break;
      case 'error':
        badge = 'Update';
        heading = state.version ? `${version} did not finish` : 'Could not check for updates';
        body = <Text style={[styles.body, { color: colors.error }]}>{state.message}</Text>;
        primary = {
          label: 'Try again',
          onPress: () => void service.retry(),
          testID: 'update-sheet-retry',
        };
        secondary = { label: 'Close', onPress: close(false), testID: 'update-sheet-close' };
        break;
      case 'needs-install':
        badge = 'Update available';
        heading = `${version} is available`;
        body = (
          <Text style={[styles.body, themed.muted]}>
            {state.reason ?? 'Install this version from the release page.'}
          </Text>
        );
        primary = {
          label: 'Open release page',
          onPress: () => void Linking.openURL(state.releaseUrl).catch(() => undefined),
          testID: 'update-sheet-release-page',
        };
        secondary = { label: 'Later', onPress: close(true), testID: 'update-sheet-later' };
        break;
      case 'available':
        badge = state.size ? `Update available · ${megabytes(state.size)}` : 'Update available';
        heading = `${version} is available`;
        body = (
          <Text style={[styles.body, themed.muted]}>
            {[
              `You have ${state.currentVersion}.`,
              state.kind === 'apk'
                ? 'This update changes the app itself: LAFINA downloads and checks it, then Android asks you to confirm.'
                : 'LAFINA downloads and checks it, then restarts in a moment. Your data stays on this phone.',
              onMobileData && state.size
                ? `You're on mobile data — this download is ${megabytes(state.size)}.`
                : null,
            ]
              .filter(Boolean)
              .join(' ')}
          </Text>
        );
        primary = { label: 'Update now', onPress: updateNow, testID: 'update-sheet-update' };
        secondary = { label: 'Later', onPress: close(true), testID: 'update-sheet-later' };
        break;
      case 'downloading':
        badge = 'Downloading';
        heading = `Downloading ${version}`;
        body = (
          <View>
            <View style={[styles.track, themed.track]}>
              <View
                style={[
                  styles.fill,
                  { width: `${state.percent ?? 0}%`, backgroundColor: colors.primary },
                ]}
              />
            </View>
            <Text style={[styles.caption, themed.muted]}>
              {`${state.percent ?? 0}%${state.size ? ` of ${megabytes(state.size)}` : ''} · keeps going if you close this`}
            </Text>
          </View>
        );
        primary = { label: 'Hide', onPress: close(false), testID: 'update-sheet-hide' };
        secondary = {
          label: 'Cancel download',
          onPress: () => {
            continueAfterDownload.current = false;
            service.cancel();
          },
          testID: 'update-sheet-cancel',
        };
        break;
      case 'ready':
        if (state.kind === 'apk') {
          badge = 'Ready to install';
          heading = `${version} is ready`;
          if (needsPermission) {
            body = (
              <Text style={[styles.body, themed.muted]}>
                Android asks this once for apps that update themselves. Turn on “Allow from this
                source” for LAFINA, then come back — the update installs right away.
              </Text>
            );
            primary = {
              label: 'Open settings',
              onPress: () => void service.openInstallPermissionSettings(),
              testID: 'update-sheet-permission',
            };
            secondary = { label: 'Not now', onPress: close(true), testID: 'update-sheet-later' };
          } else if (state.installing) {
            busy = true;
            body = (
              <Text style={[styles.body, themed.muted]}>
                Confirm the update in Android's dialog. LAFINA closes while it installs, then shows
                a notification to open it again. Your data stays on this phone.
              </Text>
            );
            // In case Android's dialog went away without saying so.
            primary = { label: 'Show again', onPress: () => void install(), testID: 'update-sheet-install' };
            secondary = { label: 'Close', onPress: close(false), testID: 'update-sheet-close' };
          } else {
            body = (
              <Text style={[styles.body, themed.muted]}>
                Downloaded and checked. Android asks you to confirm, and LAFINA closes while it
                installs. Your data stays on this phone.
              </Text>
            );
            primary = { label: 'Install', onPress: () => void install(), testID: 'update-sheet-install' };
            secondary = { label: 'Later', onPress: close(true), testID: 'update-sheet-later' };
          }
        } else {
          badge = 'Ready';
          heading = `${version} is ready`;
          body = (
            <Text style={[styles.body, themed.muted]}>
              LAFINA restarts in a moment to finish. If you choose Later, the update is used the
              next time you open LAFINA.
            </Text>
          );
          primary = { label: 'Restart now', onPress: () => void restart(), testID: 'update-sheet-restart' };
          secondary = { label: 'Later', onPress: close(true), testID: 'update-sheet-later' };
        }
        break;
    }
  }

  const subtitle =
    sheet.mode === 'whats-new'
      ? releaseSubtitle(sheet.whatsNew.title, sheet.whatsNew.version)
      : releaseSubtitle(state.title, state.version);
  const message = notice ?? (sheet.mode === 'update' && state.phase !== 'error' ? state.message : null);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={() => onClose(sheet.mode === 'update' && state.phase !== 'downloading')}
    >
      <Pressable
        style={[styles.backdrop, themed.backdrop]}
        onPress={() => onClose(sheet.mode === 'update' && state.phase !== 'downloading')}
        accessibilityLabel="Close"
        accessibilityRole="button"
      />
      <View
        style={[
          styles.sheet,
          themed.sheet,
          { paddingBottom: Math.max(insets.bottom, Spacing.lg) + Spacing.sm, maxHeight: height * 0.86 },
        ]}
        accessibilityViewIsModal
        testID="update-sheet"
      >
        <View style={[styles.grabber, themed.grabber]} />
        <Text style={[styles.badge, { color: colors.primary }]}>{badge.toUpperCase()}</Text>
        <View style={styles.headingRow}>
          <Text style={[styles.heading, themed.text]} accessibilityRole="header">
            {heading}
          </Text>
          {busy && <ActivityIndicator size="small" color={colors.textMuted} />}
        </View>
        {subtitle ? <Text style={[styles.subtitle, themed.muted]}>{subtitle}</Text> : null}
        {body ? <View style={styles.bodyBlock}>{body}</View> : null}
        {message ? (
          <Text style={[styles.body, styles.message, { color: colors.error }]}>{message}</Text>
        ) : null}
        {notes ? (
          <ScrollView
            style={[styles.notes, themed.notes]}
            contentContainerStyle={styles.notesContent}
            testID="update-sheet-notes"
          >
            <ReleaseNotes markdown={notes} />
          </ScrollView>
        ) : null}
        <View style={styles.actions}>
          {secondary && (
            <TouchableOpacity
              style={[styles.button, styles.secondary, themed.secondary]}
              onPress={secondary.onPress}
              accessibilityRole="button"
              testID={secondary.testID}
            >
              <Text style={[styles.buttonText, themed.text]}>{secondary.label}</Text>
            </TouchableOpacity>
          )}
          {primary && (
            <TouchableOpacity
              style={[styles.button, { backgroundColor: colors.primary }]}
              onPress={primary.onPress}
              accessibilityRole="button"
              testID={primary.testID}
            >
              <Text style={[styles.buttonText, { color: colors.textOnPrimary }]}>
                {primary.label}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: Layout.borderRadiusCard + 8,
    borderTopRightRadius: Layout.borderRadiusCard + 8,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: Spacing.lg,
  },
  badge: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.small,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: Spacing.xs,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  heading: {
    flexShrink: 1,
    fontFamily: Fonts.heading,
    fontSize: FontSize.title,
    fontWeight: '700',
  },
  subtitle: {
    marginTop: Spacing.xs,
    fontFamily: Fonts.body,
    fontSize: FontSize.bodyLarge,
  },
  bodyBlock: {
    marginTop: Spacing.md,
  },
  body: {
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
    lineHeight: 20,
  },
  message: {
    marginTop: Spacing.sm,
  },
  caption: {
    marginTop: Spacing.xs,
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
  },
  track: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: 6,
  },
  notes: {
    marginTop: Spacing.lg,
    borderRadius: Layout.borderRadiusCard,
    borderWidth: StyleSheet.hairlineWidth,
    flexGrow: 0,
    flexShrink: 1,
  },
  notesContent: {
    padding: Spacing.lg,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  button: {
    flex: 1,
    minHeight: 48,
    borderRadius: Layout.borderRadiusButton,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  secondary: {
    borderWidth: 1,
  },
  buttonText: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.bodyLarge,
    fontWeight: '600',
  },
});

const getThemedStyles = (colors: ThemeColors) => ({
  backdrop: { backgroundColor: colors.overlay },
  sheet: { backgroundColor: colors.surface },
  grabber: { backgroundColor: colors.divider },
  text: { color: colors.textPrimary },
  muted: { color: colors.textSecondary },
  track: { backgroundColor: colors.divider },
  notes: { borderColor: colors.border, backgroundColor: colors.background },
  secondary: { borderColor: colors.border },
});
