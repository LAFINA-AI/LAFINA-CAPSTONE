jest.unmock('../../src/cloud/chatMemoryService');
import React from 'react';
import NetInfo from '@react-native-community/netinfo';
import {Alert, DeviceEventEmitter, NativeModules} from 'react-native';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import {
  chatMemoryStore,
  chatStore,
  db,
  initDatabase,
  localSettingsStore,
  materialStore,
  preferencesStore,
  tasksStore,
  timeBlocksStore,
  userStore,
} from '../../src/storage';
import {personalMemoryStore} from '../../src/storage/personalMemoryStore';
import {studentSetupStore} from '../../src/storage/studentSetupStore';
import {explicitMemory} from '../../src/ai/explicitMemory';
import {studyPreference} from '../../src/ai/studyPreference';
import {chatOrchestrator} from '../../src/ai/chatOrchestrator';
import {
  endReviewSession,
  prepareReviewedCommand,
} from '../../src/ai/nlu/commandReview';
import {validateIntent} from '../../src/ai/nlu/types';
import {buildMorningBriefing} from '../../src/ai/briefing/morningBriefing';
import {recordReminderInteraction} from '../../src/ai/ml/featureExtractor';
import {studyReply} from '../../src/skills/studyAi';
import {askUserMaterials} from '../../src/skills/materialQa';
import {buildSkillDocumentPrompt} from '../../src/skills/documentPrompt';
import {onlineChatSkill} from '../../src/skills/onlineChatSkill';
import {chunkExtractedPages} from '../../src/materials';
import {cloudClient} from '../../src/cloud/cloudClient';
import {
  backendSelection,
  DEVICE_SETTINGS_OWNER,
} from '../../src/cloud/backendSelection';
import {
  CHAT_MEMORY_CHANGED_EVENT,
  chatMemoryService,
  resetChatMemorySupport,
} from '../../src/cloud/chatMemoryService';
import {defaultVoiceConversationDeps} from '../../src/cloud/voiceConversation';
import {actionService} from '../../src/ai/voiceActions/actionService';
import {enableUstpForTest} from '../fixtures/ustpEligibility';
import {VOICE_CONSENT_KEY} from '../../src/cloud/voiceConversation';
import {chooseUstpMode} from '../../src/storage/studentMode';
import {saveOnboardingMemories} from '../../src/storage/onboardingMemory';
import {ChatMemorySettings} from '../../src/ui/components/profile/ChatMemorySettings';
import {PreferencesSettingsScreen} from '../../src/ui/screens/PreferencesSettingsScreen';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';

