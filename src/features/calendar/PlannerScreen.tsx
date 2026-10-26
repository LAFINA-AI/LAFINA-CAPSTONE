import {useCallback, useEffect, useRef, useState} from 'react';
import {AppState, Modal, StyleSheet, Text, View} from 'react-native';
import type {
  AcademicEvent,
  PlannerRepository,
  Task,
} from '../../core/domain/planner';
import type {Preferences} from '../../core/domain/preferences';
import {assertDate} from '../../core/domain/scheduleTime';
import {dateTimePicker} from '../../core/native/dateTimePicker';
import type {AlarmClient} from '../../core/native/reminders';
import {useTheme} from '../../core/theme/ThemeContext';
import {spacing, typography} from '../../core/theme/theme';
import {Button, Choice, Field, Message} from '../../core/ui/controls';
import {PlannerForm} from '../scheduling/PlannerForm';
import type {PlannerSaveDraft} from '../scheduling/PlannerForm';
import {PlannerItemDetails} from '../scheduling/PlannerItemDetails';
import type {PlannerSelection} from '../scheduling/PlannerItemDetails';
import {
  displayInstant,
  localToday,
  operationToken,
  plannerDateWarning,
  shiftDate,
  weekDates,
} from './plannerDisplay';
import {CalendarMonth} from './CalendarMonth';

