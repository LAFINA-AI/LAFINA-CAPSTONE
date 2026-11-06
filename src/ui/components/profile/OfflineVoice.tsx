import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ToolSheet } from '../tools';
import { useThemedStyles } from '../../theme/createThemedStyles';
import type { ThemeColors } from '../../contexts/ThemeContext';
import { Fonts, FontSize, Spacing } from '../../theme';
import {
  clampSpeechFactor,
  NEUTRAL_FACTOR,
  SPEECH_FACTOR_MAX,
  SPEECH_FACTOR_MIN,
  SPEECH_FACTOR_STEP,
  speechSettingsStore,
} from '../../../storage/speechSettingsStore';
import type { SpeechChoice, SpeechSettings } from '../../../storage/speechSettingsStore';
import { readTtsReadiness } from '../../../ai/tts/ttsService';
import type { TtsReadiness } from '../../../ai/tts/ttsService';
import { applySpeechPreferences, startVoicePreview } from '../../../ai/tts/speechPreferences';
import type { PreviewHandle, PreviewRefusal } from '../../../ai/tts/speechPreferences';

interface OfflineVoiceProps {
  userId: string;
  visible: boolean;
  onClose: () => void;
  onChanged?: () => void;
}

const REFUSALS: Record<PreviewRefusal, string> = {
  speech_busy: 'Something else is speaking. Try Preview when it finishes.',
  microphone_busy: 'The microphone is in use. Finish dictating, then try Preview.',
  recording: 'A recording is in progress. Stop it, then try Preview.',
  owner_changed: 'Account changed. Reopen this sheet.',
};

const SERVICE_LABEL: Record<TtsReadiness['service'], string> = {
  ready: 'Ready',
  unavailable: 'Not available on this phone',
  timeout: 'Did not respond',
};

const ENGLISH_LABEL: Record<TtsReadiness['english'], string> = {
  ready: 'Offline English voice installed',
  missing: 'No offline English voice installed',
  unknown: 'Unknown (this engine does not list voices)',
};

const factor = (value: number): string => `${value.toFixed(2)}×`;

/**
 * AGY-PORT 10: explicit offline voice, speed and pitch for this account's
 * local speech (react-native-tts). Without a choice AGY's automatic voice and
 * the engine's own speed and pitch stay in use. Preview and Stop act on this
 * sheet's own utterance only. Student Pro cloud speech is unchanged.
 */