let idx = 0;
const makeStudent = (prefix = 'grow-ui'): string => {
  idx += 1;
  const id = `${prefix}-${idx}`;
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT OR IGNORE INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
     VALUES (?, ?, ?, 'student', 0, 0, 0, 0, ?, ?)`,
    [id, id, `${id}@example.invalid`, now, now],
  );
  return id;
};

const confirmNextAlert = (buttonLabel: string) =>
  jest.spyOn(Alert, 'alert').mockImplementationOnce((_t, _m, buttons) => {
    buttons?.find(b => b.text === buttonLabel)?.onPress?.();
  });

beforeAll(async () => {
  await initDatabase();
});

beforeEach(() => {
  endReviewSession();
  resetChatMemorySupport();
  (NetInfo.fetch as jest.Mock).mockResolvedValue({
    isConnected: true,
    isInternetReachable: true,
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Explicit memory safety, Temporary/Quick Chat, and server switch reset', () => {
  test('studyPreference parses "remember that my preferred study time is at night" while explicitMemory rejects scheduling traps', () => {
    expect(
      studyPreference('Remember that my preferred study time is at night'),
    ).toBe('Prefers studying at night.');
    expect(explicitMemory('Remember that my major is BSIT')).toBe(
      'Student says: my major is BSIT.',
    );

    // Scheduling / exam / deadline cues must NOT be swallowed as memory notes.
    expect(explicitMemory('Remember I have a math exam tomorrow')).toBeNull();
    expect(explicitMemory('Remember that I have a quiz at 3:00 PM')).toBeNull();
    expect(
      explicitMemory('Remember I need to submit my capstone report Friday'),
    ).toBeNull();
    expect(explicitMemory("Don't remember this")).toBeNull();
  });

  test('Temporary Chat refuses silent memory saves and honours "Forget everything"; Quick Chat saves memory without chat rows', async () => {
    const userId = makeStudent('temp-quick');
    chatMemoryStore.add(userId, 'Existing saved fact.');

    const chatSpy = jest.spyOn(onlineChatSkill, 'sendChatMessage');
    const tempMem = await chatOrchestrator.processMessage(
      userId,
      'Remember that I love matcha',
      {temporaryChat: true, onlineMode: true},
    );
    expect(tempMem.reply).toMatch(/Temporary chats don't save new memories/i);
    expect(chatSpy).not.toHaveBeenCalled();
    expect(chatMemoryStore.list(userId).map(m => m.text)).toEqual([
      'Existing saved fact.',
    ]);

    const tempForget = await chatOrchestrator.processMessage(
      userId,
      'Forget everything you know about me',
      {temporaryChat: true, onlineMode: true},
    );
    expect(tempForget.reply).toMatch(/forgotten all saved memories/i);
    expect(chatMemoryStore.list(userId)).toEqual([]);
    expect(chatStore.listSessions(userId)).toEqual([]);

    const quickSave = await chatOrchestrator.processMessage(
      userId,
      'Remember that I prefer studying in quiet corners',
      {temporaryChat: true, reviewSurface: 'quick', onlineMode: false},
    );
    expect(quickSave.reply).toContain("I'll remember that.");
    expect(chatMemoryStore.list(userId).map(m => m.text)).toContain(
      'Student says: I prefer studying in quiet corners.',
    );
    expect(chatStore.listSessions(userId)).toEqual([]);
  });

  test('backendSelection.select resets cached chat memory feature support', async () => {
    const userId = makeStudent('server-switch');
    const native = NativeModules as {CapstoneBuild?: Record<string, unknown>};
    const prevBuild = native.CapstoneBuild;
    native.CapstoneBuild = {...(prevBuild ?? {}), backendSwitchEnabled: true};
    try {
      jest.spyOn(cloudClient, 'request').mockResolvedValueOnce({
        status: 'client_error',
        httpStatus: 404,
      } as never);
      const reply = chatStore.addMessage(userId, 'assistant', 'Hi');
      await chatMemoryService.afterExchange({
        userId,
        sessionId: reply.sessionId,
        assistantMessageId: reply.id,
        userText: 'I live in CDO',
        replyText: 'Noted!',
      });
      expect(chatMemoryService.isActive(userId)).toBe(false);

      backendSelection.select('local');
      expect(chatMemoryService.isActive(userId)).toBe(true);
    } finally {
      native.CapstoneBuild = prevBuild;
      db.executeSync(
        'DELETE FROM local_settings WHERE user_id = ? AND key = ?',
        [DEVICE_SETTINGS_OWNER, 'debug.api_backend'],
      );
      cloudClient.resetBaseUrls();
    }
  });
});

describe('Memory-driven smart scheduling defaults and ML channel recommendation', () => {
  test('events ask for missing times and use duration while study blocks suggest a free peak window', () => {
    const userId = makeStudent('smart-defaults');
    userStore.setCurrentUser(userId);
    const ref = new Date(2026, 10, 22, 8, 0, 0);

    // 1. Migrate only the duration; the old fixed start time is not used.
    const preparedOffer = personalMemoryStore.prepare(userId, {
      startTime: '17:30',
      durationMinutes: 90,
      expiresDays: 0,
    });
    personalMemoryStore.confirm(preparedOffer.token, userId);

    const eventIntent = validateIntent({
      intent: 'create_time_block',
      targetEntityType: 'event',
      title: 'Capstone Sync',
      date: '2026-11-23',
      time: null,
      endTime: null,
      durationMinutes: null,
      category: 'Academic',
      details: null,
      snoozeMinutes: null,
      confidence: 1,
      source: 'fast_path',
      rawTranscript: 'add event Capstone Sync tomorrow',
    });
    const question = prepareReviewedCommand(userId, eventIntent, {
      referenceDate: ref,
    });
    expect(question.status).toBe('clarify');
    expect(question.reply).toMatch(/What time should.*start/);
    const evtProposal = prepareReviewedCommand(
      userId,
      {...eventIntent, time: '15:00'},
      {referenceDate: ref},
    );
    expect(evtProposal.status).toBe('proposal');
    if (evtProposal.status !== 'proposal') throw new Error('expected proposal');
    expect(evtProposal.proposal.details.join(' ')).toContain(
      '3:00 PM to 4:30 PM',
    );
    expect(evtProposal.proposal.assumptions.join(' ')).toContain(
      'default event duration',
    );

    // 2. Study time block searches student's saved evening peak window skipping busy 18:00-19:00 block.
    preferencesStore.save(userId, {
      wakeTime: '06:30',
      sleepTime: '23:00',
      studyPeakHours: ['evening'],
      busiestDay: 'Monday',
      reminderLeadMinutes: 15,
      snoozeTendency: 'snooze_once',
      weeklyClassCount: '4-6',
      longestClassGap: '1 hour',
    });
    timeBlocksStore.insert({
      id: `busy-${idx}`,
      userId,
      title: 'Dinner',
      date: '2026-11-23',
      startTime: '18:00',
      endTime: '19:00',
      color: '#444444',
      category: 'Personal',
    });

    const studyProposal = prepareReviewedCommand(
      userId,
      validateIntent({
        intent: 'create_time_block',
        title: 'Study Operating Systems',
        date: '2026-11-23',
        time: null,
        endTime: null,
        durationMinutes: null,
        category: 'Study',
        details: null,
        snoozeMinutes: null,
        confidence: 1,
        source: 'fast_path',
        rawTranscript: 'schedule study operating systems tomorrow',
      }),
      {referenceDate: ref},
    );
    expect(studyProposal.status).toBe('proposal');
    if (studyProposal.status !== 'proposal')
      throw new Error('expected proposal');
    expect(studyProposal.proposal.details.join(' ')).toContain('7:00 PM');
    expect(studyProposal.proposal.assumptions.join(' ')).toContain(
      'evening study window',
    );
  });

  test('high-confidence ML notification preference sets default reminder delivery while explicit voice flag wins', () => {
    const userId = makeStudent('ml-delivery');
    const ref = new Date(2026, 10, 22, 8, 0, 0);
    for (let i = 0; i < 7; i += 1) {
      recordReminderInteraction(userId, {
        reminderId: `rem-notify-${i}`,
        outcome: 'acknowledged',
        latencySeconds: 10,
        channel: 'notification',
      });
    }

    const adaptiveProposal = prepareReviewedCommand(
      userId,
      validateIntent({
        intent: 'create_reminder',
        title: 'Drink Water',
        date: '2026-11-25',
        time: '15:00',
        endTime: null,
        durationMinutes: null,
        category: 'Personal',
        details: null,
        snoozeMinutes: null,
        confidence: 1,
        source: 'fast_path',
        rawTranscript: 'remind me to drink water at 3pm',
      }),
      {referenceDate: ref},
    );
    expect(adaptiveProposal.status).toBe('proposal');
    if (adaptiveProposal.status === 'proposal') {
      expect(adaptiveProposal.proposal.reminderDelivery).toBe('notify');
      expect(adaptiveProposal.proposal.assumptions.join(' ')).toContain(
        'Delivery: notification',
      );
    }

    const explicitCall = prepareReviewedCommand(
      userId,
      validateIntent({
        intent: 'create_reminder',
        title: 'Final Exam Check',
        date: '2026-11-25',
        time: '15:30',
        endTime: null,
        durationMinutes: null,
        category: 'Academic',
        details: null,
        snoozeMinutes: null,
        deliveryStyle: 'call',
        confidence: 1,
        source: 'fast_path',
        rawTranscript: 'call me about Final Exam Check at 3:30pm',
      }),
      {referenceDate: ref},
    );
    expect(explicitCall.status).toBe('proposal');
    if (explicitCall.status === 'proposal') {
      expect(explicitCall.proposal.reminderDelivery).toBe('call');
    }
  });
});

describe('Cross-surface personalization: Morning Briefing, Skills, and Voice', () => {
  test('morning briefing greets student by preferred name, nudges overdue work, and highlights study peak', () => {
    const userId = makeStudent('briefing');
    studentSetupStore.update(userId, {
      preferredName: 'Elena',
      explicit: ['name'],
    });
    saveOnboardingMemories(userId, {preferredName: 'Elena', tone: 'casual'}, [
      'evening',
    ]);
    preferencesStore.save(userId, {
      wakeTime: '06:30',
      sleepTime: '23:00',
      studyPeakHours: ['evening'],
      busiestDay: 'Monday',
      reminderLeadMinutes: 15,
      snoozeTendency: 'immediate',
      weeklyClassCount: '4-6',
      longestClassGap: '1 hour',
    });
    tasksStore.insertTask({
      id: `overdue-${idx}`,
      userId,
      title: 'Overdue essay',
      dueDate: '2026-11-12',
      dueTime: null,
      isCompleted: false,
      priority: 'High',
      category: 'Academic',
      notes: null,
      recurrenceRule: null,
    });

    const text = buildMorningBriefing(userId, new Date(2026, 10, 13, 6, 30, 0));
    expect(text).toContain('Good morning, Elena.');
    expect(text).toContain('Overdue: Overdue essay.');
    expect(text).toContain('Open evening study time starts at 6:00 PM.');
  });

  test('studyAi, materialQa, and documentPrompt honor explicit reply preferences safely within char bounds', async () => {
    const userId = makeStudent('skills-pref');
    userStore.setCurrentUser(userId);
    localSettingsStore.set(userId, 'chat.onlineMode', 'true');
    chooseUstpMode(userId);
    enableUstpForTest(userId, {
      program: 'B.S. in Information Technology',
      yearLevel: '3rd Year',
    });
    studentSetupStore.update(userId, {
      tone: 'casual',
      responseStyle: 'short',
      explicit: ['tone', 'response'],
    });

    const chatSpy = jest
      .spyOn(onlineChatSkill, 'sendChatMessage')
      .mockResolvedValue({
        status: 'success',
        data: {reply: 'Summary ready.', sources: [], usedHandbook: false},
      });
    await studyReply(
      userId,
      'Summarize this.',
      'Cell membranes are selective.',
    );
    const studyPrompt = chatSpy.mock.calls[0][0][0].content;
    expect(studyPrompt).toContain('use a casual tone');
    expect(studyPrompt).toContain('short and direct');

    const chunked = chunkExtractedPages({
      fileName: 'Bio.pdf',
      fileKind: 'pdf',
      pages: [
        {
          pageNumber: 1,
          usedOcr: false,
          text: 'Mitochondria produce cellular ATP via oxidative phosphorylation.',
        },
      ],
    });
    const mat = materialStore.saveMaterialWithChunks(
      userId,
      {
        title: chunked.title,
        fileName: 'Bio.pdf',
        fileKind: 'pdf',
        mimeType: 'application/pdf',
        sizeBytes: 512,
        sha256: chunked.sha256,
        pageCount: 1,
        pagesRead: 1,
        ocrPages: 0,
        totalChars: chunked.totalChars,
        outline: chunked.outline,
      },
      chunked.chunks,
    );
    cloudClient.setAccessToken('tok');
    const streamSpy = jest
      .spyOn(onlineChatSkill, 'streamChatMessage')
      .mockResolvedValue({
        status: 'success',
        data: {
          reply: 'Mitochondria make ATP (Bio, p. 1).',
          sources: [],
          usedHandbook: false,
        },
      });
    await askUserMaterials(
      userId,
      'How does oxidative phosphorylation produce ATP?',
      {materialIds: [mat.id], scopeKey: mat.id},
    );
    const qaMessages = streamSpy.mock.calls[0][0];
    expect(qaMessages[qaMessages.length - 1].content).toContain(
      'use a casual tone',
    );
    cloudClient.setAccessToken(null);

    const doc = buildSkillDocumentPrompt({
      prompt: 'Make study guide',
      format: 'pdf',
      length: 'Short',
      context: 'Key concepts.',
      styleNote: '[Reply settings: use a casual tone.]',
    });
    expect(doc.prompt).toContain('use a casual tone');
  });

  test('actionService handles natural save_lafina_memory phrasing and voice persistence triggers post-turn extraction', async () => {
    const userId = makeStudent('voice-mem');
    userStore.setCurrentUser(userId);
    jest.spyOn(userStore, 'getActiveSessionToken').mockReturnValue({
      userId,
      accessToken: 'tok',
      refreshToken: null,
    });
    localSettingsStore.set(userId, VOICE_CONSENT_KEY, 'true');
    localSettingsStore.set(
      userId,
      'voiceConversation.directDataConsent.v1',
      'true',
    );
    cloudClient.setAccessToken('tok');
    const spy = jest
      .spyOn(chatMemoryService, 'afterExchange')
      .mockResolvedValue(null);

    const res = await actionService.executeTool(
      userId,
      'sess-voice',
      'save_lafina_memory',
      {request: 'Keep in mind my major is BS Computer Science'},
      () => true,
    );
    expect(res).toContain('Nothing has been saved');

    const deps = defaultVoiceConversationDeps(userId);
    deps.persistence?.userTurn('By the way I commute two hours to campus');
    deps.persistence?.assistantTurn(
      'That is quite a commute! Want help blocking review time?',
      'complete',
    );
    await Promise.resolve();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        userText: 'By the way I commute two hours to campus',
      }),
    );
    cloudClient.setAccessToken(null);
  });
});

describe('UI components: ChatMemorySettings growth card + inline edit/pin + Preferences bidirectional sync', () => {
  test('ChatMemorySettings updates live on CHAT_MEMORY_CHANGED_EVENT, edits, pins, filters, and reconciles Forget All', () => {
    const userId = makeStudent('ui-sheet');
    studentSetupStore.update(userId, {
      preferredName: 'Zara',
      tone: 'casual',
      explicit: ['name', 'tone'],
    });
    saveOnboardingMemories(userId, {preferredName: 'Zara', tone: 'casual'}, [
      'night',
    ]);

    const onChanged = jest.fn();
    const ui = render(
      <ThemeProvider userId={userId}>
        <ChatMemorySettings
          userId={userId}
          isGuest={false}
          visible
          onClose={jest.fn()}
          onChanged={onChanged}
        />
      </ThemeProvider>,
    );

    expect(ui.getByTestId('memory-growth-summary')).toBeTruthy();
    expect(ui.getByText(/What LAFINA has learned/)).toBeTruthy();

    // Live memory addition outside the sheet triggers instant UI refresh.
    const learned = chatMemoryStore.add(
      userId,
      'Likes flashcards for biology.',
    );
    act(() => {
      DeviceEventEmitter.emit(CHAT_MEMORY_CHANGED_EVENT, {
        userId,
        messageId: 'chat-1',
        changes: {added: [{id: learned!.id, text: learned!.text}], removed: []},
      });
    });
    expect(ui.getByText('Likes flashcards for biology.')).toBeTruthy();

    // Pin & Edit memory inline
    fireEvent.press(ui.getByTestId(`memory-pin-${learned!.id}`));
    expect(
      chatMemoryStore.list(userId).find(m => m.id === learned!.id)?.isPinned,
    ).toBe(true);

    fireEvent.press(ui.getByTestId(`memory-edit-${learned!.id}`));
    fireEvent.changeText(
      ui.getByTestId(`memory-edit-input-${learned!.id}`),
      'Likes Anki flashcards for biology.',
    );
    fireEvent.press(ui.getByTestId(`memory-edit-save-${learned!.id}`));
    expect(ui.getByText('Likes Anki flashcards for biology.')).toBeTruthy();

    // Search filters visible items
    fireEvent.changeText(ui.getByTestId('memory-search-input'), 'Anki');
    expect(ui.queryByText('Prefers studying during: night.')).toBeNull();
    fireEvent.changeText(ui.getByTestId('memory-search-input'), '');

    // Forget All reconciles studentSetupStore identity
    confirmNextAlert('Forget');
    fireEvent.press(ui.getByTestId('memory-forget-all'));
    expect(chatMemoryStore.list(userId)).toEqual([]);
    expect(studentSetupStore.get(userId).preferredName).toBe('');
  });

  test('PreferencesSettingsScreen saves identity, tone, detail, goal, and study peaks to both stores', async () => {
    const userId = makeStudent('prefs-sync');
    userStore.setCurrentUser(userId);
    chatMemoryStore.setEnabled(userId, true);
    const onSaved = jest.fn();
    const ui = render(
      <ThemeProvider userId={userId}>
        <PreferencesSettingsScreen
          userId={userId}
          onBack={jest.fn()}
          onSaved={onSaved}
        />
      </ThemeProvider>,
    );

    expect(ui.getByTestId('preferences-ai-identity-card')).toBeTruthy();
    fireEvent.changeText(
      ui.getByTestId('preferences-preferred-name-input'),
      'Kai',
    );
    fireEvent.press(ui.getByText('Professional'));
    fireEvent.press(ui.getByText('Short'));
    fireEvent.press(ui.getByText('Deadlines'));
    fireEvent.press(ui.getByText('Morning'));

    await act(async () => {
      fireEvent.press(ui.getByText('Save Preferences'));
    });

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    const setup = studentSetupStore.get(userId);
    expect(setup.preferredName).toBe('Kai');
    expect(setup.tone).toBe('professional');
    expect(setup.responseStyle).toBe('short');
    expect(setup.goal).toBe('deadlines');

    const texts = chatMemoryStore.list(userId).map(m => m.text);
    expect(texts).toContain('Prefers to be called Kai.');
    expect(texts).toContain('Prefers a professional conversational tone.');
    expect(texts).toContain(
      'Main goal with LAFINA: keeping up with deadlines.',
    );
  });
});
