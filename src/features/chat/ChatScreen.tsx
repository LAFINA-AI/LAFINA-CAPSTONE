import {useCallback, useEffect, useRef, useState} from 'react';
import {
  AppState,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
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
import {Icon} from '../../core/ui/Icon';
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
  voiceRequest = 0,
}: {
  factory: () => PlannerRepository;
  preferences: Preferences;
  now: () => Date;
  speech: SpeechClient;
  speechInput: SpeechInputClient;
  showSpeechInput: boolean;
  showDiagnostics: boolean;
  /** Opens the visible review panel only; capture still needs a hold gesture. */
  voiceRequest?: number;
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
  const [toolsOpen, setToolsOpen] = useState(false);
  const conversation = useRef<ScrollView>(null);
  const previousVoiceRequest = useRef(0);

  useEffect(() => {
    if (voiceRequest === previousVoiceRequest.current) return;
    previousVoiceRequest.current = voiceRequest;
    if (voiceRequest > 0 && showSpeechInput) setVoiceOpen(true);
  }, [voiceRequest, showSpeechInput]);

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
    <View style={[styles.section, {backgroundColor: colors.background}]}>
      <View style={styles.toolbar}>
        <Text style={[styles.status, {color: colors.muted}]}>
          Offline · {preferences.timezone}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Chat tools"
          accessibilityState={{expanded: toolsOpen}}
          onPress={() => setToolsOpen(value => !value)}
          style={styles.iconButton}
        >
          <Icon name="more" size={24} color={colors.muted} />
        </Pressable>
      </View>
      {toolsOpen ? (
        <View style={[styles.tools, {backgroundColor: colors.surface}]}>
          <Button
            label="Show planner help"
            secondary
            onPress={() => {
              session.current?.cancel();
              setReview(null);
              append('assistant', plannerHelp);
              setToolsOpen(false);
            }}
          />
          <Button
            label="Clear conversation"
            secondary
            onPress={() => {
              clear();
              setToolsOpen(false);
            }}
          />
          <Text style={[styles.status, {color: colors.muted}]}>
            Messages stay in this view only. Leaving Chat clears them.
          </Text>
        </View>
      ) : null}
      <ScrollView
        ref={conversation}
        style={styles.conversation}
        contentContainerStyle={styles.conversationContent}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() =>
          conversation.current?.scrollToEnd({animated: false})
        }
      >
        {messages.length === 0 ? (
          <View style={styles.empty}>
            <Text
              accessibilityRole="header"
              style={[styles.title, {color: colors.text}]}
            >
              LAFINA Assistant
            </Text>
            <Text style={[styles.subtitle, {color: colors.muted}]}>
              Your offline academic scheduling assistant.
            </Text>
          </View>
        ) : null}
        {messages.map(row => (
          <View
            key={row.id}
            style={[
              styles.bubble,
              row.role === 'user' ? styles.userBubble : styles.assistantBubble,
              {
                backgroundColor:
                  row.role === 'user' ? colors.selected : colors.surface,
              },
            ]}
          >
            {row.role === 'assistant' && row.id === reading?.id ? (
              <ReplyMessage
                reply={reading}
                mode={preferences.replyMode}
                options={speechPreferences(preferences)}
                client={speech}
              />
            ) : (
              <Text
                accessibilityLabel={`${
                  row.role === 'user' ? 'You' : 'LAFINA'
                }: ${row.text}`}
                style={[styles.messageText, {color: colors.text}]}
              >
                {row.text}
              </Text>
            )}
          </View>
        ))}
        {review ? (
          <View
            accessibilityLabel="Command review"
            style={[
              styles.review,
              {borderColor: colors.border, backgroundColor: colors.surface},
            ]}
          >
            <Text
              accessibilityRole="header"
              style={[styles.heading, {color: colors.text}]}
            >
              Review this change
            </Text>
            <Message text={review.summary} />
            <Text style={[styles.reviewHint, {color: colors.muted}]}>
              Confirm to save. Android alert delivery depends on permissions and
              quiet hours.
            </Text>
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
      </ScrollView>
      {error ? (
        <View style={styles.notice}>
          <Message error text={error} />
        </View>
      ) : null}
      {!ready ? (
        <View style={styles.notice}>
          <Button
            label="Retry chat"
            secondary
            onPress={() => setAttempt(value => value + 1)}
          />
        </View>
      ) : null}
      <View
        style={[
          styles.composer,
          {backgroundColor: colors.surface, borderColor: colors.border},
        ]}
      >
        {showSpeechInput ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Show speech input"
            onPress={() => setVoiceOpen(true)}
            style={styles.iconButton}
          >
            <Icon name="mic" size={23} color={colors.accent} />
          </Pressable>
        ) : null}
        <TextInput
          accessibilityLabel="Message"
          placeholder="Message LAFINA…"
          placeholderTextColor={colors.muted}
          value={composer}
          onChangeText={changeComposer}
          maxLength={2000}
          multiline
          autoCorrect={false}
          style={[styles.input, {color: colors.text}]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send message"
          accessibilityState={{disabled: !ready}}
          disabled={!ready}
          onPress={send}
          style={[
            styles.send,
            {backgroundColor: ready ? colors.accent : colors.disabled},
          ]}
        >
          <Icon
            name="send"
            size={22}
            color={ready ? colors.onBrand : colors.muted}
          />
        </Pressable>
      </View>
      {voiceOpen && showSpeechInput ? (
        <Modal
          visible
          onRequestClose={() => setVoiceOpen(false)}
          animationType="slide"
        >
          <SafeAreaView
            style={[styles.voiceModal, {backgroundColor: colors.background}]}
          >
            <View style={styles.voiceToolbar}>
              <Text
                accessibilityRole="header"
                style={[styles.heading, {color: colors.text}]}
              >
                Speech input
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Hide speech input"
                onPress={() => setVoiceOpen(false)}
                style={styles.iconButton}
              >
                <Icon name="close" size={24} color={colors.text} />
              </Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
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
            </ScrollView>
          </SafeAreaView>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {flex: 1},
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
  },
  status: {fontSize: typography.small, flexShrink: 1},
  tools: {
    padding: spacing.md,
    marginHorizontal: spacing.md,
    borderRadius: dimensions.radius,
  },
  conversation: {flex: 1},
  conversationContent: {flexGrow: 1, padding: spacing.md},
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
  },
  title: {
    fontSize: typography.heading,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  subtitle: {fontSize: typography.body, textAlign: 'center', lineHeight: 24},
  heading: {
    fontSize: typography.heading,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  messageText: {fontSize: typography.body, lineHeight: 24},
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderWidth: dimensions.border,
    borderRadius: dimensions.navigationRadius,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    padding: spacing.xs,
  },
  iconButton: {
    minWidth: dimensions.control,
    minHeight: dimensions.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  send: {
    width: dimensions.control,
    minHeight: dimensions.control,
    borderRadius: dimensions.navigationRadius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    minHeight: dimensions.control,
    maxHeight: dimensions.control * 3,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    fontSize: typography.body,
    textAlignVertical: 'top',
  },
  review: {
    borderWidth: dimensions.border,
    borderRadius: dimensions.radius,
    padding: spacing.md,
    marginVertical: spacing.md,
  },
  reviewHint: {
    fontSize: typography.small,
    lineHeight: 21,
    marginBottom: spacing.md,
  },
  bubble: {
    maxWidth: '90%',
    borderRadius: dimensions.radius * 1.5,
    padding: spacing.md,
    marginVertical: spacing.sm,
  },
  userBubble: {alignSelf: 'flex-end'},
  assistantBubble: {alignSelf: 'flex-start'},
  notice: {paddingHorizontal: spacing.md},
  voiceModal: {flex: 1},
  voiceToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
});
