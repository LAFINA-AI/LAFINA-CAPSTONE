import {useEffect, useRef, useState} from 'react';
import {Pressable, StyleSheet, Switch, Text, View} from 'react-native';
import type {AcademicEvent, Task} from '../../core/domain/planner';
import type {Preferences} from '../../core/domain/preferences';
import {localDateTime} from '../../core/domain/scheduleTime';
import {dateTimePicker} from '../../core/native/dateTimePicker';
import {useTheme} from '../../core/theme/ThemeContext';
import {dimensions, spacing, typography} from '../../core/theme/theme';
import {Button, Choice, Field, Message} from '../../core/ui/controls';
import {
  buildPlannerDraft,
  clockPreview,
  hasPastSchedule,
  initialFormState,
} from './plannerFormModel';
import type {PlannerFormState, PlannerSaveDraft} from './plannerFormModel';

export type {PlannerSaveDraft} from './plannerFormModel';

export interface PlannerFormProps {
  now?: () => Date;
  initial: Task | AcademicEvent | null;
  kind: 'task' | 'event';
  date: string;
  preferences: Preferences;
  clockFormat: '12h' | '24h';
  onSave: (draft: PlannerSaveDraft) => void;
  onCancel: () => void;
  onDraftStateChange?: (dirty: boolean) => void;
}

const days = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;
const systemNow = () => new Date();