const systemNow = () => new Date();
type Editor = {kind: 'task' | 'event'; initial: Task | AcademicEvent | null};
/** Production manual planner. Native alarms remain optional effects after durable writes. */
export function PlannerScreen({
  mode,
  preferences,
  factory,
  reminderClient,
  now = systemNow,
  backRequest = 0,
  deliveryRevision = 0,
  onDraftStateChange,
  onRouteChange,
  onSaved,
}: {
  mode: 'Today' | 'Calendar';
  preferences: Preferences;
  factory: () => PlannerRepository;
  reminderClient: AlarmClient;
  now?: () => Date;
  backRequest?: number;
  deliveryRevision?: number;
  onDraftStateChange: (dirty: boolean) => void;
  onRouteChange: (subscreen: boolean) => void;
  onSaved?: (kind: 'task' | 'event') => void;
}) {
  const {colors} = useTheme();
  const mounted = useRef(true);
  const [repository, setRepository] = useState<PlannerRepository | null>(null);
  const [openAttempt, setOpenAttempt] = useState(0);
  const [date, setDate] = useState(() =>
    localToday(now(), preferences.timezone),
  );
  const [dateDraft, setDateDraft] = useState(date);
  const [view, setView] = useState<'agenda' | 'tasks'>('agenda');
  const [calendarView, setCalendarView] = useState<'month' | 'day'>('month');
  const [clockFormat, setClockFormat] = useState<'12h' | '24h'>('24h');
  const [displayOptions, setDisplayOptions] = useState(false);
  const [dateTools, setDateTools] = useState(false);
  const [taskFilter, setTaskFilter] = useState<'active' | 'completed' | 'all'>(
    'active',
  );
  const [taskOffset, setTaskOffset] = useState(0);
  const [cursors, setCursors] = useState<Array<string | undefined>>([
    undefined,
  ]);
  const [agenda, setAgenda] = useState<ReturnType<
    PlannerRepository['agendaPage']
  > | null>(null);
  const [tasks, setTasks] = useState<ReturnType<
    PlannerRepository['tasksPage']
  > | null>(null);
  const [selection, setSelection] = useState<PlannerSelection | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [dirty, setDirty] = useState(false);
  const [confirmBack, setConfirmBack] = useState(false);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [delivery, setDelivery] = useState('Checking Android reminder access…');
  const [deliveryWarning, setDeliveryWarning] = useState(true);
  const cursor = cursors[cursors.length - 1];
  const clockWarning = plannerDateWarning(now(), preferences.timezone);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    try {
      setRepository(factory());
      setError('');
    } catch {
      setError(
        'Local planner could not be opened. Saved data has not been reset. Retry opening it.',
      );
    }
  }, [factory, openAttempt]);
  const refresh = useCallback(() => {
    setCursors([undefined]);
    setTaskOffset(0);
    setRevision(value => value + 1);
  }, []);
  useEffect(() => {
    if (!repository || editor || selection) return;
    try {
      if (view === 'agenda') {
        setAgenda(
          repository.agendaPage({
            fromDate: date,
            toDate: date,
            timezone: preferences.timezone,
            after: cursor,
            limit: 20,
          }),
        );
      } else
        setTasks(
          repository.tasksPage({
            filter: taskFilter,
            offset: taskOffset,
            limit: 20,
          }),
        );
      setError('');
    } catch {
      setError(
        'Could not read this planner page. Saved items have not been reset. Refresh to retry.',
      );
      setAgenda(null);
      setTasks(null);
    }
  }, [
    repository,
    editor,
    selection,
    view,
    date,
    preferences.timezone,
    cursor,
    taskFilter,
    taskOffset,
    revision,
  ]);
  useEffect(() => {
    let active = true;
    void reminderClient
      .capabilities()
      .then(value => {
        if (!active) return;
        const blocked = !value.enabled || !value.notifications;
        setDeliveryWarning(
          blocked || !value.exact || value.channelImportance < 3,
        );
        setDelivery(
          blocked
            ? 'Android alerts are off or notifications are blocked. Items still save locally. Open Settings → Reminder delivery to enable alerts.'
            : !value.exact
            ? 'Android alerts use inexact timing and may be delayed. Review Settings → Reminder delivery.'
            : value.channelImportance < 3
            ? 'The reminder channel is muted or low priority. Review Android reminder settings.'
            : 'Android reminder access is allowed. Device settings, quiet hours and battery restrictions can still delay or silence alerts.',
        );
      })
      .catch(() => {
        if (active) {
          setDeliveryWarning(true);
          setDelivery(
            'Android delivery status could not be checked. Items still save locally; review Settings → Reminder delivery.',
          );
        }
      });
    return () => {
      active = false;
    };
  }, [reminderClient, revision]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => {
      if (state === 'active') refresh();
    });
    return () => listener.remove();
  }, [refresh]);
  useEffect(() => {
    onDraftStateChange(dirty);
  }, [dirty, onDraftStateChange]);
  useEffect(() => {
    onRouteChange(editor !== null || selection !== null);
  }, [editor, selection, onRouteChange]);
  const previousBack = useRef(backRequest);
  useEffect(() => {
    if (previousBack.current === backRequest) return;
    previousBack.current = backRequest;
    if (editor && dirty) setConfirmBack(true);
    else {
      setEditor(null);
      setSelection(null);
      setDirty(false);
    }
  }, [backRequest, editor, dirty]);
  function chooseDate(next: string) {
    try {
      assertDate(next);
      setDate(next);
      setDateDraft(next);
      setCursors([undefined]);
      setError('');
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Choose a real calendar date.',
      );
    }
  }
  function move(days: number) {
    try {
      chooseDate(shiftDate(date, days));
    } catch {
      setError('Calendar dates must stay between 2000 and 2100.');
    }
  }
  function save(value: PlannerSaveDraft) {
    if (!repository)
      throw new Error(
        'Planner storage is unavailable. Your draft is still here.',
      );
    const command = {
      token: operationToken(),
      draft: value.draft,
      reminderLeadMinutes: value.reminderLeadMinutes,
    };
    let saved: Task | AcademicEvent;
    if (value.kind === 'task') {
      const taskCommand = {...command, draft: value.draft};
      saved = editor?.initial
        ? repository.updateTask({
            ...taskCommand,
            id: editor.initial.id,
            expectedVersion: editor.initial.version,
          })
        : repository.createTask(taskCommand);
    } else {
      const eventCommand = {...command, draft: value.draft};
      saved = editor?.initial
        ? repository.updateEvent({
            ...eventCommand,
            id: editor.initial.id,
            expectedVersion: editor.initial.version,
          })
        : repository.createEvent(eventCommand);
    }
    // No follow-up query is inside the save boundary. A failed refresh must never
    // make a durable mutation look as though it failed and invite a duplicate.
    setDirty(false);
    setEditor(null);
    setSelection({kind: value.kind, id: saved.id});
    setNotice(
      'Saved on this phone. Reminder registration does not prove delivery.',
    );
    refresh();
    // Speech is an optional post-commit effect; it must never turn a saved item
    // into a failed save or delay the durable confirmation above.
    try {
      onSaved?.(value.kind);
    } catch {
      /* Saved text remains authoritative. */
    }
  }
  if (!repository)
    return (
      <View style={styles.section}>
        <Message
          error={!!error}
          text={error || 'Opening your local planner…'}
        />
        {error ? (
          <Button
            label="Retry opening planner"
            onPress={() => setOpenAttempt(value => value + 1)}
          />
        ) : null}
      </View>
    );
  return (
    <View style={styles.section}>
      {clockWarning ? <Message error text={clockWarning} /> : null}
      {notice ? <Message text={notice} /> : null}
      <Message text={delivery} error={deliveryWarning} />
      {editor ? (
        <>
          <Modal
            visible={confirmBack}
            onRequestClose={() => setConfirmBack(false)}
          >
            <View
              accessibilityViewIsModal
              style={[
                styles.confirmation,
                {backgroundColor: colors.background},
              ]}
            >
              <Message text="Leave this form and discard unsaved changes?" />
              <Button
                label="Keep editing planner"
                secondary
                onPress={() => setConfirmBack(false)}
              />
              <Button
                label="Discard planner changes"
                onPress={() => {
                  setConfirmBack(false);
                  setEditor(null);
                  setDirty(false);
                }}
              />
            </View>
          </Modal>
          <PlannerForm
            now={now}
            key={editor.initial?.id ?? editor.kind}
            initial={editor.initial}
            kind={editor.kind}
            date={date}
            preferences={preferences}
            clockFormat={clockFormat}
            onSave={save}
            onCancel={() => {
              setDirty(false);
              setEditor(null);
            }}
            onDraftStateChange={setDirty}
          />
        </>
      ) : selection ? (
        <PlannerItemDetails
          repository={repository}
          selection={selection}
          refreshSignal={revision + deliveryRevision}
          timezone={preferences.timezone}
          clockFormat={clockFormat}
          snoozeMinutes={preferences.snoozeMinutes}
          onEdit={item => {
            setEditor({kind: selection.kind, initial: item});
            setDirty(false);
          }}
          onBack={() => {
            setSelection(null);
            refresh();
          }}
          onChanged={refresh}
        />
      ) : (
        <>
          <Text
            accessibilityRole="header"
            style={[styles.heading, {color: colors.text}]}
          >
            {mode === 'Today' ? 'Your academic day' : 'Calendar'}
          </Text>
          <Message
            text={`Local planner · ${preferences.timezone}. No account or connection needed.`}
          />
          <Button
            label="Add task"
            onPress={() => {
              setNotice('');
              setEditor({kind: 'task', initial: null});
            }}
          />
          <Button
            label="Add event"
            secondary
            onPress={() => {
              setNotice('');
              setEditor({kind: 'event', initial: null});
            }}
          />
          <Choice
            label="Planner view"
            value={view}
            options={[
              {value: 'agenda', label: 'Agenda'},
              {value: 'tasks', label: 'Tasks'},
            ]}
            onChange={value => {
              setView(value);
              setTaskOffset(0);
              setCursors([undefined]);
            }}
          />
          <Button
            label={displayOptions ? 'Hide display options' : 'Display options'}
            secondary
            onPress={() => setDisplayOptions(value => !value)}
          />
          {displayOptions ? (
            <Choice
              label="Clock display (this view)"
              value={clockFormat}
              options={[
                {value: '24h', label: '24 hour'},
                {value: '12h', label: '12 hour'},
              ]}
              onChange={setClockFormat}
            />
          ) : null}
          <Button label="Refresh planner" secondary onPress={refresh} />
          {error ? <Message error text={error} /> : null}
          {view === 'agenda' ? (
            <>
              {mode === 'Calendar' ? (
                <>
                  <Choice
                    label="Calendar display"
                    value={calendarView}
                    options={[
                      {value: 'month', label: 'Month'},
                      {value: 'day', label: 'Day'},
                    ]}
                    onChange={setCalendarView}
                  />
                  {calendarView === 'month' ? (
                    <CalendarMonth
                      selectedDate={date}
                      today={localToday(now(), preferences.timezone)}
                      onSelect={chooseDate}
                    />
                  ) : null}
                </>
              ) : null}
              <Button
                label={dateTools ? 'Hide date controls' : 'Go to another date'}
                secondary
                onPress={() => setDateTools(value => !value)}
              />
              {dateTools ? (
                <>
                  <Field
                    label="Agenda date"
                    value={dateDraft}
                    onChangeText={setDateDraft}
                    placeholder="YYYY-MM-DD"
                  />
                  <Button
                    label="Go to date"
                    secondary
                    onPress={() => chooseDate(dateDraft)}
                  />
                  <Button
                    label="Choose agenda date"
                    secondary
                    onPress={() => {
                      void dateTimePicker
                        .pickDate(date)
                        .then(next => {
                          if (mounted.current && next) chooseDate(next);
                        })
                        .catch(() => {
                          if (mounted.current)
                            setError(
                              'The Android date picker is unavailable. Enter the agenda date manually.',
                            );
                        });
                    }}
                  />
                </>
              ) : null}
              {mode === 'Today' || calendarView === 'day' ? (
                <>
                  <View style={styles.navigation}>
                    <View style={styles.navButton}>
                      <Button
                        label="Previous week"
                        secondary
                        onPress={() => move(-7)}
                      />
                    </View>
                    <View style={styles.navButton}>
                      <Button
                        label="Today"
                        secondary
                        onPress={() =>
                          chooseDate(localToday(now(), preferences.timezone))
                        }
                      />
                    </View>
                    <View style={styles.navButton}>
                      <Button
                        label="Next week"
                        secondary
                        onPress={() => move(7)}
                      />
                    </View>
                  </View>
                  <Choice
                    label="Day"
                    value={date}
                    options={weekDates(date).map(day => ({
                      value: day,
                      label: `${
                        ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][
                          new Date(`${day}T12:00:00.000Z`).getUTCDay()
                        ]
                      } ${day.slice(8)}`,
                      accessibilityLabel: `Day: ${day}`,
                    }))}
                    onChange={chooseDate}
                  />
                </>
              ) : null}
              <Text
                accessibilityRole="header"
                style={[styles.heading, {color: colors.text}]}
              >
                {date}
              </Text>
              {agenda?.items.length === 0 ? (
                <Message text="Nothing scheduled for this day. Undated tasks are in the Tasks view." />
              ) : null}
              {agenda?.items.map(item => (
                <View key={item.key}>
                  <Button
                    label={`${item.kind === 'task' ? 'Task' : 'Event'}: ${
                      item.title
                    }`}
                    secondary
                    onPress={() => setSelection({kind: item.kind, id: item.id})}
                  />
                  <Message
                    text={`${
                      item.at
                        ? displayInstant(
                            item.at,
                            preferences.timezone,
                            clockFormat,
                          )
                        : `${item.date} · date only`
                    } · ${item.status.replace(/_/g, ' ')}`}
                  />
                  {item.endAt ? (
                    <Message
                      text={`Ends ${displayInstant(
                        item.endAt,
                        preferences.timezone,
                        clockFormat,
                      )}`}
                    />
                  ) : null}
                </View>
              ))}
              {cursors.length > 1 ? (
                <Button
                  label="Previous agenda page"
                  secondary
                  onPress={() => setCursors(value => value.slice(0, -1))}
                />
              ) : null}
              {agenda?.nextCursor ? (
                <Button
                  label="Next agenda page"
                  secondary
                  onPress={() => {
                    const next = agenda.nextCursor;
                    if (next) setCursors(value => [...value, next]);
                  }}
                />
              ) : null}
            </>
          ) : (
            <>
              <Choice
                label="Task filter"
                value={taskFilter}
                options={[
                  {value: 'active', label: 'Active'},
                  {value: 'completed', label: 'Completed'},
                  {value: 'all', label: 'All'},
                ]}
                onChange={value => {
                  setTaskFilter(value);
                  setTaskOffset(0);
                }}
              />
              {tasks?.items.length === 0 ? (
                <Message text="No tasks in this filter. Add your first academic task." />
              ) : null}
              {tasks?.items.map(task => (
                <View key={task.id}>
                  <Button
                    label={`Task: ${task.title}`}
                    secondary
                    onPress={() => setSelection({kind: 'task', id: task.id})}
                  />
                  <Message
                    text={`${task.status.replace(/_/g, ' ')} · ${
                      task.dueAt
                        ? displayInstant(
                            task.dueAt,
                            preferences.timezone,
                            clockFormat,
                          )
                        : task.dueDate ?? 'No due date'
                    }`}
                  />
                </View>
              ))}
              {taskOffset > 0 ? (
                <Button
                  label="Previous task page"
                  secondary
                  onPress={() =>
                    setTaskOffset(value => Math.max(0, value - 20))
                  }
                />
              ) : null}
              {tasks?.hasMore ? (
                <Button
                  label="Next task page"
                  secondary
                  onPress={() => setTaskOffset(value => value + 20)}
                />
              ) : null}
            </>
          )}
        </>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  section: {padding: spacing.lg},
  heading: {
    fontSize: typography.heading,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  navigation: {flexDirection: 'row', gap: spacing.sm},
  navButton: {flex: 1},
  confirmation: {flex: 1, justifyContent: 'center', padding: spacing.lg},
});
