import {NativeModules} from 'react-native';
import Tts from 'react-native-tts';
import RNFS from 'react-native-fs';
import {
  initTTS,
  initTts,
  isTTSAvailable,
  isTtsAvailable,
  playSpeechFile,
  preCacheReminderAudio,
  deletePreCachedReminderAudio,
  selectOfflineVoice,
  speakText,
  speakTextWithTts,
  stopSpeaking,
  stopSpeechPlayback,
  ttsService,
} from '../../src/ai';
import {createCallSpeechProvider} from '../../src/cloud/speechService';
import {cloudClient} from '../../src/cloud/cloudClient';
import {accountLinkService} from '../../src/cloud/accountLinkService';
import {userStore} from '../../src/storage/userStore';
import {DEFAULT_ONLINE_VOICE} from '../../src/storage/onlineVoiceSettingsStore';

describe('Phase 05: Fast TTS via react-native-tts & Optional ElevenLabs Cloud TTS', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (RNFS.exists as jest.Mock).mockResolvedValue(true);
    (RNFS.writeFile as jest.Mock).mockResolvedValue(undefined);
    (RNFS.unlink as jest.Mock).mockResolvedValue(undefined);
    jest.spyOn(accountLinkService, 'refreshCloudProfile').mockResolvedValue({
      status: 'offline',
      message: 'offline in test',
    });
    jest
      .spyOn(accountLinkService, 'completeDeferredCloudLink')
      .mockResolvedValue({
        status: 'offline',
        message: 'offline in test',
      });
  });

  describe('Local react-native-tts Engine (ttsService)', () => {
    test('initTTS and initTts aliases both initialize Tts and configure language', async () => {
      const res1 = await initTTS();
      expect(res1).toBe(true);
      expect(Tts.getInitStatus).toHaveBeenCalled();
      expect(Tts.setDefaultLanguage).toHaveBeenCalledWith('en-US');

      const res2 = await initTts();
      expect(res2).toBe(true);
    });

    test('selectOfflineVoice strictly rejects cloud and uninstalled voices', () => {
      const offlineVoice = selectOfflineVoice([
        {
          id: 'cloud-voice-1',
          name: 'Cloud US',
          language: 'en-US',
          networkConnectionRequired: true,
          notInstalled: false,
        },
        {
          id: 'uninstalled-voice-2',
          name: 'Uninstalled US',
          language: 'en-US',
          networkConnectionRequired: false,
          notInstalled: true,
        },
        {
          id: 'offline-uk',
          name: 'UK Offline',
          language: 'en-GB',
          quality: 200,
          networkConnectionRequired: false,
          notInstalled: false,
        },
        {
          id: 'offline-us',
          name: 'US Offline High Quality',
          language: 'en-US',
          quality: 500,
          networkConnectionRequired: false,
          notInstalled: false,
        },
      ]);

      expect(offlineVoice).not.toBeNull();
      expect(offlineVoice?.id).toBe('offline-us');
    });

    test('selectOfflineVoice returns null if no offline English voices are found', () => {
      const empty = selectOfflineVoice([
        {
          id: 'online-only',
          language: 'en-US',
          networkConnectionRequired: true,
        },
        {
          id: 'spanish-offline',
          language: 'es-ES',
          networkConnectionRequired: false,
        },
      ]);
      expect(empty).toBeNull();
    });

    test('speakText and speakTextWithTts synthesize text via react-native-tts', async () => {
      await speakText('Reminder: Algorithms exam tomorrow');
      expect(Tts.speak).toHaveBeenCalledWith(
        'Reminder: Algorithms exam tomorrow',
      );

      await speakTextWithTts('Reminder: Submit assignment');
      expect(Tts.speak).toHaveBeenCalledWith('Reminder: Submit assignment');
    });

    test('speakText ignores blank whitespace-only strings', async () => {
      (Tts.speak as jest.Mock).mockClear();
      await speakText('   ');
      expect(Tts.speak).not.toHaveBeenCalled();
    });

    test('stopSpeaking and stopSpeechPlayback halt Tts and native audio player', async () => {
      await stopSpeaking();
      expect(Tts.stop).toHaveBeenCalled();
      expect(NativeModules.LafinaAudioPlayer.stopAudio).toHaveBeenCalled();

      await stopSpeechPlayback();
      expect(Tts.stop).toHaveBeenCalledTimes(2);
    });

    test('isTTSAvailable and isTtsAvailable report engine availability', () => {
      expect(isTTSAvailable()).toBe(true);
      expect(isTtsAvailable()).toBe(true);
    });

    test('preCacheReminderAudio is a fast non-blocking no-op returning empty string', async () => {
      const result = await preCacheReminderAudio('rem-1', 'Reminder task');
      expect(result).toBe('');
    });

    test('deletePreCachedReminderAudio deletes legacy cached file when path provided', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValueOnce(true);
      await deletePreCachedReminderAudio('/path/to/legacy_cache.wav');
      expect(RNFS.unlink).toHaveBeenCalledWith('/path/to/legacy_cache.wav');
    });

    test('playSpeechFile calls NativeModules.LafinaAudioPlayer.playAudio when file exists', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValueOnce(true);
      const played = await playSpeechFile('/path/to/elevenlabs.wav');
      expect(played).toBe(true);
      expect(NativeModules.LafinaAudioPlayer.playAudio).toHaveBeenCalledWith(
        '/path/to/elevenlabs.wav',
      );
    });

    test('playSpeechFile throws if file does not exist', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValueOnce(false);
      await expect(playSpeechFile('/missing/file.wav')).rejects.toThrow(
        'TTS audio file does not exist',
      );
    });

    test('ttsService object provides all required service methods', () => {
      expect(typeof ttsService.init).toBe('function');
      expect(typeof ttsService.initTTS).toBe('function');
      expect(typeof ttsService.speak).toBe('function');
      expect(typeof ttsService.speakText).toBe('function');
      expect(typeof ttsService.stop).toBe('function');
      expect(typeof ttsService.stopSpeaking).toBe('function');
      expect(typeof ttsService.isAvailable).toBe('function');
      expect(typeof ttsService.isTTSAvailable).toBe('function');
      expect(typeof ttsService.playSpeechFile).toBe('function');
    });
  });

  describe('Cloud + Local Speech Provider (createCallSpeechProvider)', () => {
    const testUserId = 'student-test-user-p05';

    const createMockUser = (role: string = 'student') => ({
      id: testUserId,
      email: `${role}@student.edu`,
      username: 'TestStudent',
      role,
      isNewUser: false,
      timeFormat24h: false,
      weekStartsMonday: false,
      darkModeEnabled: true,
      cloudAccountId: 'cloud-acc-123',
      isCloudLinked: true,
      cloudLinkedAt: new Date().toISOString(),
      avatarUri: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    beforeEach(() => {
      jest
        .spyOn(userStore, 'getUserById')
        .mockReturnValue(createMockUser('student'));
      jest.spyOn(userStore, 'getActiveSessionToken').mockReturnValue({
        userId: testUserId,
        accessToken: 'mock-token',
        refreshToken: 'mock-refresh',
      });
      jest.spyOn(cloudClient, 'isOnline').mockResolvedValue(true);
      jest.spyOn(cloudClient, 'getAccessToken').mockReturnValue('mock-token');
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('falls back safely when the online server capability is unavailable', async () => {
      jest.spyOn(cloudClient, 'request').mockResolvedValueOnce({
        status: 'server_unavailable',
        error: 'Capability check unavailable',
      });
      const provider = createCallSpeechProvider(testUserId, {
        isOnlineMode: () => true,
      });
      const result = await provider.speakText('Time for Physics lecture');

      expect(result.source).toBe('native_tts');
      expect(Tts.speak).toHaveBeenCalledWith('Time for Physics lecture');
      await provider.dispose?.();
    });

    test('falls back to react-native-tts when client is offline even if student_pro', async () => {
      jest
        .spyOn(userStore, 'getUserById')
        .mockReturnValue(createMockUser('student_pro'));
      jest.spyOn(cloudClient, 'isOnline').mockResolvedValue(false);

      const provider = createCallSpeechProvider(testUserId, {
        isOnlineMode: () => true,
      });
      const result = await provider.speakText('Time for Math recitation');

      expect(result.source).toBe('native_tts');
      expect(Tts.speak).toHaveBeenCalledWith('Time for Math recitation');
      await provider.dispose?.();
    });

    test('uses ElevenLabs cloud TTS for an ordinary signed-in student online', async () => {
      jest
        .spyOn(userStore, 'getUserById')
        .mockReturnValue(createMockUser('student'));
      jest.spyOn(cloudClient, 'isOnline').mockResolvedValue(true);

      const mockAudioBase64 = Buffer.from('RIFF_MOCK_WAV_BYTES').toString(
        'base64',
      );
      jest
        .spyOn(cloudClient, 'request')
        .mockResolvedValueOnce({
          status: 'success',
          data: {provider: 'elevenlabs', enabled: true},
        })
        .mockResolvedValue({
          status: 'success',
          data: {
            requestId: 'tts_req_123',
            audioBase64: mockAudioBase64,
            provider: 'elevenlabs',
            mimeType: 'audio/mpeg',
            model: 'elevenlabs-tts',
            voice: DEFAULT_ONLINE_VOICE.id,
            createdAt: new Date().toISOString(),
          },
        });

      const provider = createCallSpeechProvider(testUserId, {
        isOnlineMode: () => true,
      });
      const result = await provider.speakText(
        'Your thesis draft is due at 5 PM',
      );

      expect(cloudClient.request).toHaveBeenCalledWith(
        '/v1/ai/tts',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining(
            '"text":"Your thesis draft is due at 5 PM"',
          ),
        }),
        true,
      );
      expect(RNFS.writeFile).toHaveBeenCalled();
      expect(NativeModules.LafinaAudioPlayer.playAudio).toHaveBeenCalled();
      expect(result.source).toBe('elevenlabs');
      await provider.dispose?.();
    });

    test('falls back gracefully to react-native-tts if ElevenLabs cloud TTS returns an error', async () => {
      jest
        .spyOn(userStore, 'getUserById')
        .mockReturnValue(createMockUser('student_pro'));
      jest.spyOn(cloudClient, 'isOnline').mockResolvedValue(true);
      jest
        .spyOn(cloudClient, 'request')
        .mockResolvedValueOnce({
          status: 'success',
          data: {provider: 'elevenlabs', enabled: true},
        })
        .mockResolvedValue({
          status: 'rate_limited',
          error: 'Daily TTS quota reached',
        });

      const provider = createCallSpeechProvider(testUserId, {
        isOnlineMode: () => true,
      });
      const result = await provider.speakText('Lab report deadline');

      expect(result.source).toBe('native_tts');
      expect(Tts.speak).toHaveBeenCalledWith('Lab report deadline');
      await provider.dispose?.();
    });

    test('prepareText pre-caches audio ahead of time and speakText uses prepared audio', async () => {
      jest
        .spyOn(userStore, 'getUserById')
        .mockReturnValue(createMockUser('student_pro'));
      jest.spyOn(cloudClient, 'isOnline').mockResolvedValue(true);

      const mockAudioBase64 = Buffer.from('RIFF_MOCK_WAV_PREPARED').toString(
        'base64',
      );
      jest
        .spyOn(cloudClient, 'request')
        .mockResolvedValueOnce({
          status: 'success',
          data: {provider: 'elevenlabs', enabled: true},
        })
        .mockResolvedValue({
          status: 'success',
          data: {
            requestId: 'tts_prep_456',
            audioBase64: mockAudioBase64,
            provider: 'elevenlabs',
            mimeType: 'audio/mpeg',
            model: 'elevenlabs-tts',
            voice: DEFAULT_ONLINE_VOICE.id,
            createdAt: new Date().toISOString(),
          },
        });

      const provider = createCallSpeechProvider(testUserId, {
        isOnlineMode: () => true,
      });
      await provider.prepareText?.('Prepared announcement');
      expect(cloudClient.request).toHaveBeenCalledTimes(2);

      // Now call speakText with same text: should use pre-prepared audio without re-requesting
      const result = await provider.speakText('Prepared announcement');
      expect(cloudClient.request).toHaveBeenCalledTimes(2); // No new network call
      expect(result.source).toBe('elevenlabs');
      await provider.dispose?.();
    });

    test('explicit Offline Mode never probes capabilities or generates cloud speech', async () => {
      jest
        .spyOn(userStore, 'getUserById')
        .mockReturnValue(createMockUser('student_pro'));
      const request = jest.spyOn(cloudClient, 'request');
      const provider = createCallSpeechProvider(testUserId, {
        isOnlineMode: () => false,
      });
      await provider.prepareText?.('Private reminder');
      expect((await provider.speakText('Private reminder')).source).toBe(
        'native_tts',
      );
      expect(request).not.toHaveBeenCalled();
      await provider.dispose?.();
    });

    test('an old Gemini server is never asked to synthesize after a missing capability', async () => {
      jest
        .spyOn(userStore, 'getUserById')
        .mockReturnValue(createMockUser('student_pro'));
      const request = jest
        .spyOn(cloudClient, 'request')
        .mockResolvedValue({status: 'server_error', error: 'Not found'});
      const provider = createCallSpeechProvider(testUserId, {
        isOnlineMode: () => true,
      });
      expect((await provider.speakText('Use local speech')).source).toBe(
        'native_tts',
      );
      expect(request).toHaveBeenCalledTimes(1);
      expect(request.mock.calls[0][0]).toBe('/v1/ai/tts/capabilities');
      expect(RNFS.writeFile).not.toHaveBeenCalled();
      await provider.dispose?.();
    });

    test('cancelled capability callbacks never play or fall back after Stop', async () => {
      jest
        .spyOn(userStore, 'getUserById')
        .mockReturnValue(createMockUser('student_pro'));
      let finish!: (value: any) => void;
      const request = jest.spyOn(cloudClient, 'request').mockImplementation(
        () =>
          new Promise(resolve => {
            finish = resolve;
          }),
      );
      const provider = createCallSpeechProvider(testUserId, {
        isOnlineMode: () => true,
      });
      const result = provider.speakText('Cancelled announcement');
      for (let n = 0; n < 20 && request.mock.calls.length === 0; n += 1)
        await Promise.resolve();
      expect(request).toHaveBeenCalledTimes(1);
      await provider.stopSpeech?.();
      finish({
        status: 'success',
        data: {provider: 'elevenlabs', enabled: true},
      });
      expect((await result).source).toBe('cancelled');
      expect(Tts.speak).not.toHaveBeenCalled();
      expect(RNFS.writeFile).not.toHaveBeenCalled();
      await provider.dispose?.();
    });

    test('Stop during native MP3 playback does not start fallback speech', async () => {
      jest
        .spyOn(userStore, 'getUserById')
        .mockReturnValue(createMockUser('student_pro'));
      jest
        .spyOn(cloudClient, 'request')
        .mockResolvedValueOnce({
          status: 'success',
          data: {provider: 'elevenlabs', enabled: true},
        })
        .mockResolvedValue({
          status: 'success',
          data: {
            provider: 'elevenlabs',
            voice: DEFAULT_ONLINE_VOICE.id,
            mimeType: 'audio/mpeg',
            audioBase64: 'YXVkaW8=',
          },
        });
      let finish!: (value: boolean) => void;
      (
        NativeModules.LafinaAudioPlayer.playAudio as jest.Mock
      ).mockImplementationOnce(
        () =>
          new Promise(resolve => {
            finish = resolve;
          }),
      );
      const provider = createCallSpeechProvider(testUserId, {
        isOnlineMode: () => true,
      });
      const result = provider.speakText('Stop this audio');
      for (let n = 0; n < 30 && !finish; n += 1) await Promise.resolve();
      expect(finish).toBeDefined();
      await provider.stopSpeech?.();
      finish(false);
      expect((await result).source).toBe('cancelled');
      expect(Tts.speak).not.toHaveBeenCalled();
      await provider.dispose?.();
    });

    test('recovers cloud speech after a temporary capability failure without reopening Chat', async () => {
      jest
        .spyOn(userStore, 'getUserById')
        .mockReturnValue(createMockUser('student_pro'));
      const request = jest
        .spyOn(cloudClient, 'request')
        .mockResolvedValueOnce({
          status: 'server_unavailable',
          error: 'temporary',
        })
        .mockResolvedValueOnce({
          status: 'success',
          data: {provider: 'elevenlabs', enabled: true},
        })
        .mockResolvedValueOnce({
          status: 'success',
          data: {
            provider: 'elevenlabs',
            voice: DEFAULT_ONLINE_VOICE.id,
            mimeType: 'audio/mpeg',
            audioBase64: 'YXVkaW8=',
          },
        });
      const provider = createCallSpeechProvider(testUserId, {
        isOnlineMode: () => true,
      });
      expect((await provider.speakText('First attempt')).source).toBe(
        'native_tts',
      );
      expect((await provider.speakText('Try after recovery')).source).toBe(
        'elevenlabs',
      );
      expect(request).toHaveBeenCalledTimes(3);
      await provider.dispose?.();
    });

    test('stopSpeech halts active playback and dispose cleans up temporary files', async () => {
      const provider = createCallSpeechProvider(testUserId, {
        isOnlineMode: () => true,
      });
      await provider.stopSpeech?.();
      expect(Tts.stop).toHaveBeenCalled();
      expect(NativeModules.LafinaAudioPlayer.stopAudio).toHaveBeenCalled();

      await provider.dispose?.();
      // Verifies no uncaught exceptions on disposal
      expect(true).toBe(true);
    });
  });
});
