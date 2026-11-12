/**
 * Verification of the ChatGPT-style Chat Tab Redesign:
 * 1. Blank state: no wall of text, suggestion pills centered in screen
 * 2. Header waveform icon removed
 * 3. Header trash icon removed
 * 4. Header title: dynamic general title of current chat
 * 5. Temporary chat feature: doesn't get saved in history
 * 6. Assistant replies: no redundant "✨ lafina" label
 */
import React from 'react';
import {Alert, PermissionsAndroid} from 'react-native';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import {ChatScreen} from '../../src/ui/screens/ChatScreen';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {chatStore, initDatabase} from '../../src/storage';

let serial = 0;
const nextUser = (): string => {
  serial += 1;
  return `chatgpt-redesign-${serial}`;
};

const renderChat = (userId: string) =>
  render(
    <ThemeProvider userId={userId}>
      <ChatScreen userId={userId} />
    </ThemeProvider>,
  );

beforeAll(async () => {
  await initDatabase();
});

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);
  jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue(
    PermissionsAndroid.RESULTS.GRANTED,
  );
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ChatGPT-style Chat Tab Redesign', () => {
  test('1. Blank state: no wall of text, suggestion pills are centered and present', () => {
    const user = nextUser();
    const {getByTestId, queryByText, getByText} = renderChat(user);

    // Empty state container exists
    expect(getByTestId('chat-empty-state')).toBeTruthy();

    // The ugly wall of text is REMOVED
    expect(
      queryByText(/Your offline secretary for university life\. I can schedule your study blocks/i),
    ).toBeNull();

    // Suggestion pills are rendered in the empty state
    expect(getByTestId('chat-prompt-chip-0')).toBeTruthy();
    expect(getByTestId('chat-prompt-chip-1')).toBeTruthy();
    expect(getByTestId('chat-prompt-chip-2')).toBeTruthy();
    expect(getByTestId('chat-prompt-chip-3')).toBeTruthy();
    expect(getByText("What's on my schedule today?")).toBeTruthy();
  });

  test('2. Header circle waveform (AudioLines/meetings) is removed from header', () => {
    const user = nextUser();
    const {queryByTestId} = renderChat(user);

    expect(queryByTestId('chat-meetings-button')).toBeNull();
  });

  test('3. Header trash icon (clear history) is removed from header even with messages', async () => {
    const user = nextUser();
    chatStore.addMessage(user, 'user', 'Hello assistant');
    chatStore.addMessage(user, 'assistant', 'Hello student');

    const {queryByTestId} = renderChat(user);
    expect(queryByTestId('chat-clear-history-button')).toBeNull();
  });

  test('4. Header title dynamically shows the chat title rather than static LAFINA Assistant', async () => {
    const user = nextUser();
    const {getByText, findAllByText, getByTestId} = renderChat(user);

    // Initially displays "New chat"
    expect(getByText('New chat')).toBeTruthy();

    // Send a message
    fireEvent.changeText(getByTestId('chat-text-input'), 'Review Biology Midterms');
    await act(async () => {
      fireEvent.press(getByTestId('chat-send-button'));
    });

    // The title dynamically updates to the chat prompt
    await waitFor(async () => {
      const titles = await findAllByText(/Review Biology Midterms/i);
      expect(titles.length).toBeGreaterThanOrEqual(1);
    });
  });

  test('5. Temporary chat mode: messages are NOT saved in SQLite/chatStore history', async () => {
    const user = nextUser();
    const {getByTestId, getByText, getAllByText, findByText} = renderChat(user);

    // Toggle Temporary Chat on
    const tempToggle = getByTestId('chat-temporary-toggle-button');
    expect(tempToggle).toBeTruthy();
    fireEvent.press(tempToggle);

    // Header and empty state update to show Temporary Chat
    expect(getAllByText('Temporary Chat').length).toBeGreaterThanOrEqual(1);
    expect(getByText('Not saved in history')).toBeTruthy();

    // Send a message while in temporary chat
    fireEvent.changeText(getByTestId('chat-text-input'), 'What is an atom?');
    await act(async () => {
      fireEvent.press(getByTestId('chat-send-button'));
    });

    // Both user message and assistant reply appear on screen
    expect(await findByText('What is an atom?')).toBeTruthy();

    // Verify messages are completely absent from persistent SQLite storage
    const stored = chatStore.getMessages(user);
    expect(stored).toHaveLength(0);
  });

  test('5b. Ending temporary chat clears in-memory temporary messages and restores normal chat', async () => {
    const user = nextUser();
    // Normal chat has 1 message
    chatStore.addMessage(user, 'user', 'Permanent message');
    chatStore.addMessage(user, 'assistant', 'Permanent reply');

    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find(b => b.text === 'End')?.onPress?.();
    });

    const {getByTestId, getAllByText, findByText, queryByText, queryAllByText} = renderChat(user);
    expect(getAllByText('Permanent message').length).toBeGreaterThanOrEqual(1);

    // Turn temporary chat on
    fireEvent.press(getByTestId('chat-temporary-toggle-button'));
    expect(getAllByText('Temporary Chat').length).toBeGreaterThanOrEqual(1);
    expect(queryAllByText('Permanent message')).toHaveLength(0);

    // Send a message in temporary chat
    fireEvent.changeText(getByTestId('chat-text-input'), 'Secret temporary note');
    await act(async () => {
      fireEvent.press(getByTestId('chat-send-button'));
    });
    expect(await findByText('Secret temporary note')).toBeTruthy();

    // End temporary chat
    fireEvent.press(getByTestId('chat-temporary-toggle-button'));

    // Temporary message is gone, permanent chat restored
    await waitFor(() => {
      expect(queryByText('Secret temporary note')).toBeNull();
      expect(getAllByText('Permanent message').length).toBeGreaterThanOrEqual(1);
    });
    expect(chatStore.getMessages(user)).toHaveLength(2);
  });

  test('6. Assistant reply bubbles do NOT contain redundant "✨ lafina" header', async () => {
    const user = nextUser();
    chatStore.addMessage(user, 'user', 'What is machine learning?');
    chatStore.addMessage(user, 'assistant', 'Machine learning is a field of AI.');

    const {getByText, queryByText} = renderChat(user);

    // Assistant message content is present
    expect(getByText('Machine learning is a field of AI.')).toBeTruthy();

    // Redundant "✨ lafina" or "lafina" label header inside assistant bubble is NOT rendered
    expect(queryByText(/^lafina$/i)).toBeNull();
  });

  test('7. Assistant reply bubbles do NOT render speaker/TTS button (ChatGPT minimal style)', async () => {
    const user = nextUser();
    const msg = chatStore.addMessage(user, 'assistant', 'Clean response without speaker icon.');

    const {queryByTestId} = renderChat(user);

    expect(queryByTestId(`chat-speak-btn-${msg.id}`)).toBeNull();
  });

  test('8. Attachment plus (+) button opens action sheet with Camera and Photos without Document generation', async () => {
    const user = nextUser();
    const {getByTestId, getByText, queryByText, queryByTestId} = renderChat(user);

    // Click the attachment / plus button
    fireEvent.press(getByTestId('chat-document-format-button'));

    // Camera option is present
    expect(getByTestId('chat-attach-camera')).toBeTruthy();
    expect(getByText('Camera')).toBeTruthy();

    // Photos / Gallery option is present
    expect(getByTestId('chat-attach-gallery')).toBeTruthy();
    expect(getByText('Photos & Screenshots')).toBeTruthy();

    // Document creation options are removed per Calendar/Notes/To-Do scope cleanup
    expect(queryByText(/Create a Document/i)).toBeNull();
    expect(queryByTestId('chat-format-option-pdf')).toBeNull();
    expect(queryByTestId('chat-format-option-docx')).toBeNull();
    expect(queryByTestId('chat-format-option-xlsx')).toBeNull();
    expect(queryByTestId('chat-format-option-pptx')).toBeNull();
  });

  test('9. When input is empty, mic button is visible and send button is not', () => {
    const user = nextUser();
    const {getByTestId, queryByTestId} = renderChat(user);

    expect(getByTestId('chat-mic-button')).toBeTruthy();
    expect(queryByTestId('chat-send-button')).toBeNull();
  });

  test('10. Typing in input switches mic button to send button; clearing restores mic button', () => {
    const user = nextUser();
    const {getByTestId, queryByTestId} = renderChat(user);

    const input = getByTestId('chat-text-input');
    expect(getByTestId('chat-mic-button')).toBeTruthy();
    expect(queryByTestId('chat-send-button')).toBeNull();

    // Type text
    fireEvent.changeText(input, 'Hello Lafina');
    expect(getByTestId('chat-send-button')).toBeTruthy();
    expect(queryByTestId('chat-mic-button')).toBeNull();

    // Clear text
    fireEvent.changeText(input, '');
    expect(getByTestId('chat-mic-button')).toBeTruthy();
    expect(queryByTestId('chat-send-button')).toBeNull();
  });

  test('11. Hold to speak: pressing in starts STT listening and shows listening indicator', async () => {
    const user = nextUser();
    const {getByTestId, getByText} = renderChat(user);

    const micBtn = getByTestId('chat-mic-button');
    await act(async () => {
      fireEvent(micBtn, 'pressIn', {
        nativeEvent: {pageX: 300},
      });
    });

    expect(getByText(/Listening…/i)).toBeTruthy();
  });

  test('12. Releasing held mic stops listening and sends transcribed speech directly to chat', async () => {
    const user = nextUser();
    const {getByTestId, findAllByText} = renderChat(user);

    const micBtn = getByTestId('chat-mic-button');

    // Press in to start recording
    await act(async () => {
      fireEvent(micBtn, 'pressIn', {
        nativeEvent: {pageX: 300},
      });
    });

    // Release to stop recording and send transcribed utterance
    await act(async () => {
      fireEvent(micBtn, 'pressOut');
    });

    // The mock STT transcript 'mock transcript' should be sent and appear in chat!
    await waitFor(async () => {
      const msgs = await findAllByText('mock transcript');
      expect(msgs.length).toBeGreaterThanOrEqual(1);
    });
  });

  test('13. Sliding left cancels speech capture without sending message', async () => {
    const user = nextUser();
    const {getByTestId, getByText, queryByText} = renderChat(user);

    const micBtn = getByTestId('chat-mic-button');

    // Press in with start X = 300
    await act(async () => {
      fireEvent(micBtn, 'pressIn', {
        nativeEvent: {pageX: 300},
      });
    });
    expect(getByText(/Listening…/i)).toBeTruthy();

    // Slide left to pageX = 200 (deltaX = 100 > 50px threshold)
    await act(async () => {
      fireEvent(micBtn, 'touchMove', {
        nativeEvent: {pageX: 200},
      });
    });
    expect(getByText(/Release to cancel/i)).toBeTruthy();

    // Release touch
    await act(async () => {
      fireEvent(micBtn, 'pressOut');
    });

    // No message should be sent to chatStore
    expect(chatStore.getMessages(user)).toHaveLength(0);
    expect(queryByText('mock transcript')).toBeNull();
  });

  test('14. Robust sticky cancel: sliding left then bouncing back right stays latched as cancelled', async () => {
    const user = nextUser();
    const {getByTestId, getByText, queryByText} = renderChat(user);

    const micBtn = getByTestId('chat-mic-button');

    // Press in at startX = 300
    await act(async () => {
      fireEvent(micBtn, 'pressIn', {
        nativeEvent: {pageX: 300, pageY: 500},
      });
    });
    expect(getByText(/Listening…/i)).toBeTruthy();

    // Slide left to pageX = 250 (deltaX = 50 > 30px threshold) -> triggers cancel
    await act(async () => {
      fireEvent(micBtn, 'touchMove', {
        nativeEvent: {pageX: 250, pageY: 500},
      });
    });
    expect(getByText(/Release to cancel/i)).toBeTruthy();

    // Thumb reflex bounce back to pageX = 305 (deltaX < 0) before breaking contact
    await act(async () => {
      fireEvent(micBtn, 'touchMove', {
        nativeEvent: {pageX: 305, pageY: 500},
      });
    });
    // Must remain latched as cancelled!
    expect(getByText(/Release to cancel/i)).toBeTruthy();

    // Release touch
    await act(async () => {
      fireEvent(micBtn, 'pressOut');
    });

    // Zero messages sent
    expect(chatStore.getMessages(user)).toHaveLength(0);
    expect(queryByText('mock transcript')).toBeNull();
  });

  test('15. Discards hallucinated speech artifacts and silence without sending to chat', async () => {
    const user = nextUser();
    const {getByTestId, queryByText} = renderChat(user);

    const {NativeModules} = require('react-native');
    const originalStartListening = NativeModules.LafinaSpeechToText.startListening;
    // Mock STT returning a known Whisper silence hallucination
    NativeModules.LafinaSpeechToText.startListening = jest.fn(options =>
      Promise.resolve({
        captureId: options?.captureId || 'cap-hallucination',
        transcript: 'Thank you for watching.',
        speechDetected: false,
        cancelled: false,
        captureDurationMs: 120,
        inferenceDurationMs: 60,
      }),
    );

    try {
      const micBtn = getByTestId('chat-mic-button');
      await act(async () => {
        fireEvent(micBtn, 'pressIn', {nativeEvent: {pageX: 300, pageY: 500}});
      });
      await act(async () => {
        fireEvent(micBtn, 'pressOut');
      });

      // Neither hallucination nor empty query should be sent
      expect(chatStore.getMessages(user)).toHaveLength(0);
      expect(queryByText('Thank you for watching.')).toBeNull();
    } finally {
      NativeModules.LafinaSpeechToText.startListening = originalStartListening;
    }
  });

  test('16. Explicit tap-to-cancel target in recording bar cancels recording immediately', async () => {
    const user = nextUser();
    const {getByTestId, getByText, getByLabelText, queryByText} = renderChat(user);

    const micBtn = getByTestId('chat-mic-button');
    await act(async () => {
      fireEvent(micBtn, 'pressIn', {nativeEvent: {pageX: 300, pageY: 500}});
    });
    expect(getByText(/Listening…/i)).toBeTruthy();

    // Tap the explicit cancel button in recording bar
    const cancelBtn = getByLabelText('Cancel recording');
    await act(async () => {
      fireEvent.press(cancelBtn);
    });

    // Recording bar should reset to normal text input
    expect(getByTestId('chat-text-input')).toBeTruthy();
    expect(chatStore.getMessages(user)).toHaveLength(0);
    expect(queryByText('mock transcript')).toBeNull();
  });
});
