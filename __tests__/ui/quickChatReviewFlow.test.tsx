/**
 * Floating LAFINA (J-11 to J-14, FLOAT-05): the capture loop in Quick Chat.
 * J-11 Confirm once → one event, one reminder, one receipt; a second Confirm
 *      adds nothing.
 * J-12 Cancel saves nothing and gives the words back; expired, session ended,
 *      stale and not found remove the card with one plain message; a failed
 *      save keeps the card.
 * J-13 The success card shows the confirm reply; Done closes the panel; View
 *      in LAFINA leaves a navigation request for this student and opens LAFINA.
 * J-14 A tap on the scrim does not close the panel while a card is open.
 */
import React from 'react';
import {Keyboard, NativeModules, Platform} from 'react-native';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {
  db,
  initDatabase,
  remindersStore,
  tasksStore,
  userStore,
} from '../../src/storage';
import {chatOrchestrator} from '../../src/ai/chatOrchestrator';
import type {ReviewDecisionResult} from '../../src/ai/chatOrchestrator';
import {
  endReviewSession,
  latestPendingReview,
} from '../../src/ai/nlu/commandReview';
import type {ReviewRefusal} from '../../src/ai/nlu/commandReview';
import {quickChatController} from '../../src/ai/quickChat/quickChatController';
import {
  QUICK_CHAT_NOT_CURRENT_TEXT,
  QUICK_CHAT_SAVE_FAILED_TEXT,
  QuickChatConversation,
} from '../../src/ui/quickChat/QuickChatConversation';
import {QuickChatPanel} from '../../src/ui/quickChat/QuickChatPanel';
import {quickChatPresence} from '../../src/ui/quickChat/quickChatPresence';

jest.mock('../../src/cloud/onlineModeGate', () => ({
  resolveOnlineMode: jest.fn(() =>
    Promise.resolve({enabled: false, reason: 'auth_required'}),
  ),
}));

/** Wednesday 18 Nov 2026, 10:00 local. "This Friday" is 20 Nov. */
const REF = new Date(2026, 10, 18, 10, 0, 0);
const EXAMPLE = 'add my networking exam this Friday at 9 AM';
const native = NativeModules as Record<string, any>;
const originalOS = Platform.OS;

let serial = 0;
const owner = (): string => `quick-flow-${++serial}`;

const count = (sql: string, args: unknown[]): number =>
  Number(db.executeSync(sql, args).rows[0]?.n ?? 0);
const receipts = (userId: string) =>
  count(
    'SELECT COUNT(*) AS n FROM assistant_operation_receipts WHERE user_id = ?',
    [userId],
  );
const outbox = (userId: string) =>
  count('SELECT COUNT(*) AS n FROM sync_outbox WHERE user_id = ?', [userId]);

const conversation = (userId: string) => (
  <ThemeProvider userId={userId}>
    <QuickChatConversation userId={userId} onlineMode={false} />
  </ThemeProvider>
);

const ask = async (text: string) => {
  fireEvent.changeText(screen.getByTestId('quick-chat-input'), text);
  fireEvent.press(screen.getByTestId('quick-chat-send'));
  return screen.findByTestId('quick-review-card', {}, {timeout: 10000});
};

beforeAll(async () => {
  jest.useFakeTimers({
    doNotFake: [
      'nextTick',
      'setImmediate',
      'setTimeout',
      'setInterval',
      'clearTimeout',
      'clearInterval',
      'queueMicrotask',
      'requestAnimationFrame',
      'cancelAnimationFrame',
    ],
  });
  jest.setSystemTime(REF);
  await initDatabase();
  userStore.createGuestUser();
});

afterAll(() => {
  jest.useRealTimers();
});

beforeEach(() => {
  Object.defineProperty(Platform, 'OS', {value: 'android', configurable: true});
  endReviewSession();
  quickChatController.resetForTests();
  quickChatPresence.resetForTests();
  native.LafinaFloatingAssistant.closeQuickChat.mockClear();
  native.LafinaFloatingAssistant.openMainApp.mockClear();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  Object.defineProperty(Platform, 'OS', {
    value: originalOS,
    configurable: true,
  });
  jest.restoreAllMocks();
});

