import React from 'react';
import {render, fireEvent} from '@testing-library/react-native';
import {ReminderDraftCard} from '../../src/ui/components/callLafina/cards/ReminderDraftCard';
import {CalendarDraftCard} from '../../src/ui/components/callLafina/cards/CalendarDraftCard';
import {AgendaCard} from '../../src/ui/components/callLafina/cards/AgendaCard';
import type {AgendaCardData} from '../../src/ui/components/callLafina/cards/AgendaCard';
import {ActionCardHost} from '../../src/ui/components/callLafina/ActionCardHost';
import {
  checkScheduleConflict,
  timeToMinutes,
  minutesToTime,
} from '../../src/ai/voiceActions/conflictChecker';
import {plannerQueries} from '../../src/storage/plannerQueries';
import {userStore} from '../../src/storage/userStore';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import type {CommandProposal} from '../../src/ai/nlu/commandReview';

jest.mock('../../src/storage/plannerQueries', () => ({
  plannerQueries: {
    window: jest.fn(),
  },
}));

const mockTaskProposal: CommandProposal = {
  operationId: 'op-task-1',
  ownerId: 'student-owner-1',
  surface: 'voice',
  intent: 'create_task',
  heading: 'Create Task',
  title: 'Submit Physics Assignment',
  details: ['Due: Friday, Nov 14 at 5:00 PM', 'Reminder: 1 hour before (4:00 PM)'],
  assumptions: ['Defaulted category to Academics', 'Defaulted priority to High'],
  warnings: ['That time is during your scheduled Study Block.'],
  destructive: false,
  expiresAt: Date.now() + 300000,
  reply: 'I prepared a task for Physics Assignment due Friday at 5:00 PM.',
};

const mockEventProposal: CommandProposal = {
  operationId: 'op-event-1',
  ownerId: 'student-owner-1',
  surface: 'voice',
  intent: 'create_time_block',
  heading: 'Create Time Block',
  title: 'Calculus Revision',
  details: ['Date: 2026-11-15', 'Time: 14:00 - 15:30'],
  assumptions: ['Category: Study'],
  warnings: ['Conflicts with Chemistry Lab (14:30 - 16:00).'],
  destructive: false,
  expiresAt: Date.now() + 300000,
  reply: 'I prepared a time block for Calculus Revision on Nov 15 from 2:00 PM to 3:30 PM.',
};

