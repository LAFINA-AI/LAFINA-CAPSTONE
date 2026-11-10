/**
 * AGY-PORT 05: speech ends in an editable draft, drafts are protected, and a busy
 * microphone is recoverable. Jest renders with the node:sqlite mock and mocked
 * native speech/meeting modules; no real microphone, speaker or phone is involved.
 */
import React from 'react';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import {
  AppState,
  BackHandler,
  Modal,
  NativeModules,
  PermissionsAndroid,
  Text,
  TouchableOpacity,
} from 'react-native';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {VoiceModal, MIC_BUSY_NOTICE} from '../../src/ui/components/VoiceModal';
import {ChatScreen} from '../../src/ui/screens/ChatScreen';
import {
  MeetingsProvider,
  useMeetings,
} from '../../src/ui/contexts/MeetingsContext';
import {chatDraftStore} from '../../src/ui/drafts/chatDraftStore';
import {chatOrchestrator} from '../../src/ai/chatOrchestrator';
import {meetingRecorder} from '../../src/ai';
import {ttsService} from '../../src/ai/tts/ttsService';
import {endReviewSession} from '../../src/ai/nlu/commandReview';
import {
  initDatabase,
  recordedMeetingStore,
  tasksStore,
  userStore,
} from '../../src/storage';
import type {OfflineSpeechResult} from '../../src/ai/native/speechCapture';

let serial = 0;
const owner = (label: string): string => {
  serial += 1;
  return `p05-${label}-${serial}`;
};

const speech = NativeModules.LafinaSpeechToText;
const originalStart = speech.startListening;

const result = (
  captureId: string,
  transcript: string,
): OfflineSpeechResult => ({
  captureId,
  transcript,
  speechDetected: true,
  cancelled: false,
  captureDurationMs: 900,
  inferenceDurationMs: 300,
});

/** Native capture that returns `transcript` when the student lets go. */
const speakNext = (transcript: string) => {
  speech.startListening = jest.fn((options: {captureId: string}) =>
    Promise.resolve(result(options.captureId, transcript)),
  );
};

/** Native capture that stays open until the test resolves it. */
const deferredSpeech = () => {
  const control: {
    captureId: string | null;
    resolve: (transcript: string) => void;
  } = {captureId: null, resolve: () => undefined};
  speech.startListening = jest.fn(
    (options: {captureId: string}) =>
      new Promise<OfflineSpeechResult>(resolve => {
        control.captureId = options.captureId;
        control.resolve = transcript =>
          resolve(result(options.captureId, transcript));
      }),
  );
  return control;
};

const renderVoice = (
  userId: string,
  props: Partial<React.ComponentProps<typeof VoiceModal>> = {},
) => {
  const onClose = jest.fn();
  const element = (uid: string, visible = true) => (
    <ThemeProvider userId={uid}>
      <VoiceModal visible={visible} userId={uid} onClose={onClose} {...props} />
    </ThemeProvider>
  );
  const utils = render(element(userId));
  return {...utils, onClose, element};
};

const holdAndRelease = async (utils: ReturnType<typeof render>) => {
  const button = utils.getByTestId('voice-hold-button');
  await act(async () => {
    fireEvent(button, 'pressIn');
  });
  await act(async () => {
    fireEvent(button, 'pressOut');
  });
};

const renderChat = (userId: string) =>
  render(
    <ThemeProvider userId={userId}>
      <ChatScreen userId={userId} />
    </ThemeProvider>,
  );

