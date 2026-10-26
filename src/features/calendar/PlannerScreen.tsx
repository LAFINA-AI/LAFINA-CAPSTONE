import {useCallback, useEffect, useRef, useState} from 'react';
import {
  AppState,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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
import {dimensions, spacing, typography} from '../../core/theme/theme';
import {Icon} from '../../core/ui/Icon';
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
} from './plannerDisplay';
import {CalendarMonth} from './CalendarMonth';
import {CalendarHeader} from './CalendarHeader';
import {CalendarWeek} from './CalendarWeek';
import {DayTimeline} from './DayTimeline';
import {shiftCalendarMonth} from './calendarMonthModel';

const systemNow = () => new Date();
type Editor = {kind: 'task' | 'event'; initial: Task | AcademicEvent | null};
/** Production manual planner. Native alarms remain optional effects after durable writes. */
export function PlannerScreen({
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
  const [calendarView, setCalendarView] = useState<'month' | 'week'>('week');
  const [clockFormat, setClockFormat] = useState<'12h' | '24h'>(
    preferences.clockFormat,
  );
  const [addMenu, setAddMenu] = useState(false);
  const [tools, setTools] = useState(false);
  useEffect(
    () => setClockFormat(preferences.clockFormat),
    [preferences.clockFormat],
  );
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
  }, [reminderClient, revision, deliveryRevision]);
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
    onRouteChange(editor !== null || selection !== null || addMenu || tools);
  }, [editor, selection, addMenu, tools, onRouteChange]);
  const previousBack = useRef(backRequest);
  useEffect(() => {
    if (previousBack.current === backRequest) return;
    previousBack.current = backRequest;
    if (addMenu) setAddMenu(false);
    else if (tools) setTools(false);
    else if (editor && dirty) setConfirmBack(true);
    else {
      setEditor(null);
      setSelection(null);
      setDirty(false);
    }
  }, [backRequest, editor, dirty, addMenu, tools]);
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
      <View style={styles.padded}>
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
  if (editor || selection)
    return (
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.padded}
        keyboardShouldPersistTaps="handled"
      >
        {clockWarning ? <Message error text={clockWarning} /> : null}
        {notice ? <Message text={notice} /> : null}
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
        ) : null}
      </ScrollView>
    );

  const openItem = (item: {kind: 'task' | 'event'; id: string}) =>
    setSelection({kind: item.kind, id: item.id});
  const month = calendarView === 'month';
  const previousDisabled = month
    ? date.slice(0, 7) <= '2000-01'
    : date <= '2000-01-07';
  const nextDisabled = month
    ? date.slice(0, 7) >= '2100-12'
    : date >= '2100-12-25';
  const chooseNativeDate = () => {
    void dateTimePicker
      .pickDate(date)
      .then(next => {
        if (mounted.current && next) chooseDate(next);
      })
      .catch(() => {
        if (mounted.current) {
          setTools(true);
          setDateTools(true);
          setError(
            'The Android date picker is unavailable. Enter the agenda date manually.',
          );
        }
      });
  };
  const pageControls = (
    <>
      {cursors.length > 1 || agenda?.nextCursor ? (
        <Message text="This is one page of the selected day. Use the page controls to see every item." />
      ) : null}
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
  );
  const empty = !error && agenda?.items.length === 0 && cursors.length === 1;
  return (
    <View style={[styles.screen, {backgroundColor: colors.background}]}>
      <View style={styles.chrome}>
        <CalendarHeader
          date={date}
          weekStartsMonday={preferences.weekStartsMonday}
          mode={calendarView}
          onMode={setCalendarView}
          onPrevious={() =>
            month ? chooseDate(shiftCalendarMonth(date, -1)) : move(-7)
          }
          onNext={() =>
            month ? chooseDate(shiftCalendarMonth(date, 1)) : move(7)
          }
          onToday={() => chooseDate(localToday(now(), preferences.timezone))}
          onChoose={chooseNativeDate}
          previousDisabled={previousDisabled}
          nextDisabled={nextDisabled}
        />
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              view === 'tasks' ? 'Back to calendar' : 'All tasks'
            }
            onPress={() => {
              setView(view === 'tasks' ? 'agenda' : 'tasks');
              refresh();
            }}
            style={[styles.action, {borderColor: colors.border}]}
          >
            <Icon
              name={view === 'tasks' ? 'calendar' : 'check'}
              size={18}
              color={colors.text}
            />
            <Text style={[styles.actionLabel, {color: colors.text}]}>
              {view === 'tasks' ? 'Calendar' : 'All tasks'}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Calendar tools"
            onPress={() => setTools(true)}
            style={[styles.action, {borderColor: colors.border}]}
          >
            <Icon name="settings" size={18} color={colors.text} />
            <Text style={[styles.actionLabel, {color: colors.text}]}>
              Tools
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Reminder delivery details"
            onPress={() => setTools(true)}
            style={[styles.deliveryBadge, {backgroundColor: colors.subtle}]}
          >
            <Text
              style={[
                styles.deliveryLabel,
                {color: deliveryWarning ? colors.danger : colors.muted},
              ]}
            >
              {deliveryWarning ? 'Alerts limited' : 'Alerts ready'}
            </Text>
          </Pressable>
        </View>
        {clockWarning ? <Message error text={clockWarning} /> : null}
        {error ? <Message error text={error} /> : null}
        {view === 'agenda' ? pageControls : null}
      </View>
      {view === 'tasks' ? (
        <ScrollView style={styles.screen} contentContainerStyle={styles.list}>
          <Text
            accessibilityRole="header"
            style={[styles.heading, {color: colors.text}]}
          >
            All tasks
          </Text>
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
            <Pressable
              key={task.id}
              accessibilityRole="button"
              accessibilityLabel={`Task: ${task.title}`}
              onPress={() => openItem({kind: 'task', id: task.id})}
              style={[
                styles.item,
                {backgroundColor: colors.surface, borderColor: colors.border},
              ]}
            >
              <Text style={[styles.itemTitle, {color: colors.text}]}>
                {task.title}
              </Text>
              <Text
                style={[styles.itemDetail, {color: colors.muted}]}
              >{`${task.status.replace(/_/g, ' ')} · ${
                task.dueAt
                  ? displayInstant(
                      task.dueAt,
                      preferences.timezone,
                      clockFormat,
                    )
                  : task.dueDate ?? 'No due date'
              }`}</Text>
            </Pressable>
          ))}
          {taskOffset > 0 ? (
            <Button
              label="Previous task page"
              secondary
              onPress={() => setTaskOffset(value => Math.max(0, value - 20))}
            />
          ) : null}
          {tasks?.hasMore ? (
            <Button
              label="Next task page"
              secondary
              onPress={() => setTaskOffset(value => value + 20)}
            />
          ) : null}
        </ScrollView>
      ) : month ? (
        <ScrollView style={styles.screen} contentContainerStyle={styles.list}>
          <CalendarMonth
            selectedDate={date}
            today={localToday(now(), preferences.timezone)}
            onSelect={chooseDate}
            showHeader={false}
            weekStartsMonday={preferences.weekStartsMonday}
          />
          <Text
            accessibilityRole="header"
            style={[styles.heading, {color: colors.text}]}
          >
            {date}
          </Text>
          {empty ? (
            <Message text="Nothing scheduled for this day. Undated tasks are in All tasks." />
          ) : null}
          {agenda?.items.map(item => (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              accessibilityLabel={`${
                item.kind === 'task' ? 'Task' : 'Event'
              }: ${item.title}`}
              onPress={() => openItem(item)}
              style={[
                styles.item,
                {backgroundColor: colors.surface, borderColor: colors.border},
              ]}
            >
              <Text style={[styles.itemTitle, {color: colors.text}]}>
                {item.title}
              </Text>
              <Text style={[styles.itemDetail, {color: colors.muted}]}>
                {item.at
                  ? displayInstant(item.at, preferences.timezone, clockFormat)
                  : 'Date only'}{' '}
                · {item.status.replace(/_/g, ' ')}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : (
        <>
          <View style={styles.chrome}>
            <CalendarWeek
              date={date}
              onSelect={chooseDate}
              weekStartsMonday={preferences.weekStartsMonday}
            />
          </View>
          {empty ? (
            <Text style={[styles.empty, {color: colors.muted}]}>
              Nothing scheduled for this day.
            </Text>
          ) : null}
          {!error ? (
            <View style={styles.timeline}>
              <DayTimeline
                items={agenda?.items ?? []}
                date={date}
                timezone={preferences.timezone}
                clockFormat={clockFormat}
                now={now()}
                onSelect={openItem}
              />
            </View>
          ) : null}
        </>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add new item"
        onPress={() => setAddMenu(true)}
        style={[
          styles.fab,
          {backgroundColor: colors.brand, shadowColor: colors.shadow},
        ]}
      >
        <Icon name="plus" size={30} color={colors.onBrand} />
      </Pressable>
      <Modal
        visible={addMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setAddMenu(false)}
      >
        <View accessibilityViewIsModal style={styles.modalBackdrop}>
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              styles.backdropTint,
              {backgroundColor: colors.shadow},
            ]}
          />
          <View
            style={[
              styles.modalCard,
              {backgroundColor: colors.surface, borderColor: colors.border},
            ]}
          >
            <Text
              accessibilityRole="header"
              style={[styles.heading, {color: colors.text}]}
            >
              Create new
            </Text>
            <Button
              label="Add task"
              onPress={() => {
                setAddMenu(false);
                setNotice('');
                setEditor({kind: 'task', initial: null});
              }}
            />
            <Button
              label="Add event"
              secondary
              onPress={() => {
                setAddMenu(false);
                setNotice('');
                setEditor({kind: 'event', initial: null});
              }}
            />
            <Button
              label="Cancel"
              secondary
              onPress={() => setAddMenu(false)}
            />
          </View>
        </View>
      </Modal>
      <Modal visible={tools} onRequestClose={() => setTools(false)}>
        <ScrollView
          style={[styles.screen, {backgroundColor: colors.background}]}
          contentContainerStyle={styles.padded}
          keyboardShouldPersistTaps="handled"
        >
          <Text
            accessibilityRole="header"
            style={[styles.heading, {color: colors.text}]}
          >
            Calendar tools
          </Text>
          <Message text={`Timezone: ${preferences.timezone}`} />
          <Message text={delivery} error={deliveryWarning} />
          <Button
            label="Open Android reminder settings"
            secondary
            onPress={() => {
              void reminderClient
                .openSettings('notifications')
                .catch(() =>
                  setError(
                    'Android reminder settings could not be opened. Open the app settings manually.',
                  ),
                );
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
              setTools(false);
              refresh();
            }}
          />
          <Choice
            label="Clock display (this view)"
            value={clockFormat}
            options={[
              {value: '24h', label: '24 hour'},
              {value: '12h', label: '12 hour'},
            ]}
            onChange={setClockFormat}
          />
          <Button
            label="Refresh planner"
            secondary
            onPress={() => {
              refresh();
              setTools(false);
            }}
          />
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
                onPress={() => {
                  try {
                    assertDate(dateDraft);
                    chooseDate(dateDraft);
                    setTools(false);
                  } catch {
                    setError(
                      'Choose a real calendar date between 2000 and 2100.',
                    );
                  }
                }}
              />
              <Button
                label="Choose agenda date"
                secondary
                onPress={chooseNativeDate}
              />
            </>
          ) : null}
          {error ? <Message error text={error} /> : null}
          <Button
            label="Close calendar tools"
            onPress={() => setTools(false)}
          />
        </ScrollView>
      </Modal>
    </View>
  );
}
const styles = StyleSheet.create({
  backdropTint: {opacity: 0.25},
  screen: {flex: 1},
  padded: {padding: spacing.lg, paddingBottom: spacing.xl},
  chrome: {paddingHorizontal: spacing.md, paddingTop: spacing.xs},
  list: {padding: spacing.md, paddingBottom: 100},
  heading: {
    fontSize: typography.heading,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  action: {
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: dimensions.control,
    borderWidth: dimensions.border,
    borderRadius: dimensions.radius,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
  },
  actionLabel: {fontSize: typography.small, fontWeight: '500'},
  deliveryBadge: {
    minHeight: dimensions.control,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: dimensions.radius,
    flexGrow: 1,
  },
  deliveryLabel: {fontSize: typography.caption, fontWeight: '600'},
  timeline: {flex: 1, paddingHorizontal: spacing.md},
  empty: {
    fontSize: typography.caption,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
  },
  item: {
    minHeight: dimensions.control,
    borderWidth: dimensions.border,
    borderRadius: dimensions.radius,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  itemTitle: {fontSize: typography.body, fontWeight: '600'},
  itemDetail: {fontSize: typography.small},
  fab: {
    position: 'absolute',
    bottom: spacing.md,
    right: spacing.md,
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowOpacity: 0.2,
    shadowOffset: {width: 0, height: 2},
    shadowRadius: 4,
  },
  modalBackdrop: {flex: 1, justifyContent: 'center', padding: spacing.lg},
  modalCard: {
    borderWidth: dimensions.border,
    borderRadius: dimensions.radius,
    padding: spacing.lg,
  },
  confirmation: {flex: 1, justifyContent: 'center', padding: spacing.lg},
});
