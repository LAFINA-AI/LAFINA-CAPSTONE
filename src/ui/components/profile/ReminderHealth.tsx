import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ToolSheet } from '../tools';
import { useThemedStyles } from '../../theme/createThemedStyles';
import type { ThemeColors } from '../../contexts/ThemeContext';
import { Fonts, FontSize, Spacing } from '../../theme';
import { readReminderHealth, recoverReminderHealth } from '../../../scheduler/reminderHealth';
import type { ReminderHealthSnapshot } from '../../../scheduler/reminderHealth';
import {
  openExactAlarmSettings,
  openFullScreenIntentSettings,
  openNotificationSettings,
} from '../../../scheduler/reminderAlarm';

interface ReminderHealthProps {
  userId: string;
  visible: boolean;
  onClose: () => void;
}

const access = (value: boolean | undefined): string =>
  value === undefined ? 'Unavailable' : value ? 'Allowed' : 'Not allowed';

/**
 * AGY-PORT 09: Android access next to this device's delivery evidence, for
 * the signed-in owner only. Neither part claims that a reminder will ring.
 * Refreshes on open and whenever the app returns from system settings; a
 * result for an earlier owner or an earlier open is discarded.
 */
export const ReminderHealth: React.FC<ReminderHealthProps> = ({ userId, visible, onClose }) => {
  const themed = useThemedStyles(getThemedStyles);
  const [snapshot, setSnapshot] = useState<ReminderHealthSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const epoch = useRef(0);

  const refresh = useCallback(async () => {
    const current = ++epoch.current;
    setLoading(true);
    const value = await readReminderHealth(userId);
    if (current !== epoch.current) return;
    setSnapshot(value.userId === userId ? value : null);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (!visible) return undefined;
    setSnapshot(null);
    setMessage('');
    void refresh();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void refresh();
    });
    return () => {
      epoch.current += 1;
      subscription.remove();
    };
  }, [visible, refresh]);

  const openSettings = async (open: () => Promise<void>) => {
    if (busy) return;
    const current = epoch.current;
    setBusy(true);
    try {
      await open();
    } catch {
      if (current === epoch.current) {
        setMessage('Android settings could not open. Open LAFINA in the system app settings.');
      }
    } finally {
      setBusy(false);
    }
  };

  const retry = async () => {
    if (busy) return;
    const current = epoch.current;
    setBusy(true);
    setMessage('Requesting registration…');
    try {
      const result = await recoverReminderHealth(userId);
      if (current !== epoch.current) return;
      setMessage(result.message);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const shown = snapshot && snapshot.userId === userId ? snapshot : null;
  const local = shown?.local ?? null;
  const permissions = shown?.permissions ?? null;

  const button = (label: string, onPress: () => void, testID: string) => (
    <TouchableOpacity
      key={label}
      testID={testID}
      accessibilityRole="button"
      disabled={busy}
      onPress={onPress}
      style={[styles.button, themed.button, busy && styles.disabled]}
    >
      <Text style={[styles.buttonText, themed.text]}>{label}</Text>
    </TouchableOpacity>
  );

  const row = (label: string, value: string | number, testID: string) => (
    <View style={styles.row} key={testID}>
      <Text style={[styles.rowLabel, themed.muted]}>{label}</Text>
      <Text testID={testID} style={[styles.rowValue, themed.text]}>
        {String(value)}
      </Text>
    </View>
  );

  return (
    <ToolSheet visible={visible} title="Reminder Health" onClose={onClose}>
      <Text style={[styles.section, themed.text]}>Android access</Text>
      {shown || !loading ? (
        <>
          {row('Notifications', access(permissions?.notificationsEnabled), 'health-notifications')}
          {row('Exact alarms', access(permissions?.canScheduleExactAlarms), 'health-exact')}
          {row(
            'Full-screen calls',
            access(permissions?.canUseFullScreenIntent),
            'health-full-screen',
          )}
        </>
      ) : (
        <Text style={themed.muted}>Checking…</Text>
      )}
      <Text style={[styles.note, themed.muted]}>
        Access lets Android deliver reminders; it does not show that one rang. Without exact
        alarms a reminder can be late. Full-screen calls also depend on Android and the lock
        screen.
      </Text>

      <Text style={[styles.section, themed.text]}>Reminders on this device</Text>
      {local ? (
        <>
          {row('Upcoming', local.armed, 'health-armed')}
          {row('Accepted by Android', local.registered, 'health-registered')}
          {row('Of those, inexact (may be late)', local.inexact, 'health-inexact')}
          {row('Waiting to register', local.queued, 'health-queued')}
          {row('Registration failed', local.blocked, 'health-blocked')}
          {row('Held back (already done)', local.suppressed, 'health-suppressed')}
          {row('Ringing now', local.ringing, 'health-ringing')}
        </>
      ) : (
        <Text testID="health-local-unavailable" style={themed.muted}>
          {loading && !shown ? 'Checking…' : 'Delivery records unavailable.'}
        </Text>
      )}

      {button('Refresh', () => void refresh(), 'health-refresh')}
      {button('Notification settings', () => void openSettings(openNotificationSettings), 'health-open-notifications')}
      {button('Exact alarm access', () => void openSettings(openExactAlarmSettings), 'health-open-exact')}
      {button(
        'Full-screen call access',
        () => void openSettings(openFullScreenIntentSettings),
        'health-open-full-screen',
      )}
      {button('Retry reminder registration', () => void retry(), 'health-retry')}
      {message ? (
        <Text testID="health-message" accessibilityLiveRegion="polite" style={[styles.note, themed.text]}>
          {message}
        </Text>
      ) : null}

      {local && local.recent.length > 0 && (
        <>
          <Text style={[styles.section, themed.text]}>Recent delivery records</Text>
          {local.recent.map((item, index) => (
            <Text key={`${item.at}-${index}`} style={[styles.recent, themed.muted]}>
              {`${item.at.replace('T', ' ').slice(0, 16)}  ${item.label}`}
            </Text>
          ))}
        </>
      )}
    </ToolSheet>
  );
};

const styles = StyleSheet.create({
  section: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.body,
    fontWeight: 'bold',
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  rowLabel: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
  },
  rowValue: {
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
    fontWeight: '600',
  },
  note: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    marginTop: Spacing.sm,
  },
  button: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.sm,
  },
  buttonText: {
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
  },
  disabled: {
    opacity: 0.5,
  },
  recent: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    paddingVertical: 2,
  },
});

const getThemedStyles = (colors: ThemeColors) => ({
  text: {
    color: colors.textPrimary,
  },
  muted: {
    color: colors.textSecondary,
  },
  button: {
    borderColor: colors.border,
  },
});
