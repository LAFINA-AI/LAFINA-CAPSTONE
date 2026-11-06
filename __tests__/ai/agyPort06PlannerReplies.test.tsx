/**
 * AGY-PORT 06: factual schedule replies, the command guide, and preserved
 * online/document/Calendar paths, on real SQLite (node:sqlite).
 *
 * Online AI and document generation are Jest spies here: these tests prove the
 * route taken, not that the live backend answered.
 */
import React from 'react';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import {
  chatStore,
  db,
  initDatabase,
  tasksStore,
  timeBlocksStore,
  userStore,
} from '../../src/storage';
import {plannerQueries} from '../../src/storage/plannerQueries';
import {executeNluAction} from '../../src/ai/nlu/actionExecutor';
import {intentService} from '../../src/ai/nlu/intentService';
import {routeIntent} from '../../src/ai/nlu/intentRoutes';
import {
  endReviewSession,
  prepareReviewedCommand,
} from '../../src/ai/nlu/commandReview';
import {COMMAND_GUIDE} from '../../src/ai/nlu/commandGuide';
import {chatOrchestrator} from '../../src/ai/chatOrchestrator';
import {onlineChatSkill} from '../../src/skills/onlineChatSkill';
import {documentSkill} from '../../src/skills/documentSkill';
import {ChatScreen} from '../../src/ui/screens/ChatScreen';
import {CalendarScreen} from '../../src/ui/screens/calendar';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {chatDraftStore} from '../../src/ui/drafts/chatDraftStore';

// Friday 2026-11-06 10:00 local.
const REF = new Date(2026, 10, 6, 10, 0, 0);
const TOMORROW = '2026-11-07';

let serial = 0;
const owner = (label: string): string => {
  serial += 1;
  return `p06-${label}-${serial}`;
};

const queryIntent = (date: string) => ({
  intent: 'query_schedule' as const,
  title: null,
  date,
  time: null,
  endTime: null,
  durationMinutes: null,
  category: 'Academic',
  details: null,
  snoozeMinutes: null,
  confidence: 1,
  source: 'fast_path' as const,
  rawTranscript: `What's on my schedule on ${date}?`,
  isValid: true,
});

const footprint = (userId: string) => {
  const count = (sql: string) =>
    Number(db.executeSync(sql, [userId]).rows[0]?.n ?? 0);
  return {
    tasks: count('SELECT COUNT(*) AS n FROM tasks WHERE user_id = ?'),
    events: count('SELECT COUNT(*) AS n FROM events WHERE user_id = ?'),
    blocks: count('SELECT COUNT(*) AS n FROM time_blocks WHERE user_id = ?'),
    notes: count('SELECT COUNT(*) AS n FROM notes WHERE user_id = ?'),
    reminders: count('SELECT COUNT(*) AS n FROM reminders WHERE user_id = ?'),
    outbox: count('SELECT COUNT(*) AS n FROM sync_outbox WHERE user_id = ?'),
  };
};

