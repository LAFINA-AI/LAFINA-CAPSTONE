/**
 * AGY-PORT 08: the Calendar event form accepts overnight events, refuses an
 * equal start and end or a time the clocks skip, asks earlier/later for a
 * repeated time, and says so on screen. Synthetic events only; explicit IANA
 * zones, so the cases hold on any host.
 */
import React from 'react';
import {Alert} from 'react-native';
import type {AlertButton} from 'react-native';
import {act, render, renderHook} from '@testing-library/react-native';
import {db, initDatabase} from '../../src/storage';
import type {Event} from '../../src/storage';
import * as eventTime from '../../src/storage/eventTime';
import {useScheduleItemModal} from '../../src/ui/screens/calendar/hooks/useScheduleItemModal';
import {AddTaskEventModal} from '../../src/ui/screens/calendar/components/AddTaskEventModal';
import type {ScheduleItemModalState} from '../../src/ui/screens/calendar/types';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';

type AlertCall = {title: string; message?: string; buttons?: AlertButton[]};

const captureAlerts = (): AlertCall[] => {
  const calls: AlertCall[] = [];
  jest.spyOn(Alert, 'alert').mockImplementation((title, message, buttons) => {
    calls.push({title, message, buttons: buttons as AlertButton[] | undefined});
  });
  return calls;
};

let serial = 0;
const owner = (label: string): string => {
  serial += 1;
  return `p08ui-${label}-${serial}`;
};

const eventsOf = (userId: string) =>
  db.executeSync(
    `SELECT e.id, e.title, e.date, e.start_time, e.end_time,
            m.time_zone, m.start_at, m.start_fold
       FROM events e LEFT JOIN event_time_local m ON m.event_id = e.id
      WHERE e.user_id = ? AND e.deleted_at IS NULL ORDER BY e.created_at, e.id`,
    [userId],
  ).rows as Array<Record<string, unknown>>;

const remindersOf = (userId: string) =>
  db.executeSync(
    'SELECT scheduled_at FROM reminders WHERE user_id = ? AND deleted_at IS NULL',
    [userId],
  ).rows as Array<Record<string, unknown>>;

const formFor = (userId: string, day: Date) =>
  renderHook(() =>
    useScheduleItemModal({
      userId,
      selectedDate: day,
      onSaved: () => undefined,
      onRefresh: () => undefined,
    }),
  );

const fill = (
  state: () => ScheduleItemModalState,
  title: string,
  start: string,
  end: string,
): void => {
  act(() => state().openNew('event'));
  act(() => state().updateField('title', title));
  act(() => state().updateField('time', start));
  act(() => state().updateField('endTime', end));
};