describe('Phase 07 — Scheduling, Reminders, Calendar & Agenda Cards', () => {
  const TEST_USER = 'student-owner-1';

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(userStore, 'isGuest').mockReturnValue(false);
    jest.spyOn(userStore, 'getDarkModeEnabled').mockReturnValue(false);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('P07-01 & F-030: ReminderDraftCard', () => {
    it('renders task/reminder proposal details, assumptions, and warnings with accessible controls', () => {
      const onConfirm = jest.fn();
      const onCancel = jest.fn();
      const onDismiss = jest.fn();

      const utils = render(
        <ThemeProvider userId={TEST_USER}>
          <ReminderDraftCard
            proposal={mockTaskProposal}
            onConfirm={onConfirm}
            onCancel={onCancel}
            onDismiss={onDismiss}
            testIDPrefix="reminder-review"
          />
        </ThemeProvider>,
      );

      expect(utils.getByTestId('reminder-draft-card')).toBeTruthy();
      expect(utils.getByTestId('reminder-review-action')).toHaveTextContent(/Create Task “Submit Physics Assignment”/);
      expect(utils.getByTestId('reminder-review-detail-0')).toHaveTextContent(/Due: Friday, Nov 14 at 5:00 PM/);
      expect(utils.getByTestId('reminder-review-assumptions')).toHaveTextContent(/Defaulted priority to High/);
      expect(utils.getByTestId('reminder-review-warning')).toHaveTextContent(/during your scheduled Study Block/);

      const confirmBtn = utils.getByTestId('reminder-review-confirm');
      const cancelBtn = utils.getByTestId('reminder-review-cancel');

      fireEvent.press(confirmBtn);
      expect(onConfirm).toHaveBeenCalledTimes(1);

      fireEvent.press(cancelBtn);
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('renders expired view with dismiss button when expired is true', () => {
      const onDismiss = jest.fn();

      const utils = render(
        <ThemeProvider userId={TEST_USER}>
          <ReminderDraftCard
            proposal={mockTaskProposal}
            expired={true}
            onConfirm={jest.fn()}
            onCancel={jest.fn()}
            onDismiss={onDismiss}
            testIDPrefix="reminder-review"
          />
        </ThemeProvider>,
      );

      expect(utils.getByTestId('reminder-review-expired')).toBeTruthy();
      expect(utils.queryByTestId('reminder-review-confirm')).toBeNull();

      fireEvent.press(utils.getByTestId('reminder-review-dismiss'));
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });
  });

  describe('P07-02 & F-031: CalendarDraftCard', () => {
    it('renders event/time block proposal with date, time, timezone, and alternatives', () => {
      const onConfirm = jest.fn();
      const onCancel = jest.fn();

      const utils = render(
        <ThemeProvider userId={TEST_USER}>
          <CalendarDraftCard
            proposal={mockEventProposal}
            alternatives={['16:00 - 17:30', '17:30 - 19:00']}
            onConfirm={onConfirm}
            onCancel={onCancel}
            onDismiss={jest.fn()}
            testIDPrefix="calendar-review"
          />
        </ThemeProvider>,
      );

      expect(utils.getByTestId('calendar-draft-card')).toBeTruthy();
      expect(utils.getByTestId('calendar-review-action')).toHaveTextContent(/Calculus Revision/);
      expect(utils.getByTestId('calendar-review-timezone')).toHaveTextContent(/Timezone:/);
      expect(utils.getByTestId('calendar-review-warning')).toHaveTextContent(/Conflicts with Chemistry Lab/);

      const alts = utils.getByTestId('calendar-review-conflict-alternatives');
      expect(alts).toHaveTextContent(/16:00 - 17:30/);
      expect(alts).toHaveTextContent(/17:30 - 19:00/);

      fireEvent.press(utils.getByTestId('calendar-review-confirm'));
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });
  });

  describe('P07-03 & F-032: AgendaCard', () => {
    it('renders list of events and tasks with completion markers', () => {
      const onDismiss = jest.fn();
      const agendaData: AgendaCardData = {
        date: '2026-11-15',
        items: [
          {id: '1', title: 'Data Structures Lecture', type: 'event', time: '09:00', endTime: '10:30'},
          {id: '2', title: 'Physics Lab Report', type: 'task', time: '17:00', completed: false},
          {id: '3', title: 'Gym Workout', type: 'task', time: '07:00', completed: true},
        ],
        partial: false,
      };

      const utils = render(
        <ThemeProvider userId={TEST_USER}>
          <AgendaCard
            data={agendaData}
            onDismiss={onDismiss}
            testIDPrefix="agenda"
          />
        </ThemeProvider>,
      );

      expect(utils.getByTestId('agenda-result-card')).toBeTruthy();
      expect(utils.getByTestId('agenda-items')).toBeTruthy();
      expect(utils.getByTestId('agenda-item-0')).toHaveTextContent(/Data Structures Lecture/);
      expect(utils.getByTestId('agenda-item-0')).toHaveTextContent(/09:00 - 10:30/);
      expect(utils.getByTestId('agenda-item-1')).toHaveTextContent(/Physics Lab Report/);
      expect(utils.getByTestId('agenda-item-2')).toHaveTextContent(/Gym Workout/);

      fireEvent.press(utils.getByTestId('agenda-dismiss'));
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('renders empty message when no items are scheduled', () => {
      const emptyData: AgendaCardData = {
        date: '2026-11-16',
        items: [],
        partial: false,
      };

      const utils = render(
        <ThemeProvider userId={TEST_USER}>
          <AgendaCard
            data={emptyData}
            onDismiss={jest.fn()}
            testIDPrefix="agenda"
          />
        </ThemeProvider>,
      );

      expect(utils.getByTestId('agenda-empty')).toHaveTextContent(/No scheduled events or tasks for this date/);
    });

    it('renders partial-result notice when results are truncated', () => {
      const partialData: AgendaCardData = {
        date: '2026-11-15',
        items: [
          {id: '1', title: 'Event 1', type: 'event', time: '10:00'},
          {id: '2', title: 'Event 2', type: 'event', time: '11:00'},
        ],
        partial: true,
      };

      const utils = render(
        <ThemeProvider userId={TEST_USER}>
          <AgendaCard
            data={partialData}
            onDismiss={jest.fn()}
            testIDPrefix="agenda"
          />
        </ThemeProvider>,
      );

      const notice = utils.getByTestId('agenda-partial-notice');
      expect(notice).toHaveTextContent(/Showing 2 items \(more in your full calendar\)/);
    });
  });

  describe('P07-04 & F-033: Conflict Checker with Grounded Alternatives', () => {
    it('accurately parses timeToMinutes and minutesToTime', () => {
      expect(timeToMinutes('00:00')).toBe(0);
      expect(timeToMinutes('08:30')).toBe(510);
      expect(timeToMinutes('23:59')).toBe(1439);
      expect(minutesToTime(510)).toBe('08:30');
      expect(minutesToTime(1439)).toBe('23:59');
    });

    it('detects overlap with existing events and computes free-slot alternatives', () => {
      (plannerQueries.window as jest.Mock).mockReturnValue({
        events: [
          {id: 'e1', title: 'Chemistry Lab', startTime: '14:00', endTime: '16:00'},
        ],
        tasks: [],
        blocks: [
          {id: 'b1', title: 'Math Tutoring', startTime: '10:00', endTime: '11:30'},
        ],
      });

      // Requesting 15:00 - 16:30 collides with Chemistry Lab (14:00 - 16:00)
      const result = checkScheduleConflict(TEST_USER, '2026-11-15', '15:00', '16:30');
      expect(result.hasConflict).toBe(true);
      expect(result.conflictingItems).toHaveLength(1);
      expect(result.conflictingItems[0].title).toBe('Chemistry Lab');
      expect(result.warningMessage).toContain('Conflicts with "Chemistry Lab"');

      // Check that alternatives are recommended
      expect(result.alternatives.length).toBeGreaterThan(0);
      for (const alt of result.alternatives) {
        expect(alt).toMatch(/\d{2}:\d{2}\s*-\s*\d{2}:\d{2}/);
      }
    });

    it('returns hasConflict: false when time slot is completely clear', () => {
      (plannerQueries.window as jest.Mock).mockReturnValue({
        events: [
          {id: 'e1', title: 'Morning Lecture', startTime: '09:00', endTime: '10:00'},
        ],
        tasks: [],
        blocks: [],
      });

      // Requesting 14:00 - 15:00 does not collide
      const result = checkScheduleConflict(TEST_USER, '2026-11-15', '14:00', '15:00');
      expect(result.hasConflict).toBe(false);
      expect(result.conflictingItems).toHaveLength(0);
      expect(result.alternatives).toHaveLength(0);
    });
  });

  describe('P07-05 & ActionCardHost Dispatch Integration', () => {
    it('dispatches task proposal to ReminderDraftCard', () => {
      const utils = render(
        <ThemeProvider userId={TEST_USER}>
          <ActionCardHost proposal={mockTaskProposal} />
        </ThemeProvider>,
      );

      expect(utils.getByTestId('action-card-host')).toBeTruthy();
      expect(utils.getByTestId('reminder-draft-card')).toBeTruthy();
      expect(utils.queryByTestId('calendar-draft-card')).toBeNull();
    });

    it('dispatches time block proposal to CalendarDraftCard', () => {
      const utils = render(
        <ThemeProvider userId={TEST_USER}>
          <ActionCardHost proposal={mockEventProposal} alternatives={['16:00 - 17:30']} />
        </ThemeProvider>,
      );

      expect(utils.getByTestId('action-card-host')).toBeTruthy();
      expect(utils.getByTestId('calendar-draft-card')).toBeTruthy();
      expect(utils.queryByTestId('reminder-draft-card')).toBeNull();
    });

    it('dispatches agendaData to AgendaCard', () => {
      const agendaData: AgendaCardData = {
        date: '2026-11-15',
        items: [{title: 'Team Sync', type: 'event', time: '13:00'}],
      };

      const utils = render(
        <ThemeProvider userId={TEST_USER}>
          <ActionCardHost agendaData={agendaData} />
        </ThemeProvider>,
      );

      expect(utils.getByTestId('action-card-host')).toBeTruthy();
      expect(utils.getByTestId('agenda-result-card')).toBeTruthy();
    });
  });
});

