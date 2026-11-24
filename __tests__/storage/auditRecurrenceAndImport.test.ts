import {initDatabase, remindersStore, tasksStore} from '../../src/storage';
import {getOccurrences} from '../../src/storage/rruleHelper';
import {createNextRecurringReminder} from '../../src/scheduler/reminderActions';
import {parseIcsString, MAX_ICS_BYTES} from '../../src/storage/icsHelper';
import * as eventTime from '../../src/storage/eventTime';
import {persistImportedCalendarItems} from '../../src/ui/screens/calendar/hooks/calendarImportPersistence';
import {plannerQueries} from '../../src/storage/plannerQueries';

beforeAll(async () => {
  await initDatabase();
});
afterEach(() => jest.restoreAllMocks());
const at = (date: string) => new Date(`${date}T09:00:00`).toISOString();

test('finite reminders end at their original COUNT and keep the month-end anchor', () => {
  const owner = 'audit-finite';
  remindersStore.insertReminder({
    id: 'audit-r1',
    userId: owner,
    task: 'Monthly review',
    description: '[RRULE:FREQ=MONTHLY;COUNT=3]',
    scheduledAt: at('2027-01-31'),
    triggerAt: at('2027-01-31'),
    status: 'acknowledged',
    preCastAudioPath: null,
  });
  const second = createNextRecurringReminder(
    remindersStore.getReminderById('audit-r1')!,
    owner,
  )!;
  expect(new Date(second.triggerAt).getDate()).toBe(28);
  const third = createNextRecurringReminder(
    remindersStore.getReminderById(second.id)!,
    owner,
  )!;
  expect(new Date(third.triggerAt).getDate()).toBe(31);
  expect(new Date(third.triggerAt).getMonth()).toBe(2);
  expect(
    createNextRecurringReminder(
      remindersStore.getReminderById(third.id)!,
      owner,
    ),
  ).toBeNull();
});

test.each(['DAILY', 'WEEKLY'] as const)(
  'old finite %s series still reach their requested window after 1000 occurrences',
  freq => {
    const result = getOccurrences(
      '2000-01-01',
      `FREQ=${freq};COUNT=20000`,
      new Date(2026, 10, 24),
      new Date(2026, 10, 30, 23, 59),
    );
    expect(result.length).toBeGreaterThan(0);
    expect(
      result.every(date => date >= '2026-11-24' && date <= '2026-11-30'),
    ).toBe(true);
  },
);

test('recurring reminders keep their lead time', () => {
  const owner = 'audit-lead';
  remindersStore.insertReminder({
    id: 'audit-lead1',
    userId: owner,
    task: 'Lead test',
    description: '[RRULE:FREQ=DAILY;COUNT=2]',
    scheduledAt: at('2027-01-01'),
    triggerAt: new Date(Date.parse(at('2027-01-01')) - 900000).toISOString(),
    status: 'acknowledged',
    preCastAudioPath: null,
  });
  const next = createNextRecurringReminder(
    remindersStore.getReminderById('audit-lead1')!,
    owner,
  )!;
  const saved = remindersStore.getReminderById(next.id)!;
  expect(Date.parse(saved.scheduledAt) - Date.parse(saved.triggerAt)).toBe(
    900000,
  );
});

const calendar = (extra: string[] = []) =>
  [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    'UID:audit-utc',
    'DTSTART:20200101T010000Z',
    'DTEND:20200101T020000Z',
    'SUMMARY:Class',
    ...extra,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

test('UTC repeating imports convert to Manila and remain visible years after DTSTART', () => {
  jest.spyOn(eventTime, 'deviceTimeZone').mockReturnValue('Asia/Manila');
  const parsed = parseIcsString(calendar(['RRULE:FREQ=DAILY']));
  expect(parsed.blocks).toHaveLength(1);
  expect(parsed.blocks[0]).toMatchObject({
    startTime: '09:00',
    endTime: '10:00',
    recurrenceRule: 'RRULE:FREQ=DAILY',
  });
  const ids = persistImportedCalendarItems('audit-import', parsed);
  expect(
    plannerQueries.window('audit-import', '2030-01-01', '2030-01-01').blocks,
  ).toHaveLength(1);
  expect(ids.blockIds).toHaveLength(1);
});

test('a completed task stays completed after an ICS round trip is persisted', () => {
  const parsed = parseIcsString(
    [
      'BEGIN:VCALENDAR',
      'BEGIN:VTODO',
      'UID:done',
      'SUMMARY:Done',
      'STATUS:COMPLETED',
      'END:VTODO',
      'END:VCALENDAR',
    ].join('\r\n'),
  );
  const ids = persistImportedCalendarItems('audit-completed', parsed);
  expect(
    tasksStore
      .getAllTasks('audit-completed')
      .find(task => task.id === ids.taskIds[0])?.isCompleted,
  ).toBe(true);
});

test('dense and oversized imports are rejected before unbounded expansion', () => {
  expect(() => parseIcsString(calendar(['RRULE:FREQ=SECONDLY']))).toThrow(
    /frequent/,
  );
  expect(() => parseIcsString('x'.repeat(MAX_ICS_BYTES + 1))).toThrow(
    /too large/,
  );
  expect(() =>
    parseIcsString(calendar(['RRULE:FREQ=DAILY', 'EXDATE:20200102T010000Z'])),
  ).toThrow(/too many/);
});

test('finite complex imports are not truncated at two years', () => {
  const parsed = parseIcsString(
    calendar(['RRULE:FREQ=YEARLY;COUNT=6', 'EXDATE:20210101T010000Z']),
  );
  expect(parsed.blocks.some(block => block.date === '2025-01-01')).toBe(true);
});

test('imported month-end rules keep RFC skipping while manual rules keep their existing clamping', () => {
  const from = new Date(2027, 0, 31);
  const to = new Date(2027, 3, 30, 23, 59);
  expect(
    getOccurrences('2027-01-31', 'RRULE:FREQ=MONTHLY;COUNT=3', from, to),
  ).toEqual(['2027-01-31', '2027-03-31']);
  expect(
    getOccurrences('2027-01-31', 'FREQ=MONTHLY;COUNT=3', from, to),
  ).toEqual(['2027-01-31', '2027-02-28', '2027-03-31']);
});
