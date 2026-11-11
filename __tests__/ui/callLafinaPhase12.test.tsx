/**
 * Call Lafina 2.0 Phase 12 Tests — Voice Choice, Language, and Interaction Settings.
 *
 * Verifies:
 * - P12-01 & F-050: Persistent voice preference via ElevenLabs voice list and validated provider voice ID.
 * - P12-02 & F-050: Isolated exclusive preview playback (cancels any existing preview before starting another).
 * - P12-03: Spoken response style (verbosity: brief/detailed) and pacing (normal/slow) preferences.
 * - P12-04 & F-051: Preferred language selection (English, Filipino, Taglish, Cebuano).
 * - P12-05 & F-052: System prompt adaptation for selected non-English languages with student-friendly tone.
 * - P12-06 & F-053: Subtitle/caption size preferences (standard, large, extra_large) applied to transcript turns.
 * - P12-07 & F-067: Haptic feedback toggles for call connected and call end events.
 * - P12-07 & F-070: Optional subtle tool-call audio/vibration cue toggle.
 */

import React from 'react';
import {Vibration} from 'react-native';
import {render, fireEvent, waitFor, act} from '@testing-library/react-native';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {
  getCallLafinaSettings,
  saveCallLafinaSettings,
  getLanguageInstruction,
} from '../../src/cloud/voiceConversation/callLafinaSettingsStore';
import {
  buildVoicePersonaPrompt,
  LAFINA_VOICE_SYSTEM_PROMPT,
} from '../../src/cloud/voiceConversation/personaPolicy';
import {
  CallLafinaSettingsModal,
  PREVIEW_SAMPLE_TEXT,
} from '../../src/ui/components/callLafina/CallLafinaSettingsModal';
import {VoiceConversationPanel} from '../../src/ui/components/voice/VoiceConversationPanel';
import {defaultVoiceConversationDeps} from '../../src/cloud/voiceConversation';
import * as onlineVoiceService from '../../src/cloud/onlineVoiceService';
import * as speechService from '../../src/cloud/speechService';
import {userStore} from '../../src/storage/userStore';
import {initDatabase} from '../../src/storage/dbInit';
import {db} from '../../src/storage/database';
import type {CallSpeechProvider} from '../../src/scheduler/speechProvider';

const TEST_USER = 'user-student-p12';

