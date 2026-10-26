import {useEffect, useRef, useState} from 'react';
import {Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {
  speechInputClient,
  type SpeechInputClient,
  type SpeechInputEnginePreference,
  type SpeechInputLanguage,
} from '../../core/native/speechToText';
import {useTheme} from '../../core/theme/ThemeContext';
import {dimensions, spacing, typography} from '../../core/theme/theme';
import {Button, Choice, Message} from '../../core/ui/controls';
import {
  microphonePermission,
  useSpeechInputSession,
  type MicrophonePermission,
} from './useSpeechInputSession';

/** Draft review only: neither recognized nor confirmed words mutate the planner. */
export function SpeechInputPanel({
  client = speechInputClient,
  permission = microphonePermission,
  onBeforeCapture,
  showDiagnostics = false,
  onDraftReady,
}: {
  client?: SpeechInputClient;
  permission?: MicrophonePermission;
  onBeforeCapture?: () => Promise<void>;
  showDiagnostics?: boolean;
  /** Reviewed text is copied to the chat composer; this callback never executes it. */
  onDraftReady?: (text: string) => void;
}) {
  const {colors} = useTheme();
  const [language, setLanguage] = useState<SpeechInputLanguage>('en-US');
  const [engine, setEngine] = useState<SpeechInputEnginePreference>('auto');
  const [draft, setDraft] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [draftError, setDraftError] = useState(false);
  const [settingsNotice, setSettingsNotice] = useState('');
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const input = useSpeechInputSession({
    client,
    permission,
    language,
    engine,
    onBeforeCapture,
  });
  const enginesAvailable = Boolean(
    input.capabilities?.onDevice || input.capabilities?.whisper,
  );
  const holdDisabled =
    input.checking || !enginesAvailable || input.phase === 'transcribing';

  function changeDraft(value: string) {
    setDraft(value);
    setConfirmed(false);
    setDraftError(false);
  }
  async function openSettings() {
    input.cancel();
    try {
      const opened = await client.openSettings();
      if (!mounted.current) return;
      setSettingsNotice(
        opened
          ? 'Return here and refresh offline speech options after checking Android settings.'
          : 'Open Android Settings and check speech recognition and this app’s microphone permission. Typing remains available.',
      );
    } catch {
      if (mounted.current)
        setSettingsNotice(
          'Android speech settings could not open. Open Android Settings manually or keep typing.',
        );
    }
  }

  return (
    <View style={styles.section}>
      <Text
        accessibilityRole="header"
        style={[styles.heading, {color: colors.text}]}
      >
        Offline speech draft
      </Text>
      <Message
        text={
          onDraftReady
            ? 'Hold to speak, release, and review the words. Copy your draft into chat, then send it for a separate command review. Recording alone never changes your planner. These drafts are cleared when you leave Chat.'
            : 'Hold to speak, release to transcribe, then review the words. This screen does not create or change tasks. Drafts and transcripts are not saved; leaving Chat clears them. You can always type instead.'
        }
      />
      <Editor label="Draft text" value={draft} onChange={changeDraft} />
      <Button
        label={onDraftReady ? 'Use draft in chat' : 'Confirm draft text'}
        onPress={() => {
          setDraftError(!draft.trim());
          setConfirmed(Boolean(draft.trim()));
          if (draft.trim()) onDraftReady?.(draft.trim());
        }}
      />
      {draftError ? (
        <Message
          error
          text="Type or review some words before confirming your draft."
        />
      ) : null}
      {confirmed ? (
        <Message
          text={
            onDraftReady
              ? 'Reviewed words copied to the chat message. Send that message to review a command; nothing has been changed yet.'
              : 'Draft text confirmed on this screen. No task, event or reminder has been created or changed. Scheduling commands are not available in this phase.'
          }
        />
      ) : null}
      <Choice<SpeechInputLanguage>
        label="Speech language"
        value={language}
        disabled={input.busy}
        options={[
          {value: 'en-US', label: 'English'},
          {value: 'fil-PH', label: 'Filipino'},
        ]}
        onChange={setLanguage}
      />
      <Choice<SpeechInputEnginePreference>
        label="Offline speech engine"
        value={engine}
        disabled={input.busy}
        options={[
          {value: 'auto', label: 'Automatic'},
          {value: 'android', label: 'Android on-device'},
          {value: 'whisper', label: 'Whisper local model'},
        ]}
        onChange={setEngine}
      />
      <Message text="Automatic selects a candidate offline engine. Android on-device support depends on the phone and installed language data; Whisper requires the verified local model. Availability checks do not prove recognition works for your language. No online recognizer or automatic language download is used. If a language fails, release and try another engine or type." />
      {input.checking ? (
        <Message text="Checking offline speech options…" />
      ) : null}
      {input.capabilityError ? (
        <Message error text={input.capabilityError} />
      ) : null}
      {!input.checking && !enginesAvailable ? (
        <Message text="Offline speech is unavailable on this device or build. Check Android speech settings or keep using the draft text field." />
      ) : null}
      <Button
        label="Refresh offline speech options"
        secondary
        disabled={input.busy || input.checking}
        onPress={input.refresh}
      />
      <Message text={input.notice} error={input.error} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Hold to talk"
        accessibilityHint="Keep your finger pressed while recording; release to transcribe. A permission prompt requires another hold afterward."
        accessibilityState={{disabled: holdDisabled, busy: input.busy}}
        disabled={holdDisabled}
        onPressIn={input.begin}
        onPressOut={input.release}
        style={({pressed}) => [
          styles.hold,
          {
            backgroundColor: holdDisabled ? colors.disabled : colors.primary,
            borderColor: colors.border,
            opacity: pressed ? 0.75 : 1,
          },
        ]}
      >
        <Text
          style={[
            styles.holdText,
            {color: holdDisabled ? colors.muted : colors.onPrimary},
          ]}
        >
          {input.phase === 'recording'
            ? 'Recording — release to transcribe'
            : input.phase === 'preparing'
            ? 'Preparing — keep holding'
            : 'Hold to talk'}
        </Text>
      </Pressable>
      <Button
        label="Cancel speech input"
        secondary
        disabled={!input.busy}
        onPress={input.cancel}
      />
      {input.transcript !== null ? (
        <>
          <Editor
            label="Recognized speech (review before use)"
            value={input.transcript}
            onChange={input.setTranscript}
            editable={!input.busy}
          />
          <Button
            label="Replace draft with recognized speech"
            secondary
            disabled={input.busy || !input.transcript.trim()}
            onPress={() => changeDraft(input.transcript?.trim() ?? '')}
          />
          <Message text="Replacing the draft uses the reviewed words above. Confirm the draft separately; recognition alone never changes your schedule." />
        </>
      ) : null}
      <Button
        label="Open Android speech settings"
        secondary
        disabled={input.busy}
        onPress={() => {
          void openSettings();
        }}
      />
      {settingsNotice ? <Message text={settingsNotice} /> : null}
      {showDiagnostics && input.capabilities ? (
        <Message
          text={`QA speech input: API ${
            input.capabilities.sdk
          }; on-device candidate ${
            input.capabilities.onDevice ? 'available' : 'unavailable'
          }; Whisper asset candidate ${
            input.capabilities.whisper ? 'available' : 'unavailable'
          }; microphone permission ${
            input.capabilities.permission ? 'allowed' : 'not allowed'
          }. Capability is not an accuracy or offline listening test.`}
        />
      ) : null}
      {showDiagnostics && input.measurement ? (
        <Message
          text={`QA speech result: ${input.measurement.type}; engine ${
            input.measurement.engine ?? 'unreported'
          }; recording ${
            input.measurement.recordingMs ?? 'unreported'
          } ms; transcription ${
            input.measurement.transcriptionMs ?? 'unreported'
          } ms. These native milestones do not establish accuracy or phone performance.`}
        />
      ) : null}
    </View>
  );
}

function Editor({
  label,
  value,
  onChange,
  editable = true,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  editable?: boolean;
}) {
  const {colors} = useTheme();
  return (
    <View style={styles.editor}>
      <Text style={[styles.label, {color: colors.text}]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        maxLength={2000}
        multiline
        autoCorrect={false}
        editable={editable}
        style={[
          styles.input,
          {
            backgroundColor: colors.field,
            borderColor: colors.border,
            color: colors.text,
          },
        ]}
      />
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
  editor: {marginBottom: spacing.lg},
  label: {
    fontSize: typography.label,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  input: {
    minHeight: dimensions.control * 2,
    borderWidth: dimensions.border,
    borderRadius: dimensions.radius,
    padding: spacing.md,
    fontSize: typography.body,
    textAlignVertical: 'top',
  },
  hold: {
    minHeight: dimensions.control,
    borderWidth: dimensions.border,
    borderRadius: dimensions.radius,
    padding: spacing.md,
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  holdText: {
    fontSize: typography.label,
    fontWeight: '600',
    textAlign: 'center',
  },
});