describe('J-11: Confirm saves once', () => {
  test('the brief’s example: card, Confirm → one event + one reminder + one receipt; again → nothing new', async () => {
    const userId = owner();
    render(conversation(userId));
    await ask(EXAMPLE);
    expect(screen.getByTestId('quick-review-action').props.children).toMatch(
      /^Create event /,
    );
    const operationId = latestPendingReview(userId, 'quick')?.operationId;
    expect(operationId).toBeTruthy();
    expect(latestPendingReview(userId, 'chat')).toBeNull();
    expect(tasksStore.getAllEvents(userId)).toHaveLength(0);

    await act(async () => {
      fireEvent.press(screen.getByTestId('quick-review-confirm'));
    });
    expect(await screen.findByTestId('quick-success-card')).toBeTruthy();

    const events = tasksStore.getAllEvents(userId);
    expect(events).toHaveLength(1);
    expect(events[0].date).toBe('2026-11-20');
    expect(events[0].startTime).toBe('09:00');
    expect(remindersStore.getAllReminders(userId)).toHaveLength(1);
    expect(receipts(userId)).toBe(1);
    const outboxAfter = outbox(userId);
    expect(screen.queryByTestId('quick-review-card')).toBeNull();

    // A late second Confirm of the same operation writes nothing again.
    const again = await chatOrchestrator.confirmReview(userId, operationId!, {
      temporaryChat: true,
    });
    if (again.outcome?.status === 'applied') {
      expect(again.outcome.repeated).toBe(true);
    } else {
      expect(again.outcome?.status).toBe('refused');
    }
    expect(tasksStore.getAllEvents(userId)).toHaveLength(1);
    expect(remindersStore.getAllReminders(userId)).toHaveLength(1);
    expect(receipts(userId)).toBe(1);
    expect(outbox(userId)).toBe(outboxAfter);
  });

  test('a double tap on Confirm writes once', async () => {
    const userId = owner();
    render(conversation(userId));
    await ask(EXAMPLE);
    await act(async () => {
      fireEvent.press(screen.getByTestId('quick-review-confirm'));
      fireEvent.press(screen.getByTestId('quick-review-confirm'));
    });
    await screen.findByTestId('quick-success-card');
    expect(tasksStore.getAllEvents(userId)).toHaveLength(1);
    expect(receipts(userId)).toBe(1);
  });

  test('a reminder request and a note request complete the same loop', async () => {
    const userId = owner();
    render(conversation(userId));
    await ask('remind me to submit the lab report tomorrow at 8 PM');
    await act(async () => {
      fireEvent.press(screen.getByTestId('quick-review-confirm'));
    });
    await screen.findByTestId('quick-success-card');
    expect(remindersStore.getAllReminders(userId).length).toBeGreaterThan(0);

    await ask('note: bring the lab manual on Thursday');
    await act(async () => {
      fireEvent.press(screen.getByTestId('quick-review-confirm'));
    });
    await screen.findByTestId('quick-success-card');
    expect(receipts(userId)).toBe(2);
  });
});

describe('J-12: Cancel and refusals', () => {
  test('Cancel saves nothing and gives the words back', async () => {
    const userId = owner();
    render(conversation(userId));
    await ask(EXAMPLE);
    act(() => {
      fireEvent.press(screen.getByTestId('quick-review-cancel'));
    });
    expect(screen.queryByTestId('quick-review-card')).toBeNull();
    expect(screen.getByTestId('quick-chat-input').props.value).toBe(EXAMPLE);
    expect(tasksStore.getAllEvents(userId)).toHaveLength(0);
    expect(receipts(userId)).toBe(0);
    expect(latestPendingReview(userId, 'quick')).toBeNull();
  });

  test('Cancel after closing and reopening the panel still gives the words back (device finding)', async () => {
    const userId = owner();
    const first = render(conversation(userId));
    await ask(EXAMPLE);
    // Closing Quick Chat unmounts the panel; the card stays pending.
    first.unmount();
    render(conversation(userId));
    expect(await screen.findByTestId('quick-review-card')).toBeTruthy();
    act(() => {
      fireEvent.press(screen.getByTestId('quick-review-cancel'));
    });
    expect(screen.queryByTestId('quick-review-card')).toBeNull();
    expect(screen.getByTestId('quick-chat-input').props.value).toBe(EXAMPLE);
    expect(tasksStore.getAllEvents(userId)).toHaveLength(0);
  });

  const refused = (reason: ReviewRefusal): ReviewDecisionResult => ({
    outcome: {status: 'refused', reason, reply: `pipeline says ${reason}`},
    assistantMessage: null,
    reply: `pipeline says ${reason}`,
  });

  test.each<ReviewRefusal>(['expired', 'session_ended', 'stale', 'not_found'])(
    '%s → the card goes, with one plain message',
    async reason => {
      const userId = owner();
      render(conversation(userId));
      await ask(EXAMPLE);
      jest
        .spyOn(chatOrchestrator, 'confirmReview')
        .mockResolvedValue(refused(reason));
      await act(async () => {
        fireEvent.press(screen.getByTestId('quick-review-confirm'));
      });
      await waitFor(() =>
        expect(screen.queryByTestId('quick-review-card')).toBeNull(),
      );
      expect(screen.getByText(QUICK_CHAT_NOT_CURRENT_TEXT)).toBeTruthy();
      expect(screen.queryByTestId('quick-success-card')).toBeNull();
      expect(tasksStore.getAllEvents(userId)).toHaveLength(0);
    },
  );

  test('failed → the card stays with "Could not save. Try again."', async () => {
    const userId = owner();
    render(conversation(userId));
    await ask(EXAMPLE);
    jest
      .spyOn(chatOrchestrator, 'confirmReview')
      .mockResolvedValue(refused('failed'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('quick-review-confirm'));
    });
    expect(screen.getByTestId('quick-review-card')).toBeTruthy();
    expect(screen.getByTestId('quick-review-notice').props.children).toBe(
      QUICK_CHAT_SAVE_FAILED_TEXT,
    );
  });
});

