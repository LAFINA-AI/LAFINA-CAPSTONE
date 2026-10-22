import {useRef, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import type {
  AcademicEvent,
  EventDraft,
  PlannerRepository,
  PlannerSnapshot,
  Reminder,
  ReminderAction,
  Task,
  TaskDraft,
  TaskStatus,
} from '../../core/domain/planner';
import {localDateTime, localToUtc} from '../../core/domain/scheduleTime';
import type {FoldChoice} from '../../core/domain/scheduleTime';
import {validateEvent, validateTask} from '../../core/domain/plannerValidation';
import {useTheme} from '../../core/theme/ThemeContext';
import {spacing, typography} from '../../core/theme/theme';
import {Button, Choice, Field, Message} from '../../core/ui/controls';

interface Draft {
  kind: 'task' | 'event';
  title: string;
  notes: string;
  timezone: string;
  dueMode: 'none' | 'date' | 'time';
  date: string;
  time: string;
  endDate: string;
  endTime: string;
  lead: string;
  weekdays: string;
  until: string;
  fold: 'reject' | FoldChoice;
  taskStatus: TaskStatus;
  eventStatus: EventDraft['status'];
}

function emptyDraft(timezone: string): Draft {
  return {
    kind: 'task',
    title: '',
    notes: '',
    timezone,
    dueMode: 'none',
    date: '',
    time: '',
    endDate: '',
    endTime: '',
    lead: '',
    weekdays: '',
    until: '',
    fold: 'reject',
    taskStatus: 'TODO',
    eventStatus: 'ACTIVE',
  };
}

function integer(value: string, maximum: number, label: string): number {
  if (!/^\d+$/.test(value) || Number(value) > maximum) {
    throw new Error(`${label} must be a whole number from 0 to ${maximum}.`);
  }
  return Number(value);
}

/** Developer-only controls over production use cases, never a delivery simulator. */
export function PlannerHarness({
  repository,
  timezone,
  now = () => new Date().toISOString(),
}: {
  repository: PlannerRepository;
  timezone: string;
  now?: () => string;
}) {
  const {colors} = useTheme();
  const [initial] = useState(() => {
    try {
      return {snapshot: repository.snapshot(), error: ''};
    } catch {
      return {
        snapshot: null,
        error:
          'Could not read planner storage. Retry the read; saved data has not been reset.',
      };
    }
  });
  const [snapshot, setSnapshot] = useState<PlannerSnapshot | null>(
    initial.snapshot,
  );
  const [error, setError] = useState(initial.error);
  const [message, setMessage] = useState('');
  const [draft, setDraft] = useState(() => emptyDraft(timezone));
  const [editing, setEditing] = useState<{id: string; version: number} | null>(
    null,
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [selectedReminder, setSelectedReminder] = useState<string | null>(null);
  const [snooze, setSnooze] = useState('10');
  const counter = useRef(0);
  const attempts = useRef(new Map<string, string>());
  const textStyle = [styles.body, {color: colors.text}];
  const headingStyle = [styles.heading, {color: colors.text}];

  function change(patch: Partial<Draft>) {
    attempts.current.clear();
    setConfirmDelete(false);
    setError('');
    setMessage('');
    setDraft(value => ({...value, ...patch}));
  }
  function token(key: string) {
    let value = attempts.current.get(key);
    if (!value) {
      counter.current += 1;
      value = `harness_${Date.now()}_${counter.current}`;
      attempts.current.set(key, value);
    }
    return value;
  }
  function refresh() {
    setSnapshot(repository.snapshot());
  }
  function run(
    key: string,
    mutation: (operationToken: string) => void,
    success: string | (() => string),
  ) {
    setError('');
    setMessage('');
    try {
      mutation(token(key));
      refresh();
      attempts.current.delete(key);
      setMessage(typeof success === 'function' ? success() : success);
      return true;
    } catch {
      // Never expose SQL/error payloads that could include private schedule text.
      setError(
        'The operation could not finish. Your draft is kept. Check the fields and retry; reload before editing a stale item.',
      );
      return false;
    }
  }
  function save() {
    setError('');
    let task: TaskDraft | undefined;
    let event: EventDraft | undefined;
    let lead: number | null;
    try {
      lead =
        draft.lead === '' ? null : integer(draft.lead, 120, 'Reminder lead');
      const common = {
        title: draft.title,
        notes: draft.notes,
        timezone: draft.timezone,
      };
      const fold = draft.fold === 'reject' ? undefined : draft.fold;
      if (draft.kind === 'task') {
        task = {
          ...common,
          status: draft.taskStatus,
          dueDate: draft.dueMode === 'date' ? draft.date : null,
          dueAt:
            draft.dueMode === 'time'
              ? localToUtc(draft.date, draft.time, draft.timezone, fold)
              : null,
        };
        validateTask(task, lead);
      } else {
        if ((draft.weekdays === '') !== (draft.until === '')) {
          throw new Error(
            'Weekly classes need both weekdays and an inclusive end date.',
          );
        }
        const weekdays = draft.weekdays.split(',');
        if (
          draft.weekdays !== '' &&
          weekdays.some(day => !/^[0-6]$/.test(day.trim()))
        ) {
          throw new Error(
            'Use comma-separated weekdays from 0 (Sunday) to 6 (Saturday).',
          );
        }
        event = {
          ...common,
          status: draft.eventStatus,
          startAt: localToUtc(draft.date, draft.time, draft.timezone, fold),
          endAt: localToUtc(draft.endDate, draft.endTime, draft.timezone, fold),
          recurrence:
            draft.weekdays === ''
              ? null
              : {
                  weekdays: weekdays.map(day => Number(day.trim())),
                  untilDate: draft.until,
                  ...(fold === undefined ? {} : {fold}),
                },
        };
        validateEvent(event, lead);
      }
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Check the date and time fields.',
      );
      return;
    }
    const key = JSON.stringify({kind: draft.kind, editing, task, event, lead});
    let saved: Task | AcademicEvent | undefined;
    const ok = run(
      key,
      operationToken => {
        if (task) {
          const command = {
            token: operationToken,
            draft: task,
            reminderLeadMinutes: lead,
          };
          saved = editing
            ? repository.updateTask({
                ...command,
                id: editing.id,
                expectedVersion: editing.version,
              })
            : repository.createTask(command);
        } else if (event) {
          const command = {
            token: operationToken,
            draft: event,
            reminderLeadMinutes: lead,
          };
          saved = editing
            ? repository.updateEvent({
                ...command,
                id: editing.id,
                expectedVersion: editing.version,
              })
            : repository.createEvent(command);
        }
      },
      'Saved locally. Android reminder delivery depends on the enabled delivery setting and system permissions.',
    );
    if (ok && saved) {
      setEditing({id: saved.id, version: saved.version});
    }
  }
  function edit(item: Task | AcademicEvent, kind: Draft['kind']) {
    const start = 'startAt' in item ? item.startAt : item.dueAt;
    let local: {date: string; time: string} | null;
    let end: {date: string; time: string} | null;
    try {
      local = start ? localDateTime(start, item.timezone) : null;
      end = 'endAt' in item ? localDateTime(item.endAt, item.timezone) : null;
    } catch {
      setError(
        'This item has an unreadable date or timezone. Reload planner storage before editing.',
      );
      return;
    }
    attempts.current.clear();
    setDraft({
      ...emptyDraft(item.timezone),
      kind,
      title: item.title,
      notes: item.notes,
      date: local?.date ?? ('dueDate' in item ? item.dueDate ?? '' : ''),
      time: local?.time ?? '',
      endDate: end?.date ?? '',
      endTime: end?.time ?? '',
      dueMode: start
        ? 'time'
        : 'dueDate' in item && item.dueDate
        ? 'date'
        : 'none',
      lead:
        item.reminderLeadMinutes === null
          ? ''
          : String(item.reminderLeadMinutes),
      taskStatus: 'dueAt' in item ? item.status : 'TODO',
      eventStatus: 'startAt' in item ? item.status : 'ACTIVE',
      weekdays:
        'recurrence' in item ? item.recurrence?.weekdays.join(',') ?? '' : '',
      until: 'recurrence' in item ? item.recurrence?.untilDate ?? '' : '',
      fold: 'recurrence' in item ? item.recurrence?.fold ?? 'reject' : 'reject',
    });
    setEditing({id: item.id, version: item.version});
    setConfirmDelete(false);
    setError('');
    setMessage(
      'Editing the selected version. Save explicitly to apply changes.',
    );
  }
  function remove() {
    if (!editing) {
      return;
    }
    const key = JSON.stringify({delete: draft.kind, editing});
    if (
      run(
        key,
        operationToken => {
          const target = {
            token: operationToken,
            id: editing.id,
            expectedVersion: editing.version,
          };
          if (draft.kind === 'task') {
            repository.deleteTask(target);
          } else {
            repository.deleteEvent(target);
          }
        },
        'Deleted locally; associated reminder cancellation is recorded.',
      )
    ) {
      setEditing(null);
      setConfirmDelete(false);
      setDraft(emptyDraft(timezone));
    }
  }
  function outcome(reminder: Reminder, action: ReminderAction) {
    const job = snapshot?.jobs
      .filter(value => value.reminderId === reminder.id)
      .sort((left, right) => right.generation - left.generation)[0];
    if (!job) {
      setError('This reminder has no readable job. Reload planner storage.');
      return;
    }
    if (action.kind === 'RING' && now() < job.runAt) {
      setError(
        'This job is still in the future. Simulate due uses the current clock; it cannot ring early.',
      );
      return;
    }
    const command = {
      id: reminder.id,
      occurrenceKey: reminder.occurrenceKey,
      generation: job.generation,
      action,
    };
    let result = 'ignored';
    run(
      JSON.stringify(command),
      operationToken => {
        result = repository.reminderAction({...command, token: operationToken});
      },
      () =>
        result === 'ignored'
          ? 'No change: this outcome was stale or ineligible. The displayed state is authoritative.'
          : action.kind === 'ACK'
          ? 'Reminder acknowledged. ACK never completes its task; inspect the task status below.'
          : 'Reminder outcome applied; the displayed state is authoritative.',
    );
    // State is rendered from the refreshed repository snapshot, never a predicted outcome.
    return result;
  }
  const reminder = snapshot?.reminders.find(
    value => value.id === selectedReminder,
  );
  function simulateDue(selected: Reminder) {
    const source =
      snapshot?.tasks.find(item => item.id === selected.taskId) ??
      snapshot?.events.find(item => item.id === selected.eventId);
    if (!source) {
      setError(
        'The source item is unavailable. Reload before simulating this reminder.',
      );
      return;
    }
    outcome(selected, {
      kind: 'RING',
      timezone: source.timezone,
      quietHours: null,
    });
  }
  const jobs = reminder
    ? snapshot?.jobs.filter(value => value.reminderId === reminder.id) ?? []
    : [];

  return (
    <View>
      <Text style={headingStyle}>Phase 03 reminder test tool</Text>
      <Message text="Debug only. These controls change local data. When Android reminder delivery is enabled, saved changes can schedule or cancel real notifications and simulated reminder alerts. Calendar screens arrive in a later phase." />
      <Button
        label="Reload planner storage"
        secondary
        onPress={() => {
          try {
            refresh();
            setError('');
            setMessage('Read local planner storage.');
          } catch {
            setError(
              'Could not read planner storage. Saved data has not been reset.',
            );
          }
        }}
      />
      {error ? <Message text={error} error /> : null}
      {message ? <Message text={message} /> : null}
      <Choice
        label="Item type"
        value={draft.kind}
        options={[
          {value: 'task', label: 'Task'},
          {value: 'event', label: 'Event'},
        ]}
        disabled={editing !== null}
        onChange={kind => change({kind})}
      />
      <Text style={textStyle}>
        {editing
          ? `Editing ${draft.kind}, version ${editing.version}`
          : `New ${draft.kind}`}
      </Text>
      <Field
        label="Item title"
        value={draft.title}
        maxLength={160}
        onChangeText={title => change({title})}
      />
      <Field
        label="Item notes (optional)"
        value={draft.notes}
        maxLength={4000}
        onChangeText={notes => change({notes})}
      />
      <Field
        label="Item timezone"
        value={draft.timezone}
        autoCapitalize="none"
        onChangeText={value => change({timezone: value})}
      />
      {draft.kind === 'task' ? (
        <Choice
          label="Task due"
          value={draft.dueMode}
          options={[
            {value: 'none', label: 'No due date'},
            {value: 'date', label: 'Date only'},
            {value: 'time', label: 'Timed'},
          ]}
          onChange={dueMode => change({dueMode})}
        />
      ) : null}
      {draft.kind === 'event' || draft.dueMode !== 'none' ? (
        <Field
          label="Start or due date (YYYY-MM-DD)"
          value={draft.date}
          autoCapitalize="none"
          onChangeText={date => change({date})}
        />
      ) : null}
      {draft.kind === 'event' || draft.dueMode === 'time' ? (
        <>
          <Field
            label="Start or due time (HH:mm)"
            value={draft.time}
            autoCapitalize="none"
            onChangeText={time => change({time})}
          />
          <Choice
            label="Repeated local time"
            value={draft.fold}
            options={[
              {value: 'reject', label: 'Ask if ambiguous'},
              {value: 'earlier', label: 'Earlier'},
              {value: 'later', label: 'Later'},
            ]}
            onChange={fold => change({fold})}
          />
        </>
      ) : null}
      {draft.kind === 'event' ? (
        <>
          <Field
            label="Event end date (YYYY-MM-DD)"
            value={draft.endDate}
            autoCapitalize="none"
            onChangeText={endDate => change({endDate})}
          />
          <Field
            label="Event end time (HH:mm)"
            value={draft.endTime}
            autoCapitalize="none"
            onChangeText={endTime => change({endTime})}
          />
          <Field
            label="Weekly weekdays (optional, comma-separated 0–6)"
            value={draft.weekdays}
            onChangeText={weekdays => change({weekdays})}
          />
          <Field
            label="Weekly inclusive end date (YYYY-MM-DD)"
            value={draft.until}
            autoCapitalize="none"
            onChangeText={until => change({until})}
          />
          <Choice
            label="Event status"
            value={draft.eventStatus}
            options={[
              {value: 'ACTIVE', label: 'Active'},
              {value: 'CANCELLED', label: 'Cancelled'},
            ]}
            onChange={eventStatus => change({eventStatus})}
          />
        </>
      ) : (
        <Choice
          label="Task status"
          value={draft.taskStatus}
          options={[
            {value: 'TODO', label: 'To do'},
            {value: 'IN_PROGRESS', label: 'In progress'},
            {value: 'COMPLETED', label: 'Completed (explicit)'},
            {value: 'CANCELLED', label: 'Cancelled'},
          ]}
          onChange={taskStatus => change({taskStatus})}
        />
      )}
      <Field
        label="Reminder lead minutes (empty for none, 0–120)"
        value={draft.lead}
        keyboardType="number-pad"
        onChangeText={lead => change({lead})}
      />
      <Button
        label={editing ? 'Save selected item' : 'Create local item'}
        onPress={save}
      />
      <Button
        label="Start a new item"
        secondary
        onPress={() => {
          attempts.current.clear();
          setDraft(emptyDraft(timezone));
          setEditing(null);
          setConfirmDelete(false);
          setError('');
          setMessage('');
        }}
      />
      {editing ? (
        confirmDelete ? (
          <>
            <Message text="Delete this item and cancel its reminders? This requires your explicit confirmation." />
            <Button label="Confirm delete selected item" onPress={remove} />
            <Button
              label="Keep selected item"
              secondary
              onPress={() => setConfirmDelete(false)}
            />
          </>
        ) : (
          <Button
            label="Delete selected item"
            secondary
            onPress={() => setConfirmDelete(true)}
          />
        )
      ) : null}
      <Text style={headingStyle}>Persisted tasks and events</Text>
      {snapshot ? (
        <>
          <Message
            text={`Showing up to 20 tasks, 20 events and 40 reminders. Loaded: ${snapshot.tasks.length} tasks, ${snapshot.events.length} events, ${snapshot.reminders.length} reminders.`}
          />
          {snapshot.truncated ? (
            <Message text="This test view loads at most 500 records per table. More saved records exist and remain in local storage." />
          ) : null}
          {snapshot.tasks.slice(0, 20).map((item, index) => (
            <View key={item.id} style={styles.entry}>
              <Text style={textStyle}>
                {item.title} · Task {item.status} · version {item.version}
              </Text>
              <Text style={textStyle}>
                {item.dueDate ?? item.dueAt ?? 'No due date'} · {item.timezone}
              </Text>
              <Button
                label={`Edit task ${index + 1}: ${item.title}`}
                secondary
                onPress={() => edit(item, 'task')}
              />
            </View>
          ))}
          {snapshot.events.slice(0, 20).map((item, index) => (
            <View key={item.id} style={styles.entry}>
              <Text style={textStyle}>
                {item.title} · Event {item.status} · version {item.version}
              </Text>
              <Text style={textStyle}>
                {item.startAt} to {item.endAt} · {item.timezone}
              </Text>
              <Button
                label={`Edit event ${index + 1}: ${item.title}`}
                secondary
                onPress={() => edit(item, 'event')}
              />
            </View>
          ))}
          <Text style={headingStyle}>Reminder outcomes</Text>
          {snapshot.reminders.slice(0, 40).map((item, index) => (
            <Button
              key={item.id}
              label={`Inspect reminder ${index + 1}: ${item.status}`}
              secondary
              onPress={() => {
                setSelectedReminder(item.id);
                setError('');
                setMessage('');
              }}
            />
          ))}
        </>
      ) : (
        <Message text="Planner contents are unavailable until storage can be read." />
      )}
      {reminder ? (
        <View>
          <Text style={textStyle}>
            Selected reminder: {reminder.status} · {reminder.scheduledAt}
          </Text>
          {jobs.slice(-5).map(job => (
            <Text key={job.id} style={textStyle}>
              Job generation {job.generation}: {job.status} ·{' '}
              {job.deliveryState} · {job.runAt}
            </Text>
          ))}
          {reminder.taskId ? (
            <Text style={textStyle}>
              Linked task status:{' '}
              {snapshot?.tasks.find(item => item.id === reminder.taskId)
                ?.status ?? 'Unavailable'}
            </Text>
          ) : null}
          <Button
            label="Simulate due for selected reminder"
            secondary
            onPress={() => simulateDue(reminder)}
          />
          <Button
            label="ACK selected reminder (keep task status)"
            onPress={() => outcome(reminder, {kind: 'ACK'})}
          />
          <Field
            label="Snooze minutes (1–120)"
            value={snooze}
            keyboardType="number-pad"
            onChangeText={value => {
              setSnooze(value);
              attempts.current.clear();
            }}
          />
          <Button
            label="Snooze selected reminder"
            secondary
            onPress={() => {
              try {
                const minutes = integer(snooze, 120, 'Snooze');
                if (minutes < 1) {
                  throw new Error('Snooze must be 1 to 120 whole minutes.');
                }
                outcome(reminder, {kind: 'SNOOZE', minutes});
              } catch (failure) {
                setError(
                  failure instanceof Error
                    ? failure.message
                    : 'Check snooze duration.',
                );
              }
            }}
          />
          <Button
            label="Mark selected reminder missed"
            secondary
            onPress={() => outcome(reminder, {kind: 'MISS'})}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  body: {fontSize: typography.body, marginBottom: spacing.sm},
  heading: {
    fontSize: typography.heading,
    fontWeight: '600',
    marginVertical: spacing.md,
  },
  entry: {marginBottom: spacing.md},
});