describe('AGY-PORT 05 drafts and microphone ownership (UI)', () => {
  beforeAll(async () => {
    await initDatabase();
    userStore.createGuestUser();
  });

  beforeEach(() => {
    jest.spyOn(ttsService, 'speak').mockResolvedValue(undefined as never);
    jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);
  });

  afterEach(() => {
    speech.startListening = originalStart;
    jest.restoreAllMocks();
    endReviewSession();
    chatDraftStore.resetForTests();
  });

  describe('VoiceModal drafts', () => {
    test('recognition ends in an editable draft and prepares or sends nothing', async () => {
      const userId = owner('draft');
      const prepare = jest.spyOn(chatOrchestrator, 'processMessage');
      speakNext('Add task: finish lab report');
      const utils = renderVoice(userId);
      await holdAndRelease(utils);

      await waitFor(() =>
        expect(utils.getByTestId('voice-text-input').props.value).toBe(
          'Add task: finish lab report',
        ),
      );
      expect(prepare).not.toHaveBeenCalled();
      expect(utils.queryByTestId('voice-review-card')).toBeNull();
      expect(utils.getByTestId('voice-status-text').props.children).toBe(
        'Edit if needed, then tap Prepare',
      );
      expect(utils.getByTestId('voice-draft-hint')).toBeTruthy();
      expect(utils.onClose).not.toHaveBeenCalled();
      expect(tasksStore.getAllTasks(userId)).toHaveLength(0);
    });

    test('Prepare goes through review; only Confirm writes; Cancel keeps the text', async () => {
      const userId = owner('prepare');
      speakNext('Add task: read chapter 7');
      const utils = renderVoice(userId);
      await holdAndRelease(utils);
      await waitFor(() =>
        expect(utils.getByTestId('voice-text-input').props.value).toBe(
          'Add task: read chapter 7',
        ),
      );

      fireEvent.changeText(
        utils.getByTestId('voice-text-input'),
        'Add task: read chapter 8',
      );
      fireEvent.press(utils.getByTestId('voice-send-button'));
      expect(await utils.findByTestId('voice-review-card')).toBeTruthy();
      expect(tasksStore.getAllTasks(userId)).toHaveLength(0);

      fireEvent.press(utils.getByTestId('voice-review-cancel'));
      await waitFor(() =>
        expect(utils.queryByTestId('voice-review-card')).toBeNull(),
      );
      expect(utils.getByTestId('voice-text-input').props.value).toBe(
        'Add task: read chapter 8',
      );
      expect(tasksStore.getAllTasks(userId)).toHaveLength(0);

      fireEvent.press(utils.getByTestId('voice-send-button'));
      const confirm = await utils.findByTestId('voice-review-confirm');
      await act(async () => {
        fireEvent.press(confirm);
      });
      await waitFor(() =>
        expect(tasksStore.getAllTasks(userId)).toHaveLength(1),
      );
      expect(tasksStore.getAllTasks(userId)[0].title.toLowerCase()).toContain(
        'read chapter 8',
      );
    });

    test('Keep/Replace: dictation never silently overwrites typed text', async () => {
      const userId = owner('replace');
      const utils = renderVoice(userId);
      fireEvent.changeText(
        utils.getByTestId('voice-text-input'),
        'my typed text',
      );

      speakNext('spoken words');
      await holdAndRelease(utils);
      expect(await utils.findByTestId('voice-draft-dialog')).toBeTruthy();
      // Default (Keep) keeps the typed text.
      fireEvent.press(utils.getByTestId('voice-draft-dialog-keep'));
      expect(utils.queryByTestId('voice-draft-dialog')).toBeNull();
      expect(utils.getByTestId('voice-text-input').props.value).toBe(
        'my typed text',
      );

      // Android back on the dialog is also Keep.
      speakNext('spoken again');
      await holdAndRelease(utils);
      await utils.findByTestId('voice-draft-dialog');
      const modals = utils.UNSAFE_getAllByType(Modal);
      act(() => {
        modals[modals.length - 1].props.onRequestClose();
      });
      expect(utils.getByTestId('voice-text-input').props.value).toBe(
        'my typed text',
      );

      speakNext('replace me in');
      await holdAndRelease(utils);
      fireEvent.press(await utils.findByTestId('voice-draft-dialog-confirm'));
      expect(utils.getByTestId('voice-text-input').props.value).toBe(
        'replace me in',
      );
    });

    test('closing with a draft asks first; Keep editing keeps it, Discard closes', async () => {
      const userId = owner('close');
      const utils = renderVoice(userId);
      fireEvent.changeText(
        utils.getByTestId('voice-text-input'),
        'unsent words',
      );

      fireEvent.press(utils.getByTestId('voice-modal-close'));
      expect(utils.onClose).not.toHaveBeenCalled();
      fireEvent.press(utils.getByTestId('voice-draft-dialog-keep'));
      expect(utils.getByTestId('voice-text-input').props.value).toBe(
        'unsent words',
      );

      // Android back on the sheet is guarded the same way.
      act(() => {
        utils.UNSAFE_getAllByType(Modal)[0].props.onRequestClose();
      });
      expect(utils.onClose).not.toHaveBeenCalled();
      fireEvent.press(utils.getByTestId('voice-draft-dialog-confirm'));
      expect(utils.onClose).toHaveBeenCalledWith(false);
    });

    test('a late speech result after close and reopen is ignored', async () => {
      const userId = owner('late');
      const control = deferredSpeech();
      const utils = renderVoice(userId);
      const button = utils.getByTestId('voice-hold-button');
      await act(async () => {
        fireEvent(button, 'pressIn');
      });
      await waitFor(() => expect(control.captureId).not.toBeNull());
      act(() => {
        fireEvent(button, 'pressOut');
      });

      utils.rerender(utils.element(userId, false));
      utils.rerender(utils.element(userId, true));
      await act(async () => {
        control.resolve('delete all my tasks');
      });
      expect(utils.getByTestId('voice-text-input').props.value).toBe('');
      expect(utils.queryByTestId('voice-draft-dialog')).toBeNull();
    });

    test('account switch clears the draft and ignores the old capture', async () => {
      const first = owner('acct-a');
      const second = owner('acct-b');
      const control = deferredSpeech();
      const utils = renderVoice(first);
      fireEvent.changeText(
        utils.getByTestId('voice-text-input'),
        'private draft',
      );
      const button = utils.getByTestId('voice-hold-button');
      await act(async () => {
        fireEvent(button, 'pressIn');
      });
      await waitFor(() => expect(control.captureId).not.toBeNull());

      utils.rerender(utils.element(second));
      expect(utils.getByTestId('voice-text-input').props.value).toBe('');
      act(() => {
        fireEvent(utils.getByTestId('voice-hold-button'), 'pressOut');
      });
      await act(async () => {
        control.resolve('old owner words');
      });
      expect(utils.getByTestId('voice-text-input').props.value).toBe('');
      expect(utils.queryByTestId('voice-draft-dialog')).toBeNull();
    });

    test('busy microphone: recoverable notice, typing still works, no recording stopped', async () => {
      const userId = owner('busy');
      const stopMeeting = NativeModules.LafinaMeetingRecorder.stopRecording;
      speech.startListening = jest.fn(() =>
        Promise.reject(
          Object.assign(
            new Error('Microphone is currently in use by meeting recorder.'),
            {
              code: 'MIC_IN_USE',
            },
          ),
        ),
      );
      const utils = renderVoice(userId);
      await holdAndRelease(utils);

      expect(await utils.findByText(MIC_BUSY_NOTICE)).toBeTruthy();
      expect(utils.getByTestId('voice-status-text').props.children).toBe(
        'Hold the mic button to talk',
      );
      expect(stopMeeting).not.toHaveBeenCalled();
      // Typing is still available and works.
      fireEvent.changeText(
        utils.getByTestId('voice-text-input'),
        'Add task: typed',
      );
      fireEvent.press(utils.getByTestId('voice-send-button'));
      expect(await utils.findByTestId('voice-review-card')).toBeTruthy();
    });

    test('Use in Chat fills an empty composer without sending', async () => {
      const userId = owner('handoff');
      const prepare = jest.spyOn(chatOrchestrator, 'processMessage');
      const onUseInChat = jest.fn();
      speakNext('Remind me to call mom');
      const utils = renderVoice(userId, {onUseInChat});
      await holdAndRelease(utils);
      fireEvent.press(await utils.findByTestId('voice-use-in-chat'));

      expect(chatDraftStore.get(userId)).toBe('Remind me to call mom');
      expect(utils.onClose).toHaveBeenCalledWith(false);
      expect(onUseInChat).toHaveBeenCalledTimes(1);
      expect(prepare).not.toHaveBeenCalled();
    });

    test('Use in Chat asks before replacing unsent Chat text; Keep keeps both', async () => {
      const userId = owner('handoff-keep');
      chatDraftStore.set(userId, 'half-written chat message');
      const onUseInChat = jest.fn();
      const utils = renderVoice(userId, {onUseInChat});
      fireEvent.changeText(
        utils.getByTestId('voice-text-input'),
        'voice words',
      );

      fireEvent.press(utils.getByTestId('voice-use-in-chat'));
      fireEvent.press(await utils.findByTestId('voice-draft-dialog-keep'));
      expect(chatDraftStore.get(userId)).toBe('half-written chat message');
      expect(utils.getByTestId('voice-text-input').props.value).toBe(
        'voice words',
      );
      expect(onUseInChat).not.toHaveBeenCalled();

      fireEvent.press(utils.getByTestId('voice-use-in-chat'));
      fireEvent.press(await utils.findByTestId('voice-draft-dialog-confirm'));
      expect(chatDraftStore.get(userId)).toBe('voice words');
      expect(onUseInChat).toHaveBeenCalledTimes(1);
    });
  });

  describe('VoiceModal lifecycle', () => {
    test('StrictMode double effects keep the draft guard working', async () => {
      const userId = owner('strict');
      speakNext('Add task: strict mode');
      const onClose = jest.fn();
      const utils = render(
        <React.StrictMode>
          <ThemeProvider userId={userId}>
            <VoiceModal visible userId={userId} onClose={onClose} />
          </ThemeProvider>
        </React.StrictMode>,
      );
      await holdAndRelease(utils);
      await waitFor(() =>
        expect(utils.getByTestId('voice-text-input').props.value).toBe(
          'Add task: strict mode',
        ),
      );
      fireEvent.press(utils.getByTestId('voice-modal-close'));
      expect(onClose).not.toHaveBeenCalled();
      fireEvent.press(utils.getByTestId('voice-draft-dialog-confirm'));
      expect(onClose).toHaveBeenCalledWith(false);
    });

    test('going to the background ends a live capture and keeps the draft', async () => {
      const userId = owner('background');
      const handlers: Array<(state: string) => void> = [];
      jest
        .spyOn(AppState, 'addEventListener')
        .mockImplementation((_event, handler) => {
          handlers.push(handler as (state: string) => void);
          return {remove: () => undefined} as ReturnType<
            typeof AppState.addEventListener
          >;
        });
      const control = deferredSpeech();
      const utils = renderVoice(userId);
      fireEvent.changeText(
        utils.getByTestId('voice-text-input'),
        'typed before',
      );
      await act(async () => {
        fireEvent(utils.getByTestId('voice-hold-button'), 'pressIn');
      });
      await waitFor(() => expect(control.captureId).not.toBeNull());

      act(() => handlers.forEach(handler => handler('background')));
      expect(speech.cancelListening).toHaveBeenCalledWith(control.captureId);
      await act(async () => {
        control.resolve('late words');
      });
      expect(utils.getByTestId('voice-text-input').props.value).toBe(
        'typed before',
      );
      expect(utils.queryByTestId('voice-draft-dialog')).toBeNull();
    });
  });

  describe('Chat composer protection', () => {
    test('the composer draft survives leaving Chat and returning (tab switch)', () => {
      const userId = owner('tab');
      const first = renderChat(userId);
      fireEvent.changeText(first.getByTestId('chat-text-input'), 'keep me');
      first.unmount();
      const second = renderChat(userId);
      expect(second.getByTestId('chat-text-input').props.value).toBe('keep me');
      second.unmount();
      const other = renderChat(owner('tab-other'));
      expect(other.getByTestId('chat-text-input').props.value).toBe('');
    });

    test('a Voice handoff appears in an open Chat composer and is not sent', async () => {
      const userId = owner('chat-handoff');
      const prepare = jest.spyOn(chatOrchestrator, 'processMessage');
      const utils = renderChat(userId);
      act(() => chatDraftStore.set(userId, 'from voice'));
      expect(utils.getByTestId('chat-text-input').props.value).toBe(
        'from voice',
      );
      expect(prepare).not.toHaveBeenCalled();
    });

    test('Cancel on a Chat review puts the text back in the composer', async () => {
      const userId = owner('chat-cancel');
      const utils = renderChat(userId);
      fireEvent.changeText(
        utils.getByTestId('chat-text-input'),
        'Add task: buy notebook',
      );
      fireEvent.press(utils.getByTestId('chat-send-button'));
      expect(await utils.findByTestId('chat-review-card')).toBeTruthy();
      expect(utils.getByTestId('chat-text-input').props.value).toBe('');

      fireEvent.press(utils.getByTestId('chat-review-cancel'));
      await waitFor(() =>
        expect(utils.getByTestId('chat-text-input').props.value).toBe(
          'Add task: buy notebook',
        ),
      );
      expect(tasksStore.getAllTasks(userId)).toHaveLength(0);
    });

    test('Android back with a Chat draft asks first and keeps it by default', () => {
      const userId = owner('back');
      type BackListener = Parameters<typeof BackHandler.addEventListener>[1];
      const handlers: BackListener[] = [];
      jest
        .spyOn(BackHandler, 'addEventListener')
        .mockImplementation((_event, handler) => {
          handlers.push(handler);
          return {
            remove: () => {
              const index = handlers.indexOf(handler);
              if (index >= 0) handlers.splice(index, 1);
            },
          };
        });
      const exitApp = jest
        .spyOn(BackHandler, 'exitApp')
        .mockImplementation(() => undefined);
      const utils = renderChat(userId);
      const pressBack = () =>
        handlers[handlers.length - 1]({} as Parameters<BackListener>[0]);

      let handled: boolean | null | undefined;
      act(() => {
        handled = pressBack();
      });
      expect(handled).toBe(false); // Nothing unsent: normal back.

      fireEvent.changeText(utils.getByTestId('chat-text-input'), 'unsent');
      act(() => {
        handled = pressBack();
      });
      expect(handled).toBe(true);
      fireEvent.press(utils.getByTestId('chat-draft-dialog-keep'));
      expect(utils.getByTestId('chat-text-input').props.value).toBe('unsent');
      expect(exitApp).not.toHaveBeenCalled();

      act(() => {
        pressBack();
      });
      fireEvent.press(utils.getByTestId('chat-draft-dialog-confirm'));
      expect(exitApp).toHaveBeenCalledTimes(1);
      expect(chatDraftStore.get(userId)).toBe('');
    });

    test('opening and closing the meeting recorder keeps the composer draft', () => {
      const userId = owner('tool');
      const utils = render(
        <ThemeProvider userId={userId}>
          <MeetingsProvider userId={userId}>
            <ChatScreen userId={userId} />
          </MeetingsProvider>
        </ThemeProvider>,
      );
      fireEvent.changeText(
        utils.getByTestId('chat-text-input'),
        'draft before tool',
      );
      fireEvent.press(utils.getByTestId('chat-meetings-button'));
      expect(utils.getByTestId('chat-text-input').props.value).toBe(
        'draft before tool',
      );
    });
  });

  describe('drafts across accounts', () => {
    test('retainOnly drops every other owner and sign-out drops all', () => {
      chatDraftStore.set('a', 'text a');
      chatDraftStore.set('b', 'text b');
      chatDraftStore.retainOnly('b');
      expect(chatDraftStore.get('a')).toBe('');
      expect(chatDraftStore.get('b')).toBe('text b');
      chatDraftStore.retainOnly(null);
      expect(chatDraftStore.get('b')).toBe('');
    });
  });

  describe('meeting start when the microphone is busy', () => {
    const Probe: React.FC = () => {
      const {startRecording, recorderError, recorder} = useMeetings();
      return (
        <>
          <TouchableOpacity
            testID="probe-start"
            onPress={() => {
              void startRecording({title: 'Lecture'});
            }}
          />
          <Text testID="probe-error">{recorderError?.title ?? ''}</Text>
          <Text testID="probe-status">{recorder?.status ?? 'none'}</Text>
        </>
      );
    };

    test('a voice capture holding the microphone shows a busy error and records nothing', async () => {
      const userId = 'local_guest_user';
      // Jest runs as iOS; present the Android recorder bridge explicitly.
      jest.spyOn(meetingRecorder, 'isAvailable').mockReturnValue(true);
      jest
        .spyOn(meetingRecorder, 'getAvailableStorageMB')
        .mockResolvedValue(2048);
      jest.spyOn(meetingRecorder, 'requestPermission').mockResolvedValue(true);
      const startSpy = jest.spyOn(meetingRecorder, 'start').mockRejectedValue(
        Object.assign(
          new Error('Microphone is currently in use by voice assistant.'),
          {
            code: 'MIC_IN_USE',
          },
        ),
      );
      const before = recordedMeetingStore.list(userId).length;
      const utils = render(
        <ThemeProvider userId={userId}>
          <MeetingsProvider userId={userId}>
            <Probe />
          </MeetingsProvider>
        </ThemeProvider>,
      );
      await act(async () => {
        fireEvent.press(utils.getByTestId('probe-start'));
      });
      await waitFor(() => expect(startSpy).toHaveBeenCalled());
      await waitFor(() =>
        expect(utils.getByTestId('probe-error').props.children).toBe(
          'Microphone is busy',
        ),
      );
      expect(utils.getByTestId('probe-status').props.children).toBe('none');
      expect(recordedMeetingStore.list(userId)).toHaveLength(before);
    });
  });
});
