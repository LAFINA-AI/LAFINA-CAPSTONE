/**
 * Alarm plan A2: the alarms table, the JS schedule mirror, the native bridge
 * (reconcile + events) and the Schedule → Alarms, Home and health screens.
 * Native ringing itself is covered by the JVM tests (AlarmScheduleTest) and
 * still needs a device; nothing here claims an alarm rang.
 */
import React from 'react';
import {NativeModules, Platform} from 'react-native';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import {
  db,
  initDatabase,
  alarmsStore,
  CURRENT_SCHEMA_VERSION,
} from '../../src/storage';
import {
  describeRepeat,
  describeTimeUntil,
  nextAlarmTrigger,
  oneShotDateFor,
  repeatDaysFromRule,
  WEEKDAYS,
} from '../../src/scheduler/alarmSchedule';
import {
  nextAlarm,
  onAlarmDismissedForBriefing,
  reconcileAlarms,
  syncAlarmEvents,
} from '../../src/scheduler/alarmService';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {AlarmsView} from '../../src/ui/screens/calendar/components/AlarmsView';
import {NextAlarmCard} from '../../src/ui/screens/dashboard/components/NextAlarmCard';

/** Saturday 14 Nov 2026, 22:00 local. */
const SAT_NIGHT = new Date(2026, 10, 14, 22, 0, 0);
let n = 0;
let user = '';
const LafinaAlarm = NativeModules.LafinaAlarm as Record<string, jest.Mock>;

const originalOs = Platform.OS;
beforeAll(async () => {
  await initDatabase();
  // The bridge only talks to native on Android.
  Platform.OS = 'android';
});
afterAll(() => {
  Platform.OS = originalOs;
});
beforeEach(() => {
  user = `alarm-user-${++n}`;
  jest.clearAllMocks();
});

describe('schema and store', () => {
  it('schema 27 adds the alarms table', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(27);
    const columns = db
      .executeSync('PRAGMA table_info(alarms)')
      .rows.map((row: Record<string, unknown>) => row.name);
    expect(columns).toEqual(
      expect.arrayContaining([
        'repeat_days',
        'one_shot_date',
        'snooze_minutes',
        'briefing',
        'generation',
      ]),
    );
  });

  it('a one-shot alarm gets the next date that time comes', () => {
    const alarm = alarmsStore.create(user, {hour: 6, minute: 0}, db, SAT_NIGHT);
    expect(alarm.oneShotDate).toBe('2026-11-15');
    expect(alarm.enabled).toBe(true);
    expect(alarm.snoozeMinutes).toBe(9);
    const evening = alarmsStore.create(
      user,
      {hour: 23, minute: 30},
      db,
      SAT_NIGHT,
    );
    expect(evening.oneShotDate).toBe('2026-11-14');
  });

  it('every change bumps the generation; a repeating alarm has no date', () => {
    const alarm = alarmsStore.create(user, {
      hour: 6,
      minute: 30,
      repeatDays: WEEKDAYS,
      label: 'Wake up',
    });
    expect(alarm.oneShotDate).toBeNull();
    const changed = alarmsStore.update(alarm.id, user, {minute: 45});
    expect(changed?.generation).toBe(alarm.generation + 1);
    const off = alarmsStore.setEnabled(alarm.id, user, false);
    expect(off?.enabled).toBe(false);
    expect(off?.generation).toBe(alarm.generation + 2);
  });

  it('rejects bad input and another owner', () => {
    expect(() => alarmsStore.create(user, {hour: 24, minute: 0})).toThrow();
    expect(() =>
      alarmsStore.create(user, {hour: 6, minute: 0, snoozeMinutes: 0}),
    ).toThrow();
    expect(() =>
      alarmsStore.create(user, {hour: 6, minute: 0, label: 'x'.repeat(61)}),
    ).toThrow();
    const alarm = alarmsStore.create(user, {hour: 6, minute: 0});
    expect(alarmsStore.get(alarm.id, 'someone-else')).toBeNull();
    expect(alarmsStore.remove(alarm.id, 'someone-else')).toBe(false);
    expect(alarmsStore.remove(alarm.id, user)).toBe(true);
  });

  it('a one-shot that rang is switched off only for the same generation', () => {
    const alarm = alarmsStore.create(user, {hour: 6, minute: 0});
    alarmsStore.markOneShotDone(alarm.id, alarm.generation + 5);
    expect(alarmsStore.get(alarm.id, user)?.enabled).toBe(true);
    alarmsStore.markOneShotDone(alarm.id, alarm.generation);
    expect(alarmsStore.get(alarm.id, user)?.enabled).toBe(false);
  });
});

