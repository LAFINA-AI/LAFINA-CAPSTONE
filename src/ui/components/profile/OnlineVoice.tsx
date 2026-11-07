import React, {useCallback, useEffect, useRef, useState} from 'react';
import {AppState, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {ToolSheet} from '../tools';
import {useThemedStyles} from '../../theme/createThemedStyles';
import type {ThemeColors} from '../../contexts/ThemeContext';
import {Fonts, FontSize, Spacing, Layout} from '../../theme';
import {onlineVoiceSettingsStore} from '../../../storage/onlineVoiceSettingsStore';
import type {OnlineVoiceChoice} from '../../../storage/onlineVoiceSettingsStore';
import {loadOnlineVoices} from '../../../cloud/onlineVoiceService';
import type {OnlineVoiceOption} from '../../../cloud/onlineVoiceService';
import {createCallSpeechProvider} from '../../../cloud/speechService';
import type {CallSpeechProvider} from '../../../scheduler/speechProvider';
import {isSpeechBusy} from '../../../ai/tts/ttsService';
import {getActiveOfflineCaptureId} from '../../../ai/native/speechCapture';
import {meetingRecorder} from '../../../ai/native/meetingRecorder';

interface Props {
  userId: string;
  visible: boolean;
  onClose: () => void;
  onChanged?: () => void;
}

export const ONLINE_PREVIEW_TEXT =
  'Hello. This is lafina, reading with your selected online voice.';
const LOAD_TIMEOUT_MS = 15_000;
const BUSY_NOTICE = 'Finish the current speech or recording, then try Preview.';

const LANGUAGE_NAMES: Record<string, string> = {
  fil: 'Filipino',
  en: 'English',
};

/** "Female · Filipino", from the catalogue's labels; empty when it has none. */
export const describeOnlineVoice = (voice: OnlineVoiceOption): string =>
  [
    voice.gender
      ? voice.gender.charAt(0).toUpperCase() + voice.gender.slice(1)
      : null,
    voice.language
      ? LANGUAGE_NAMES[voice.language] ?? voice.language.toUpperCase()
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

/** Synchronous audio admission, re-run immediately before Preview speaks. */
const audioBusy = (): boolean =>
  isSpeechBusy() ||
  getActiveOfflineCaptureId() !== null ||
  meetingRecorder.isRecordingClaimed();

/**
 * Online (ElevenLabs) voice choice for every signed-in account. Stored apart
 * from Android's offline voice settings; offline speech never reads it except
 * to decide which online voice to request.
 */
export const OnlineVoice: React.FC<Props> = ({
  userId,
  visible,
  onClose,
  onChanged,
}) => {
  const themed = useThemedStyles(getThemedStyles);
  const [choice, setChoice] = useState<OnlineVoiceChoice | null>(null);
  const [voices, setVoices] = useState<OnlineVoiceOption[]>([]);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  /** Bumped whenever this sheet's visible session ends; stale work stops. */
  const epoch = useRef(0);
  const request = useRef<AbortController | null>(null);
  const preview = useRef<CallSpeechProvider | null>(null);
  /** True while Preview admission checks are pending (before a provider exists). */
  const admitting = useRef(false);

  const stop = useCallback(async () => {
    admitting.current = false;
    const current = preview.current;
    preview.current = null;
    setPreviewing(false);
    await current?.dispose?.().catch(() => undefined);
  }, []);

  const reload = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort(), LOAD_TIMEOUT_MS);
    const ticket = epoch.current;
    setLoading(true);
    setNotice('Loading ElevenLabs voices…');
    try {
      const available = await loadOnlineVoices(userId, controller.signal);
      if (ticket !== epoch.current || request.current !== controller) return;
      setVoices(available);
      setNotice(
        available.length
          ? ''
          : 'No voices are available on the server account. You can still use the server default.',
      );
    } catch (error) {
      if (ticket === epoch.current && request.current === controller) {
        setNotice(
          controller.signal.aborted
            ? 'Voice loading stopped. Tap Reload voices to retry.'
            : error instanceof Error
            ? error.message
            : 'Could not load voices. Try again.',
        );
      }
    } finally {
      clearTimeout(timeout);
      if (ticket === epoch.current && request.current === controller) {
        request.current = null;
        setLoading(false);
      }
    }
  }, [userId]);

  useEffect(() => {
    if (!visible) return undefined;
    epoch.current += 1;
    setVoices([]);
    setNotice('');
    try {
      setChoice(onlineVoiceSettingsStore.read(userId));
    } catch (error) {
      // A corrupt saved value is shown as "server default" until replaced.
      setChoice(null);
      setNotice(
        error instanceof Error ? error.message : 'Choose a voice again.',
      );
    }
    void reload();
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') {
        epoch.current += 1;
        request.current?.abort();
        request.current = null;
        setLoading(false);
        void stop();
      }
    });
    return () => {
      epoch.current += 1;
      request.current?.abort();
      request.current = null;
      subscription.remove();
      void stop();
    };
  }, [visible, userId, reload, stop]);

  const choose = async (next: OnlineVoiceChoice | null) => {
    const ticket = epoch.current;
    await stop();
    // The sheet closed, backgrounded or changed account while Preview stopped.
    if (ticket !== epoch.current) return;
    try {
      // Only the ID and name are saved; labels are for display.
      const saved = next ? {id: next.id, name: next.name} : null;
      onlineVoiceSettingsStore.save(userId, saved);
      setChoice(saved);
      setNotice(`${next?.name ?? 'Server default'} saved for online speech.`);
      onChanged?.();
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'Could not save voice.',
      );
    }
  };

  const play = async () => {
    if (preview.current || admitting.current) return;
    admitting.current = true;
    const ticket = epoch.current;
    setNotice('Checking audio…');
    let recording = false;
    try {
      recording = audioBusy() || (await meetingRecorder.isRecording());
    } catch {
      recording = false; // Native check unavailable; the claim check still applies.
    }
    // Stop, close, background or a second tap may have happened meanwhile.
    if (!admitting.current || ticket !== epoch.current || preview.current) {
      return;
    }
    admitting.current = false;
    if (recording || audioBusy()) {
      setNotice(BUSY_NOTICE);
      return;
    }
    const provider = createCallSpeechProvider(userId);
    preview.current = provider;
    setPreviewing(true);
    setNotice('Starting preview…');
    try {
      const result = await provider.speakText(ONLINE_PREVIEW_TEXT);
      if (ticket !== epoch.current || preview.current !== provider) return;
      setNotice(
        result.source === 'elevenlabs'
          ? 'ElevenLabs preview finished. Check media volume if you heard nothing.'
          : result.source === 'cancelled'
          ? 'Preview stopped.'
          : `Played with the offline device voice, not ElevenLabs. ${
              result.fallbackReason ??
              'Enable Online Mode in Chat and connect to the internet to use ElevenLabs.'
            }`,
      );
    } catch {
      if (ticket === epoch.current && preview.current === provider) {
        setNotice('Preview could not play. Try again.');
      }
    } finally {
      if (preview.current === provider) {
        preview.current = null;
        setPreviewing(false);
      }
      await provider.dispose?.().catch(() => undefined);
    }
  };

  const option = (value: OnlineVoiceOption | null) => {
    const selected = (choice?.id ?? null) === (value?.id ?? null);
    const name = value?.name ?? 'Server default';
    const detail = value ? describeOnlineVoice(value) : '';
    return (
      <TouchableOpacity
        key={value?.id ?? 'default'}
        testID={`online-voice-${value?.id ?? 'default'}`}
        accessibilityRole="radio"
        accessibilityLabel={detail ? `${name}, ${detail}` : name}
        accessibilityState={{checked: selected, selected, disabled: previewing}}
        disabled={previewing}
        onPress={() => void choose(value)}
        style={[
          styles.option,
          themed.option,
          selected && themed.selected,
          previewing && styles.disabled,
        ]}
      >
        <Text style={[styles.label, themed.text]}>
          {selected ? '✓ ' : ''}
          {name}
        </Text>
        {detail ? (
          <Text style={[styles.detail, themed.muted]}>{detail}</Text>
        ) : null}
      </TouchableOpacity>
    );
  };

  const filipino = voices.filter(v => v.language === 'fil');
  const others = voices.filter(v => v.language !== 'fil');
  const filipinoTitle = filipino.every(v => v.gender === 'female')
    ? 'Filipina voices'
    : 'Filipino voices';

  return (
    <ToolSheet
      visible={visible}
      title="Online Voice · ElevenLabs"
      onClose={() => {
        epoch.current += 1;
        void stop();
        onClose();
      }}
      footer={
        <View>
          <Text
            accessibilityLiveRegion="polite"
            testID="online-voice-notice"
            style={[styles.note, themed.muted]}
          >
            {notice}
          </Text>
          <View style={styles.actions}>
            <TouchableOpacity
              testID="online-voice-reload"
              accessibilityRole="button"
              accessibilityState={{disabled: loading || previewing}}
              disabled={loading || previewing}
              onPress={() => void reload()}
              style={[
                styles.action,
                themed.option,
                (loading || previewing) && styles.disabled,
              ]}
            >
              <Text style={[styles.actionText, themed.text]}>
                {loading ? 'Loading…' : 'Reload voices'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="online-voice-preview"
              accessibilityRole="button"
              onPress={() => {
                if (previewing || admitting.current) {
                  void stop();
                  setNotice('Preview stopped.');
                } else {
                  void play();
                }
              }}
              style={[styles.action, themed.option]}
            >
              <Text style={[styles.actionText, themed.text]}>
                {previewing ? 'Stop preview' : 'Preview voice'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      }
    >
      <Text style={[styles.note, themed.muted]}>
        For all signed-in accounts in Online Mode. Loading voices contacts
        ElevenLabs through the LAFINA server. Preview sends the sample sentence
        for speech generation and counts toward your online allowance.
      </Text>
      <Text style={[styles.label, themed.text]}>
        Current: {choice?.name ?? 'Server default'}
      </Text>
      <Text style={[styles.note, themed.muted]}>
        Tap a voice to save it for this account on this device. Offline Voice
        keeps its own settings and works without the internet.
      </Text>
      {choice && voices.length > 0 && !voices.some(v => v.id === choice.id) && (
        <Text style={[styles.note, themed.text]}>
          Your saved voice is no longer in this catalogue. Choose another voice
          or the server default.
        </Text>
      )}
      <View accessibilityRole="radiogroup">
        {option(null)}
        {filipino.length > 0 && (
          <Text
            accessibilityRole="header"
            testID="online-voice-group-filipino"
            style={[styles.group, themed.text]}
          >
            {filipinoTitle}
          </Text>
        )}
        {filipino.map(option)}
        {filipino.length > 0 && others.length > 0 && (
          <Text
            accessibilityRole="header"
            testID="online-voice-group-more"
            style={[styles.group, themed.text]}
          >
            More voices
          </Text>
        )}
        {others.map(option)}
      </View>
    </ToolSheet>
  );
};

const getThemedStyles = (colors: ThemeColors) => ({
  text: {color: colors.textPrimary},
  muted: {color: colors.textSecondary},
  option: {borderColor: colors.border, backgroundColor: colors.surface},
  selected: {borderColor: colors.primary, borderWidth: 2},
});

const styles = StyleSheet.create({
  note: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    marginBottom: Spacing.md,
  },
  label: {fontFamily: Fonts.heading, fontSize: FontSize.body},
  detail: {fontFamily: Fonts.body, fontSize: FontSize.small, marginTop: 2},
  group: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.small,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  option: {
    minHeight: 48,
    justifyContent: 'center',
    padding: Spacing.md,
    borderWidth: 1,
    borderRadius: Layout.borderRadiusButton,
    marginBottom: Spacing.sm,
  },
  actions: {flexDirection: 'row', gap: Spacing.sm},
  action: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.sm,
    borderWidth: 1,
    borderRadius: Layout.borderRadiusButton,
  },
  actionText: {
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
    textAlign: 'center',
  },
  disabled: {opacity: 0.5},
});
