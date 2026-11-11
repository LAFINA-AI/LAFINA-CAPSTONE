/**
 * Regression & feature tests for:
 * 1. Fast-path regex fixes ("schedule me a meeting tommorow at 3pm", indirect objects, tomorrow typos).
 * 2. Online Mode DeepSeek intent extraction (with safe local fallback and no interference on chat/RAG/queries).
 * 3. Inline editable CommandReviewCard (commandReview.editReviewedCommand + useCommandReview + ChatScreen flow).
 */
import React from 'react';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import {
  chatStore,
  initDatabase,
  notesStore,
  tasksStore,
  timeBlocksStore,
} from '../../src/storage';
import {addDaysToDate} from '../../src/storage/eventTime';
import {parseIntentFastPath} from '../../src/ai/nlu/fastPathParser';
import {intentService} from '../../src/ai/nlu/intentService';
import {
  editReviewedCommand,
  endReviewSession,
  prepareReviewedCommand,
} from '../../src/ai/nlu/commandReview';
import type {PrepareResult} from '../../src/ai/nlu/commandReview';
import {chatOrchestrator} from '../../src/ai/chatOrchestrator';
import {shouldUseOnlineIntentExtraction} from '../../src/ai/onlineIntentExtractor';
import {onlineChatSkill} from '../../src/skills/onlineChatSkill';
import {CommandReviewCard} from '../../src/ui/components/chat/CommandReviewCard';
import {ChatScreen} from '../../src/ui/screens/ChatScreen';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {chatDraftStore} from '../../src/ui/drafts/chatDraftStore';

// Reference date in 2030 so created task/reminder times remain cleanly in the future.
const REF = new Date(2030, 5, 10, 9, 0, 0); // Monday 2030-06-10 09:00
const TODAY = '2030-06-10';
const TOMORROW = '2030-06-11';
const DAY_AFTER = '2030-06-12';

let seq = 0;
const owner = (tag: string): string => {
  seq += 1;
  return `oer-${tag}-${seq}`;
};

const setupOwner = (tag: string): string => owner(tag);

describe('Fast-path NLU indirect pronouns & tomorrow typos', () => {
  test('extracts clean title "Meeting" and 15:00 tomorrow from "schedule me a meeting tommorow at 3pm"', async () => {
    const parsed = parseIntentFastPath(
      'schedule me a meeting tommorow at 3pm',
      REF,
    );
    expect(parsed.intent).toBe('create_task');
    expect(parsed.title).toBe('Meeting');
    expect(parsed.date).toBe(TOMORROW);
    expect(parsed.time).toBe('15:00');
    expect(parsed.confidence).toBeGreaterThanOrEqual(0.85);

    const validated = await intentService.extractIntent(
      'schedule me a meeting tommorow at 3pm',
      {referenceDate: REF},
    );
    expect(validated.isValid).toBe(true);
    expect(validated.title).toBe('Meeting');
    expect(validated.date).toBe(TOMORROW);
    expect(validated.time).toBe('15:00');
  });

  test('strips indirect object pronouns across schedule/make/book/add/create variants and typo variants', () => {
    const studyBlock = parseIntentFastPath(
      'schedule me a study block tomorow from 2pm to 4pm',
      REF,
    );
    expect(studyBlock.intent).toBe('create_time_block');
    expect(studyBlock.date).toBe(TOMORROW);
    expect(studyBlock.time).toBe('14:00');
    expect(studyBlock.endTime).toBe('16:00');
    expect(studyBlock.title?.toLowerCase()).not.toContain('me ');

    const appt = parseIntentFastPath(
      'make me a dentist appointment tmr at 10am',
      REF,
    );
    expect(appt.title).toBe('Dentist Appointment');
    expect(appt.date).toBe(TOMORROW);
    expect(appt.time).toBe('10:00');

    const booking = parseIntentFastPath(
      'book me an advisor consultation tommorrow at 1:30pm',
      REF,
    );
    expect(booking.title).toBe('Advisor consultation');
    expect(booking.date).toBe(TOMORROW);
    expect(booking.time).toBe('13:30');
  });

  test('preserves existing "Remind me..." sentence-case titles and "Call me..." titles', () => {
    const remind = parseIntentFastPath(
      'Remind me tomorrow at 9am to submit capstone chapter 2 draft',
      REF,
    );
    expect(remind.title).toBe('Submit capstone chapter 2 draft');
    expect(remind.confidence).toBeGreaterThan(0.85);

    const checkSchedule = parseIntentFastPath(
      'Remind me to check my schedule tomorrow',
      REF,
    );
    expect(checkSchedule.title).toBe('Check my schedule');

    const callMe = parseIntentFastPath(
      'Remind me to text me when ready tomorrow at 5pm',
      REF,
    );
    expect(callMe.title).toBe('Text me when ready');
  });
});