describe('schedule mirror', () => {
  it('weekday alarm on Saturday night rings Monday', () => {
    const next = nextAlarmTrigger(
      {
        hour: 6,
        minute: 0,
        repeatDays: WEEKDAYS,
        oneShotDate: null,
        enabled: true,
      },
      SAT_NIGHT,
    );
    expect(next).toEqual(new Date(2026, 10, 16, 6, 0, 0));
  });

  it('describes repeats and time until', () => {
    expect(describeRepeat(0)).toBe('Once');
    expect(describeRepeat(127)).toBe('Every day');
    expect(describeRepeat(WEEKDAYS)).toBe('Weekdays');
    expect(describeRepeat(1 | 4)).toBe('Mon, Wed');
    expect(describeTimeUntil(new Date(2026, 10, 15, 5, 12), SAT_NIGHT)).toBe(
      'in 7 h 12 min',
    );
    expect(oneShotDateFor(6, 0, SAT_NIGHT)).toBe('2026-11-15');
    expect(repeatDaysFromRule('RRULE:FREQ=WEEKLY;BYDAY=MO,WE')).toBe(5);
    expect(repeatDaysFromRule('RRULE:FREQ=DAILY')).toBe(127);
  });
});

describe('native bridge', () => {
  it('hands native exactly the owner’s alarms and stores the next ring', async () => {
    const alarm = alarmsStore.create(user, {
      hour: 7,
      minute: 0,
      repeatDays: WEEKDAYS,
    });
    const at = Date.now() + 3600_000;
    LafinaAlarm.reconcile.mockImplementationOnce((list: {id: string}[]) =>
      Promise.resolve(list.map(item => ({id: item.id, nextTriggerMs: at}))),
    );
    await reconcileAlarms(user);
    const sent = LafinaAlarm.reconcile.mock.calls[0][0];
    expect(sent).toEqual([
      expect.objectContaining({
        id: alarm.id,
        ownerId: user,
        hour: 7,
        repeatDays: WEEKDAYS,
        generation: alarm.generation,
        label: 'Alarm',
      }),
    ]);
    expect(alarmsStore.get(alarm.id, user)?.nextTriggerAt).toBe(
      new Date(at).toISOString(),
    );
  });

  it('signed out: native gets no alarms', async () => {
    alarmsStore.create(user, {hour: 7, minute: 0});
    await reconcileAlarms(null);
    expect(LafinaAlarm.reconcile).toHaveBeenLastCalledWith([]);
  });

  it('records native events and the morning briefing after Dismiss', async () => {
    const alarm = alarmsStore.create(user, {
      hour: 6,
      minute: 0,
      briefing: true,
    });
    const now = Date.now();
    LafinaAlarm.drainEvents.mockResolvedValueOnce([
      {alarmId: alarm.id, kind: 'fired', atMs: now - 30_000, generation: 1},
      {
        alarmId: alarm.id,
        kind: 'one_shot_done',
        atMs: now - 30_000,
        generation: 1,
      },
      {alarmId: alarm.id, kind: 'dismissed', atMs: now - 10_000, generation: 1},
    ]);
    const briefed: string[] = [];
    const stop = onAlarmDismissedForBriefing(a => briefed.push(a.id));
    await syncAlarmEvents(user, now);
    stop();
    const stored = alarmsStore.get(alarm.id, user);
    expect(stored?.enabled).toBe(false);
    expect(stored?.lastOutcome).toBe('dismissed');
    expect(stored?.lastFiredAt).not.toBeNull();
    expect(briefed).toEqual([alarm.id]);
  });

  it('changes re-book native without the screen asking', async () => {
    const {startAlarmLifecycle} = require('../../src/scheduler/alarmService');
    const stop = startAlarmLifecycle(user);
    await waitFor(() => expect(LafinaAlarm.reconcile).toHaveBeenCalled());
    LafinaAlarm.reconcile.mockClear();
    alarmsStore.create(user, {hour: 5, minute: 15});
    await waitFor(() => expect(LafinaAlarm.reconcile).toHaveBeenCalled());
    stop();
  });
});