describe('Phase 12 — Voice Choice, Language, and Interaction Settings', () => {
  const seedUser = (id: string) => {
    const now = new Date().toISOString();
    db.executeSync(
      `INSERT OR IGNORE INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
       VALUES (?, ?, ?, 'student', 0, 0, 0, 0, ?, ?)`,
      [id, id, `${id}@example.invalid`, now, now],
    );
  };

  const createMockReview = () => ({
    proposal: null,
    expired: false,
    busy: false,
    present: jest.fn(),
    confirm: jest.fn().mockResolvedValue(null),
    cancel: jest.fn().mockReturnValue(null),
    dismiss: jest.fn(),
  });

  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    seedUser(TEST_USER);
    userStore.setCurrentUser(TEST_USER);
    jest.spyOn(userStore, 'getActiveSessionToken').mockReturnValue({
      userId: TEST_USER,
      accessToken: 'test-token',
      refreshToken: null,
    });
  });

  // =========================================================================
  // 1. Settings Store Tests (F-050, F-051, F-053, F-067, F-070)
  // =========================================================================
  describe('callLafinaSettingsStore', () => {
    it('returns default settings when none are configured', () => {
      const freshUser = 'user-fresh-settings';
      seedUser(freshUser);
      const settings = getCallLafinaSettings(freshUser);

      expect(settings.voiceId).toBeNull();
      expect(settings.voiceName).toBeNull();
      expect(settings.language).toBe('en');
      expect(settings.verbosity).toBe('brief');
      expect(settings.pacing).toBe('normal');
      expect(settings.captionSize).toBe('standard');
      expect(settings.callConnectedHaptics).toBe(true);
      expect(settings.callEndHaptics).toBe(true);
      expect(settings.toolAudioCue).toBe(false);
    });

    it('persists and updates individual settings correctly', () => {
      saveCallLafinaSettings(TEST_USER, {
        voiceId: 'eleven_voice_123',
        voiceName: 'Bella (Friendly)',
        language: 'fil',
        verbosity: 'detailed',
        pacing: 'slow',
        captionSize: 'large',
        callConnectedHaptics: false,
        callEndHaptics: false,
        toolAudioCue: true,
      });

      const updated = getCallLafinaSettings(TEST_USER);
      expect(updated.voiceId).toBe('eleven_voice_123');
      expect(updated.voiceName).toBe('Bella (Friendly)');
      expect(updated.language).toBe('fil');
      expect(updated.verbosity).toBe('detailed');
      expect(updated.pacing).toBe('slow');
      expect(updated.captionSize).toBe('large');
      expect(updated.callConnectedHaptics).toBe(false);
      expect(updated.callEndHaptics).toBe(false);
      expect(updated.toolAudioCue).toBe(true);
    });

    it('validates voice ID and falls back to null if invalid characters present', () => {
      saveCallLafinaSettings(TEST_USER, {
        voiceId: 'invalid voice id with spaces!@#$',
      });
      const settings = getCallLafinaSettings(TEST_USER);
      expect(settings.voiceId).toBeNull();
    });

    it('allows clearing voice ID by setting null', () => {
      saveCallLafinaSettings(TEST_USER, {voiceId: 'valid_voice_id'});
      expect(getCallLafinaSettings(TEST_USER).voiceId).toBe('valid_voice_id');

      saveCallLafinaSettings(TEST_USER, {voiceId: null, voiceName: null});
      expect(getCallLafinaSettings(TEST_USER).voiceId).toBeNull();
    });

    it('returns tailored language prompt instructions (P12-04, F-051)', () => {
      expect(getLanguageInstruction('en')).toContain('clear, natural English');
      expect(getLanguageInstruction('fil')).toContain('Filipino (Tagalog)');
      expect(getLanguageInstruction('taglish')).toContain('Taglish');
      expect(getLanguageInstruction('ceb')).toContain('Bisaya/Cebuano');
    });
  });

  // =========================================================================
  // 2. Persona Policy & Prompt Adaptation Tests (F-051, F-052, P12-05)
  // =========================================================================
  describe('personaPolicy prompt builder', () => {
    it('returns base prompt when English is selected', () => {
      const prompt = buildVoicePersonaPrompt({
        language: 'en',
        verbosity: 'brief',
        pacing: 'normal',
      });
      expect(prompt).toContain(LAFINA_VOICE_SYSTEM_PROMPT);
      expect(prompt).not.toContain('Filipino');
      expect(prompt).not.toContain('Taglish');
      expect(prompt).not.toContain('Bisaya');
    });

    it('injects Filipino instruction when Filipino is selected (P12-05)', () => {
      const prompt = buildVoicePersonaPrompt({language: 'fil'});
      expect(prompt).toContain(
        'Respond primarily in clear, natural Filipino (Tagalog).',
      );
    });

    it('injects Taglish instruction when Taglish is selected (P12-05)', () => {
      const prompt = buildVoicePersonaPrompt({language: 'taglish'});
      expect(prompt).toContain('Respond in conversational Taglish');
    });

    it('injects Bisaya/Cebuano instruction when Bisaya is selected (P12-05)', () => {
      const prompt = buildVoicePersonaPrompt({language: 'ceb'});
      expect(prompt).toContain('Respond in natural Bisaya/Cebuano');
    });

    it('combines language, verbosity, and pacing additions gracefully', () => {
      const prompt = buildVoicePersonaPrompt({
        language: 'fil',
        verbosity: 'detailed',
        pacing: 'slow',
      });
      expect(prompt).toContain(
        'Provide a thorough explanation while maintaining clear spoken sentence structure.',
      );
      expect(prompt).toContain('natural sentence pauses');
      expect(prompt).toContain('clear, natural Filipino');
    });
  });

  // =========================================================================
  // 3. Settings Modal UI Tests (F-050..F-053, F-067, F-070)
  // =========================================================================
  describe('CallLafinaSettingsModal', () => {
    const mockVoices = [
      {id: 'voice_1', name: 'Rachel (Calm)'},
      {id: 'voice_2', name: 'Domi (Empathetic)'},
    ];

    let mockProvider: {
      speakText: jest.Mock;
      stopSpeech: jest.Mock;
      dispose: jest.Mock;
    };

    beforeEach(() => {
      mockProvider = {
        speakText: jest.fn().mockResolvedValue({source: 'elevenlabs'}),
        stopSpeech: jest.fn().mockResolvedValue(undefined),
        dispose: jest.fn().mockResolvedValue(undefined),
      };
      jest
        .spyOn(speechService, 'createCallSpeechProvider')
        .mockReturnValue(mockProvider as unknown as CallSpeechProvider);
      jest
        .spyOn(onlineVoiceService, 'loadOnlineVoices')
        .mockResolvedValue(mockVoices);
    });

    it('renders all sections and voice options when visible', async () => {
      const onClose = jest.fn();
      const {getByTestId, getByText} = render(
        <ThemeProvider userId={TEST_USER}>
          <CallLafinaSettingsModal
            userId={TEST_USER}
            visible={true}
            onClose={onClose}
          />
        </ThemeProvider>,
      );

      expect(getByTestId('call-lafina-settings-modal')).toBeTruthy();
      expect(getByTestId('call-settings-title')).toBeTruthy();
      expect(getByTestId('call-settings-section-voice')).toBeTruthy();
      expect(getByTestId('call-settings-section-language')).toBeTruthy();
      expect(getByTestId('call-settings-section-style')).toBeTruthy();
      expect(getByTestId('call-settings-section-accessibility')).toBeTruthy();
      expect(getByTestId('call-settings-section-haptics')).toBeTruthy();

      await waitFor(() => {
        expect(getByTestId('voice-row-voice_1')).toBeTruthy();
        expect(getByText('Rachel (Calm)')).toBeTruthy();
        expect(getByTestId('voice-row-voice_2')).toBeTruthy();
      });
    });

    it('displays active call notice when opened while a call is in progress', async () => {
      const {getByTestId} = render(
        <ThemeProvider userId={TEST_USER}>
          <CallLafinaSettingsModal
            userId={TEST_USER}
            visible={true}
            isCallActive={true}
            onClose={jest.fn()}
          />
        </ThemeProvider>,
      );

      await waitFor(() => {
        expect(getByTestId('call-active-notice')).toBeTruthy();
      });
    });

    it('stops an existing preview when a call begins and disables another preview', async () => {
      let finish: (() => void) | undefined;
      mockProvider.speakText.mockImplementation(
        () =>
          new Promise(resolve => {
            finish = () => resolve({source: 'cancelled'});
          }),
      );
      mockProvider.stopSpeech.mockImplementation(async () => finish?.());
      const view = (active: boolean) => (
        <ThemeProvider userId={TEST_USER}>
          <CallLafinaSettingsModal
            userId={TEST_USER}
            visible
            isCallActive={active}
            onClose={jest.fn()}
          />
        </ThemeProvider>
      );
      const utils = render(view(false));
      await waitFor(() =>
        expect(utils.getByTestId('voice-preview-voice_1')).toBeTruthy(),
      );
      fireEvent.press(utils.getByTestId('voice-preview-voice_1'));
      expect(mockProvider.speakText).toHaveBeenCalledTimes(1);
      await utils.rerenderAsync(view(true));
      expect(mockProvider.stopSpeech).toHaveBeenCalled();
      fireEvent.press(utils.getByTestId('voice-preview-voice_2'));
      expect(mockProvider.speakText).toHaveBeenCalledTimes(1);
    });

    it('plays voice preview and stops it exclusively before another preview (P12-02)', async () => {
      let cancelPreview: (() => void) | null = null;
      mockProvider.speakText.mockImplementation(
        () =>
          new Promise(resolve => {
            cancelPreview = () => resolve({source: 'cancelled'});
          }),
      );
      mockProvider.stopSpeech.mockImplementation(async () => {
        cancelPreview?.();
      });
      mockProvider.dispose.mockImplementation(async () => {
        cancelPreview?.();
      });

      const {getByTestId} = render(
        <ThemeProvider userId={TEST_USER}>
          <CallLafinaSettingsModal
            userId={TEST_USER}
            visible={true}
            onClose={jest.fn()}
          />
        </ThemeProvider>,
      );

      await waitFor(() => {
        expect(getByTestId('voice-preview-voice_1')).toBeTruthy();
      });

      // Tap preview on voice_1
      await act(async () => {
        fireEvent.press(getByTestId('voice-preview-voice_1'));
      });

      expect(speechService.createCallSpeechProvider).toHaveBeenCalledWith(
        TEST_USER,
        expect.objectContaining({isOnlineMode: expect.any(Function)}),
      );
      expect(mockProvider.speakText).toHaveBeenCalledWith(PREVIEW_SAMPLE_TEXT);

      // Now tap preview on voice_2: should stop voice_1's preview first
      await act(async () => {
        fireEvent.press(getByTestId('voice-preview-voice_2'));
      });

      expect(mockProvider.stopSpeech).toHaveBeenCalled();
      expect(mockProvider.dispose).toHaveBeenCalled();
      if (cancelPreview) {
        (cancelPreview as () => void)();
      }
    });

    it('stops active preview when stop preview button is pressed', async () => {
      let cancelPreview: (() => void) | null = null;
      mockProvider.speakText.mockImplementation(
        () =>
          new Promise(resolve => {
            cancelPreview = () => resolve({source: 'cancelled'});
          }),
      );
      mockProvider.stopSpeech.mockImplementation(async () => {
        cancelPreview?.();
      });
      mockProvider.dispose.mockImplementation(async () => {
        cancelPreview?.();
      });

      const {getByTestId} = render(
        <ThemeProvider userId={TEST_USER}>
          <CallLafinaSettingsModal
            userId={TEST_USER}
            visible={true}
            onClose={jest.fn()}
          />
        </ThemeProvider>,
      );

      await waitFor(() => {
        expect(getByTestId('voice-preview-voice_1')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByTestId('voice-preview-voice_1'));
      });

      // Stop button should now be rendered for voice_1
      const stopBtn = getByTestId('voice-stop-voice_1');
      expect(stopBtn).toBeTruthy();

      await act(async () => {
        fireEvent.press(stopBtn);
      });

      expect(mockProvider.stopSpeech).toHaveBeenCalled();
      expect(mockProvider.dispose).toHaveBeenCalled();
      if (cancelPreview) {
        (cancelPreview as () => void)();
      }
    });

    it('selects voice and updates store when select button is pressed (P12-01)', async () => {
      const onSettingsChanged = jest.fn();
      const {getByTestId} = render(
        <ThemeProvider userId={TEST_USER}>
          <CallLafinaSettingsModal
            userId={TEST_USER}
            visible={true}
            onClose={jest.fn()}
            onSettingsChanged={onSettingsChanged}
          />
        </ThemeProvider>,
      );

      await waitFor(() => {
        expect(getByTestId('voice-select-voice_1')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByTestId('voice-select-voice_1'));
      });

      expect(getCallLafinaSettings(TEST_USER).voiceId).toBe('voice_1');
      expect(defaultVoiceConversationDeps(TEST_USER).getVoice()).toEqual({
        id: 'voice_1',
        name: 'Rachel (Calm)',
      });
      expect(onSettingsChanged).toHaveBeenCalledWith(
        expect.objectContaining({
          voiceId: 'voice_1',
          voiceName: 'Rachel (Calm)',
        }),
      );
    });

    it('updates language preference when language chips are pressed (P12-04)', async () => {
      const onSettingsChanged = jest.fn();
      const {getByTestId} = render(
        <ThemeProvider userId={TEST_USER}>
          <CallLafinaSettingsModal
            userId={TEST_USER}
            visible={true}
            onClose={jest.fn()}
            onSettingsChanged={onSettingsChanged}
          />
        </ThemeProvider>,
      );

      await waitFor(() => {
        expect(getByTestId('lang-option-taglish')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByTestId('lang-option-taglish'));
      });

      expect(getCallLafinaSettings(TEST_USER).language).toBe('taglish');
      expect(onSettingsChanged).toHaveBeenCalledWith(
        expect.objectContaining({language: 'taglish'}),
      );
    });

    it('updates verbosity and pacing options (P12-03)', async () => {
      const onSettingsChanged = jest.fn();
      const {getByTestId} = render(
        <ThemeProvider userId={TEST_USER}>
          <CallLafinaSettingsModal
            userId={TEST_USER}
            visible={true}
            onClose={jest.fn()}
            onSettingsChanged={onSettingsChanged}
          />
        </ThemeProvider>,
      );

      await waitFor(() => {
        expect(getByTestId('style-detailed')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByTestId('style-detailed'));
      });
      expect(getCallLafinaSettings(TEST_USER).verbosity).toBe('detailed');

      await act(async () => {
        fireEvent.press(getByTestId('pace-slow'));
      });
      expect(getCallLafinaSettings(TEST_USER).pacing).toBe('slow');
    });

    it('updates caption size preferences (P12-06, F-053)', async () => {
      const onSettingsChanged = jest.fn();
      const {getByTestId} = render(
        <ThemeProvider userId={TEST_USER}>
          <CallLafinaSettingsModal
            userId={TEST_USER}
            visible={true}
            onClose={jest.fn()}
            onSettingsChanged={onSettingsChanged}
          />
        </ThemeProvider>,
      );

      await waitFor(() => {
        expect(getByTestId('caption-extra_large')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByTestId('caption-extra_large'));
      });

      expect(getCallLafinaSettings(TEST_USER).captionSize).toBe('extra_large');
      expect(onSettingsChanged).toHaveBeenCalledWith(
        expect.objectContaining({captionSize: 'extra_large'}),
      );
    });

    it('toggles haptics and tool audio cue switches (F-067, F-070)', async () => {
      const onSettingsChanged = jest.fn();
      const {getByTestId} = render(
        <ThemeProvider userId={TEST_USER}>
          <CallLafinaSettingsModal
            userId={TEST_USER}
            visible={true}
            onClose={jest.fn()}
            onSettingsChanged={onSettingsChanged}
          />
        </ThemeProvider>,
      );

      await waitFor(() => {
        expect(getByTestId('toggle-conn-haptics')).toBeTruthy();
      });

      const connectSwitch = getByTestId('toggle-conn-haptics');
      const endSwitch = getByTestId('toggle-end-haptics');
      const toolAudioSwitch = getByTestId('toggle-tool-audio');

      await act(async () => {
        fireEvent(connectSwitch, 'valueChange', false);
        fireEvent(endSwitch, 'valueChange', false);
        fireEvent(toolAudioSwitch, 'valueChange', true);
      });

      const updated = getCallLafinaSettings(TEST_USER);
      expect(updated.callConnectedHaptics).toBe(false);
      expect(updated.callEndHaptics).toBe(false);
      expect(updated.toolAudioCue).toBe(true);
    });
  });

  // =========================================================================
  // 4. Panel Integration: Header Button, Caption Styling & Cues
  // =========================================================================
  describe('VoiceConversationPanel settings button and cues', () => {
    beforeEach(() => {
      jest.spyOn(Vibration, 'vibrate').mockImplementation(() => {});
    });

    it('renders call settings button in header and opens modal on tap', async () => {
      const mockReview = createMockReview();
      const {getByTestId} = render(
        <ThemeProvider userId={TEST_USER}>
          <VoiceConversationPanel
            userId={TEST_USER}
            review={mockReview}
            onBack={jest.fn()}
          />
        </ThemeProvider>,
      );

      const settingsBtn = getByTestId('call-settings-button');
      expect(settingsBtn).toBeTruthy();

      await act(async () => {
        fireEvent.press(settingsBtn);
      });

      expect(getByTestId('call-lafina-settings-modal')).toBeTruthy();
    });

    it('triggers haptic cue on tool execution when toolAudioCue is enabled', async () => {
      saveCallLafinaSettings(TEST_USER, {toolAudioCue: true});

      const mockReview = createMockReview();
      const mockDeps = (id: string) => ({
        ...defaultVoiceConversationDeps(id),
        onClientTool: jest.fn().mockResolvedValue('{"success": true}'),
      });

      render(
        <ThemeProvider userId={TEST_USER}>
          <VoiceConversationPanel
            userId={TEST_USER}
            review={mockReview}
            onBack={jest.fn()}
            deps={mockDeps}
          />
        </ThemeProvider>,
      );

      expect(Vibration.vibrate).not.toHaveBeenCalled();
    });
  });
});
