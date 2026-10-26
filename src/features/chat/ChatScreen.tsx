import {useCallback, useEffect, useRef, useState} from 'react';
import {AppState, StyleSheet, Text, TextInput, View} from 'react-native';
import {
  createCommandSession,
  type CommandReply,
  type CommandReview,
  type CommandSession,
} from '../../core/ai/commandSession';
import type {PlannerRepository} from '../../core/domain/planner';
import {
  speechPreferences,
  type Preferences,
} from '../../core/domain/preferences';
import type {SpeechInputClient} from '../../core/native/speechToText';
import type {SpeechClient} from '../../core/native/textToSpeech';
import {useTheme} from '../../core/theme/ThemeContext';
import {dimensions, spacing, typography} from '../../core/theme/theme';
import {Button, Message} from '../../core/ui/controls';
import {ReplyMessage, type WrittenReply} from '../../core/voice/ReplyMessage';
import {SpeechInputPanel} from './SpeechInputPanel';

export const plannerHelp =
  'Use Calendar to add a class or task. Android reminders can alert you offline. In Chat, send a clear command such as Remind me to revise tomorrow at 7 PM. Review the exact time and confirm the change before it is saved.';
const unavailable =
  'The local planner could not open. Retry chat or use Calendar. Your saved data has not been reset.';
type MessageRow = WrittenReply & {role: 'user' | 'assistant'};