describe('screens', () => {
  const wrap = (node: React.ReactElement) => (
    <ThemeProvider userId={null}>{node}</ThemeProvider>
  );

  it('Schedule → Alarms: empty state, add, list, toggle', async () => {
    const screen = render(
      wrap(
        <AlarmsView userId={user} refreshTrigger={0} onRefresh={jest.fn()} />,
      ),
    );
    expect(screen.getByText(/No alarms yet/)).toBeTruthy();
    await act(async () => {}); // the health check resolves
    fireEvent.press(screen.getByTestId('alarm-add-button'));
    fireEvent.press(screen.getByTestId('alarm-day-mon'));
    fireEvent.changeText(screen.getByTestId('alarm-label-input'), 'Lab day');
    fireEvent.press(screen.getByTestId('alarm-save-button'));
    const [saved] = alarmsStore.list(user);
    expect(saved.label).toBe('Lab day');
    expect(saved.repeatDays).toBe(1);
    expect(screen.getByText('6:00 AM')).toBeTruthy();
    fireEvent(
      screen.getByTestId(`alarm-switch-${saved.id}`),
      'valueChange',
      false,
    );
    expect(alarmsStore.get(saved.id, user)?.enabled).toBe(false);
  });

  it('shows what could stop an alarm, with a fix', async () => {
    LafinaAlarm.getStatus.mockResolvedValueOnce({
      canScheduleExactAlarms: false,
      canUseFullScreenIntent: true,
      notificationsEnabled: true,
      ignoringBatteryOptimizations: false,
      manufacturer: 'Xiaomi',
    });
    const screen = render(
      wrap(
        <AlarmsView userId={user} refreshTrigger={0} onRefresh={jest.fn()} />,
      ),
    );
    expect(await screen.findByText(/ring a few minutes late/)).toBeTruthy();
    expect(screen.getByText(/battery saver may stop alarms/)).toBeTruthy();
  });

  it('Home shows the next alarm only when one is on', () => {
    const onOpen = jest.fn();
    const empty = render(
      wrap(
        <NextAlarmCard
          userId={user}
          timeFormat24h={false}
          now={SAT_NIGHT}
          onOpenAlarms={onOpen}
        />,
      ),
    );
    expect(empty.queryByTestId('dashboard-next-alarm')).toBeNull();
    alarmsStore.create(
      user,
      {hour: 6, minute: 0, repeatDays: WEEKDAYS},
      db,
      SAT_NIGHT,
    );
    expect(nextAlarm(user, SAT_NIGHT)?.at).toEqual(
      new Date(2026, 10, 16, 6, 0),
    );
    const shown = render(
      wrap(
        <NextAlarmCard
          userId={user}
          timeFormat24h={false}
          now={SAT_NIGHT}
          onOpenAlarms={onOpen}
        />,
      ),
    );
    fireEvent.press(shown.getByTestId('dashboard-next-alarm'));
    expect(onOpen).toHaveBeenCalled();
    expect(shown.getByText(/Next alarm · 6:00 AM/)).toBeTruthy();
  });
});
