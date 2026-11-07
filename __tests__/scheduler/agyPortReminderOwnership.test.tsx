/**
 * Pre-advance remediation (after AGY-PORT 05): a shared title alone never decides
 * which item a reminder belongs to. Ownership is an exact link, or, for older
 * unlinked reminders, the strict evidence rule (same owner and title, scheduled at
 * the item's own due time, and no other item qualifying). Jest with the in-memory
 * SQLite mock; not a device result.
 */
import {Alert} from 'react-native';
import {act, renderHook} from '@testing-library/react-native';
import {
  db,
  deliveryStore,
  initDatabase,
  remindersStore,
  tasksStore,
} from '../../src/storage';
import {
  acknowledgeReminderAction,
  admitReminderCall,
} from '../../src/scheduler';
import {useScheduleItemModal} from '../../src/ui/screens/calendar/hooks/useScheduleItemModal';
import {
  inferLegacySource,
  resolveReminderSource,
} from '../../src/storage/sourceReminders';

const userId = 'student-ownership';
const DAY = '2030-03-04';
let serial = 0;

const addTask = (title: string, time: string, extra = {}) => {
  const id = `task-${(serial += 1)}`;
  tasksStore.insertTask({
    id,
    userId,
    title,
    priority: 'Medium',
    category: 'Academics',
    isCompleted: false,
    dueDate: DAY,
    dueTime: time,
    ...extra,
  });
  return id;
};

/** An unlinked reminder scheduled at `time` on DAY (how the form schedules one). */
const addReminder = (
  task: string,
  time: string,
  status: 'pending' | 'acknowledged' = 'pending',
) => {
  const id = `rem-${(serial += 1)}`;
  const at = new Date(`${DAY}T${time}:00`).toISOString();
  remindersStore.insertReminder({
    id,
    userId,
    task,
    description: 'Scheduled reminder',
    scheduledAt: at,
    triggerAt: at,
    status,
    preCastAudioPath: null,
  });
  return id;
};

const status = (id: string) => remindersStore.getReminderById(id)?.status;