describe('AGY-PORT 06 planner replies and guide', () => {
  beforeAll(() => {
    initDatabase();
    userStore.createGuestUser();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    endReviewSession();
  });

  describe('query_schedule reads actual local records', () => {
    test('includes a weekly study block occurrence and the day’s event, and nothing from another owner', async () => {
      const me = owner('me');
      const other = owner('other');
      timeBlocksStore.insert({
        id: 'p06-weekly-block',
        userId: me,
        title: 'Calculus review',
        date: '2026-10-31', // a Saturday; weekly → 2026-11-07
        startTime: '14:00',
        endTime: '16:00',
        color: '#E6003A',
        category: 'academic',
        recurrenceRule: 'FREQ=WEEKLY;INTERVAL=1',
      } as Parameters<typeof timeBlocksStore.insert>[0]);
      tasksStore.insertEvent({
        id: 'p06-event',
        userId: me,
        title: 'Org meeting',
        date: TOMORROW,
        startTime: '09:00',
        endTime: '10:00',
      });
      tasksStore.insertTask({
        id: 'p06-other-task',
        userId: other,
        title: 'Someone else’s task',
        dueDate: TOMORROW,
        dueTime: '08:00',
        isCompleted: false,
        priority: 'Medium',
        category: 'General',
      });

      const result = await executeNluAction(me, queryIntent(TOMORROW), {
        referenceDate: REF,
      });
      expect(result.success).toBe(true);
      expect(result.reply).toContain('Calculus review');
      expect(result.reply).toContain('Org meeting');
      expect(result.reply).not.toContain('Someone else');
    });

    test('a storage failure is reported truthfully, never as a free day', async () => {
      const me = owner('broken');
      jest.spyOn(plannerQueries, 'window').mockImplementation(() => {
        throw new Error('database is locked');
      });
      jest.spyOn(console, 'error').mockImplementation(() => undefined);

      const result = await executeNluAction(me, queryIntent(TOMORROW), {
        referenceDate: REF,
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('storage_unavailable');
      expect(result.reply).toMatch(/couldn't read your schedule/i);
      expect(result.reply).not.toMatch(/free|clear|nothing (?:is )?scheduled/i);
    });
  });

  describe('command guide examples are tested against the parser and review contract', () => {
    test.each(COMMAND_GUIDE.map(example => [example.command, example]))(
      '%s',
      async (_label, example) => {
        const me = owner('guide');
        tasksStore.insertTask({
          id: `${me}-lab`,
          userId: me,
          title: 'Submit lab report',
          dueDate: TOMORROW,
          dueTime: '17:00',
          isCompleted: false,
          priority: 'Medium',
          category: 'Academic',
        });
        const before = footprint(me);

        const parsed = await intentService.extractIntent(example.command, {
          referenceDate: REF,
        });
        expect(parsed.intent).toBe(example.intent);
        expect(parsed.isValid).toBe(true);

        const route = routeIntent(parsed.intent);
        if (example.intent === 'query_schedule') {
          expect(route).toBe('read_only');
        } else {
          expect(route).toBe('reviewed_mutation');
          const prepared = prepareReviewedCommand(me, parsed, {
            referenceDate: REF,
          });
          expect(prepared.status).toBe('proposal');
        }
        // Preparing or parsing an example writes nothing.
        expect(footprint(me)).toEqual(before);
      },
    );
  });

  describe('conflict checks read one bounded day', () => {
    test('a recurring block occurrence is a conflict, and the slot search reads the day once', () => {
      const me = owner('conflict');
      timeBlocksStore.insert({
        id: `${me}-weekly`,
        userId: me,
        title: 'Weekly lab',
        date: '2026-10-31',
        startTime: '14:00',
        endTime: '16:00',
        color: '#E6003A',
        category: 'academic',
        recurrenceRule: 'FREQ=WEEKLY;INTERVAL=1',
      } as Parameters<typeof timeBlocksStore.insert>[0]);
      const windowSpy = jest.spyOn(plannerQueries, 'window');

      const conflict = chatOrchestrator.checkScheduleConflict(
        me,
        TOMORROW,
        '15:00',
        '17:00',
      );
      expect(conflict).toMatchObject({
        hasConflict: true,
        conflictingTitle: 'Weekly lab',
      });
      expect(windowSpy).toHaveBeenCalledWith(me, TOMORROW, TOMORROW);

      windowSpy.mockClear();
      const slot = chatOrchestrator.recommendAvailableSlot(me, TOMORROW, 120);
      expect(slot).toEqual({startTime: '08:00', endTime: '10:00'});
      expect(windowSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('online, Handbook and document routes are unchanged', () => {
    test('a general question in Online mode goes to online AI with the Handbook flag', async () => {
      const me = owner('online');
      const online = jest
        .spyOn(onlineChatSkill, 'sendChatMessage')
        .mockResolvedValue({
          status: 'success',
          data: {reply: 'Dean’s list needs a GWA of 1.75.', sources: []},
        } as never);

      const result = await chatOrchestrator.processMessage(
        me,
        'What GWA do I need for the dean’s list?',
        {onlineMode: true, useHandbook: true, referenceDate: REF},
      );
      expect(online).toHaveBeenCalledTimes(1);
      expect(online.mock.calls[0][1]).toEqual({useHandbook: true});
      expect(result.usedOnline).toBe(true);
    });

    test('a schedule question in Online mode is answered from local records, not online AI', async () => {
      const me = owner('online-query');
      tasksStore.insertTask({
        id: `${me}-t`,
        userId: me,
        title: 'Physics problem set',
        dueDate: TOMORROW,
        dueTime: '13:00',
        isCompleted: false,
        priority: 'Medium',
        category: 'Academic',
      });
      const online = jest.spyOn(onlineChatSkill, 'sendChatMessage');

      const result = await chatOrchestrator.processMessage(
        me,
        "What's on my schedule tomorrow?",
        {onlineMode: true, referenceDate: REF},
      );
      expect(online).not.toHaveBeenCalled();
      expect(result.reply).toContain('Physics problem set');
    });

    test('a document request in Online mode still goes to document generation', async () => {
      const me = owner('doc');
      const generate = jest.spyOn(documentSkill, 'generate').mockResolvedValue({
        status: 'error',
        error: 'network',
      } as never);

      await chatOrchestrator.processMessage(me, 'Outline for my thesis', {
        onlineMode: true,
        documentFormat: 'docx',
        referenceDate: REF,
      });
      expect(generate).toHaveBeenCalledTimes(1);
      expect(generate.mock.calls[0][0]).toMatchObject({format: 'docx'});
    });
  });

  describe('Chat guide UI', () => {
    const renderChat = (userId: string) =>
      render(
        <ThemeProvider userId={userId}>
          <ChatScreen userId={userId} />
        </ThemeProvider>,
      );

    test('choosing an example only fills the draft; nothing is sent or saved; starter prompts and tools remain', async () => {
      const me = owner('ui');
      chatDraftStore.set(me, '');
      const before = footprint(me);
      const process = jest.spyOn(chatOrchestrator, 'processMessage');
      const utils = renderChat(me);

      expect(utils.getByTestId('chat-prompt-chip-0')).toBeTruthy();
      expect(utils.getByTestId('chat-online-toggle-button')).toBeTruthy();
      expect(utils.getByTestId('chat-meetings-button')).toBeTruthy();
      expect(utils.getByTestId('chat-document-format-button')).toBeTruthy();

      fireEvent.press(utils.getByTestId('chat-guide-button'));
      fireEvent.press(utils.getByTestId('chat-guide-example-1'));

      await waitFor(() =>
        expect(utils.getByTestId('chat-text-input').props.value).toBe(
          COMMAND_GUIDE[1].command,
        ),
      );
      expect(chatDraftStore.get(me)).toBe(COMMAND_GUIDE[1].command);
      expect(process).not.toHaveBeenCalled();
      expect(chatStore.getMessages(me)).toHaveLength(0);
      expect(footprint(me)).toEqual(before);
    });

    test('unsent text is kept unless the student explicitly replaces it', async () => {
      const me = owner('ui-keep');
      chatDraftStore.set(me, 'my own unsent question');
      const utils = renderChat(me);

      fireEvent.press(utils.getByTestId('chat-guide-button'));
      fireEvent.press(utils.getByTestId('chat-guide-example-0'));
      expect(utils.getByTestId('chat-draft-dialog')).toBeTruthy();
      fireEvent.press(utils.getByTestId('chat-draft-dialog-keep'));
      expect(utils.getByTestId('chat-text-input').props.value).toBe(
        'my own unsent question',
      );

      fireEvent.press(utils.getByTestId('chat-guide-button'));
      fireEvent.press(utils.getByTestId('chat-guide-example-0'));
      fireEvent.press(utils.getByTestId('chat-draft-dialog-confirm'));
      await waitFor(() =>
        expect(utils.getByTestId('chat-text-input').props.value).toBe(
          COMMAND_GUIDE[0].command,
        ),
      );
      expect(chatStore.getMessages(me)).toHaveLength(0);
    });
  });

  describe('Calendar keeps its interactions with bounded reads', () => {
    const renderCalendar = (userId: string) =>
      render(
        <ThemeProvider userId={userId}>
          <CalendarScreen
            userId={userId}
            refreshTrigger={0}
            onRefresh={jest.fn()}
          />
        </ThemeProvider>,
      );

    test('overdue chips are bounded with a "+N more" count, and the undated list stays reachable', () => {
      const me = owner('cal');
      for (let i = 0; i < 103; i += 1) {
        tasksStore.insertTask({
          id: `${me}-late-${String(i).padStart(3, '0')}`,
          userId: me,
          title: `Late ${i}`,
          dueDate: '2020-01-01',
          dueTime: '08:00',
          isCompleted: false,
          priority: 'Medium',
          category: 'General',
        });
      }
      const utils = renderCalendar(me);
      expect(utils.getByTestId('calendar-overdue-more')).toBeTruthy();
      expect(utils.getByText('+3 more')).toBeTruthy();
      expect(utils.getByTestId('calendar-undated-button')).toBeTruthy();
    });

    test('editing an overdue task from its chip keeps its own date and schedules no call in the past', () => {
      const me = owner('cal-edit');
      tasksStore.insertTask({
        id: `${me}-old`,
        userId: me,
        title: 'Old lab writeup',
        dueDate: '2020-01-01',
        dueTime: '08:00',
        isCompleted: false,
        priority: 'Medium',
        category: 'Academic',
      });
      const update = jest.spyOn(tasksStore, 'updateTask');
      const utils = renderCalendar(me);
      fireEvent.press(utils.getByText('Old lab writeup'));
      fireEvent.press(utils.getByText('Save'));

      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({id: `${me}-old`}),
      );
      const saved = db.executeSync('SELECT due_date FROM tasks WHERE id = ?', [
        `${me}-old`,
      ]).rows[0];
      expect(saved?.due_date).toBe('2020-01-01');
      const reminders = db.executeSync(
        "SELECT COUNT(*) AS n FROM reminders WHERE user_id = ? AND deleted_at IS NULL AND status IN ('pending', 'snoozed', 'triggered')",
        [me],
      ).rows[0]?.n;
      expect(Number(reminders)).toBe(0);
    });

    test('a weekly task occurrence still appears in today’s week, and the full export reads every owned item', () => {
      const me = owner('cal-rec');
      const earlier = new Date();
      earlier.setDate(earlier.getDate() - 14);
      const base = `${earlier.getFullYear()}-${`${
        earlier.getMonth() + 1
      }`.padStart(2, '0')}-${`${earlier.getDate()}`.padStart(2, '0')}`;
      tasksStore.insertTask({
        id: `${me}-weekly`,
        userId: me,
        title: 'Weekly lab journal',
        dueDate: base,
        dueTime: '07:00',
        isCompleted: false,
        priority: 'Medium',
        category: 'Academic',
        recurrenceRule: 'FREQ=WEEKLY;INTERVAL=1',
      });
      tasksStore.insertTask({
        id: `${me}-undated`,
        userId: me,
        title: 'Someday reading',
        dueDate: null,
        dueTime: null,
        isCompleted: false,
        priority: 'Low',
        category: 'General',
      } as Parameters<typeof tasksStore.insertTask>[0]);

      const utils = renderCalendar(me);
      expect(utils.getAllByText('Weekly lab journal').length).toBeGreaterThan(
        0,
      );

      const exported = plannerQueries.exportAll(me);
      expect(exported.tasks.map(t => t.id).sort()).toEqual(
        [`${me}-undated`, `${me}-weekly`].sort(),
      );
    });
  });
});
