/**
 * AGY-PORT 04 review UI: ChatScreen and VoiceModal show a review card that
 * writes nothing until the student presses Confirm. Rendering runs in Jest with
 * the node:sqlite mock; it does not prove anything about a real phone.
 */
import React from 'react';
import {
  act,
  fireEvent,
  render,
  waitFor,
  within,
} from '@testing-library/react-native';
import {PermissionsAndroid} from 'react-native';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {ChatScreen} from '../../src/ui/screens/ChatScreen';
import {VoiceModal} from '../../src/ui/components/VoiceModal';
import {CalendarScreen} from '../../src/ui/screens/calendar';
import {db, initDatabase, tasksStore, userStore} from '../../src/storage';
import {endReviewSession, REVIEW_TTL_MS} from '../../src/ai/nlu/commandReview';
import {ttsService} from '../../src/ai/tts/ttsService';

let serial = 0;
const owner = (label: string): string => {
  serial += 1;
  return `p04-ui-${label}-${serial}`;
};

const tasksOf = (userId: string) => tasksStore.getAllTasks(userId);

const renderChat = (userId: string) =>
  render(
    <ThemeProvider userId={userId}>
      <ChatScreen userId={userId} />
    </ThemeProvider>,
  );

const sendChat = (utils: ReturnType<typeof renderChat>, text: string) => {
  fireEvent.changeText(utils.getByTestId('chat-text-input'), text);
  fireEvent.press(utils.getByTestId('chat-send-button'));
};