/** Manual scheduling remains usable if a native picker or alarm service fails. */
export function PlannerForm({
  initial,
  kind,
  date,
  preferences,
  clockFormat,
  onSave,
  onCancel,
  onDraftStateChange,
  now = systemNow,
}: PlannerFormProps) {
  const {colors} = useTheme();
  const [committed, setCommitted] = useState(() =>
    initialFormState(initial, date, preferences),
  );
  const [state, setState] = useState(committed);
  const [error, setError] = useState<string | null>(null);
  const [needsFold, setNeedsFold] = useState<'start' | 'end' | null>(null);
  const [pastDraft, setPastDraft] = useState<PlannerSaveDraft | null>(null);
  const [discard, setDiscard] = useState(false);
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);
  const [saved, setSaved] = useState(false);
  const active = useRef(true);
  const inFlight = useRef(false);
  const pickerInFlight = useRef(false);
  const dirty = JSON.stringify(state) !== JSON.stringify(committed);
  const disabled = saving || picking;
  const hasTime = kind === 'event' || state.dueKind === 'timed';

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    onDraftStateChange?.(dirty);
  }, [dirty, onDraftStateChange]);

  function change<K extends keyof PlannerFormState>(
    key: K,
    value: PlannerFormState[K],
  ) {
    setState(current => ({
      ...current,
      [key]: value,
      ...(['startDate', 'startTime', 'endDate', 'endTime', 'timezone'].includes(
        key,
      )
        ? {fold: undefined, endFold: undefined}
        : {}),
    }));
    if (key !== 'fold' && key !== 'endFold') {
      setNeedsFold(null);
    }
    setPastDraft(null);
    setError(null);
    setSaved(false);
    setDiscard(false);
  }

  async function pick(
    key: 'startDate' | 'endDate' | 'until' | 'startTime' | 'endTime',
    type: 'date' | 'time',
  ) {
    if (pickerInFlight.current || inFlight.current) {
      return;
    }
    pickerInFlight.current = true;
    setPicking(true);
    try {
      const result =
        type === 'date'
          ? await dateTimePicker.pickDate(state[key])
          : await dateTimePicker.pickTime(state[key], clockFormat === '24h');
      if (active.current && result !== null) {
        change(key, result);
      }
    } catch {
      if (active.current) {
        setError(
          'The picker is unavailable. You can still type the date or time.',
        );
      }
    } finally {
      pickerInFlight.current = false;
      if (active.current) {
        setPicking(false);
      }
    }
  }

  function commit(value: PlannerSaveDraft) {
    if (inFlight.current || saved) {
      return;
    }
    inFlight.current = true;
    setSaving(true);
    try {
      onSave(value);
      if (active.current) {
        setCommitted(state);
        setPastDraft(null);
        setSaved(true);
      }
    } catch (problem) {
      if (active.current) {
        const detail = problem instanceof Error ? ` ${problem.message}` : '';
        setError(
          `Your changes could not be saved. Your entries are still here.${detail}`,
        );
        setPastDraft(null);
      }
    } finally {
      inFlight.current = false;
      if (active.current) {
        setSaving(false);
      }
    }
  }

  function submit() {
    if (disabled || inFlight.current || saved) {
      return;
    }
    try {
      const value = buildPlannerDraft(kind, state, initial);
      const current = now();
      const today = localDateTime(
        current.toISOString(),
        value.draft.timezone,
      ).date;
      setError(null);
      if (hasPastSchedule(value, current.getTime(), today)) {
        setPastDraft(value);
      } else {
        commit(value);
      }
    } catch (problem) {
      const text =
        problem instanceof Error
          ? problem.message
          : 'Check your schedule entries.';
      setError(text);
      setNeedsFold(
        text.includes('occurs twice')
          ? text.startsWith('End time')
            ? 'end'
            : 'start'
          : null,
      );
    }
  }

  function dateField(label: string, key: 'startDate' | 'endDate' | 'until') {
    return (
      <View>
        <Field
          label={label}
          value={state[key]}
          onChangeText={value => change(key, value)}
          editable={!disabled}
          placeholder="YYYY-MM-DD"
          maxLength={10}
        />
        <Button
          label={`Choose ${label.toLowerCase()}`}
          secondary
          disabled={disabled}
          onPress={() => {
            void pick(key, 'date');
          }}
        />
      </View>
    );
  }
  function timeField(label: string, key: 'startTime' | 'endTime') {
    return (
      <View>
        <Field
          label={label}
          value={state[key]}
          onChangeText={value => change(key, value)}
          editable={!disabled}
          placeholder="HH:mm (24-hour entry)"
          maxLength={5}
        />
        <Message text={clockPreview(state[key], clockFormat)} />
        <Button
          label={`Choose ${label.toLowerCase()}`}
          secondary
          disabled={disabled}
          onPress={() => {
            void pick(key, 'time');
          }}
        />
      </View>
    );
  }

  return (
    <View style={styles.form}>
      <Text
        accessibilityRole="header"
        style={[styles.heading, {color: colors.text}]}
      >
        {initial ? 'Edit' : 'New'} {kind === 'task' ? 'task' : 'event'}
      </Text>
      {initial && 'startAt' in initial && initial.recurrence ? (
        <Message text="This edits the entire weekly series, including its future reminders. Individual occurrences cannot be edited separately." />
      ) : null}
      <Field
        label="Title"
        value={state.title}
        onChangeText={value => change('title', value)}
        editable={!disabled}
        maxLength={160}
      />
      <Field
        label="Notes"
        value={state.notes}
        onChangeText={value => change('notes', value)}
        editable={!disabled}
        maxLength={4000}
      />
      <Field
        label="Timezone"
        value={state.timezone}
        onChangeText={value => change('timezone', value)}
        editable={!disabled}
        autoCapitalize="none"
        placeholder="Asia/Manila"
      />
      {kind === 'task' ? (
        <Choice
          label="Due"
          value={state.dueKind}
          onChange={value => change('dueKind', value)}
          disabled={disabled}
          options={[
            {value: 'none', label: 'No due date'},
            {value: 'date', label: 'Date only'},
            {value: 'timed', label: 'Date and time'},
          ]}
        />
      ) : null}
      {kind === 'event' || state.dueKind !== 'none'
        ? dateField(kind === 'task' ? 'Due date' : 'Start date', 'startDate')
        : null}
      {hasTime
        ? timeField(kind === 'task' ? 'Due time' : 'Start time', 'startTime')
        : null}
      {kind === 'event' ? (
        <>
          {dateField('End date', 'endDate')}
          {timeField('End time', 'endTime')}
          <Toggle
            label="Repeat weekly"
            value={state.repeat}
            disabled={disabled}
            onChange={value => change('repeat', value)}
          />
          {state.repeat ? (
            <>
              <Message text="Select the starting day's weekday too. Series are limited to 366 calendar days; every selected occurrence must be a valid local time." />
              <View style={styles.days}>
                {days.map((day, index) => {
                  const checked = state.weekdays.includes(index);
                  return (
                    <Pressable
                      key={day}
                      accessibilityRole="checkbox"
                      accessibilityLabel={`Repeat on ${day}`}
                      accessibilityState={{checked, disabled}}
                      disabled={disabled}
                      onPress={() =>
                        change(
                          'weekdays',
                          checked
                            ? state.weekdays.filter(value => value !== index)
                            : [...state.weekdays, index],
                        )
                      }
                      style={[
                        styles.day,
                        {
                          backgroundColor: checked
                            ? colors.selected
                            : colors.surface,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <Text style={[styles.label, {color: colors.text}]}>
                        {checked ? '● ' : '○ '}
                        {day}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {dateField('Repeat until', 'until')}
            </>
          ) : null}
        </>
      ) : null}
      {hasTime ? (
        <>
          <Toggle
            label="Remind me"
            value={state.reminder}
            disabled={disabled}
            onChange={value => change('reminder', value)}
          />
          {state.reminder ? (
            <Field
              label="Reminder lead (minutes)"
              value={state.lead}
              onChangeText={value => change('lead', value)}
              editable={!disabled}
              keyboardType="number-pad"
              maxLength={3}
            />
          ) : null}
          <Message text="Reminder delivery depends on Android permissions and device settings. Saving a schedule does not guarantee an alert." />
        </>
      ) : (
        <Message text="Tasks without an explicit time have no reminder alarm." />
      )}
      {needsFold ? (
        <>
          <Message text="This timezone repeats a local hour. Choose which occurrence to use, or change the time to reject this ambiguity. A start-time choice also applies throughout a weekly series." />
          <Choice
            label={`Repeated local ${needsFold} time`}
            value={
              (needsFold === 'end' ? state.endFold : state.fold) ?? 'unset'
            }
            disabled={disabled}
            onChange={value => {
              if (value !== 'unset') {
                change(needsFold === 'end' ? 'endFold' : 'fold', value);
              }
            }}
            options={[
              {value: 'unset', label: 'Choose an occurrence'},
              {value: 'earlier', label: 'Earlier occurrence'},
              {value: 'later', label: 'Later occurrence'},
            ]}
          />
        </>
      ) : null}
      {error ? <Message error text={error} /> : null}
      {saved ? <Message text="Saved on this phone." /> : null}
      {pastDraft ? (
        <>
          <Message
            error
            text="This schedule or its reminder time is in the past. A recent reminder may alert immediately; older reminders may be marked missed. Save it anyway?"
          />
          <Button
            label="Save past schedule"
            disabled={disabled}
            onPress={() => commit(pastDraft)}
          />
          <Button
            label="Keep editing schedule"
            secondary
            disabled={disabled}
            onPress={() => setPastDraft(null)}
          />
        </>
      ) : (
        <Button
          label={
            saving ? 'Saving…' : kind === 'task' ? 'Save task' : 'Save event'
          }
          disabled={disabled || saved}
          onPress={submit}
        />
      )}
      {discard ? (
        <>
          <Message text="Discard your unsaved schedule edits?" />
          <Button
            label="Discard schedule edits"
            secondary
            disabled={disabled}
            onPress={onCancel}
          />
          <Button
            label="Keep editing"
            secondary
            disabled={disabled}
            onPress={() => setDiscard(false)}
          />
        </>
      ) : (
        <Button
          label="Cancel editing"
          secondary
          disabled={disabled}
          onPress={() => {
            if (dirty) {
              setDiscard(true);
            } else {
              onCancel();
            }
          }}
        />
      )}
    </View>
  );
}

function Toggle({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  const {colors} = useTheme();
  return (
    <View style={styles.toggle}>
      <Text style={[styles.toggleLabel, {color: colors.text}]}>{label}</Text>
      <Switch
        accessibilityLabel={label}
        value={value}
        disabled={disabled}
        onValueChange={onChange}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  form: {gap: spacing.sm},
  heading: {
    fontSize: typography.heading,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  label: {fontSize: typography.label},
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: dimensions.control,
    marginBottom: spacing.md,
  },
  toggleLabel: {fontSize: typography.label, flex: 1},
  days: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  day: {
    padding: spacing.md,
    minHeight: dimensions.control,
    borderWidth: dimensions.border,
    borderRadius: dimensions.radius,
    justifyContent: 'center',
  },
});