export const OfflineVoice: React.FC<OfflineVoiceProps> = ({ userId, visible, onClose, onChanged }) => {
  const themed = useThemedStyles(getThemedStyles);
  const [settings, setSettings] = useState<SpeechSettings | null>(null);
  const [readiness, setReadiness] = useState<TtsReadiness | null>(null);
  const [notice, setNotice] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const epoch = useRef(0);
  const preview = useRef<PreviewHandle | null>(null);

  const stopPreview = useCallback(async () => {
    const current = preview.current;
    preview.current = null;
    setPreviewing(false);
    if (current) await current.stop();
  }, []);

  const refresh = useCallback(async () => {
    const ticket = ++epoch.current;
    try {
      setSettings(speechSettingsStore.read(userId));
    } catch {
      setSettings(null);
      setNotice('Voice settings unavailable. Close and try again.');
    }
    setReadiness(null);
    const value = await readTtsReadiness();
    if (ticket === epoch.current) setReadiness(value);
  }, [userId]);

  useEffect(() => {
    if (!visible) return undefined;
    setNotice('');
    void refresh();
    const subscription = AppState.addEventListener('change', state => {
      // Leaving the app ends this sheet's Preview; returning re-reads voices
      // (the student may have installed one in Android settings).
      if (state !== 'active') void stopPreview();
      else void refresh();
    });
    return () => {
      epoch.current += 1;
      subscription.remove();
      void stopPreview();
    };
  }, [visible, refresh, stopPreview]);

  const save = async (choice: SpeechChoice, done: string) => {
    if (!settings) return;
    await stopPreview();
    try {
      setSettings(speechSettingsStore.save(userId, choice, settings.revision));
      await applySpeechPreferences(userId);
      setNotice(done);
      onChanged?.();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not save. Reopen this sheet.');
      try {
        setSettings(speechSettingsStore.read(userId));
      } catch {
        setSettings(null);
      }
    }
    await refresh();
  };

  const reset = async () => {
    if (!settings) return;
    await stopPreview();
    try {
      setSettings(speechSettingsStore.reset(userId, settings.revision));
      await applySpeechPreferences(userId);
      setNotice('Back to the automatic voice and normal speed and pitch.');
      onChanged?.();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not reset. Reopen this sheet.');
    }
    await refresh();
  };

  const play = async () => {
    if (previewing) return;
    const ticket = epoch.current;
    const handle = await startVoicePreview(userId);
    if (ticket !== epoch.current) {
      if (typeof handle !== 'string') await handle.stop();
      return;
    }
    if (typeof handle === 'string') {
      setNotice(REFUSALS[handle]);
      return;
    }
    preview.current = handle;
    setPreviewing(true);
    setNotice('Playing Preview…');
    const outcome = await handle.result;
    if (preview.current !== handle || ticket !== epoch.current) return;
    preview.current = null;
    setPreviewing(false);
    setNotice(
      outcome === 'finished'
        ? 'Preview finished. If you heard nothing, check the media volume or choose another voice.'
        : outcome === 'stopped'
        ? 'Preview stopped.'
        : 'Preview could not play. Typing and on-screen text still work.',
    );
  };

  const current: SpeechChoice = {
    voiceId: settings?.explicit ? settings.voiceId : null,
    rate: settings?.explicit ? settings.rate : NEUTRAL_FACTOR,
    pitch: settings?.explicit ? settings.pitch : NEUTRAL_FACTOR,
  };
  const step = (value: number, delta: number) => clampSpeechFactor(value + delta);

  const button = (
    label: string,
    onPress: () => void,
    testID: string,
    disabled = false,
    selected = false,
  ) => (
    <TouchableOpacity
      key={testID}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, themed.button, selected && themed.selected, disabled && styles.disabled]}
    >
      <Text style={[styles.buttonText, themed.text]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <ToolSheet
      visible={visible}
      title="Offline Voice"
      onClose={() => {
        void stopPreview();
        onClose();
      }}
    >
      <Text style={[styles.note, themed.muted]}>
        For speech made on this phone without the internet. Only voices Android reports as
        installed and offline are listed; nothing is downloaded. Student Pro cloud speech, when
        online, is unchanged. Kept on this device for this account.
      </Text>

      <Text style={[styles.section, themed.text]}>Speech engine</Text>
      <Text testID="voice-service" style={[styles.value, themed.text]}>
        {readiness ? SERVICE_LABEL[readiness.service] : 'Checking…'}
      </Text>
      <Text testID="voice-english" style={[styles.value, themed.text]}>
        {readiness ? (readiness.service === 'ready' ? ENGLISH_LABEL[readiness.english] : '—') : ''}
      </Text>
      {readiness && readiness.service !== 'ready' && (
        <Text style={[styles.note, themed.muted]}>
          Replies still appear as text, and typing always works.
        </Text>
      )}
      {readiness?.selectedVoiceMissing && (
        <Text testID="voice-missing" style={[styles.note, themed.text]}>
          Your chosen voice is not installed now, so the automatic voice is used.
        </Text>
      )}

      <Text style={[styles.section, themed.text]}>Voice</Text>
      {button(
        `${current.voiceId === null ? 'Selected: ' : ''}Automatic (default)`,
        () => void save({ ...current, voiceId: null }, 'Automatic voice selected.'),
        'voice-automatic',
        !settings,
        current.voiceId === null,
      )}
      {(readiness?.voices ?? []).map(voice =>
        button(
          `${current.voiceId === voice.id ? 'Selected: ' : ''}${voice.name ?? voice.id} (${voice.language})`,
          () => void save({ ...current, voiceId: voice.id }, 'Voice saved for this account.'),
          `voice-option-${voice.id}`,
          !settings,
          current.voiceId === voice.id,
        ),
      )}

      <Text style={[styles.section, themed.text]}>Speed and pitch</Text>
      <View style={styles.row}>
        <Text style={[styles.value, themed.text]}>Speed</Text>
        <Text testID="voice-rate" style={[styles.value, themed.text]}>
          {settings?.explicit ? factor(current.rate) : 'Engine default'}
        </Text>
      </View>
      <View style={styles.pair}>
        {button('Slower', () => void save({ ...current, rate: step(current.rate, -SPEECH_FACTOR_STEP) }, 'Speed saved.'), 'voice-slower', !settings || current.rate <= SPEECH_FACTOR_MIN)}
        {button('Faster', () => void save({ ...current, rate: step(current.rate, SPEECH_FACTOR_STEP) }, 'Speed saved.'), 'voice-faster', !settings || current.rate >= SPEECH_FACTOR_MAX)}
      </View>
      <View style={styles.row}>
        <Text style={[styles.value, themed.text]}>Pitch</Text>
        <Text testID="voice-pitch" style={[styles.value, themed.text]}>
          {settings?.explicit ? factor(current.pitch) : 'Engine default'}
        </Text>
      </View>
      <View style={styles.pair}>
        {button('Lower', () => void save({ ...current, pitch: step(current.pitch, -SPEECH_FACTOR_STEP) }, 'Pitch saved.'), 'voice-lower', !settings || current.pitch <= SPEECH_FACTOR_MIN)}
        {button('Higher', () => void save({ ...current, pitch: step(current.pitch, SPEECH_FACTOR_STEP) }, 'Pitch saved.'), 'voice-higher', !settings || current.pitch >= SPEECH_FACTOR_MAX)}
      </View>

      <View style={styles.pair}>
        {button('Preview', () => void play(), 'voice-preview', previewing || readiness?.service !== 'ready')}
        {button('Stop', () => void stopPreview().then(() => setNotice('Preview stopped.')), 'voice-stop', !previewing)}
      </View>
      {button('Reset to defaults', () => void reset(), 'voice-reset', !settings?.explicit)}
      {button('Refresh', () => void refresh(), 'voice-refresh')}

      {notice ? (
        <Text testID="voice-notice" accessibilityLiveRegion="polite" style={[styles.note, themed.text]}>
          {notice}
        </Text>
      ) : null}
    </ToolSheet>
  );
};

const styles = StyleSheet.create({
  section: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.body,
    fontWeight: 'bold',
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },
  value: {
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
  },
  note: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    marginTop: Spacing.xs,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
  },
  pair: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  button: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.sm,
  },
  buttonText: {
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
  },
  disabled: {
    opacity: 0.5,
  },
});

const getThemedStyles = (colors: ThemeColors) => ({
  text: {
    color: colors.textPrimary,
  },
  muted: {
    color: colors.textSecondary,
  },
  button: {
    borderColor: colors.border,
  },
  selected: {
    borderColor: colors.blue,
  },
});