describe('Online Mode DeepSeek intent extraction', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    endReviewSession();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('uses DeepSeek in Online Mode for scheduling prompts to populate the review card without writing SQLite early', async () => {
    const userId = setupOwner('deepseek-ok');
    const sendSpy = jest
      .spyOn(onlineChatSkill, 'sendChatMessage')
      .mockResolvedValue({
        status: 'success',
        data: {
          reply: JSON.stringify({
            intent: 'create_task',
            title: 'Project Sync Meeting',
            date: TOMORROW,
            time: '15:00',
            endTime: null,
            durationMinutes: null,
            category: 'Academic',
            details: 'Bring architecture slides',
            targetTitle: null,
            newTitle: null,
            targetEntityType: null,
          }),
          usedHandbook: false,
          sources: [],
        },
      });

    const result = await chatOrchestrator.processMessage(
      userId,
      'schedule me a meeting with my project group tommorow at 3pm and bring architecture slides',
      {onlineMode: true, referenceDate: REF},
    );

    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy.mock.calls[0][1]).toEqual({useHandbook: false});
    expect(result.usedOnline).toBe(true);
    expect(result.route).toBe('reviewed_mutation');
    expect(result.intent.source).toBe('cloud');
    expect(result.review?.status).toBe('proposal');
    if (result.review?.status !== 'proposal') {
      throw new Error('Expected proposal');
    }
    expect(result.review.proposal.title).toBe('Project Sync Meeting');
    expect(result.review.proposal.draftFields).toMatchObject({
      title: 'Project Sync Meeting',
      date: TOMORROW,
      time: '15:00',
      category: 'Academic',
      details: 'Bring architecture slides',
    });
    expect(tasksStore.getAllTasks(userId)).toHaveLength(0);
  });

  test('catches natural phrasing in Online Mode that offline fast-path leaves as chat', async () => {
    const userId = setupOwner('deepseek-natural');
    const sendSpy = jest
      .spyOn(onlineChatSkill, 'sendChatMessage')
      .mockResolvedValue({
        status: 'success',
        data: {
          reply:
            '```json\n{"intent":"create_task","title":"Thesis Defense with Prof Reyes","date":"2030-06-11","time":"15:00","endTime":null,"durationMinutes":null,"category":"Academic","details":null,"targetTitle":null,"newTitle":null,"targetEntityType":null}\n```',
          usedHandbook: false,
          sources: [],
        },
      });

    const result = await chatOrchestrator.processMessage(
      userId,
      'I have a meeting with Prof Reyes tommorow at 3pm',
      {onlineMode: true, referenceDate: REF},
    );

    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(result.usedOnline).toBe(true);
    expect(result.review?.status).toBe('proposal');
    if (result.review?.status !== 'proposal') {
      throw new Error('Expected proposal');
    }
    expect(result.review.proposal.title).toBe('Thesis Defense with Prof Reyes');
  });

  test('falls back safely to fixed local regex when DeepSeek errors or returns invalid JSON', async () => {
    const userId = setupOwner('deepseek-fallback');
    jest.spyOn(onlineChatSkill, 'sendChatMessage').mockResolvedValue({
      status: 'offline',
      error: 'No network',
    });

    const result = await chatOrchestrator.processMessage(
      userId,
      'schedule me a meeting tommorow at 3pm',
      {onlineMode: true, referenceDate: REF},
    );

    expect(result.usedOnline).toBe(false);
    expect(result.intent.source).toBe('fast_path');
    expect(result.review?.status).toBe('proposal');
    if (result.review?.status !== 'proposal') {
      throw new Error('Expected fallback proposal');
    }
    expect(result.review.proposal.title).toBe('Meeting');
    expect(result.review.proposal.draftFields?.date).toBe(TOMORROW);
    expect(result.review.proposal.draftFields?.time).toBe('15:00');
  });

  test('does not invoke intent extraction for handbook questions, small talk, or schedule queries', () => {
    const chatIntent = parseIntentFastPath('hi', REF);
    const handbookIntent = parseIntentFastPath(
      'What GWA do I need for the dean’s list?',
      REF,
    );
    const scheduleQuery = parseIntentFastPath(
      "What's on my schedule tomorrow?",
      REF,
    );
    const planAdvice = parseIntentFastPath('plan my week', REF);

    expect(
      shouldUseOnlineIntentExtraction('hi', {...chatIntent, isValid: true}),
    ).toBe(false);
    expect(
      shouldUseOnlineIntentExtraction('What GWA do I need for the dean’s list?', {
        ...handbookIntent,
        isValid: true,
      }),
    ).toBe(false);
    expect(
      shouldUseOnlineIntentExtraction("What's on my schedule tomorrow?", {
        ...scheduleQuery,
        isValid: true,
      }),
    ).toBe(false);
    expect(
      shouldUseOnlineIntentExtraction('plan my week', {
        ...planAdvice,
        isValid: true,
      }),
    ).toBe(false);
  });
});