/** Transient bounded conversation. Only the private command session can commit a reviewed action. */
export function ChatScreen({
  factory,
  preferences,
  now,
  speech,
  speechInput,
  showSpeechInput,
  showDiagnostics,
}: {
  factory: () => PlannerRepository;
  preferences: Preferences;
  now: () => Date;
  speech: SpeechClient;
  speechInput: SpeechInputClient;
  showSpeechInput: boolean;
  showDiagnostics: boolean;
}) {
  const {colors} = useTheme();
  const latest = useRef({preferences, now});
  latest.current = {preferences, now};
  const session = useRef<CommandSession | null>(null);
  const sequence = useRef(0);
  const running = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [composer, setComposer] = useState('');
  const [review, setReview] = useState<CommandReview | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [reading, setReading] = useState<WrittenReply | null>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);

  useEffect(() => {
    setReady(false);
    setError('');
    try {
      session.current = createCommandSession({
        repository: factory(),
        context: () => ({
          now: latest.current.now().toISOString(),
          timezone: latest.current.preferences.timezone,
        }),
        defaultLeadMinutes: () => latest.current.preferences.leadMinutes,
      });
      setReady(true);
    } catch {
      setError(unavailable);
    }
    const background = AppState.addEventListener('change', state => {
      if (state !== 'active') {
        session.current?.cancel();
        setReview(null);
      }
    });
    return () => {
      session.current?.dispose();
      session.current = null;
      background.remove();
    };
  }, [factory, attempt]);

  const append = useCallback((role: MessageRow['role'], text: string) => {
    const row = {role, text, id: `chat_${Date.now()}_${sequence.current++}`};
    setMessages(previous => [...previous, row].slice(-40));
    if (role === 'assistant') setReading(row);
  }, []);

  function accept(result: CommandReply) {
    setError('');
    setReview(result.review ?? null);
    append('assistant', result.message);
  }
  function changeComposer(value: string) {
    session.current?.cancel();
    setReview(null);
    setComposer(value);
  }
  function send() {
    if (!session.current || running.current) return;
    if (!composer.trim()) {
      setError('Type or copy a reviewed command first.');
      return;
    }
    running.current = true;
    setVoiceOpen(false);
    try {
      append('user', composer.trim());
      accept(session.current.submit(composer));
    } catch {
      setReview(null);
      setError(
        'The command could not finish. Inspect Calendar before retrying. Manual controls remain available.',
      );
    } finally {
      running.current = false;
    }
  }
  function confirm() {
    if (!review || !session.current || running.current) return;
    running.current = true;
    setVoiceOpen(false);
    try {
      accept(session.current.confirm(review.id));
    } catch {
      setReview(null);
      setError(
        'The change could not be confirmed. Inspect Calendar before retrying; your planner has not been reset.',
      );
    } finally {
      running.current = false;
    }
  }
  function clear() {
    session.current?.dispose();
    session.current = null;
    setReady(false);
    setReview(null);
    setComposer('');
    setMessages([]);
    setReading(null);
    setVoiceOpen(false);
    setAttempt(value => value + 1);
  }

  return (
    <View style={styles.section}>
      <Text
        accessibilityRole="header"
        style={[styles.title, {color: colors.text}]}
      >
        Chat
      </Text>
      <Message
        text={`Offline planner · ${preferences.timezone}. Every change needs review and a Confirm change tap. Messages stay on this screen only (up to 40); leaving Chat clears them. Typing always works without speech.`}
      />
      <Text style={[styles.label, {color: colors.text}]}>Message</Text>
      <TextInput
        accessibilityLabel="Message"
        value={composer}
        onChangeText={changeComposer}
        maxLength={2000}
        multiline
        autoCorrect={false}
        style={[
          styles.input,
          {
            color: colors.text,
            backgroundColor: colors.field,
            borderColor: colors.border,
          },
        ]}
      />
      <Button label="Send message" disabled={!ready} onPress={send} />
      {error ? <Message error text={error} /> : null}
      {!ready ? (
        <Button
          label="Retry chat"
          secondary
          onPress={() => setAttempt(value => value + 1)}
        />
      ) : null}
      {review ? (
        <View
          accessibilityLabel="Command review"
          style={[
            styles.review,
            {borderColor: colors.border, backgroundColor: colors.selected},
          ]}
        >
          <Text
            accessibilityRole="header"
            style={[styles.heading, {color: colors.text}]}
          >
            Review this change
          </Text>
          <Message text={review.summary} />
          <Message text="No change is saved until you confirm. Android alert delivery still depends on permissions and quiet hours." />
          <Button label="Confirm change" onPress={confirm} />
          <Button
            label="Discard change"
            secondary
            onPress={() => {
              session.current?.cancel();
              setReview(null);
              append(
                'assistant',
                'Review discarded. No planner change was made.',
              );
            }}
          />
        </View>
      ) : null}
      <Button
        label="Show planner help"
        secondary
        onPress={() => {
          session.current?.cancel();
          setReview(null);
          append('assistant', plannerHelp);
        }}
      />
      {showSpeechInput ? (
        <Button
          label={voiceOpen ? 'Hide speech input' : 'Show speech input'}
          secondary
          onPress={() => setVoiceOpen(value => !value)}
        />
      ) : null}
      {voiceOpen && showSpeechInput ? (
        <SpeechInputPanel
          client={speechInput}
          showDiagnostics={showDiagnostics}
          onDraftReady={text => {
            changeComposer(text);
            setVoiceOpen(false);
          }}
          onBeforeCapture={async () => {
            setReading(null);
            session.current?.cancel();
            setReview(null);
            await speech.stop('speech_input');
            await speech.dispose();
          }}
        />
      ) : null}
      <Button label="Clear conversation" secondary onPress={clear} />
      <Text
        accessibilityRole="header"
        style={[styles.heading, {color: colors.text}]}
      >
        Conversation · latest first
      </Text>
      {[...messages].reverse().map(row => (
        <View
          key={row.id}
          style={[
            styles.bubble,
            row.role === 'user' ? styles.userBubble : styles.assistantBubble,
            {
              backgroundColor:
                row.role === 'user' ? colors.selected : colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          <Text style={[styles.label, {color: colors.muted}]}>
            {row.role === 'user' ? 'You' : 'LAFINA'}
          </Text>
          {row.role === 'assistant' && row.id === reading?.id ? (
            <ReplyMessage
              reply={reading}
              mode={preferences.replyMode}
              options={speechPreferences(preferences)}
              client={speech}
            />
          ) : (
            <Message text={row.text} />
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {padding: spacing.lg},
  title: {
    fontSize: typography.title,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  heading: {
    fontSize: typography.heading,
    fontWeight: '600',
    marginVertical: spacing.md,
  },
  label: {fontSize: typography.label, marginBottom: spacing.sm},
  input: {
    minHeight: dimensions.control * 2,
    borderWidth: dimensions.border,
    borderRadius: dimensions.radius,
    padding: spacing.md,
    fontSize: typography.body,
    textAlignVertical: 'top',
    marginBottom: spacing.sm,
  },
  review: {
    borderWidth: dimensions.border,
    borderRadius: dimensions.radius,
    padding: spacing.md,
    marginVertical: spacing.md,
  },
  bubble: {
    maxWidth: '95%',
    borderWidth: dimensions.border,
    borderRadius: dimensions.radius,
    padding: spacing.md,
    marginVertical: spacing.sm,
  },
  userBubble: {alignSelf: 'flex-end'},
  assistantBubble: {alignSelf: 'flex-start'},
});