describe('AGY-PORT 04 review UI', () => {
  beforeAll(async () => {
    await initDatabase();
    userStore.createGuestUser();
  });

  beforeEach(() => {
    jest.spyOn(ttsService, 'speak').mockResolvedValue(undefined as never);
    jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    endReviewSession();
  });

  test('Chat shows a review card; Cancel writes nothing', async () => {
    const userId = owner('cancel');
    const utils = renderChat(userId);
    sendChat(utils, 'Add task: read chapter 5');
    const card = await utils.findByTestId('chat-review-card');
    expect(card).toBeTruthy();
    expect(utils.getByTestId('chat-review-action')).toBeTruthy();
    expect(tasksOf(userId)).toHaveLength(0);

    fireEvent.press(utils.getByTestId('chat-review-cancel'));
    await waitFor(() =>
      expect(utils.queryByTestId('chat-review-card')).toBeNull(),
    );
    expect(
      await utils.findByText('Cancelled. Nothing was changed.'),
    ).toBeTruthy();
    expect(tasksOf(userId)).toHaveLength(0);
  });

  test('Chat Confirm writes once even when tapped twice', async () => {
    const userId = owner('confirm');
    const utils = renderChat(userId);
    sendChat(utils, 'Add task: read chapter 5');
    const confirm = await utils.findByTestId('chat-review-confirm');
    await act(async () => {
      fireEvent.press(confirm);
      fireEvent.press(confirm);
    });
    await waitFor(() =>
      expect(utils.queryByTestId('chat-review-card')).toBeNull(),
    );
    expect(tasksOf(userId).map(t => t.title)).toEqual(['Read chapter 5']);
    expect(await utils.findByText(/Added task/)).toBeTruthy();
  });

  test('defaults are shown on the card before anything is saved', async () => {
    const userId = owner('assume');
    const utils = renderChat(userId);
    sendChat(utils, 'Add study block for Algorithms');
    const assumptions = await utils.findByTestId('chat-review-assumptions');
    expect(within(assumptions).getByText(/starts at 9:00 AM/)).toBeTruthy();
    expect(within(assumptions).getByText(/No date was given/)).toBeTruthy();
    expect(tasksOf(userId)).toHaveLength(0);
  });

  test('leaving Chat does not confirm; the review comes back and still needs a tap', async () => {
    const userId = owner('unmount');
    const first = renderChat(userId);
    sendChat(first, 'Add task: read chapter 5');
    await first.findByTestId('chat-review-card');
    first.unmount();
    expect(tasksOf(userId)).toHaveLength(0);

    const second = renderChat(userId);
    expect(await second.findByTestId('chat-review-card')).toBeTruthy();
    expect(tasksOf(userId)).toHaveLength(0);
  });

  test('an expired review shows a notice and never confirms by itself', async () => {
    jest.useFakeTimers({doNotFake: ['nextTick', 'setImmediate']});
    try {
      const userId = owner('expired');
      const utils = renderChat(userId);
      sendChat(utils, 'Add task: read chapter 5');
      await utils.findByTestId('chat-review-card');
      await act(async () => {
        jest.advanceTimersByTime(REVIEW_TTL_MS + 1000);
      });
      expect(utils.getByTestId('chat-review-expired')).toBeTruthy();
      expect(utils.queryByTestId('chat-review-confirm')).toBeNull();
      expect(tasksOf(userId)).toHaveLength(0);
      fireEvent.press(utils.getByTestId('chat-review-dismiss'));
      await waitFor(() =>
        expect(utils.queryByTestId('chat-review-card')).toBeNull(),
      );
      expect(tasksOf(userId)).toHaveLength(0);
    } finally {
      jest.useRealTimers();
    }
  });

  test('VoiceModal: closing during review cancels it and writes nothing', async () => {
    const userId = owner('voice');
    const onClose = jest.fn();
    const utils = render(
      <ThemeProvider userId={userId}>
        <VoiceModal visible userId={userId} onClose={onClose} />
      </ThemeProvider>,
    );
    fireEvent.changeText(
      utils.getByTestId('voice-text-input'),
      'Add task: read chapter 5',
    );
    fireEvent.press(utils.getByTestId('voice-send-button'));
    expect(await utils.findByTestId('voice-review-card')).toBeTruthy();
    expect(utils.getByTestId('voice-status-text').props.children).toBe(
      'Check the details, then confirm',
    );
    // No auto-close while a review waits.
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.press(utils.getByTestId('voice-modal-close'));
    // AGY-PORT 05 (intentional): an unsent draft/review asks before it is discarded.
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.press(utils.getByTestId('voice-draft-dialog-confirm'));
    expect(onClose).toHaveBeenCalled();
    expect(tasksOf(userId)).toHaveLength(0);
  });

  test('Calendar opens the paged Undated tasks view', async () => {
    const userId = owner('cal');
    db.executeSync('DELETE FROM active_session');
    for (let i = 0; i < 22; i += 1) {
      tasksStore.insertTask({
        id: `${userId}-u-${i}`,
        userId,
        title: `Undated ${String(i).padStart(2, '0')}`,
        dueDate: null,
        dueTime: null,
        isCompleted: false,
        priority: 'Medium',
        category: 'Academic',
      });
    }
    const utils = render(
      <ThemeProvider userId={userId}>
        <CalendarScreen
          userId={userId}
          refreshTrigger={0}
          onRefresh={jest.fn()}
        />
      </ThemeProvider>,
    );
    fireEvent.press(utils.getByTestId('calendar-undated-button'));
    expect(await utils.findByTestId('undated-tasks-modal')).toBeTruthy();
    expect(utils.getAllByTestId(/^undated-task-done-/)).toHaveLength(20);
    fireEvent.press(utils.getByTestId('undated-tasks-more'));
    await waitFor(() =>
      expect(utils.getAllByTestId(/^undated-task-done-/)).toHaveLength(22),
    );
    expect(utils.queryByTestId('undated-tasks-more')).toBeNull();
    fireEvent.press(utils.getByTestId(`undated-task-done-${userId}-u-0`));
    await waitFor(() =>
      expect(
        tasksOf(userId).find(t => t.id === `${userId}-u-0`)?.isCompleted,
      ).toBe(true),
    );
    // Completed tasks leave the Undated list.
    await waitFor(() =>
      expect(utils.getAllByTestId(/^undated-task-done-/)).toHaveLength(21),
    );
  });
});
