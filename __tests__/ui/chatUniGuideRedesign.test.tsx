import React from 'react';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import {ChatScreen} from '../../src/ui/screens/ChatScreen';
import {SUGGESTED_PROMPTS} from '../../src/ui/components/chat/ChatInput';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {MeetingsProvider} from '../../src/ui/contexts/MeetingsContext';
import {
  academicProfileStore,
  chatStore,
  initDatabase,
  localSettingsStore,
  notesStore,
  remindersStore,
  tasksStore,
  timeBlocksStore,
  userStore,
} from '../../src/storage';
import {parseIntentFastPath} from '../../src/ai/nlu/fastPathParser';
import * as modelManager from '../../src/ai/nlu/modelManager';
import {accountLinkService} from '../../src/cloud';
import {enableUstpForTest} from '../fixtures/ustpEligibility';

describe('UniGuide-inspired Chat Tab Redesign', () => {
  let userCounter = 0;

  const nextUser = () => {
    userCounter += 1;
    const id = `uniguide_chat_user_${userCounter}`;
    userStore.createGuestUser();
    chatStore.clearHistory(id);
    return id;
  };

  const renderChat = (userId: string, onCallLafina = jest.fn()) =>
    render(
      <ThemeProvider userId={userId}>
        <MeetingsProvider userId={userId}>
          <ChatScreen userId={userId} onCallLafina={onCallLafina} />
        </MeetingsProvider>
      </ThemeProvider>,
    );

  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('renders UniGuide header (Menu left, model pill center, Temporary Chat right) and places Call Lafina to the left of Mic in the composer', () => {
    const userId = nextUser();
    const onCallLafina = jest.fn();
    const {getByTestId, queryByTestId, getByText} = renderChat(
      userId,
      onCallLafina,
    );

    const historyBtn = getByTestId('chat-history-button');
    expect(historyBtn).toBeTruthy();
    expect(historyBtn.findByProps({accessibilityLabel: 'Menu'})).toBeTruthy();

    expect(getByTestId('chat-online-toggle-button')).toBeTruthy();
    expect(getByText('Qwen 2.5 0.5B · Setup')).toBeTruthy();

    expect(getByTestId('chat-temporary-toggle-button')).toBeTruthy();
    expect(queryByTestId('chat-guide-button')).toBeNull();

    // Call Lafina sits in the composer bar directly to the left of the Mic button
    const composerRow = getByTestId('chat-composer-input-row');
    const rowChildren = composerRow.findAll(
      node =>
        node.props?.testID === 'chat-text-input' ||
        node.props?.testID === 'chat-call-lafina-button' ||
        node.props?.testID === 'chat-mic-button',
    );
    const orderedIds = rowChildren.map(node => node.props.testID);
    const uniqueOrder = orderedIds.filter(
      (id, idx) => orderedIds.indexOf(id) === idx,
    );
    expect(uniqueOrder).toEqual([
      'chat-text-input',
      'chat-call-lafina-button',
      'chat-mic-button',
    ]);

    fireEvent.press(getByTestId('chat-call-lafina-button'));
    expect(onCallLafina).toHaveBeenCalledTimes(1);

    // Typing switches the right cluster cleanly to Send
    fireEvent.changeText(getByTestId('chat-text-input'), 'Hello LAFINA');
    expect(getByTestId('chat-send-button')).toBeTruthy();
    expect(queryByTestId('chat-call-lafina-button')).toBeNull();
    expect(queryByTestId('chat-mic-button')).toBeNull();
  });

  it('shows personalized greeting, LAFINA mascot, and 2x2 sample chat cards with distinct icons', () => {
    const guest = userStore.createGuestUser();
    // Onboarding redesign: COR details count only after review and confirmation.
    enableUstpForTest(guest.id, {
      campus: 'USTP CDO Campus',
      formattedName: 'Mara Santos',
      preferredName: 'Mara',
      program: 'BSIT',
      yearLevel: '2nd Year',
      section: 'IT2R1',
    });

    try {
      const {getByTestId, getByText} = renderChat(guest.id);

      expect(getByText('Hello, Mara!')).toBeTruthy();
      expect(getByText('How can I help you today?')).toBeTruthy();
      expect(getByTestId('chat-empty-mascot')).toBeTruthy();

      const chip0 = getByTestId('chat-prompt-chip-0');
      const chip1 = getByTestId('chat-prompt-chip-1');
      const chip2 = getByTestId('chat-prompt-chip-2');
      const chip3 = getByTestId('chat-prompt-chip-3');

      expect(chip0.findByProps({accessibilityLabel: 'Clock'})).toBeTruthy();
      expect(chip1.findByProps({accessibilityLabel: 'BookOpen'})).toBeTruthy();
      expect(
        chip2.findByProps({accessibilityLabel: 'CheckSquare'}),
      ).toBeTruthy();
      expect(
        chip3.findByProps({accessibilityLabel: 'CalendarDays'}),
      ).toBeTruthy();

      expect(getByText("Today's Schedule")).toBeTruthy();
      expect(getByText('Free Study Time')).toBeTruthy();
      expect(getByText('Pending Tasks')).toBeTruthy();
      expect(getByText('Upcoming Schedule')).toBeTruthy();
    } finally {
      academicProfileStore.clear(guest.id);
    }
  });

  it('renders a clean Chat sidebar without wall-of-text clutter and opens CommandGuide from What can you ask?', async () => {
    const userId = nextUser();
    enableUstpForTest(userId);
    const {getByTestId, getByText, queryByText, findByText} =
      renderChat(userId);

    fireEvent.press(getByTestId('chat-history-button'));

    expect(getByText('Chat')).toBeTruthy();
    expect(queryByText('lafina')).toBeNull();
    expect(queryByText('Chats & Tools')).toBeNull();
    expect(queryByText('All Chats')).toBeNull();
    expect(queryByText('Chats are kept on this phone only.')).toBeNull();
    expect(queryByText('Unsaved')).toBeNull();

    expect(getByText('New chat')).toBeTruthy();
    expect(getByText('Temporary')).toBeTruthy();
    expect(getByText('USTP Handbook')).toBeTruthy();
    expect(queryByText('RAG')).toBeNull();
    expect(getByText('Camera')).toBeTruthy();
    expect(getByText('Gallery')).toBeTruthy();
    expect(getByTestId('chat-history-filter-all')).toBeTruthy();
    expect(getByTestId('chat-history-filter-general')).toBeTruthy();
    expect(getByTestId('chat-history-filter-ustp')).toBeTruthy();

    const guideRow = getByTestId('chat-sidebar-guide');
    expect(guideRow).toBeTruthy();
    expect(getByText('What can you ask?')).toBeTruthy();

    fireEvent.press(guideRow);
    expect(await findByText('What you can ask')).toBeTruthy();
  });

  it('opens downloadable offline models sheet from the center pill and updates active offline model & online status', async () => {
    const userId = nextUser();
    let gemmaDownloaded = false;

    jest
      .spyOn(modelManager, 'getAllModelsStatus')
      .mockImplementation(async uid => {
        const selected = modelManager.getSelectedOfflineModelId(uid);
        return modelManager.OFFLINE_MODEL_CATALOG.map(preset => ({
          isDownloaded: preset.id === 'gemma-3-270m' ? gemmaDownloaded : false,
          filePath:
            preset.id === 'gemma-3-270m' && gemmaDownloaded
              ? '/mock/gemma-3-270m.gguf'
              : '',
          fileSizeBytes:
            preset.id === 'gemma-3-270m' && gemmaDownloaded
              ? 240 * 1024 * 1024
              : 0,
          modelName: preset.name,
          modelId: preset.id,
          shortLabel: preset.shortLabel,
          approximateSizeBytes: preset.approximateSizeBytes,
          recommendedRamGb: preset.recommendedRamGb,
          description: preset.description,
          isSelected: preset.id === selected,
        }));
      });

    jest
      .spyOn(modelManager, 'isOfflineModelEngineAvailable')
      .mockResolvedValue(true);
    const downloadSpy = jest
      .spyOn(modelManager, 'downloadOfflineModel')
      .mockImplementation(async (_id, onProgress) => {
        onProgress?.({
          bytesWritten: 120 * 1024 * 1024,
          contentLength: 240 * 1024 * 1024,
          percent: 50,
          status: 'downloading',
        });
        gemmaDownloaded = true;
        return '/mock/gemma-3-270m.gguf';
      });

    jest
      .spyOn(accountLinkService, 'authorizeOnlineMode')
      .mockResolvedValue({status: 'success', message: 'Connected'});

    const {getByTestId, findByTestId, getByText} = renderChat(userId);

    // Clicking center pill opens offline models & engine sheet
    fireEvent.press(getByTestId('chat-online-toggle-button'));
    expect(await findByTestId('chat-engine-sheet')).toBeTruthy();
    expect(getByTestId('chat-model-card-smollm2-135m')).toBeTruthy();
    expect(getByTestId('chat-model-card-gemma-3-270m')).toBeTruthy();
    expect(getByTestId('chat-model-card-qwen2.5-0.5b')).toBeTruthy();
    expect(getByTestId('chat-model-card-gemma-3-1b')).toBeTruthy();
    expect(getByTestId('chat-model-card-fast_path_only')).toBeTruthy();

    // Selecting Fast-Path Only updates center pill immediately
    fireEvent.press(getByTestId('chat-model-action-fast_path_only'));
    await waitFor(() => {
      expect(getByText('Fast-Path Only')).toBeTruthy();
    });

    // Downloading & Loading Gemma 3 270M selects it and shows clean active label
    fireEvent.press(getByTestId('chat-model-action-gemma-3-270m'));
    await waitFor(() => expect(downloadSpy).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(getByText('Gemma 3 270M')).toBeTruthy();
    });

    // Switching to Online updates the center pill to Online, and back restores active offline model
    fireEvent.press(getByTestId('chat-engine-select-online'));
    await waitFor(() => {
      expect(localSettingsStore.get(userId, 'chat.onlineMode')).toBe('true');
      expect(
        getByTestId('chat-online-toggle-button').findByProps({
          children: 'Online',
        }),
      ).toBeTruthy();
    });

    fireEvent.press(getByTestId('chat-engine-select-offline'));
    await waitFor(() => {
      expect(getByText('Gemma 3 270M')).toBeTruthy();
    });
  });

  it('quick action cards run read-only schedule/task queries and never create dummy items', async () => {
    const refDate = new Date('2026-11-16T09:00:00');
    const intents = SUGGESTED_PROMPTS.map(prompt =>
      parseIntentFastPath(prompt, refDate),
    );
    expect(intents.map(item => item?.intent)).toEqual([
      'query_schedule',
      'query_schedule',
      'query_schedule',
      'query_schedule',
    ]);
    expect(intents[1]?.details).toBe('free_slots');
    expect(intents[2]?.details).toBe('todo_list');
    expect(intents[3]?.dateRange).toBe('this_week');

    for (let index = 0; index < 4; index += 1) {
      const userId = nextUser();
      const {getByTestId, queryByTestId} = renderChat(userId);
      await act(async () => {
        fireEvent.press(getByTestId(`chat-prompt-chip-${index}`));
      });
      await waitFor(() => {
        expect(chatStore.getMessages(userId).length).toBe(2);
      });
      expect(queryByTestId('command-review-card')).toBeNull();
      expect(tasksStore.getAllTasks(userId)).toHaveLength(0);
      expect(tasksStore.getAllEvents(userId)).toHaveLength(0);
      expect(timeBlocksStore.getAll(userId)).toHaveLength(0);
      expect(remindersStore.getAllReminders(userId)).toHaveLength(0);
      expect(notesStore.getAll(userId)).toHaveLength(0);
    }
  });
});
