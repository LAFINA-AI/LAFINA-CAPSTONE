import {act, fireEvent, render, screen} from '@testing-library/react-native';
import {CalendarMonth} from '../src/features/calendar/CalendarMonth';
import {
  calendarMonth,
  shiftCalendarMonth,
} from '../src/features/calendar/calendarMonthModel';
import {PlannerScreen} from '../src/features/calendar/PlannerScreen';
import {defaultPreferences} from '../src/core/domain/preferences';
import type {AlarmClient} from '../src/core/native/reminders';
import {
  createPlannerFixture,
  fixtureNow,
  taskDraft,
} from './helpers/plannerFixtures';

describe('date-only calendar month', () => {
  it('lays out a leap month from Monday with at most six complete weeks', () => {
    const result = calendarMonth('2024-02-29');
    expect(result.title).toBe('February 2024');
    expect(result.cells.slice(0, 4)).toEqual([null, null, null, '2024-02-01']);
    expect(result.cells.filter(Boolean)).toHaveLength(29);
    expect(calendarMonth('2026-03-01').cells).toHaveLength(42);
  });

  it('clamps month-end selection and keeps four-digit years without timezone conversion', () => {
    expect(shiftCalendarMonth('2024-01-31', 1)).toBe('2024-02-29');
    expect(shiftCalendarMonth('2023-03-31', -1)).toBe('2023-02-28');
    expect(shiftCalendarMonth('2026-12-22', 1)).toBe('2027-01-22');
    expect(calendarMonth('0001-01-01').cells[0]).toBe('0001-01-01');
    expect(calendarMonth('0099-01-01').title).toBe('January 99');
  });

  it.each([
    '2026-02-29',
    '1900-02-29',
    '0000-01-01',
    '2026-13-01',
    'not a date',
  ])('rejects invalid date %s', date =>
    expect(() => calendarMonth(date)).toThrow(),
  );

  it('rejects movement beyond the supported four-digit year range', () => {
    expect(() => shiftCalendarMonth('0001-01-01', -1)).toThrow();
    expect(() => shiftCalendarMonth('9999-12-31', 1)).toThrow();
  });
});

describe('calendar month presentation', () => {
  it('selects exact date-only values, exposes selected state and moves by a clamped month', () => {
    const onSelect = jest.fn();
    render(
      <CalendarMonth
        selectedDate="2024-01-31"
        today="2024-01-15"
        onSelect={onSelect}
      />,
    );
    expect(
      screen.getByRole('radio', {name: 'Day: 2024-01-31'}).props
        .accessibilityState.checked,
    ).toBe(true);
    fireEvent.press(screen.getByRole('radio', {name: 'Day: 2024-01-02'}));
    expect(onSelect).toHaveBeenLastCalledWith('2024-01-02');
    fireEvent.press(screen.getByRole('button', {name: 'Next month'}));
    expect(onSelect).toHaveBeenLastCalledWith('2024-02-29');
    fireEvent.press(screen.getByRole('button', {name: 'Today'}));
    expect(onSelect).toHaveBeenLastCalledWith('2024-01-15');
  });

  it('disables navigation outside the existing planner date range', () => {
    const onSelect = jest.fn();
    const view = render(
      <CalendarMonth
        selectedDate="2000-01-01"
        today="2000-01-01"
        onSelect={onSelect}
      />,
    );
    fireEvent.press(screen.getByRole('button', {name: 'Previous month'}));
    expect(onSelect).not.toHaveBeenCalled();
    view.rerender(
      <CalendarMonth
        selectedDate="2100-12-31"
        today="2100-12-31"
        onSelect={onSelect}
      />,
    );
    fireEvent.press(screen.getByRole('button', {name: 'Next month'}));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('feeds the selected date into the existing paged agenda without scanning the database', async () => {
    const fixture = createPlannerFixture();
    try {
      fixture.repository.createTask({
        token: 'month_selection',
        draft: taskDraft({
          title: 'Selected day assignment',
          dueAt: null,
          dueDate: '2026-10-23',
          timezone: 'Asia/Manila',
        }),
        reminderLeadMinutes: null,
      });
      const agendaPage = jest.spyOn(fixture.repository, 'agendaPage');
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
          preferences={defaultPreferences('Asia/Manila')}
          factory={() => fixture.repository}
          reminderClient={reminderClient}
          now={() => new Date(fixtureNow)}
          onDraftStateChange={jest.fn()}
          onRouteChange={jest.fn()}
        />,
      );
      await screen.findByText(/Android alerts are off/);
      await act(async () => {
        fireEvent.press(screen.getByRole('radio', {name: 'Day: 2026-10-23'}));
      });
      expect(
        screen.getByRole('button', {name: 'Task: Selected day assignment'}),
      ).toBeTruthy();
      expect(agendaPage).toHaveBeenLastCalledWith({
        fromDate: '2026-10-23',
        toDate: '2026-10-23',
        timezone: 'Asia/Manila',
        after: undefined,
        limit: 20,
      });
      expect(snapshot).not.toHaveBeenCalled();
      await act(async () => {
        fireEvent.press(
          screen.getByRole('radio', {name: 'Calendar display: Day'}),
        );
      });
      expect(screen.queryByRole('button', {name: 'Next month'})).toBeNull();
      expect(screen.getByRole('button', {name: 'Next week'})).toBeTruthy();
    } finally {
      fixture.close();
    }
  });
});
