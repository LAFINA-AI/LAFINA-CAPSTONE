import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {AppState, StyleSheet, Text, View} from 'react-native';
import type {ReplyMode, SpeechPreferences} from '../../core/domain/preferences';
import {
  speechClient,
  type SpeechClient,
  type SpeechInventory,
} from '../../core/native/textToSpeech';
import {useTheme} from '../../core/theme/ThemeContext';
import {spacing, typography} from '../../core/theme/theme';
import {Button, Choice, Message} from '../../core/ui/controls';

export const SPEECH_PREVIEW_TEXT =
  'Reminder: your study session starts soon. Your task stays open until you mark it complete.';
const VOICE_PAGE_SIZE = 12;
const FAILURE =
  'Speech could not finish. The words and manual planner controls remain available. Refresh voices or check Android speech settings.';

/** Inspects installed voices without speaking until the visible preview action. */
export function SpeechSettings({
  client = speechClient,
  options,
  replyMode,
  onSave,
  onDraftStateChange,
  showDiagnostics = false,
}: {
  client?: SpeechClient;
  options: SpeechPreferences;
  replyMode: ReplyMode;
  onSave: (options: SpeechPreferences) => Promise<void>;
  onDraftStateChange?: (state: {dirty: boolean; saving: boolean}) => void;
  showDiagnostics?: boolean;
}) {
  const {colors} = useTheme();
  const {enginePackage, voiceName, languageTag, rate, pitch} = options;
  const savedOptions = useMemo(
    () => ({enginePackage, voiceName, languageTag, rate, pitch}),
    [enginePackage, voiceName, languageTag, rate, pitch],
  );
  const [draft, setDraft] = useState(savedOptions);
  const [committed, setCommitted] = useState(savedOptions);
  const [inventory, setInventory] = useState<SpeechInventory | null>(null);
  const [busy, setBusy] = useState(false);
  const [persisting, setPersisting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [startMs, setStartMs] = useState<number | null>(null);
  const [voiceLimit, setVoiceLimit] = useState(VOICE_PAGE_SIZE);
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const request = useRef<string | null>(null);
  const sequence = useRef(0);
  const generation = useRef(0);
  const previousMode = useRef(replyMode);

  const refresh = useCallback(
    async (next: SpeechPreferences, baseline = false) => {
      if (inFlight.current || request.current) {
        return;
      }
      inFlight.current = true;
      generation.current += 1;
      const current = generation.current;
      setBusy(true);
      setError('');
      setNotice('');
      try {
        const actual = await client.initialize(next);
        if (!mounted.current || current !== generation.current) {
          return;
        }
        setInventory(actual);
        const selected = actual.voices.find(
          voice =>
            voice.name === actual.selectedVoiceName &&
            voice.offline &&
            voice.installed,
        );
        const resolved = {
          ...next,
          enginePackage: actual.enginePackage ?? next.enginePackage,
          voiceName: selected?.name ?? next.voiceName,
          languageTag: selected?.languageTag ?? next.languageTag,
        };
        setDraft(resolved);
        if (baseline) {
          setCommitted(resolved);
        }
        setVoiceLimit(VOICE_PAGE_SIZE);
      } catch {
        if (mounted.current && current === generation.current) {
          setInventory(null);
          setError(FAILURE);
        }
      } finally {
        if (mounted.current && current === generation.current) {
          inFlight.current = false;
          setBusy(false);
        }
      }
    },
    [client],
  );

  const stop = useCallback(
    async (reason: string) => {
      request.current = null;
      setPreviewing(false);
      try {
        await client.stop(reason);
        if (mounted.current) {
          setNotice(
            'Voice preview stopped. The preview text remains available.',
          );
        }
      } catch {
        if (mounted.current) {
          setError(FAILURE);
        }
      }
    },
    [client],
  );

  useEffect(() => {
    mounted.current = true;
    const unsubscribe = client.subscribe(event => {
      if (!mounted.current || event.requestId !== request.current) {
        return;
      }
      if (event.type === 'start') {
        setStartMs(event.requestToStartMs ?? null);
        setNotice(
          'Android reported playback started. Check whether you can hear the preview.',
        );
      } else if (event.type === 'done') {
        request.current = null;
        setPreviewing(false);
        setNotice(
          'Android finished the preview. Confirm the words were audible and understandable on this device.',
        );
      } else if (event.type === 'cancelled' || event.type === 'error') {
        request.current = null;
        setPreviewing(false);
        if (event.type === 'error') {
          setError(FAILURE);
        } else {
          setNotice(
            'Voice preview was interrupted. The preview text remains available.',
          );
        }
      }
    });
    return () => {
      mounted.current = false;
      generation.current += 1;
      inFlight.current = false;
      request.current = null;
      unsubscribe();
      // Enqueue both now so an old stop promise cannot later dispose a new session.
      void client.stop('settings-unmounted').catch(() => undefined);
      void client.dispose().catch(() => undefined);
    };
  }, [client]);

  useEffect(() => {
    void refresh(savedOptions, true);
  }, [refresh, savedOptions]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(committed);
  useEffect(() => {
    onDraftStateChange?.({dirty, saving: persisting});
  }, [dirty, onDraftStateChange, persisting]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active' && request.current) {
        void stop('settings-backgrounded');
      }
    });
    return () => subscription.remove();
  }, [stop]);

  useEffect(() => {
    if (
      previousMode.current !== 'text' &&
      replyMode === 'text' &&
      request.current
    ) {
      void stop('reply-mode-text');
    }
    previousMode.current = replyMode;
  }, [replyMode, stop]);

  const voices =
    inventory?.voices.filter(voice => voice.offline && voice.installed) ?? [];
  const selected = voices.find(voice => voice.name === draft.voiceName);
  const ready = Boolean(
    inventory?.available &&
      selected &&
      inventory.selectedVoiceName === selected.name,
  );
  const disabled = busy || previewing;
  const visibleVoices = voices.slice(0, voiceLimit);
  if (selected && !visibleVoices.some(voice => voice.name === selected.name)) {
    visibleVoices.push(selected);
  }

  async function preview() {
    if (!ready || inFlight.current || request.current) {
      return;
    }
    const id = `preview_${Date.now().toString(36)}_${sequence.current++}`;
    request.current = id;
    setPreviewing(true);
    setStartMs(null);
    setError('');
    setNotice(
      'Voice preview requested. The text is available while Android prepares speech.',
    );
    try {
      // Apply the visible options before making the sole explicit speech request.
      const actual = await client.initialize(draft);
      if (!mounted.current || request.current !== id) {
        return;
      }
      if (!actual.available || actual.selectedVoiceName !== draft.voiceName) {
        throw new Error('The selected offline voice is no longer available.');
      }
      setInventory(actual);
      const accepted = await client.speak(id, SPEECH_PREVIEW_TEXT);
      if (mounted.current && request.current === id && !accepted.accepted) {
        request.current = null;
        setPreviewing(false);
        setError(FAILURE);
      }
    } catch {
      if (mounted.current && request.current === id) {
        request.current = null;
        setPreviewing(false);
        setError(FAILURE);
      }
    }
  }

  async function save() {
    if (!ready || inFlight.current || request.current) {
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setPersisting(true);
    setError('');
    setNotice('');
    try {
      await onSave(draft);
      if (mounted.current) {
        setCommitted(draft);
        setNotice('Voice options saved on this phone.');
      }
    } catch {
      if (mounted.current) {
        setError(
          'Voice options could not be saved. Your selections are still here. Try again.',
        );
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) {
        setBusy(false);
        setPersisting(false);
      }
    }
  }

  async function openSettings() {
    try {
      if (!(await client.openSettings()) && mounted.current) {
        setNotice(
          'Open Android Settings and look for Text-to-speech output. Choose an installed engine and install a voice for your language if needed, then refresh here.',
        );
      }
    } catch {
      if (mounted.current) {
        setError(
          'Android speech settings could not open. Open Text-to-speech output in Android Settings, then return and refresh voices.',
        );
      }
    }
  }

  return (
    <View style={styles.section}>
      <Text
        accessibilityRole="header"
        style={[styles.heading, {color: colors.text}]}
      >
        Offline speech
      </Text>
      <Message text="Android system voices read text on this phone. Only installed voices reported as offline are offered. No voice is played when this screen opens. Text and manual controls remain available." />
      <Message
        text={`Saved reply preference: ${
          replyMode === 'both'
            ? 'Text and voice'
            : replyMode === 'voice'
            ? 'Voice with visible text fallback'
            : 'Text'
        }. The preview below is a separate action.`}
      />
      {error ? <Message error text={error} /> : null}
      {notice ? <Message text={notice} /> : null}
      <Button
        label="Refresh installed voices"
        secondary
        disabled={disabled}
        onPress={() => {
          void refresh(draft);
        }}
      />
      {busy ? <Message text="Checking voice options…" /> : null}
      {inventory && !inventory.available && voices.length ? (
        <Message text="The selected voice is not ready. Choose an installed offline voice or check Android speech settings, then refresh. Text remains available." />
      ) : null}
      {inventory?.engines.length ? (
        <Choice
          label="Speech engine"
          value={draft.enginePackage ?? ''}
          disabled={disabled}
          options={inventory.engines.map(engine => ({
            value: engine.packageName,
            label: engine.label,
          }))}
          onChange={value => {
            void refresh({...draft, enginePackage: value, voiceName: null});
          }}
        />
      ) : null}
      {voices.length ? (
        <>
          <Choice
            label="Installed offline voice"
            value={draft.voiceName ?? ''}
            disabled={disabled}
            options={visibleVoices.map(voice => ({
              value: voice.name,
              label: `${voice.languageTag} · ${voice.name}`,
            }))}
            onChange={value => {
              const voice = voices.find(candidate => candidate.name === value);
              if (voice) {
                void refresh({
                  ...draft,
                  voiceName: value,
                  languageTag: voice.languageTag,
                });
              }
            }}
          />
          {voices.length > voiceLimit ? (
            <Button
              label="Show more installed voices"
              secondary
              disabled={disabled}
              onPress={() => setVoiceLimit(value => value + VOICE_PAGE_SIZE)}
            />
          ) : null}
        </>
      ) : (
        <Message text="No installed offline voice is ready. Open Android speech settings to check the engine and language voice data, then refresh here. Voice setup may need a separate download in Android settings; this app does not download voices. Continue using text and notifications meanwhile." />
      )}
      <Choice
        label="Speech speed"
        value={String(draft.rate)}
        disabled={disabled}
        options={[
          {value: '0.75', label: 'Slow'},
          {value: '1', label: 'Normal'},
          {value: '1.25', label: 'Fast'},
        ]}
        onChange={value =>
          setDraft(current => ({...current, rate: Number(value)}))
        }
      />
      <Choice
        label="Voice pitch"
        value={String(draft.pitch)}
        disabled={disabled}
        options={[
          {value: '0.8', label: 'Lower'},
          {value: '1', label: 'Normal'},
          {value: '1.2', label: 'Higher'},
        ]}
        onChange={value =>
          setDraft(current => ({...current, pitch: Number(value)}))
        }
      />
      <Button
        label="Save voice options"
        disabled={disabled || !ready}
        onPress={() => {
          void save();
        }}
      />
      <Text
        accessibilityRole="header"
        style={[styles.heading, {color: colors.text}]}
      >
        Voice preview
      </Text>
      <Message text={SPEECH_PREVIEW_TEXT} />
      <Message text="A preview may play through this device's speaker. Check its volume and your surroundings before playing." />
      <Button
        label="Play voice preview"
        disabled={disabled || !ready}
        onPress={() => {
          void preview();
        }}
      />
      <Button
        label="Stop voice preview"
        secondary
        disabled={!previewing}
        onPress={() => {
          void stop('preview-stop');
        }}
      />
      {startMs !== null ? (
        <Message
          text={`Android playback callback: ${Math.round(
            startMs,
          )} ms from request. This does not measure when sound became audible.`}
        />
      ) : null}
      {showDiagnostics && inventory ? (
        <Message
          text={`QA engine initialization: ${
            inventory.initializationMs ?? 'unavailable'
          } ms. Offline selection: ${
            inventory.available ? 'ready' : 'unavailable'
          }. Engine package selection: ${
            inventory.enginePackage ?? 'none'
          }. Voice: ${inventory.selectedVoiceName ?? 'none'}.`}
        />
      ) : null}
      <Button
        label="Open Android speech settings"
        secondary
        disabled={disabled}
        onPress={() => {
          void openSettings();
        }}
      />
      <Message text="Check the preview in airplane mode. An offline flag alone does not prove this engine is audible or works offline on your phone. If speech fails or is interrupted, the text stays visible." />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {marginBottom: spacing.lg},
  heading: {
    fontSize: typography.heading,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
});
