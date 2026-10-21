import {useRef, useState} from 'react';
import {StyleSheet, Switch, Text, View} from 'react-native';
import {Button, Choice, Field, Message} from '../../core/ui/controls';
import {useTheme, ThemeContext} from '../../core/theme/ThemeContext';
import {resolveTheme, spacing, typography} from '../../core/theme/theme';
import {useColorScheme} from 'react-native';
import {validatePreferences} from '../../core/domain/preferences';
import type {Preferences} from '../../core/domain/preferences';

interface Props {
  initial: Preferences;
  onboarding: boolean;
  onSave: (preferences: Preferences) => Promise<void>;
}

/** Keep draft values on failure; never advance onboarding before the save commits. */
export function PreferencesForm({initial, onboarding, onSave}: Props) {
  const [draft, setDraft] = useState(initial);
  const [lead, setLead] = useState(String(initial.leadMinutes));
  const [snooze, setSnooze] = useState(String(initial.snoozeMinutes));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const [step, setStep] = useState(0);
  const scheme = useColorScheme();
  const theme = resolveTheme(draft.theme, scheme);
  function change<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    setDraft(current => ({...current, [key]: value}));
    setSaved(false);
  }
  async function submit() {
    if (inFlight.current) {
      return;
    }
    const next = {
      ...draft,
      nickname: draft.nickname.trim(),
      timezone: draft.timezone.trim(),
      leadMinutes: lead.trim() ? Number(lead) : NaN,
      snoozeMinutes: snooze.trim() ? Number(snooze) : NaN,
    };
    const problem = validatePreferences(next);
    setError(problem);
    if (problem) {
      return;
    }
    inFlight.current = true;
    setSaving(true);
    try {
      await onSave(next);
      setSaved(true);
    } catch {
      setError(
        'Your settings could not be saved. Your entries are still here. Try again.',
      );
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <ThemeContext.Provider value={theme}>
      <View style={[styles.form, {backgroundColor: theme.colors.background}]}>
        {onboarding ? (
          <>
            <Text
              accessibilityRole="header"
              style={[styles.title, {color: theme.colors.text}]}
            >
              {step === 0 ? 'Your student secretary' : 'Make it yours'}
            </Text>
            <Message text={`Step ${step + 1} of 2`} />
          </>
        ) : (
          <Text
            accessibilityRole="header"
            style={[styles.heading, {color: theme.colors.text}]}
          >
            Planner preferences
          </Text>
        )}
        {onboarding && step === 0 ? (
          <>
            <Message text="Keep your academic plans on this phone. No account, email or internet connection is needed." />
            <Message text="You stay in control. Calendar tools, reminders and voice features will arrive in later updates. This build sets up your local preferences." />
            <Message text="Nothing is uploaded. You can change these preferences or reopen setup in Settings." />
            <Button label="Set up my planner" onPress={() => setStep(1)} />
          </>
        ) : (
          <>
            <Field
              editable={!saving}
              label="Nickname (optional)"
              value={draft.nickname}
              onChangeText={value => change('nickname', value)}
              maxLength={80}
              placeholder="Student"
            />
            <Field
              editable={!saving}
              label="Timezone"
              value={draft.timezone}
              onChangeText={value => change('timezone', value)}
              autoCapitalize="none"
              placeholder="Asia/Manila"
            />
            <Choice
              disabled={saving}
              label="Appearance"
              value={draft.theme}
              onChange={value => change('theme', value)}
              options={[
                {value: 'system', label: 'System'},
                {value: 'light', label: 'Light'},
                {value: 'dark', label: 'Dark'},
              ]}
            />
            <Field
              editable={!saving}
              label="Default reminder lead (minutes)"
              value={lead}
              keyboardType="number-pad"
              onChangeText={value => {
                setLead(value);
                setSaved(false);
              }}
              maxLength={3}
            />
            <Field
              editable={!saving}
              label="Default snooze (minutes)"
              value={snooze}
              keyboardType="number-pad"
              onChangeText={value => {
                setSnooze(value);
                setSaved(false);
              }}
              maxLength={3}
            />
            <Choice
              disabled={saving}
              label="Reply preference"
              value={draft.replyMode}
              onChange={value => change('replyMode', value)}
              options={[
                {value: 'text', label: 'Text'},
                {value: 'voice', label: 'Voice'},
                {value: 'both', label: 'Both'},
              ]}
            />
            <Message text="Voice replies are not available yet. Your preference is saved; this build uses text." />
            <View style={styles.switchRow}>
              <Text style={[styles.label, {color: theme.colors.text}]}>
                Quiet hours preference
              </Text>
              <Switch
                disabled={saving}
                accessibilityLabel="Quiet hours preference"
                value={draft.quietHoursEnabled}
                onValueChange={value => change('quietHoursEnabled', value)}
              />
            </View>
            {draft.quietHoursEnabled ? (
              <>
                <Field
                  editable={!saving}
                  label="Quiet hours start (HH:MM)"
                  value={draft.quietStart}
                  onChangeText={value => change('quietStart', value)}
                  maxLength={5}
                />
                <Field
                  editable={!saving}
                  label="Quiet hours end (HH:MM)"
                  value={draft.quietEnd}
                  onChangeText={value => change('quietEnd', value)}
                  maxLength={5}
                />
                <Message text="These times will be used when reminders become available. They do not change Android Do Not Disturb." />
              </>
            ) : null}
            <PermissionNotice />
            {error ? <Message error text={error} /> : null}
            {saved ? <Message text="Preferences saved on this phone." /> : null}
            <Button
              label={
                saving
                  ? 'Saving preferences…'
                  : onboarding
                  ? 'Finish setup'
                  : 'Save preferences'
              }
              disabled={saving}
              onPress={() => {
                void submit();
              }}
            />
            {onboarding ? (
              <Button
                label="Back"
                secondary
                disabled={saving}
                onPress={() => setStep(0)}
              />
            ) : (
              <Button
                label="Discard unsaved changes"
                secondary
                disabled={saving}
                onPress={() => {
                  setDraft(initial);
                  setLead(String(initial.leadMinutes));
                  setSnooze(String(initial.snoozeMinutes));
                  setSaved(false);
                  setError(null);
                }}
              />
            )}
          </>
        )}
      </View>
    </ThemeContext.Provider>
  );
}

function PermissionNotice() {
  const {colors} = useTheme();
  return (
    <View style={styles.notice}>
      <Text
        accessibilityRole="header"
        style={[styles.heading, {color: colors.text}]}
      >
        Permissions, when you need them
      </Text>
      <Message text="This setup requests no microphone or notification access. Later, reminders may need notification and alarm permission; full-screen alerts depend on Android settings. Microphone permission will be requested only when you choose voice input." />
    </View>
  );
}

const styles = StyleSheet.create({
  form: {padding: spacing.lg},
  title: {
    fontSize: typography.title,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  heading: {
    fontSize: typography.heading,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  label: {fontSize: typography.label, flex: 1},
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  notice: {marginVertical: spacing.md},
});
