import {act, fireEvent, render, screen} from '@testing-library/react-native';
import type {AgendaItem} from '../src/core/domain/planner';
import {
  calendarIntervals,
  calendarRangeLabel,
  calendarWeek,
} from '../src/features/calendar/calendarTimeline';
import {DayTimeline} from '../src/features/calendar/DayTimeline';
import {PlannerScreen} from '../src/features/calendar/PlannerScreen';
import {defaultPreferences} from '../src/core/domain/preferences';
import type {AlarmClient} from '../src/core/native/reminders';
import {
  createPlannerFixture,
  eventDraft,
  fixtureNow,
  taskDraft,
} from './helpers/plannerFixtures';

function item(id: string, at: string, endAt: string | null): AgendaItem {
  return {
    id,
    key: id,
    kind: 'event',
    title: id,
    at,
    endAt,
    date: '2026-10-22',
    occurrenceKey: id,
    status: 'ACTIVE',
    timezone: 'UTC',
  };
}

describe('calendar timeline with real agenda times', () => {
  it('packs overlapping intervals side by side and reuses columns after a group ends', () => {
    const result = calendarIntervals(
      [
        item('first', '2026-10-22T09:00:00.000Z', '2026-10-22T10:00:00.000Z'),
        item('overlap', '2026-10-22T09:30:00.000Z', '2026-10-22T11:00:00.000Z'),
        item(
          'touching',
          '2026-10-22T11:00:00.000Z',
          '2026-10-22T12:00:00.000Z',
        ),
      ],
      '2026-10-22',
      'UTC',
      '24h',
    ).timed;
    expect(result.map(({column, columns}) => [column, columns])).toEqual([
      [0, 2],
      [1, 2],
      [0, 1],
    ]);
  });

  it('clips overnight carry-in in the selected timezone and separates date-only tasks', () => {
    const dateOnly = {
      ...item('date only', '2026-10-22T09:00:00.000Z', null),
      kind: 'task' as const,
      at: null,
    };
    const result = calendarIntervals(
      [
        item(
          'overnight',
          '2026-10-21T15:00:00.000Z',
          '2026-10-21T18:00:00.000Z',
        ),
        item('morning', '2026-10-21T20:30:00.000Z', '2026-10-21T21:30:00.000Z'),
        dateOnly,
      ],
      '2026-10-22',
      'Asia/Manila',
      '12h',
    );
    expect(result.timed.map(({start, end}) => [start, end])).toEqual([
      [0, 120],
      [270, 330],
    ]);
    expect(result.timed[0]?.label).toBe('11:00 PM – 2:00 AM · spans midnight');
    expect(result.dateOnly).toEqual([dateOnly]);
  });

  it('uses real bounded repository recurrence occurrences rather than a second recurrence engine', () => {
    const fixture = createPlannerFixture();
    try {
      fixture.repository.createEvent({
        token: 'timeline_series',
        draft: eventDraft({
          recurrence: {weekdays: [4], untilDate: '2026-11-05'},
        }),
        reminderLeadMinutes: null,
      });
      const page = fixture.repository.agendaPage({
        fromDate: '2026-10-29',
        toDate: '2026-10-29',
        timezone: 'Asia/Manila',
        limit: 20,
      });
      const result = calendarIntervals(
        page.items,
        '2026-10-29',
        'Asia/Manila',
        '24h',
      );
      expect(result.timed).toHaveLength(1);
      expect(result.timed[0]?.start).toBe(17 * 60);
      expect(result.timed[0]?.label).toBe('17:00 – 18:00');
      expect(page.items[0]?.at).toBe('2026-10-29T09:00:00.000Z');
    } finally {
      fixture.close();
    }
  });

  it('keeps boundary week dates valid and labels a year-crossing range', () => {
    expect(calendarWeek('2000-01-01')).toEqual(['2000-01-01', '2000-01-02']);
    expect(calendarRangeLabel('2026-12-31', 'week')).toContain('Jan 3');
    expect(calendarRangeLabel('2026-12-31', 'week')).toContain('2027');
  });

  it('uses saved Monday or Sunday boundaries in both dates and their range label', () => {
    expect(calendarWeek('2026-10-27', true)).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ]);
    expect(calendarWeek('2026-10-27', false)).toEqual([
      '2026-10-25',
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
    ]);
    expect(calendarRangeLabel('2026-10-27', 'week', true)).toBe(
      'Oct 26 – Nov 1, 2026',
    );
    expect(calendarRangeLabel('2026-10-27', 'week', false)).toBe(
      'Oct 25 – Oct 31, 2026',
    );
  });

  it('keeps ISO range labels available when Android locale formatting throws', () => {
    const formatter = jest
      .spyOn(Intl, 'DateTimeFormat')
      .mockImplementation(() => {
        throw new RangeError('formatter unavailable');
      });
    try {
      expect(calendarRangeLabel('2026-10-22', 'week')).toBe(
        '2026-10-19 – 2026-10-25',
      );
      expect(calendarRangeLabel('2026-10-22', 'month')).toBe('2026-10');
    } finally {
      formatter.mockRestore();
    }
  });

  it('opens saved item details from an actual card and uses the selected timezone for the current-time line', () => {
    const selected = item(
      'Lecture',
      '2026-10-22T09:00:00.000Z',
      '2026-10-22T10:00:00.000Z',
    );
    const onSelect = jest.fn();
    render(
      <DayTimeline
        items={[selected]}
        date="2026-10-22"
        timezone="Asia/Manila"
        clockFormat="24h"
        now={new Date('2026-10-21T20:00:00.000Z')}
        onSelect={onSelect}
      />,
    );
    fireEvent.press(screen.getByRole('button', {name: 'Event: Lecture'}));
    expect(onSelect).toHaveBeenCalledWith(selected);
    expect(screen.getByText('17:00 – 18:00')).toBeTruthy();
    expect(screen.getByTestId('calendar-current-time')).toBeTruthy();
  });

  it('preserves manual item access when the selected runtime timezone is unavailable', () => {
    const selected = item(
      'Fallback lecture',
      '2026-10-22T09:00:00.000Z',
      '2026-10-22T10:00:00.000Z',
    );
    const onSelect = jest.fn();
    render(
      <DayTimeline
        items={[selected]}
        date="2026-10-22"
        timezone="Invalid/Timezone"
        clockFormat="24h"
        now={new Date(fixtureNow)}
        onSelect={onSelect}
      />,
    );
    expect(screen.getByRole('alert')).toBeTruthy();
    fireEvent.press(
      screen.getByRole('button', {name: 'Event: Fallback lecture'}),
    );
    expect(onSelect).toHaveBeenCalledWith(selected);
  });

  it('keeps all 25 real records reachable by pages and never labels a partial page as the full day', async () => {
    const fixture = createPlannerFixture();
    try {
      for (let index = 0; index < 25; index++)
        fixture.repository.createTask({
          token: `timeline_${index}`,
          draft: taskDraft({title: `Timed ${String(index).padStart(2, '0')}`}),
          reminderLeadMinutes: null,
        });
      const snapshot = jest.spyOn(fixture.repository, 'snapshot');
      const reminderClient = {
        capabilities: jest.fn(async () => ({
          enabled: false,
          notifications: false,
          exact: false,
          channelImportance: 4,
        })),
      } as unknown as AlarmClient;
      render(
        <PlannerScreen
          mode="Calendar"
          preferences={defaultPreferences('UTC')}
          factory={() => fixture.repository}
          reminderClient={reminderClient}
          now={() => new Date(fixtureNow)}
          onDraftStateChange={jest.fn()}
          onRouteChange={jest.fn()}
        />,
      );
      await screen.findByText(/This is one page/);
      expect(
        screen.getAllByRole('button', {name: /^Task: Timed/}),
      ).toHaveLength(20);
      await act(async () =>
        fireEvent.press(screen.getByRole('button', {name: 'Next agenda page'})),
      );
      expect(
        screen.getAllByRole('button', {name: /^Task: Timed/}),
      ).toHaveLength(5);
      expect(screen.getByText(/This is one page/)).toBeTruthy();
      expect(screen.queryByText(/Nothing scheduled/)).toBeNull();
      await act(async () =>
        fireEvent.press(
          screen.getByRole('button', {name: 'Previous agenda page'}),
        ),
      );
      expect(
        screen.getAllByRole('button', {name: /^Task: Timed/}),
      ).toHaveLength(20);
      expect(snapshot).not.toHaveBeenCalled();
    } finally {
      fixture.close();
    }
  });

  it('updates the actual week strip and header when Profile changes the saved week start', async () => {
    const fixture = createPlannerFixture();
    try {
      const factory = () => fixture.repository;
      const props = {
        mode: 'Calendar' as const,
        factory,
        reminderClient: {
          capabilities: jest.fn(async () => ({
            enabled: false,
            notifications: false,
            exact: false,
            channelImportance: 4,
          })),
        } as unknown as AlarmClient,
        now: () => new Date(fixtureNow),
        onDraftStateChange: jest.fn(),
        onRouteChange: jest.fn(),
      };
      const preferences = defaultPreferences('UTC');
      const result = render(
        <PlannerScreen
          {...props}
          preferences={{...preferences, weekStartsMonday: true}}
        />,
      );
      await screen.findByRole('radio', {name: 'Day: 2026-10-25'});
      expect(screen.getByText('Oct 19 – Oct 25, 2026')).toBeTruthy();
      expect(screen.queryByRole('radio', {name: 'Day: 2026-10-18'})).toBeNull();
      await act(async () =>
        result.rerender(
          <PlannerScreen
            {...props}
            preferences={{...preferences, weekStartsMonday: false}}
          />,
        ),
      );
      expect(screen.getByRole('radio', {name: 'Day: 2026-10-18'})).toBeTruthy();
      expect(screen.getByText('Oct 18 – Oct 24, 2026')).toBeTruthy();
      expect(screen.queryByRole('radio', {name: 'Day: 2026-10-25'})).toBeNull();
      expect(
        screen.getByRole('radio', {name: 'Day: 2026-10-22'}).props
          .accessibilityState.checked,
      ).toBe(true);
    } finally {
      fixture.close();
    }
  });
});