describe('Editable CommandReviewCard & editReviewedCommand', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    endReviewSession();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('editReviewedCommand updates proposal fields without writing SQLite until Confirm', async () => {
    const userId = setupOwner('edit-service');
    const prepared = prepareReviewedCommand(
      userId,
      {
        intent: 'create_task',
        title: 'Meeting',
        date: TOMORROW,
        time: '15:00',
        endTime: null,
        durationMinutes: null,
        category: 'Personal',
        details: null,
        snoozeMinutes: null,
        confidence: 0.95,
        source: 'fast_path',
        rawTranscript: 'schedule me a meeting tommorow at 3pm',
        isValid: true,
      },
      {surface: 'chat', referenceDate: REF},
    );
    expect(prepared.status).toBe('proposal');
    if (prepared.status !== 'proposal') throw new Error('Expected proposal');

    // Invalid blank title keeps original pending proposal alive
    const invalidEdit = editReviewedCommand(
      userId,
      prepared.proposal.operationId,
      {title: '   '},
      REF,
    );
    expect(invalidEdit.status).toBe('invalid');
    expect(tasksStore.getAllTasks(userId)).toHaveLength(0);

    // Valid edit updates title, date, time, category, notes
    const edited = editReviewedCommand(
      userId,
      prepared.proposal.operationId,
      {
        title: 'Capstone Sync',
        date: DAY_AFTER,
        time: '4:30 PM',
        category: 'Academic',
        details: 'Room 302',
      },
      REF,
    );
    expect(edited.status).toBe('proposal');
    if (edited.status !== 'proposal') throw new Error('Expected edited proposal');
    expect(edited.proposal.title).toBe('Capstone Sync');
    expect(edited.proposal.draftFields).toMatchObject({
      title: 'Capstone Sync',
      date: DAY_AFTER,
      time: '16:30',
      category: 'Academic',
      details: 'Room 302',
    });
    // Still nothing saved before Confirm
    expect(tasksStore.getAllTasks(userId)).toHaveLength(0);

    // Old operationId cannot be confirmed twice or after replacement
    const staleConfirm = await chatOrchestrator.confirmReview(
      userId,
      prepared.proposal.operationId,
    );
    expect(staleConfirm.outcome?.status).not.toBe('applied');

    // Confirming the edited proposal persists the edited task values
    const confirmed = await chatOrchestrator.confirmReview(
      userId,
      edited.proposal.operationId,
    );
    expect(confirmed.outcome?.status).toBe('applied');
    const saved = tasksStore.getAllTasks(userId);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      title: 'Capstone Sync',
      dueDate: DAY_AFTER,
      dueTime: '16:30',
      category: 'Academic',
      notes: 'Room 302',
    });
  });

  test('editReviewedCommand shifts time_block endTime automatically when only start time changes, or accepts explicit endTime', async () => {
    const userId = setupOwner('edit-block');
    const prepared = prepareReviewedCommand(
      userId,
      {
        intent: 'create_time_block',
        title: 'Study Session',
        date: TOMORROW,
        time: '14:00',
        endTime: '16:00',
        durationMinutes: 120,
        category: 'Academic',
        details: null,
        snoozeMinutes: null,
        confidence: 0.95,
        source: 'fast_path',
        rawTranscript: 'study block tomorrow 2pm to 4pm',
        isValid: true,
      },
      {surface: 'chat', referenceDate: REF},
    );
    if (prepared.status !== 'proposal') throw new Error('Expected proposal');

    const shifted = editReviewedCommand(
      userId,
      prepared.proposal.operationId,
      {time: '15:00'},
      REF,
    );
    if (shifted.status !== 'proposal') throw new Error('Expected proposal');
    expect(shifted.proposal.draftFields?.time).toBe('15:00');
    expect(shifted.proposal.draftFields?.endTime).toBe('17:00');

    const explicitEnd = editReviewedCommand(
      userId,
      shifted.proposal.operationId,
      {endTime: '6:30 PM'},
      REF,
    );
    if (explicitEnd.status !== 'proposal') throw new Error('Expected proposal');
    await chatOrchestrator.confirmReview(userId, explicitEnd.proposal.operationId);

    const blocks = timeBlocksStore.getAll(userId);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      title: 'Study Session',
      startTime: '15:00',
      endTime: '18:30',
    });
  });

  test('editReviewedCommand supports editing create_note body and title', async () => {
    const userId = setupOwner('edit-note');
    const prepared = prepareReviewedCommand(
      userId,
      {
        intent: 'create_note',
        title: 'Lab Checklist',
        date: null,
        time: null,
        endTime: null,
        durationMinutes: null,
        category: 'Academic',
        details: 'Bring goggles',
        snoozeMinutes: null,
        confidence: 0.95,
        source: 'fast_path',
        rawTranscript: 'note Lab Checklist: Bring goggles',
        isValid: true,
      },
      {surface: 'chat', referenceDate: REF},
    );
    if (prepared.status !== 'proposal') throw new Error('Expected proposal');

    const edited = editReviewedCommand(
      userId,
      prepared.proposal.operationId,
      {title: 'Chem Lab Checklist', details: 'Bring goggles and lab coat'},
      REF,
    );
    if (edited.status !== 'proposal') throw new Error('Expected proposal');

    await chatOrchestrator.confirmReview(userId, edited.proposal.operationId);
    const notes = notesStore.getAll(userId);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      title: 'Chem Lab Checklist',
      body: 'Bring goggles and lab coat',
    });
  });

  test('CommandReviewCard renders Edit button, allows inline editing, and saves on Save press', () => {
    const userId = setupOwner('card-ui');
    let currentReview: PrepareResult = prepareReviewedCommand(
      userId,
      {
        intent: 'create_task',
        title: 'Meeting',
        date: addDaysToDate(TODAY, 1),
        time: '15:00',
        endTime: null,
        durationMinutes: null,
        category: 'Personal',
        details: null,
        snoozeMinutes: null,
        confidence: 0.95,
        source: 'fast_path',
        rawTranscript: 'schedule me a meeting tommorow at 3pm',
        isValid: true,
      },
      {surface: 'chat', referenceDate: REF},
    );
    if (currentReview.status !== 'proposal') {
      throw new Error('Expected proposal');
    }

    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    const onDismiss = jest.fn();
    const onEdit = jest.fn(patch => {
      if (currentReview.status !== 'proposal') return currentReview;
      currentReview = editReviewedCommand(
        userId,
        currentReview.proposal.operationId,
        patch,
        REF,
      );
      return currentReview;
    });

    const utils = render(
      <ThemeProvider userId={userId}>
        <CommandReviewCard
          proposal={currentReview.proposal}
          expired={false}
          busy={false}
          onEdit={onEdit}
          onConfirm={onConfirm}
          onCancel={onCancel}
          onDismiss={onDismiss}
          testIDPrefix="chat-review"
        />
      </ThemeProvider>,
    );

    expect(utils.getByTestId('chat-review-edit')).toBeTruthy();
    expect(utils.getByTestId('chat-review-cancel')).toBeTruthy();
    expect(utils.getByTestId('chat-review-confirm')).toBeTruthy();

    fireEvent.press(utils.getByTestId('chat-review-edit'));
    expect(utils.getByTestId('chat-review-edit-form')).toBeTruthy();

    fireEvent.changeText(
      utils.getByTestId('chat-review-edit-title'),
      'Capstone Review',
    );
    fireEvent.changeText(utils.getByTestId('chat-review-edit-time'), '4:00 PM');
    fireEvent.press(utils.getByTestId('chat-review-edit-category-academic'));
    fireEvent.press(utils.getByTestId('chat-review-edit-save'));

    expect(onEdit).toHaveBeenCalledWith({
      title: 'Capstone Review',
      time: '4:00 PM',
      category: 'Academic',
    });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  test('ChatScreen lets user edit a proposed task inline before confirming and preserves Cancel draft restore after edit', async () => {
    const userId = setupOwner('chatscreen-edit');
    chatDraftStore.set(userId, '');

    const utils = render(
      <ThemeProvider userId={userId}>
        <ChatScreen userId={userId} />
      </ThemeProvider>,
    );

    fireEvent.changeText(
      utils.getByTestId('chat-text-input'),
      'schedule me a meeting tommorow at 3pm',
    );
    fireEvent.press(utils.getByTestId('chat-send-button'));

    await waitFor(() =>
      expect(utils.getByTestId('chat-review-action')).toHaveTextContent(
        /Create task “Meeting”/,
      ),
    );

    // Edit title & notes inline before confirming
    fireEvent.press(utils.getByTestId('chat-review-edit'));
    fireEvent.changeText(
      utils.getByTestId('chat-review-edit-title'),
      'Updated Meeting Title',
    );
    fireEvent.changeText(
      utils.getByTestId('chat-review-edit-details'),
      'Agenda: sprint demo',
    );
    fireEvent.press(utils.getByTestId('chat-review-edit-save'));

    await waitFor(() =>
      expect(utils.getByTestId('chat-review-action')).toHaveTextContent(
        /Create task “Updated Meeting Title”/,
      ),
    );
    expect(tasksStore.getAllTasks(userId)).toHaveLength(0);

    // Cancelling after edit restores original text to the composer (AGY-PORT 05)
    fireEvent.press(utils.getByTestId('chat-review-cancel'));
    await waitFor(() =>
      expect(utils.getByTestId('chat-text-input').props.value).toBe(
        'schedule me a meeting tommorow at 3pm',
      ),
    );
    expect(tasksStore.getAllTasks(userId)).toHaveLength(0);

    // Send again, edit again, then Confirm to persist edited values
    fireEvent.press(utils.getByTestId('chat-send-button'));
    await waitFor(() => expect(utils.getByTestId('chat-review-edit')).toBeTruthy());

    fireEvent.press(utils.getByTestId('chat-review-edit'));
    fireEvent.changeText(
      utils.getByTestId('chat-review-edit-title'),
      'Final Meeting Title',
    );
    fireEvent.press(utils.getByTestId('chat-review-edit-save'));
    await waitFor(() =>
      expect(utils.getByTestId('chat-review-action')).toHaveTextContent(
        /Create task “Final Meeting Title”/,
      ),
    );

    fireEvent.press(utils.getByTestId('chat-review-confirm'));
    await waitFor(() => expect(tasksStore.getAllTasks(userId)).toHaveLength(1));

    expect(tasksStore.getAllTasks(userId)[0].title).toBe('Final Meeting Title');
    expect(chatStore.getMessages(userId).length).toBeGreaterThanOrEqual(2);
    utils.unmount();
  });
});
