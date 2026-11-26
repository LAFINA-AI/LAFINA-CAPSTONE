import React from 'react';
import RNFS from 'react-native-fs';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {CalendarScreen} from '../../src/ui/screens/calendar';
import {
  USTP_ACADEMIC_EVENTS,
  formatUstpDateRange,
  getUstpAcademicEvents,
  getUstpEventsOn,
} from '../../src/ui/screens/calendar/utils/ustpAcademicCalendar';
import {db, initDatabase, userStore} from '../../src/storage';
import {calendarVisibilityStore} from '../../src/storage/calendarVisibilityStore';
import {enableUstpForTest} from '../fixtures/ustpEligibility';

describe('USTP Academic Calendar Group', () => {
  let userId: string;
  const mockFs = new Map<string, string>();
  let origExists: typeof RNFS.exists;
  let origReadFile: typeof RNFS.readFile;
  let origWriteFile: typeof RNFS.writeFile;

  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    mockFs.clear();
    calendarVisibilityStore.resetCache();
    origExists = RNFS.exists;
    origReadFile = RNFS.readFile;
    origWriteFile = RNFS.writeFile;

    (RNFS as unknown as Record<string, unknown>).exists = jest.fn(
      async (p: string) => mockFs.has(p),
    );
    (RNFS as unknown as Record<string, unknown>).readFile = jest.fn(
      async (p: string) => mockFs.get(p) ?? '',
    );
    (RNFS as unknown as Record<string, unknown>).writeFile = jest.fn(
      async (p: string, content: string) => {
        mockFs.set(p, content);
      },
    );

    db.executeSync('DELETE FROM active_session');
    db.executeSync('DELETE FROM sync_outbox');
    db.executeSync('DELETE FROM reminders');
    db.executeSync('DELETE FROM notes');
    db.executeSync('DELETE FROM custom_categories');
    db.executeSync('DELETE FROM time_blocks');
    db.executeSync('DELETE FROM events');
    db.executeSync('DELETE FROM tasks');
    db.executeSync('DELETE FROM local_settings');
    db.executeSync('DELETE FROM users');

    const guest = userStore.createGuestUser();
    userId = guest.id;
  });

  afterEach(() => {
    (RNFS as unknown as Record<string, unknown>).exists = origExists;
    (RNFS as unknown as Record<string, unknown>).readFile = origReadFile;
    (RNFS as unknown as Record<string, unknown>).writeFile = origWriteFile;
    calendarVisibilityStore.resetCache();
    jest.restoreAllMocks();
  });

  describe('ustpAcademicCalendar data rules', () => {
    test('defaults to UG & All-Campus events and gates Graduate events behind includeGraduate', () => {
      const ugOnly = getUstpAcademicEvents();
      const withGrad = getUstpAcademicEvents({includeGraduate: true});

      expect(ugOnly.length).toBeGreaterThan(30);
      expect(ugOnly.every(ev => ev.audience !== 'gr')).toBe(true);
      expect(withGrad.length).toBeGreaterThan(ugOnly.length);
      expect(withGrad.some(ev => ev.audience === 'gr')).toBe(true);

      // Graduate orientation on Aug 15, 2026 only appears when Graduate is enabled
      expect(getUstpEventsOn('2026-08-15', {includeGraduate: false})).toEqual(
        [],
      );
      const gradAug15 = getUstpEventsOn('2026-08-15', {includeGraduate: true});
      expect(gradAug15).toHaveLength(1);
      expect(gradAug15[0].event.title).toMatch(/Graduate Studies Orientation/i);
    });

    test('spans short multi-day events across each day and renders long multi-month windows as Start & Deadline endpoints only', () => {
      // Short 6-day event: Midterm Examinations (1st Sem) Oct 5–10, 2026
      const midDay3 = getUstpEventsOn('2026-10-07');
      expect(midDay3).toHaveLength(1);
      expect(midDay3[0].displayTitle).toBe('Midterm Examinations (1st Sem)');
      expect(midDay3[0].dayLabel).toContain('Day 3 of 6');

      // Multi-month window: Application for Graduation (1st Sem) Aug 17 – Oct 31, 2026
      const gradOpen = getUstpEventsOn('2026-08-17');
      expect(
        gradOpen.some(
          o =>
            o.event.id === 'ustp-1st-grad-application' &&
            o.endpointRole === 'start' &&
            o.displayTitle.includes('(Opens)'),
        ),
      ).toBe(true);

      // Mid-window date should NOT be flooded with Graduation Application
      const midWindow = getUstpEventsOn('2026-09-15');
      expect(
        midWindow.some(o => o.event.id === 'ustp-1st-grad-application'),
      ).toBe(false);

      const gradDeadline = getUstpEventsOn('2026-10-31');
      expect(
        gradDeadline.some(
          o =>
            o.event.id === 'ustp-1st-grad-application' &&
            o.endpointRole === 'end' &&
            o.displayTitle.includes('(Deadline)'),
        ),
      ).toBe(true);
    });

    test('preserves known PDF caveats and avoids duplicating national Philippine holidays', () => {
      const june5 = getUstpEventsOn('2027-06-05');
      const june9 = getUstpEventsOn('2027-06-09');
      expect(
        june5.some(
          o =>
            o.event.id === 'ustp-midyear-start-detailed' &&
            o.event.needsConfirmation === true,
        ),
      ).toBe(true);
      expect(
        june9.some(
          o =>
            o.event.id === 'ustp-midyear-start-summary' &&
            o.event.needsConfirmation === true,
        ),
      ).toBe(true);

      // National holidays belong to Philippine Holidays layer, not duplicated here
      expect(
        USTP_ACADEMIC_EVENTS.some(ev =>
          /Bonifacio|Christmas|Independence|Ninoy Aquino|All Saints/i.test(
            ev.title,
          ),
        ),
      ).toBe(false);

      expect(formatUstpDateRange('2026-08-16', '2026-08-16')).toBe(
        'Aug 16, 2026',
      );
      expect(formatUstpDateRange('2026-10-05', '2026-10-10')).toBe(
        'Oct 5–10, 2026',
      );
      expect(formatUstpDateRange('2026-11-09', '2027-04-30')).toBe(
        'Nov 9, 2026 – Apr 30, 2027',
      );
    });
  });

  test('hides USTP Academic Calendar group and events when user has not confirmed a USTP COR', async () => {
    const screen = render(
      <ThemeProvider userId={userId}>
        <CalendarScreen
          userId={userId}
          refreshTrigger={0}
          onRefresh={jest.fn()}
        />
      </ThemeProvider>,
    );

    // Open Sidebar -> USTP Academic Calendar row must NOT be rendered
    await act(async () => {
      fireEvent.press(screen.getByTestId('calendar-more-menu-button'));
    });
    expect(screen.queryByTestId('calendar-ustp-group-button')).toBeNull();
    expect(screen.queryByTestId('sidebar-layer-toggle-ustp')).toBeNull();

    // Open My Calendars modal -> USTP Academic Calendar layer must NOT be rendered
    await act(async () => {
      fireEvent.press(
        screen.getByLabelText('Manage calendars and visibility'),
      );
    });
    expect(screen.queryByTestId('layers-modal-toggle-ustp')).toBeNull();
  });

  test('shows USTP Academic Calendar for confirmed USTP students, jumps to events across views, toggles Graduate & layer visibility', async () => {
    enableUstpForTest(userId);

    const screen = render(
      <ThemeProvider userId={userId}>
        <CalendarScreen
          userId={userId}
          refreshTrigger={0}
          onRefresh={jest.fn()}
        />
      </ThemeProvider>,
    );

    // Open Sidebar -> USTP Academic Calendar group is visible
    await act(async () => {
      fireEvent.press(screen.getByTestId('calendar-more-menu-button'));
    });
    expect(screen.getByTestId('calendar-ustp-group-button')).toBeTruthy();

    // Open USTP Academic Calendar modal
    await act(async () => {
      fireEvent.press(screen.getByTestId('calendar-ustp-group-button'));
    });
    expect(screen.getByTestId('ustp-calendar-group-modal')).toBeTruthy();

    // Graduate events are hidden by default
    expect(
      screen.queryByTestId('ustp-event-row-ustp-1st-gr-orientation'),
    ).toBeNull();

    // Enable Graduate toggle -> Graduate event appears
    await act(async () => {
      fireEvent(
        screen.getByTestId('ustp-calendar-graduate-toggle'),
        'valueChange',
        true,
      );
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(
        screen.getByTestId('ustp-event-row-ustp-1st-gr-orientation'),
      ).toBeTruthy();
    });

    // Filter to 1st Sem and tap Midterm Examinations (1st Sem) -> jumps to Oct 5, 2026
    await act(async () => {
      fireEvent.press(screen.getByTestId('ustp-term-filter-first'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('ustp-event-row-ustp-1st-midterms'));
    });

    // MonthView Plan card displays Midterm Examinations & USTP Calendar category
    expect(screen.getByText('Midterm Examinations (1st Sem)')).toBeTruthy();
    expect(screen.getAllByText('USTP Calendar').length).toBeGreaterThanOrEqual(
      1,
    );

    // Switch to Week view -> displays Midterm Examinations card
    await act(async () => {
      fireEvent.press(screen.getByText('Week'));
    });
    expect(screen.getByText('Midterm Examinations (1st Sem)')).toBeTruthy();

    // Switch to Day view -> displays in All-Day banner as ustp-event-chip
    await act(async () => {
      fireEvent.press(screen.getByText('Day'));
    });
    expect(screen.getByTestId('day-all-day-banner')).toBeTruthy();
    const ustpChips = screen.getAllByTestId('ustp-event-chip');
    expect(ustpChips.length).toBeGreaterThanOrEqual(1);

    // Tapping a USTP chip opens ScheduleItemDetailModal with PDF source & All USTP Dates button
    await act(async () => {
      fireEvent.press(ustpChips[0]);
    });
    expect(screen.getByTestId('schedule-item-detail-modal')).toBeTruthy();
    expect(screen.getByText('All USTP Dates')).toBeTruthy();
    expect(
      screen.getByText(/CHED-noted USTP Academic Calendar AY 2026–2027/i),
    ).toBeTruthy();

    // Tapping All USTP Dates opens UstpCalendarGroupModal
    await act(async () => {
      fireEvent.press(screen.getByTestId('schedule-detail-edit-button'));
    });
    expect(screen.getByTestId('ustp-calendar-group-modal')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId('ustp-calendar-close-button'));
    });

    // Toggle USTP Academic Calendar layer OFF from sidebar -> chips disappear immediately
    await act(async () => {
      fireEvent.press(screen.getByTestId('calendar-more-menu-button'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('sidebar-layer-toggle-ustp'));
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Done'));
    });

    await waitFor(() => {
      expect(screen.queryByTestId('ustp-event-chip')).toBeNull();
    });

    // Toggle back ON from My Calendars modal -> chips reappear
    await act(async () => {
      fireEvent.press(screen.getByTestId('calendar-more-menu-button'));
    });
    await act(async () => {
      fireEvent.press(
        screen.getByLabelText('Manage calendars and visibility'),
      );
    });
    expect(screen.getByTestId('layers-modal-toggle-ustp')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId('layers-modal-toggle-ustp'));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getAllByTestId('ustp-event-chip').length).toBeGreaterThan(
        0,
      );
    });
  });
});