describe('reminder ownership without title guessing', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    db.executeSync('DELETE FROM reminders');
    db.executeSync('DELETE FROM tasks');
    db.executeSync('DELETE FROM events');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('evidence rule', () => {
    test('needs the title and the item time, and exactly one candidate', () => {
      const task = addTask('Study', '10:00');
      const onTime = addReminder('  STUDY ', '10:00');
      const otherTime = addReminder('Study', '11:00');
      const reminder = (id: string) => {
        const row = remindersStore.getReminderById(id);
        if (!row) throw new Error('missing');
        return row;
      };
      expect(resolveReminderSource(db, reminder(onTime))).toEqual({
        type: 'task',
        id: task,
        linked: false,
      });
      expect(resolveReminderSource(db, reminder(otherTime))).toBeNull();

      // A second "study" item due at the same minute makes it ambiguous.
      addTask('study', '10:00');
      expect(
        inferLegacySource(db, userId, 'Study', reminder(onTime).scheduledAt),
      ).toBeNull();
    });
  });

  describe('Calendar form', () => {
    const renderForm = () =>
      renderHook(() =>
        useScheduleItemModal({
          userId,
          selectedDate: new Date(`${DAY}T00:00:00`),
          onSaved: jest.fn(),
          onRefresh: jest.fn(),
        }),
      );

    test('a new item gets one reminder with an exact link to it', () => {
      const {result} = renderForm();
      act(() => result.current.openNew('task'));
      act(() => {
        result.current.updateField('title', 'Read chapter 4');
        result.current.updateField('time', '09:30');
      });
      act(() => result.current.save());

      const task = tasksStore
        .getAllTasks(userId)
        .find(t => t.title === 'Read chapter 4');
      expect(task).toBeDefined();
      const reminders = remindersStore.getPendingReminders(userId);
      expect(reminders).toHaveLength(1);
      expect(deliveryStore.get(reminders[0].id)).toMatchObject({
        sourceType: 'task',
        sourceId: task?.id,
      });
    });

    test('editing one "Study" task replaces only its own reminder', () => {
      const mine = addTask('Study', '10:00');
      const mineReminder = addReminder('Study', '10:00');
      // Another task with the same title, linked exactly to its reminder.
      const theirs = addTask('Study', '15:00');
      const theirsReminder = addReminder('Study', '15:00');
      deliveryStore.linkSource(theirsReminder, 'task', theirs);
      // A standalone reminder that only shares the title.
      const standalone = addReminder('Study', '20:00');

      const item = tasksStore.getAllTasks(userId).find(t => t.id === mine);
      if (!item) throw new Error('missing');
      const {result} = renderForm();
      act(() => result.current.openEdit(item, 'task'));
      act(() => result.current.updateField('time', '11:00'));
      act(() => result.current.save());

      expect(remindersStore.getReminderById(mineReminder)).toBeNull();
      expect(status(theirsReminder)).toBe('pending');
      expect(status(standalone)).toBe('pending');
      const replacement = deliveryStore.findBySource(userId, 'task', mine);
      expect(replacement).toHaveLength(1);
      expect(
        remindersStore.getReminderById(replacement[0])?.scheduledAt,
      ).toBe(new Date(`${DAY}T11:00:00`).toISOString());
    });

    test('deleting a task removes its reminders and leaves same-title ones', () => {
      const mine = addTask('Quiz', '08:00');
      const mineReminder = addReminder('Quiz', '08:00');
      const standalone = addReminder('quiz', '13:00');
      jest
        .spyOn(Alert, 'alert')
        .mockImplementation((_title, _message, buttons) => {
          buttons?.find(b => b.text === 'Delete')?.onPress?.();
        });
      const item = tasksStore.getAllTasks(userId).find(t => t.id === mine);
      if (!item) throw new Error('missing');
      const {result} = renderForm();
      act(() => result.current.openEdit(item, 'task'));
      act(() => result.current.delete(mine, 'task'));

      expect(remindersStore.getReminderById(mineReminder)).toBeNull();
      expect(status(standalone)).toBe('pending');
    });
  });

  describe('call suppression', () => {
    test('a completed task silences only its own reminder', () => {
      addTask('Lab report', '09:00', {isCompleted: true});
      const own = addReminder('Lab report', '09:00');
      const other = addReminder('Lab report', '17:00');

      expect(admitReminderCall({reminderId: own}, userId)).toMatchObject({
        admitted: false,
        reason: 'task_completed',
      });
      expect(status(own)).toBe('acknowledged');
      expect(admitReminderCall({reminderId: other}, userId)).toMatchObject({
        admitted: true,
      });
    });

    test('an acknowledged reminder silences only the same alert', () => {
      addReminder('Pay tuition', '12:00', 'acknowledged');
      const duplicate = addReminder('pay  tuition', '12:00');
      const later = addReminder('Pay tuition', '18:00');

      expect(admitReminderCall({reminderId: duplicate}, userId)).toMatchObject(
        {admitted: false, reason: 'already_acknowledged'},
      );
      expect(admitReminderCall({reminderId: later}, userId)).toMatchObject({
        admitted: true,
      });
    });
  });

  describe('acknowledge', () => {
    test('also acknowledges the same item’s reminders, never title-only ones', async () => {
      const task = addTask('Essay', '14:00');
      const first = addReminder('Essay', '14:00');
      const second = addReminder('Essay', '07:00');
      deliveryStore.linkSource(second, 'task', task);
      const titleOnly = addReminder('Essay', '21:00');

      const outcome = await acknowledgeReminderAction(first, userId);
      expect(outcome.ok).toBe(true);
      expect(status(first)).toBe('acknowledged');
      expect(status(second)).toBe('acknowledged');
      expect(status(titleOnly)).toBe('pending');
      // Acknowledged is not completed.
      expect(
        tasksStore.getAllTasks(userId).find(t => t.id === task)?.isCompleted,
      ).toBe(false);
    });
  });
});