describe('AGY-PORT 08 Calendar event form', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('an overnight event saves with the next-day end, this device timezone and an exact reminder', () => {
    jest.spyOn(eventTime, 'deviceTimeZone').mockReturnValue('Asia/Manila');
    const alerts = captureAlerts();
    const me = owner('overnight');
    const {result} = formFor(me, new Date(2027, 0, 15));
    fill(() => result.current, 'Night shift', '23:00', '01:00');
    act(() => result.current.save(null));
    expect(alerts).toEqual([]);
    expect(eventsOf(me)).toEqual([
      expect.objectContaining({
        title: 'Night shift',
        date: '2027-01-15',
        start_time: '23:00',
        end_time: '01:00',
        time_zone: 'Asia/Manila',
        start_at: '2027-01-15T15:00:00.000Z',
      }),
    ]);
    expect(remindersOf(me)).toEqual([
      {scheduled_at: '2027-01-15T15:00:00.000Z'},
    ]);
  });

  test('an equal start and end, or a time the clocks skip, is refused and nothing is saved', () => {
    jest.spyOn(eventTime, 'deviceTimeZone').mockReturnValue('America/New_York');
    const alerts = captureAlerts();
    const me = owner('refused');
    const {result} = formFor(me, new Date(2027, 2, 14));
    fill(() => result.current, 'Zero', '09:00', '09:00');
    act(() => result.current.save(null));
    // US spring forward 2027-03-14: 02:30 does not exist.
    fill(() => result.current, 'Gap', '02:30', '03:30');
    act(() => result.current.save(null));
    expect(alerts.map(a => [a.title, a.message])).toEqual([
      [
        'Invalid Time Range',
        'The end time must be different from the start time.',
      ],
      [
        'Invalid Time Range',
        '02:30 does not exist on 2027-03-14 in America/New_York (the clocks change). Choose another time.',
      ],
    ]);
    expect(eventsOf(me)).toEqual([]);
    expect(result.current.visible).toBe(true);
  });

  test('a repeated time asks earlier or later, and the choice decides the instant and the reminder', () => {
    jest.spyOn(eventTime, 'deviceTimeZone').mockReturnValue('America/New_York');
    const alerts = captureAlerts();
    const me = owner('repeated');
    // US fall back 2027-11-07: 01:30 happens twice.
    const {result} = formFor(me, new Date(2027, 10, 7));
    fill(() => result.current, 'Twice', '01:30', '02:30');
    act(() => result.current.save(null));
    expect(alerts).toHaveLength(1);
    expect(alerts[0].title).toBe('Repeated time');
    expect(alerts[0].buttons?.map(b => b.text)).toEqual([
      'Cancel',
      'Earlier',
      'Later',
    ]);
    expect(eventsOf(me)).toEqual([]);

    act(() => alerts[0].buttons?.find(b => b.text === 'Later')?.onPress?.());
    expect(eventsOf(me)).toEqual([
      expect.objectContaining({
        start_time: '01:30',
        start_at: '2027-11-07T06:30:00.000Z',
        start_fold: 'later',
      }),
    ]);
    expect(remindersOf(me)).toEqual([
      {scheduled_at: '2027-11-07T06:30:00.000Z'},
    ]);
  });

  test('a legacy event whose time is untouched saves as before, even at a time the clocks skip', () => {
    jest.spyOn(eventTime, 'deviceTimeZone').mockReturnValue('America/New_York');
    const alerts = captureAlerts();
    const me = owner('legacy');
    const now = new Date().toISOString();
    db.executeSync(
      `INSERT INTO events (id, user_id, title, date, start_time, end_time, created_at, updated_at)
       VALUES ('legacy-gap', ?, 'Old', '2027-03-14', '02:30', '02:30', ?, ?)`,
      [me, now, now],
    );
    const legacy = {
      id: 'legacy-gap',
      userId: me,
      title: 'Old',
      date: '2027-03-14',
      startTime: '02:30',
      endTime: '02:30',
      createdAt: now,
      updatedAt: now,
    } as Event;
    const {result} = formFor(me, new Date(2027, 2, 1));
    act(() => result.current.openEdit(legacy, 'event'));
    act(() => result.current.updateField('title', 'Old, renamed'));
    act(() => result.current.save(null));
    expect(alerts).toEqual([]);
    expect(eventsOf(me)).toEqual([
      expect.objectContaining({
        title: 'Old, renamed',
        start_time: '02:30',
        end_time: '02:30',
      }),
    ]);
  });

  test('the form says when an event ends the next day, and when it was saved in another timezone', () => {
    jest.spyOn(eventTime, 'deviceTimeZone').mockReturnValue('America/New_York');
    const state = (
      overrides: Partial<ScheduleItemModalState>,
    ): ScheduleItemModalState =>
      ({
        visible: true,
        modalType: 'event',
        editingItem: null,
        form: {
          title: 'x',
          date: '2026-12-31',
          time: '23:00',
          endTime: '00:30',
          priority: 'Medium',
          category: 'Work',
          location: '',
          notes: '',
          recurrenceRule: null,
        },
        showTimePicker: false,
        showEndTimePicker: false,
        openNew: () => undefined,
        openEdit: () => undefined,
        close: () => undefined,
        updateField: () => undefined,
        save: () => undefined,
        delete: () => undefined,
        setShowTimePicker: () => undefined,
        setShowEndTimePicker: () => undefined,
        ...overrides,
      } as ScheduleItemModalState);
    const screen = render(
      <ThemeProvider userId={null}>
        <AddTaskEventModal
          state={state({
            editingItem: {
              id: 'e',
              title: 'x',
              timeZone: 'Asia/Manila',
            } as Event,
          })}
          timeFormat24h={false}
        />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('event-time-hint').props.children).toBe(
      'Ends the next day (2027-01-01).',
    );
    expect(screen.getByTestId('event-zone-hint').props.children).toBe(
      'Saved on this device in Asia/Manila. A changed time is saved in America/New_York.',
    );
    screen.unmount();

    const sameDay = render(
      <ThemeProvider userId={null}>
        <AddTaskEventModal
          state={state({
            form: {...state({}).form, time: '09:00', endTime: '10:00'},
          })}
          timeFormat24h={false}
        />
      </ThemeProvider>,
    );
    expect(sameDay.queryByTestId('event-time-hint')).toBeNull();
    expect(sameDay.queryByTestId('event-zone-hint')).toBeNull();
  });
});
