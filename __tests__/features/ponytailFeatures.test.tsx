/**
 * Tests for Ponytail features:
 * 1. Exit VoiceModal while Lafina is speaking without discarding the set schedule.
 * 2. ElevenLabs transcription capabilities for Meeting Transcription with Whisper fallback.
 * 3. Remember Me password persistence in userStore and LoginScreen.
 */
import React from 'react';
import {
  fireEvent,
  render,
  waitFor,
} from '@testing-library/react-native';
import {PermissionsAndroid} from 'react-native';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {VoiceModal} from '../../src/ui/components/VoiceModal';
import {LoginScreen} from '../../src/ui/screens/LoginScreen';
import {initDatabase, tasksStore, userStore} from '../../src/storage';
import {endReviewSession} from '../../src/ai/nlu/commandReview';
import {ttsService} from '../../src/ai/tts/ttsService';
import {transcribeMeetingChunks} from '../../src/ai/meeting/meetingTranscriber';
import {meetingRecorder} from '../../src/ai/native/meetingRecorder';
import * as elevenlabsTranscriber from '../../src/cloud/elevenlabsTranscriber';

let serial = 0;
const owner = (label: string): string => {
  serial += 1;
  return `pt-feat-${label}-${serial}`;
};

describe('Ponytail Features Verification', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    endReviewSession();
  });

  describe('Feature 1: Exit VoiceModal while Lafina is speaking without discarding schedule', () => {
    beforeEach(() => {
      jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);
    });

    test('exiting via close button while Lafina speaks after confirm preserves schedule and calls onClose(true)', async () => {
      const userId = owner('speaking-exit');
      const onClose = jest.fn();
      let resolveSpeech: () => void = () => {};
      const speechPromise = new Promise<void>(resolve => {
        resolveSpeech = resolve;
      });

      const stopSpy = jest.spyOn(ttsService, 'stop').mockResolvedValue(undefined as never);
      jest.spyOn(ttsService, 'speak').mockImplementation(() => speechPromise);

      const utils = render(
        <ThemeProvider userId={userId}>
          <VoiceModal visible userId={userId} onClose={onClose} />
        </ThemeProvider>,
      );

      // Input task creation command
      fireEvent.changeText(
        utils.getByTestId('voice-text-input'),
        'Add task: Complete capstone review',
      );
      fireEvent.press(utils.getByTestId('voice-send-button'));

      // Wait for review card
      expect(await utils.findByTestId('voice-review-card')).toBeTruthy();
      expect(tasksStore.getAllTasks(userId)).toHaveLength(0);

      // Confirm proposal
      fireEvent.press(utils.getByTestId('voice-review-confirm'));

      // Task is applied and Lafina begins speaking
      await waitFor(() => {
        expect(tasksStore.getAllTasks(userId)).toHaveLength(1);
      });

      // While Lafina is speaking, user presses close button
      fireEvent.press(utils.getByTestId('voice-modal-close'));

      // Speech must be stopped immediately
      expect(stopSpy).toHaveBeenCalled();

      // onClose must be called with true (schedule updated)
      expect(onClose).toHaveBeenCalledWith(true);

      // Schedule remains intact in database (not discarded)
      const tasks = tasksStore.getAllTasks(userId);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe('Complete capstone review');

      // Cleanup remaining speech promise
      resolveSpeech();
    });
  });

  describe('Feature 2: ElevenLabs Meeting Transcription with Fallback', () => {
    test('transcribes meeting chunks using ElevenLabs Scribe STT when available', async () => {
      jest.spyOn(meetingRecorder, 'deleteAudioFile').mockResolvedValue(true);
      const elevenlabsSpy = jest
        .spyOn(elevenlabsTranscriber, 'transcribeChunkWithElevenLabs')
        .mockResolvedValue([
          {start_ms: 0, end_ms: 2500, text: 'ElevenLabs transcribed lecture segment.'},
        ]);
      const localWhisperSpy = jest.spyOn(meetingRecorder, 'transcribeChunk');

      const progress = await transcribeMeetingChunks({
        meetingId: 'meet-11labs',
        chunkFiles: ['/tmp/meet_chunk_000.wav'],
        chunkDurationsMs: [30000],
        userId: 'student-pro-1',
        useElevenLabs: true,
      });

      expect(elevenlabsSpy).toHaveBeenCalledTimes(1);
      expect(elevenlabsSpy).toHaveBeenCalledWith(
        '/tmp/meet_chunk_000.wav',
        0,
        'student-pro-1',
      );
      expect(localWhisperSpy).not.toHaveBeenCalled();
      expect(progress.segments).toEqual([
        {start_ms: 0, end_ms: 2500, text: 'ElevenLabs transcribed lecture segment.'},
      ]);
      expect(progress.fullTranscript).toBe('ElevenLabs transcribed lecture segment.');
    });

    test('gracefully falls back to local Whisper when ElevenLabs transcription fails or is offline', async () => {
      jest.spyOn(meetingRecorder, 'deleteAudioFile').mockResolvedValue(true);
      jest
        .spyOn(elevenlabsTranscriber, 'transcribeChunkWithElevenLabs')
        .mockResolvedValue(null); // Simulated failure / offline
      const localWhisperSpy = jest
        .spyOn(meetingRecorder, 'transcribeChunk')
        .mockResolvedValue([
          {start_ms: 100, end_ms: 3000, text: 'Whisper local fallback segment.'},
        ]);

      const progress = await transcribeMeetingChunks({
        meetingId: 'meet-fallback',
        chunkFiles: ['/tmp/meet_chunk_001.wav'],
        chunkDurationsMs: [30000],
        userId: 'student-pro-1',
        useElevenLabs: true,
      });

      expect(localWhisperSpy).toHaveBeenCalledTimes(1);
      expect(progress.segments).toEqual([
        {start_ms: 100, end_ms: 3000, text: 'Whisper local fallback segment.'},
      ]);
      expect(progress.fullTranscript).toBe('Whisper local fallback segment.');
    });
  });

  describe('Feature 3: Remember Me Password Persistence', () => {
    test('userStore saves and retrieves password when remember_me is enabled', () => {
      userStore.setRememberMe(true, 'student@ustp.edu.ph', 'superSecretPass123!');
      const remembered = userStore.getRememberMe();

      expect(remembered.enabled).toBe(true);
      expect(remembered.email).toBe('student@ustp.edu.ph');
      expect(remembered.password).toBe('superSecretPass123!');

      // Disabling remember_me clears stored password
      userStore.setRememberMe(false);
      const disabled = userStore.getRememberMe();
      expect(disabled.enabled).toBe(false);
      expect(disabled.password).toBeNull();
    });

    test('LoginScreen restores both email and password when rememberMe is active', async () => {
      userStore.setRememberMe(true, 'student@ustp.edu.ph', 'mySavedPassword');

      const onLoginSuccess = jest.fn();
      const onNavigateToRegister = jest.fn();

      const utils = render(
        <ThemeProvider userId={null}>
          <LoginScreen
            onLoginSuccess={onLoginSuccess}
            onNavigateToRegister={onNavigateToRegister}
          />
        </ThemeProvider>,
      );

      // Verify email input has the remembered email
      const emailInput = utils.getByPlaceholderText('student@ustp.edu.ph');
      expect(emailInput.props.value).toBe('student@ustp.edu.ph');

      // Verify password input has the remembered password
      const passwordInput = utils.getByPlaceholderText('••••••••');
      expect(passwordInput.props.value).toBe('mySavedPassword');
    });
  });
});