describe('J-13: success card', () => {
  test('shows the confirm reply; View in LAFINA requests the item; Done closes', async () => {
    const userId = owner();
    render(conversation(userId));
    await ask(EXAMPLE);
    const confirmSpy = jest.spyOn(chatOrchestrator, 'confirmReview');
    await act(async () => {
      fireEvent.press(screen.getByTestId('quick-review-confirm'));
    });
    await screen.findByTestId('quick-success-card');
    const decision = await confirmSpy.mock.results[0].value;
    expect(decision.outcome.status).toBe('applied');
    expect(screen.getByTestId('quick-success-message').props.children).toBe(
      decision.outcome.reply,
    );
    const eventId = tasksStore.getAllEvents(userId)[0].id;

    fireEvent.press(screen.getByTestId('quick-success-view'));
    expect(native.LafinaFloatingAssistant.openMainApp).toHaveBeenCalledTimes(1);
    expect(quickChatPresence.consumeNavigation(userId)).toEqual({
      ownerId: userId,
      screen: 'calendar',
      entityKind: 'event',
      entityId: eventId,
    });

    fireEvent.press(screen.getByTestId('quick-success-done'));
    expect(native.LafinaFloatingAssistant.closeQuickChat).toHaveBeenCalledTimes(
      1,
    );
  });

  test('chips only fill the composer; they never send', () => {
    const userId = owner();
    const spy = jest.spyOn(chatOrchestrator, 'processMessage');
    render(conversation(userId));
    fireEvent.press(screen.getByTestId('quick-chip-reminder'));
    expect(screen.getByTestId('quick-chat-input').props.value).toBe(
      'Remind me to ',
    );
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('J-14: scrim', () => {
  const panel = (userId: string) => (
    <SafeAreaProvider
      initialMetrics={{
        frame: {x: 0, y: 0, width: 400, height: 800},
        insets: {top: 0, left: 0, right: 0, bottom: 0},
      }}
    >
      <ThemeProvider userId={userId}>
        <QuickChatPanel userId={userId} state="ready" />
      </ThemeProvider>
    </SafeAreaProvider>
  );

  test('closes the panel when no card is open; only hides the keyboard while one is', async () => {
    const userId = owner();
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    render(panel(userId));
    fireEvent.press(screen.getByTestId('quick-chat-scrim'));
    expect(native.LafinaFloatingAssistant.closeQuickChat).toHaveBeenCalledTimes(
      1,
    );

    await ask(EXAMPLE);
    native.LafinaFloatingAssistant.closeQuickChat.mockClear();
    dismiss.mockClear();
    fireEvent.press(screen.getByTestId('quick-chat-scrim'));
    expect(
      native.LafinaFloatingAssistant.closeQuickChat,
    ).not.toHaveBeenCalled();
    expect(dismiss).toHaveBeenCalled();
    expect(screen.getByTestId('quick-review-card')).toBeTruthy();

    // Close (✕) still closes it, and the card stays for the next open.
    fireEvent.press(screen.getByTestId('quick-chat-close'));
    expect(native.LafinaFloatingAssistant.closeQuickChat).toHaveBeenCalledTimes(
      1,
    );
    expect(latestPendingReview(userId, 'quick')).not.toBeNull();
  });
});
