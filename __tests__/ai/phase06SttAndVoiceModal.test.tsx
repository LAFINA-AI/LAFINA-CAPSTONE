import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { DeviceEventEmitter, NativeModules, PermissionsAndroid } from 'react-native';
import {
  isSTTAvailable,
  ensureMicrophonePermission,
  startListening,
  stopListening,
  cancelListening,
  transcribeUtterance,
  addSpeechListener,
  sttService,
} from '../../src/ai/stt/sttService';
import { VoiceModal } from '../../src/ui/components/VoiceModal';
import { ThemeProvider } from '../../src/ui/contexts/ThemeContext';
import { notesStore } from '../../src/storage/notesStore';
import { tasksStore } from '../../src/storage/tasksStore';
import { userStore } from '../../src/storage/userStore';
import { initDatabase } from '../../src/storage/dbInit';
import { ttsService } from '../../src/ai/tts/ttsService';

describe('Phase 06: Push-to-Talk Offline STT & VoiceModal', () => {
  const mockUserId = 'test-student-voice-user';

  beforeAll(() => {
    initDatabase();
    userStore.createGuestUser();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);
    jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue(
      PermissionsAndroid.RESULTS.GRANTED,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('sttService Core APIs', () => {
    test('isSTTAvailable resolves true when native module is linked and available', async () => {
      const available = await isSTTAvailable();
      expect(available).toBe(true);
      expect(NativeModules.LafinaSpeechToText.isAvailable).toHaveBeenCalled();
    });

    test('ensureMicrophonePermission returns true when permission is granted', async () => {
      jest.spyOn(PermissionsAndroid, 'check').mockResolvedValueOnce(true);
      const hasPermission = await ensureMicrophonePermission();
      expect(hasPermission).toBe(true);
    });

    test('ensureMicrophonePermission requests permission if not initially granted', async () => {
      jest.spyOn(PermissionsAndroid, 'check').mockResolvedValueOnce(false);
      jest
        .spyOn(PermissionsAndroid, 'request')
        .mockResolvedValueOnce(PermissionsAndroid.RESULTS.GRANTED);
      const hasPermission = await ensureMicrophonePermission();
      expect(hasPermission).toBe(true);
      expect(PermissionsAndroid.request).toHaveBeenCalledWith(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        expect.any(Object),
      );
    });

    test('ensureMicrophonePermission returns false when permission is denied', async () => {
      jest.spyOn(PermissionsAndroid, 'check').mockResolvedValueOnce(false);
      jest
        .spyOn(PermissionsAndroid, 'request')
        .mockResolvedValueOnce(PermissionsAndroid.RESULTS.DENIED);
      const hasPermission = await ensureMicrophonePermission();
      expect(hasPermission).toBe(false);
    });

    test('startListening, stopListening, and cancelListening interact properly with native module', async () => {
      const handle = startListening({ mode: 'manual', context: 'main_mic' });
      expect(handle.captureId).toBeDefined();
      expect(NativeModules.LafinaSpeechToText.startListening).toHaveBeenCalledWith(
        expect.objectContaining({
          captureId: handle.captureId,
          mode: 'manual',
          context: 'main_mic',
        }),
      );

      const stopped = await stopListening(handle.captureId);
      expect(stopped).toBe(true);
      expect(NativeModules.LafinaSpeechToText.stopListening).toHaveBeenCalledWith(
        handle.captureId,
      );

      const cancelled = await cancelListening(handle.captureId);
      expect(cancelled).toBe(true);
      expect(NativeModules.LafinaSpeechToText.cancelListening).toHaveBeenCalledWith(
        handle.captureId,
      );
    });

    test('transcribeUtterance captures and awaits transcript result', async () => {
      const result = await transcribeUtterance();
      expect(result.speechDetected).toBe(true);
      expect(result.transcript).toBe('mock transcript');
      expect(result.captureDurationMs).toBeGreaterThan(0);
    });

    test('addSpeechListener correctly registers and cleans up event listeners', () => {
      const onStarted = jest.fn();
      const onPartial = jest.fn();
      const onFinal = jest.fn();

      const unsubscribe = addSpeechListener({
        onStarted,
        onPartialResult: onPartial,
        onFinalResult: onFinal,
      });

      DeviceEventEmitter.emit('onSpeechStarted', { captureId: 'test-cap-1' });
      expect(onStarted).toHaveBeenCalledWith({ captureId: 'test-cap-1' });

      DeviceEventEmitter.emit('onSpeechPartialResult', {
        captureId: 'test-cap-1',
        transcript: 'hello partial',
      });
      expect(onPartial).toHaveBeenCalledWith({
        captureId: 'test-cap-1',
        transcript: 'hello partial',
      });

      DeviceEventEmitter.emit('onSpeechFinalResult', {
        captureId: 'test-cap-1',
        transcript: 'hello final',
      });
      expect(onFinal).toHaveBeenCalledWith({
        captureId: 'test-cap-1',
        transcript: 'hello final',
      });

      unsubscribe();

      DeviceEventEmitter.emit('onSpeechFinalResult', {
        captureId: 'test-cap-1',
        transcript: 'after unsub',
      });
      expect(onFinal).toHaveBeenCalledTimes(1);
    });

    test('sttService object bundles all required methods', () => {
      expect(typeof sttService.isAvailable).toBe('function');
      expect(typeof sttService.ensureMicrophonePermission).toBe('function');
      expect(typeof sttService.startListening).toBe('function');
      expect(typeof sttService.stopListening).toBe('function');
      expect(typeof sttService.cancelListening).toBe('function');
      expect(typeof sttService.transcribeUtterance).toBe('function');
      expect(typeof sttService.addSpeechListener).toBe('function');
    });
  });

  describe('VoiceModal Component UI & Push-to-Talk Interactions', () => {
    test('renders correctly in idle state with instructions and mic button', () => {
      const onClose = jest.fn();
      const { getByText, getByTestId } = render(
        <ThemeProvider userId={mockUserId}>
          <VoiceModal visible={true} userId={mockUserId} onClose={onClose} />
        </ThemeProvider>,
      );

      expect(getByText('LAFINA Voice Assistant')).toBeTruthy();
      expect(getByText('Hold the mic button to talk')).toBeTruthy();
      expect(getByTestId('voice-hold-button')).toBeTruthy();
      expect(getByTestId('voice-text-input')).toBeTruthy();
    });

    test('updates transcript view when partial and final speech events arrive', () => {
      const { getByTestId } = render(
        <ThemeProvider userId={mockUserId}>
          <VoiceModal visible={true} userId={mockUserId} onClose={jest.fn()} />
        </ThemeProvider>,
      );

      act(() => {
        DeviceEventEmitter.emit('onSpeechPartialResult', {
          transcript: 'Schedule physics study',
        });
      });

      expect(getByTestId('voice-transcript').props.children).toEqual([
        '“',
        'Schedule physics study',
        '”',
      ]);
    });

    test('handles fallback text command submission and displays success reply', async () => {
      const onClose = jest.fn();
      const insertSpy = jest.spyOn(notesStore, 'insert').mockImplementation(() => {});

      const { getByTestId, findByTestId } = render(
        <ThemeProvider userId={mockUserId}>
          <VoiceModal visible={true} userId={mockUserId} onClose={onClose} />
        </ThemeProvider>,
      );

      const input = getByTestId('voice-text-input');
      const sendButton = getByTestId('voice-send-button');

      fireEvent.changeText(input, 'Take a note: Review organic chemistry chapter 3');
      fireEvent.press(sendButton);

      const reply = await findByTestId('voice-reply');
      expect(reply).toBeTruthy();
      expect(insertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUserId,
          title: 'Voice Note',
          body: 'Review organic chemistry chapter 3',
          isVoiceTranscribed: true,
        }),
      );

      insertSpy.mockRestore();
    });

    test('handles task creation command via text input fallback', async () => {
      const onClose = jest.fn();
      const insertTaskSpy = jest.spyOn(tasksStore, 'insertTask').mockImplementation(() => {});

      const { getByTestId, findByTestId } = render(
        <ThemeProvider userId={mockUserId}>
          <VoiceModal visible={true} userId={mockUserId} onClose={onClose} />
        </ThemeProvider>,
      );

      const input = getByTestId('voice-text-input');
      fireEvent.changeText(input, 'Add task: Submit engineering capstone proposal');
      fireEvent.press(getByTestId('voice-send-button'));

      const reply = await findByTestId('voice-reply');
      expect(reply).toBeTruthy();
      expect(insertTaskSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUserId,
          title: 'Submit engineering capstone proposal',
          isCompleted: false,
        }),
      );

      insertTaskSpy.mockRestore();
    });

    test('speaks aloud schedule query reply via react-native-tts', async () => {
      const speakSpy = jest.spyOn(ttsService, 'speak');
      const onClose = jest.fn();

      const { getByTestId, findByTestId } = render(
        <ThemeProvider userId={mockUserId}>
          <VoiceModal visible={true} userId={mockUserId} onClose={onClose} />
        </ThemeProvider>,
      );

      const input = getByTestId('voice-text-input');
      fireEvent.changeText(input, "What's on my schedule today?");
      fireEvent.press(getByTestId('voice-send-button'));

      const reply = await findByTestId('voice-reply');
      expect(reply).toBeTruthy();
      expect(speakSpy).toHaveBeenCalled();
      speakSpy.mockRestore();
    });

    test('invokes custom onTranscript and onCommand handlers if supplied', async () => {
      const onTranscript = jest.fn();
      const onCommand = jest.fn().mockReturnValue('Custom handler executed');
      const onClose = jest.fn();

      const { getByTestId, findByText } = render(
        <ThemeProvider userId={mockUserId}>
          <VoiceModal
            visible={true}
            userId={mockUserId}
            onClose={onClose}
            onTranscript={onTranscript}
            onCommand={onCommand}
          />
        </ThemeProvider>,
      );

      const input = getByTestId('voice-text-input');
      fireEvent.changeText(input, 'Testing custom command execution');
      fireEvent.press(getByTestId('voice-send-button'));

      expect(await findByText('Custom handler executed')).toBeTruthy();
      expect(onTranscript).toHaveBeenCalledWith('Testing custom command execution');
      expect(onCommand).toHaveBeenCalledWith('Testing custom command execution', mockUserId);
    });

    test('closes when backdrop or close button is pressed', () => {
      const onClose = jest.fn();
      const { getByTestId } = render(
        <ThemeProvider userId={mockUserId}>
          <VoiceModal visible={true} userId={mockUserId} onClose={onClose} />
        </ThemeProvider>,
      );

      fireEvent.press(getByTestId('voice-modal-close'));
      expect(onClose).toHaveBeenCalledWith(false);

      fireEvent.press(getByTestId('voice-modal-backdrop'));
      expect(onClose).toHaveBeenCalledWith(false);
    });
  });
});
