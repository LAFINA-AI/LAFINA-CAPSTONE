import {useEffect, useRef, useState} from 'react';
import {Pressable, StyleSheet, Switch, Text, View} from 'react-native';
import Svg, {Defs, LinearGradient, Path, Stop} from 'react-native-svg';
import type {Preferences} from '../../core/domain/preferences';
import {useTheme} from '../../core/theme/ThemeContext';
import {dimensions, spacing, typography} from '../../core/theme/theme';
import {Icon} from '../../core/ui/Icon';

type ProfileCounts = {completedTasks: number; notes: number};

/** Local identity and real counts only; settings actions open existing editors. */
export function ProfileScreen({
  preferences,
  counts,
  onPreferences,
  onReminders,
  onSpeech,
  onPlannerTools,
  onClockFormat,
  onWeekStartsMonday,
  onSavingChange,
}: {
  preferences: Preferences;
  counts: ProfileCounts | null;
  onPreferences: () => void;
  onReminders: () => void;
  onSpeech: () => void;
  onPlannerTools?: () => void;
  onClockFormat?: (format: '12h' | '24h') => Promise<void>;
  onWeekStartsMonday?: (value: boolean) => Promise<void>;
  onSavingChange?: (saving: boolean) => void;
}) {
  const {colors} = useTheme();
  const mounted = useRef(true);
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  function saveSetting(action: () => Promise<void>) {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError('');
    onSavingChange?.(true);
    void (async () => {
      try {
        await action();
      } catch {
        if (mounted.current)
          setError(
            'This preference could not be saved. Your previous setting is still in use. Try again.',
          );
      } finally {
        savingRef.current = false;
        onSavingChange?.(false);
        if (mounted.current) setSaving(false);
      }
    })();
  }
  const name = preferences.nickname.trim() || 'Guest User';
  const words = name.split(/\s+/);
  const initials =
    words.length > 1
      ? words
          .slice(0, 2)
          .map(word => Array.from(word)[0] ?? '')
          .join('')
          .toUpperCase()
      : Array.from(name).slice(0, 2).join('').toUpperCase();
  return (
    <View>
      <View style={styles.banner} accessible={false}>
        <Svg
          width="100%"
          height="100%"
          viewBox="0 0 400 200"
          preserveAspectRatio="none"
        >
          <Defs>
            <LinearGradient id="profileGradient" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={colors.profileStart} />
              <Stop offset="0.5" stopColor={colors.profileMid} />
              <Stop offset="1" stopColor={colors.profileEnd} />
            </LinearGradient>
          </Defs>
          <Path
            d="M0 0 H400 V165 Q200 225 0 165 Z"
            fill="url(#profileGradient)"
          />
        </Svg>
      </View>
      <View style={styles.identity}>
        <View
          style={[
            styles.avatar,
            {backgroundColor: colors.brand, borderColor: colors.background},
          ]}
        >
          <Text style={[styles.initials, {color: colors.onBrand}]}>
            {initials}
          </Text>
        </View>
        <Text
          accessibilityRole="header"
          style={[styles.name, {color: colors.text}]}
        >
          {name}
        </Text>
        <Text style={[styles.caption, {color: colors.muted}]}>
          Your planner, on this phone
        </Text>
      </View>
      <View style={styles.content}>
        <View style={styles.stats}>
          <Stat
            value={counts === null ? '—' : String(counts.completedTasks)}
            label="Tasks Done"
          />
          <Stat
            value={counts === null ? '—' : String(counts.notes)}
            label="Notes Saved"
          />
          <Stat value="Offline" label="Local only" />
        </View>
        {counts === null ? (
          <Text style={[styles.caption, {color: colors.muted}]}>
            Saved counts are unavailable. Your data has not been reset.
          </Text>
        ) : null}
        {error ? (
          <Text
            accessibilityRole="alert"
            style={[styles.error, {color: colors.danger}]}
          >
            {error}
          </Text>
        ) : null}
        {saving ? (
          <Text style={[styles.caption, {color: colors.muted}]}>
            Saving preference…
          </Text>
        ) : null}
        <Text style={[styles.groupLabel, {color: colors.muted}]}>
          PREFERENCES
        </Text>
        <View
          style={[
            styles.group,
            {backgroundColor: colors.surface, shadowColor: colors.shadow},
          ]}
        >
          <SettingRow
            label="Scheduling & Reminder Preferences"
            value={`${preferences.leadMinutes} min lead · ${preferences.snoozeMinutes} min snooze`}
            onPress={onPreferences}
          />
          <View
            style={[
              styles.settingRow,
              {
                borderBottomWidth: dimensions.border,
                borderColor: colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.settingText,
                styles.settingLabel,
                {color: colors.text},
              ]}
            >
              24-Hour Time Format
            </Text>
            <Switch
              accessibilityLabel="24-Hour Time Format"
              accessibilityState={{
                disabled: saving || !onClockFormat,
                checked: preferences.clockFormat === '24h',
              }}
              value={preferences.clockFormat === '24h'}
              disabled={saving || !onClockFormat}
              trackColor={{true: colors.brand, false: colors.border}}
              thumbColor={colors.surface}
              onValueChange={value => {
                if (onClockFormat)
                  saveSetting(() => onClockFormat(value ? '24h' : '12h'));
              }}
            />
          </View>
          <View
            style={[
              styles.settingRow,
              {
                borderBottomWidth: dimensions.border,
                borderColor: colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.settingText,
                styles.settingLabel,
                {color: colors.text},
              ]}
            >
              Week Starts on Monday
            </Text>
            <Switch
              accessibilityLabel="Week Starts on Monday"
              accessibilityState={{
                disabled: saving || !onWeekStartsMonday,
                checked: preferences.weekStartsMonday,
              }}
              value={preferences.weekStartsMonday}
              disabled={saving || !onWeekStartsMonday}
              trackColor={{true: colors.brand, false: colors.border}}
              thumbColor={colors.surface}
              onValueChange={value => {
                if (onWeekStartsMonday)
                  saveSetting(() => onWeekStartsMonday(value));
              }}
            />
          </View>
          <SettingRow
            label="Appearance"
            value={
              preferences.theme === 'system'
                ? 'System'
                : preferences.theme === 'dark'
                ? 'Dark'
                : 'Light'
            }
            onPress={onPreferences}
          />
          <SettingRow
            label="Timezone"
            value={preferences.timezone}
            onPress={onPreferences}
            last
          />
        </View>
        <Text style={[styles.groupLabel, {color: colors.muted}]}>
          AI & VOICE
        </Text>
        <View
          style={[
            styles.group,
            {backgroundColor: colors.surface, shadowColor: colors.shadow},
          ]}
        >
          <SettingRow
            label="Voice & Text-to-Speech"
            value="Android offline voice"
            onPress={onSpeech}
            last
          />
        </View>
        <Text style={[styles.groupLabel, {color: colors.muted}]}>
          NOTIFICATIONS
        </Text>
        <View
          style={[
            styles.group,
            {backgroundColor: colors.surface, shadowColor: colors.shadow},
          ]}
        >
          <SettingRow
            label="Reminder delivery"
            value="Permissions & quiet hours"
            onPress={onReminders}
            last
          />
        </View>
        {onPlannerTools ? (
          <>
            <Text style={[styles.groupLabel, {color: colors.muted}]}>
              REVIEW TOOLS
            </Text>
            <View
              style={[
                styles.group,
                {backgroundColor: colors.surface, shadowColor: colors.shadow},
              ]}
            >
              <SettingRow
                label="Planner test tools"
                onPress={onPlannerTools}
                last
              />
            </View>
          </>
        ) : null}
        <Text style={[styles.footer, {color: colors.muted}]}>
          Schedules, notes and preferences stay on this phone. No registration
          is needed.
        </Text>
      </View>
    </View>
  );
}

function Stat({value, label}: {value: string; label: string}) {
  const {colors} = useTheme();
  return (
    <View
      style={[
        styles.stat,
        {backgroundColor: colors.surface, shadowColor: colors.shadow},
      ]}
    >
      <Text style={[styles.statValue, {color: colors.text}]}>{value}</Text>
      <Text style={[styles.statLabel, {color: colors.muted}]}>{label}</Text>
    </View>
  );
}

function SettingRow({
  label,
  value,
  onPress,
  last = false,
}: {
  label: string;
  value?: string;
  onPress: () => void;
  last?: boolean;
}) {
  const {colors} = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={value}
      onPress={onPress}
      style={({pressed}) => [
        styles.settingRow,
        {
          borderBottomWidth: last ? 0 : dimensions.border,
          borderColor: colors.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <View style={styles.settingText}>
        <Text style={[styles.settingLabel, {color: colors.text}]}>{label}</Text>
        {value ? (
          <Text style={[styles.settingValue, {color: colors.muted}]}>
            {value}
          </Text>
        ) : null}
      </View>
      <Icon name="chevron-right" size={19} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {height: 200},
  identity: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    marginTop: -70,
  },
  avatar: {
    width: 128,
    height: 128,
    borderRadius: 64,
    borderWidth: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  initials: {fontSize: 40, fontWeight: '700'},
  name: {
    fontSize: typography.heading,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: spacing.md,
  },
  caption: {
    fontSize: typography.small,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  content: {padding: spacing.lg},
  stats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  stat: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 90,
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: dimensions.radius * 1.5,
    elevation: 3,
    shadowOpacity: 0.12,
    shadowOffset: {width: 0, height: 2},
    shadowRadius: 5,
  },
  statValue: {
    fontSize: typography.heading,
    fontWeight: '700',
    textAlign: 'center',
  },
  statLabel: {
    fontSize: typography.small,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  groupLabel: {
    fontSize: typography.small,
    fontWeight: '700',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  group: {
    borderRadius: dimensions.radius * 1.5,
    paddingHorizontal: spacing.md,
    elevation: 2,
    shadowOpacity: 0.1,
    shadowOffset: {width: 0, height: 2},
    shadowRadius: 5,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: dimensions.control,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  settingText: {flex: 1},
  settingLabel: {fontSize: typography.body, lineHeight: 23},
  settingValue: {
    fontSize: typography.small,
    lineHeight: 21,
    marginTop: spacing.xs,
  },
  footer: {
    fontSize: typography.small,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  error: {fontSize: typography.small, lineHeight: 22, marginTop: spacing.md},
});
