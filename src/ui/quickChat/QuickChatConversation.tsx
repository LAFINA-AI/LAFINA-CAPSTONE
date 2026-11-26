import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {useTheme} from '../contexts/ThemeContext';
import {Fonts, FontSize, Spacing} from '../theme';
import {ChatMessageItem} from '../components/chat/ChatMessageItem';
import {TypingBubble} from '../components/chat/TypingBubble';
import {CommandReviewCard} from '../components/chat/CommandReviewCard';
import {UndoSnackbar} from '../components/chat/UndoSnackbar';
import {useChatReplyFormat} from '../hooks/useChatReplyFormat';
import {useCommandReview} from '../hooks/useCommandReview';
import {quickChatController} from '../../ai/quickChat/quickChatController';
import {chatMemoryService} from '../../cloud/chatMemoryService';
import type {UndoOffer} from '../../ai/nlu/commandReview';
import type {ChatMessage} from '../../storage/chatStore';
import type {CallNavigationTarget} from '../navigation/callNavigation';
import {floatingAssistantNative} from '../../utils/floatingAssistantNative';
import {QuickActionChips} from './QuickActionChips';
import {QuickChatComposer} from './QuickChatComposer';
import {QuickChatSuccessCard} from './QuickChatSuccessCard';
import {quickChatPresence} from './quickChatPresence';
import {quickChatTargetFor} from './quickChatTargets';

/** `03` §6: honest labels only; this one after 8 s. */
export const QUICK_CHAT_STILL_WORKING_MS = 8000;
/** Same repaint pace as the Chat tab's streaming reply. */
const STREAM_REPAINT_MS = 50;

export const QUICK_CHAT_ERROR_TEXT =
  'LAFINA could not answer that. Your message is back in the box, so you can send it again.';
/** UX 03 §9: a card that expired, changed elsewhere or outlived its session. */
export const QUICK_CHAT_NOT_CURRENT_TEXT =
  'This request is no longer current. Please ask again.';
/** UX 03 §9: Confirm failed while saving; the card stays. */
export const QUICK_CHAT_SAVE_FAILED_TEXT = 'Could not save. Try again.';
export const QUICK_CHAT_MULTI_STEP_TEXT =
  'This request has several steps. Open LAFINA and ask there to review them together.';

interface QuickChatConversationProps {
  userId: string;
  /** The Online Mode decision for this student (the status chip's). */
  onlineMode: boolean;
  /** Tells the panel a review card is open (the scrim then does not close it). */
  onCardOpenChange?: (open: boolean) => void;
  /** Incremented by the panel header's Clear action to reset local UI state. */
  clearSignal?: number;
  /** Tells the panel whether the current chat has anything clearable. */
  onHasContentChange?: (hasContent: boolean) => void;
}

interface SuccessState {
  message: string;
  target: CallNavigationTarget;
}

/**
 * Floating LAFINA (ADR-036): Quick Chat's transcript, progress and composer.
 * All requests go through `quickChatController` (Temporary Chat, `'quick'`
 * review surface), so nothing reaches the Chat tab's history.
 */
export const QuickChatConversation: React.FC<QuickChatConversationProps> = ({
  userId,
  onlineMode,
  onCardOpenChange,
  clearSignal = 0,
  onHasContentChange,
}) => {
  const {colors} = useTheme();
  const replyFormat = useChatReplyFormat(userId);
  const review = useCommandReview(userId, 'quick');
  const [success, setSuccess] = useState<SuccessState | null>(null);
  const [undoOffer, setUndoOffer] = useState<UndoOffer | null>(null);
  const [multiStep, setMultiStep] = useState(false);
  const [cardNotice, setCardNotice] = useState('');
  const cardOpen = Boolean(review.proposal);

  useEffect(() => {
    onCardOpenChange?.(cardOpen);
  }, [cardOpen, onCardOpenChange]);
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    quickChatController.getTranscript(userId),
  );
  const [busy, setBusy] = useState(() => quickChatController.isBusy(userId));
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState<{text: string; at: string} | null>(
    null,
  );
  const [stillWorking, setStillWorking] = useState(false);
  const [notice, setNotice] = useState('');
  const inputRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);
  /** Synchronous guard: a double tap on Send sends once. */
  const sendingRef = useRef(false);
  const flushRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const prevClearSignalRef = useRef(clearSignal);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (flushRef.current) clearTimeout(flushRef.current);
    };
  }, []);

  // Reset local UI state when the student taps Clear in the panel header.
  useEffect(() => {
    if (clearSignal === prevClearSignalRef.current) return;
    prevClearSignalRef.current = clearSignal;
    if (flushRef.current) {
      clearTimeout(flushRef.current);
      flushRef.current = null;
    }
    review.dismiss();
    setSuccess(null);
    setUndoOffer(null);
    setMultiStep(false);
    setCardNotice('');
    setNotice('');
    setStreaming(null);
    setDraft('');
    inputRef.current?.focus();
  }, [clearSignal, review]);

  const hasContent =
    messages.length > 0 ||
    busy ||
    cardOpen ||
    Boolean(success) ||
    multiStep ||
    Boolean(notice) ||
    draft.trim().length > 0;

  useEffect(() => {
    onHasContentChange?.(hasContent);
  }, [hasContent, onHasContentChange]);

  // The controller is the source of truth (it also survives closing the panel).
  useEffect(() => {
    const sync = () => {
      setMessages(quickChatController.getTranscript(userId));
      setBusy(quickChatController.isBusy(userId));
    };
    sync();
    return quickChatController.subscribe(sync);
  }, [userId]);

  // Reopened from the orb or the notification: typing should be immediate.
  useEffect(
    () =>
      quickChatPresence.subscribe(() => {
        if (quickChatPresence.isOpen()) {
          setMessages(quickChatController.getTranscript(userId));
          inputRef.current?.focus();
        }
      }),
    [userId],
  );

  useEffect(() => {
    if (!busy) {
      setStillWorking(false);
      return undefined;
    }
    const timer = setTimeout(
      () => setStillWorking(true),
      QUICK_CHAT_STILL_WORKING_MS,
    );
    return () => clearTimeout(timer);
  }, [busy]);

  const handleUndoMemory = useCallback(
    (message: ChatMessage) => {
      if (!message.memoryChanges || message.memoryChanges.undone) return;
      try {
        const reverted = chatMemoryService.undoTemporary(
          userId,
          message.id,
          message.memoryChanges,
        );
        quickChatController.patchMemoryChanges(userId, message.id, reverted);
      } catch (error) {
        console.warn('[QuickChat] Could not undo memory change:', error);
        setNotice('Could not undo the memory change. Try again.');
      }
    },
    [userId],
  );

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || sendingRef.current || quickChatController.isBusy(userId)) {
      return;
    }
    sendingRef.current = true;
    setNotice('');
    setCardNotice('');
    setSuccess(null);
    setUndoOffer(null);
    setMultiStep(false);
    setDraft('');
    let latest = '';
    const startedAt = new Date().toISOString();
    const showLatest = () => {
      flushRef.current = null;
      if (mounted.current) setStreaming({text: latest, at: startedAt});
    };
    try {
      const outcome = await quickChatController.send(userId, text, {
        onlineMode,
        onReplyText: replySoFar => {
          if (!mounted.current || !sendingRef.current) return;
          latest = replySoFar;
          if (!flushRef.current) {
            flushRef.current = setTimeout(showLatest, STREAM_REPAINT_MS);
          }
        },
      });
      if (!mounted.current) return;
      if (outcome.status === 'done') {
        const {result} = outcome;
        setUndoOffer(result.undo ?? null);
        if (result.multiBatch) {
          // Several changes at once are reviewed in the main app.
          review.dismiss();
          setMultiStep(true);
        } else if (result.resolvedReview) {
          // Conversational confirm/cancel resolved the open card.
          quickChatController.setCardSource(userId, null);
          review.dismiss();
        } else {
          // The words behind the card, given back on Cancel (even after
          // the panel was closed and reopened). For a multi-turn follow-up
          // ("remind me to throw trash" → "9pm"), preserve the combined
          // command text so Cancel restores something editable.
          quickChatController.setCardSource(
            userId,
            result.review?.status === 'proposal'
              ? {
                  operationId: result.review.proposal.operationId,
                  text: result.intent?.rawTranscript?.trim() || text,
                  messageId: result.assistantMessage.id,
                }
              : null,
          );
          // A new request replaces the open card in Quick Chat only.
          review.present(result.review);
        }
      } else if (outcome.status === 'error') {
        console.warn('[QuickChat] Request failed:', outcome.error);
        // Nothing was answered: give the text back unless more was typed.
        setDraft(current => (current.trim() ? current : text));
        setNotice(QUICK_CHAT_ERROR_TEXT);
      } else if (outcome.status === 'busy') {
        setDraft(current => (current.trim() ? current : text));
      }
    } finally {
      if (flushRef.current) {
        clearTimeout(flushRef.current);
        flushRef.current = null;
      }
      if (mounted.current) setStreaming(null);
      sendingRef.current = false;
    }
  }, [draft, onlineMode, userId, review]);

  const confirm = useCallback(async () => {
    if (!review.proposal) return;
    setCardNotice('');
    let decision;
    try {
      decision = await review.confirm({temporaryChat: true});
    } catch (error) {
      console.warn('[QuickChat] Confirm failed:', error);
      if (mounted.current) setCardNotice(QUICK_CHAT_SAVE_FAILED_TEXT);
      return;
    }
    if (!decision || !mounted.current) return;
    const outcome = decision.outcome;
    if (outcome?.status === 'applied') {
      quickChatController.recordDecision(userId, decision);
      quickChatController.setCardSource(userId, null);
      setSuccess({
        message: outcome.reply || decision.reply,
        target: quickChatTargetFor(userId, outcome.receipt),
      });
      Keyboard.dismiss();
      return;
    }
    if (outcome?.status === 'refused' && outcome.reason === 'failed') {
      // The card stays so the student can try again.
      setCardNotice(QUICK_CHAT_SAVE_FAILED_TEXT);
      return;
    }
    // Expired, changed elsewhere, session ended, not found: the card is gone.
    quickChatController.setCardSource(userId, null);
    quickChatController.recordDecision(userId, {
      ...decision,
      reply: QUICK_CHAT_NOT_CURRENT_TEXT,
    });
  }, [review, userId]);

  const cancel = useCallback(() => {
    const proposal = review.proposal;
    const source = proposal
      ? quickChatController.getCardSource(userId, proposal.operationId)
      : null;
    const decision = review.cancel({temporaryChat: true});
    setCardNotice('');
    if (!decision) return;
    quickChatController.recordDecision(userId, decision);
    // Nothing was saved; the words come back so they can be changed.
    if (source) {
      setDraft(current => (current.trim() ? current : source));
    }
    quickChatController.setCardSource(userId, null);
  }, [review, userId]);

  const reviewEdit = review.edit;
  const edit = useCallback(
    (patch: Parameters<NonNullable<typeof reviewEdit>>[0]) => {
      const previous = review.proposal?.operationId;
      const edited = reviewEdit ? reviewEdit(patch) : null;
      const source = previous
        ? quickChatController.getCardSource(userId, previous)
        : null;
      if (edited?.status === 'proposal' && source) {
        quickChatController.setCardSource(userId, {
          operationId: edited.proposal.operationId,
          text: source,
        });
      }
      return edited;
    },
    [review.proposal, reviewEdit, userId],
  );

  const viewInLafina = useCallback(() => {
    if (success) quickChatPresence.requestNavigation(success.target);
    Keyboard.dismiss();
    void floatingAssistantNative.openMainApp();
  }, [success]);

  const done = useCallback(() => {
    Keyboard.dismiss();
    void floatingAssistantNative.closeQuickChat();
  }, []);

  const openLafina = useCallback(() => {
    quickChatPresence.requestNavigation({ownerId: userId, screen: 'chat'});
    Keyboard.dismiss();
    void floatingAssistantNative.openMainApp();
  }, [userId]);

  const stop = useCallback(() => {
    const pending = quickChatController.getTranscript(userId).slice(-1)[0];
    quickChatController.stop();
    if (flushRef.current) {
      clearTimeout(flushRef.current);
      flushRef.current = null;
    }
    setStreaming(null);
    // Stop discards the reply; the question goes back so it is not lost.
    if (pending?.sender === 'user') {
      setDraft(current => (current.trim() ? current : pending.content));
    }
  }, [userId]);

  const empty = messages.length === 0 && !busy && !cardOpen && !success;
  const showChips = empty && !multiStep;
  // Avoid duplicating the exact confirmation line both as a trailing bubble
  // and inside the green QuickChatSuccessCard right underneath it.
  const visibleMessages =
    success &&
    messages.length > 0 &&
    messages[messages.length - 1].sender === 'assistant' &&
    messages[messages.length - 1].content.trim() === success.message.trim()
      ? messages.slice(0, -1)
      : messages;

  return (
    <View style={styles.container}>
      {empty ? (
        <>
          <Text
            style={[styles.hint, {color: colors.textSecondary}]}
            testID="quick-chat-hint"
          >
            What do you need to add?
          </Text>
          {showChips ? (
            <QuickActionChips
              onPick={item => {
                setDraft(current => (current.trim() ? current : item.starter));
                inputRef.current?.focus();
              }}
            />
          ) : null}
        </>
      ) : (
        <ScrollView
          ref={scrollRef}
          style={styles.transcript}
          contentContainerStyle={styles.transcriptContent}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() =>
            scrollRef.current?.scrollToEnd({animated: false})
          }
          testID="quick-chat-transcript"
        >
          {visibleMessages.map(message => (
            <ChatMessageItem
              key={message.id}
              item={message}
              replyFormat={replyFormat}
              onUndoMemory={handleUndoMemory}
            />
          ))}
          {busy && streaming?.text ? (
            <ChatMessageItem
              item={{
                id: 'quick-streaming-reply',
                sessionId: 'temp_chat',
                sender: 'assistant',
                content: streaming.text,
                createdAt: streaming.at,
                updatedAt: streaming.at,
              }}
              replyFormat={replyFormat}
              streaming
            />
          ) : busy ? (
            <View testID="quick-chat-working">
              <TypingBubble
                label={stillWorking ? 'Still working…' : 'Working on it…'}
              />
            </View>
          ) : null}
          {review.proposal ? (
            <View style={styles.card}>
              <CommandReviewCard
                proposal={review.proposal}
                expired={review.expired}
                busy={review.busy}
                onEdit={edit}
                onDeliveryChange={review.setDelivery}
                editError={review.editError}
                onConfirm={() => void confirm()}
                onCancel={cancel}
                onDismiss={review.dismiss}
                testIDPrefix="quick-review"
              />
              {cardNotice ? (
                <Text
                  style={[styles.notice, {color: colors.error}]}
                  testID="quick-review-notice"
                  accessibilityLiveRegion="polite"
                >
                  {cardNotice}
                </Text>
              ) : null}
            </View>
          ) : null}
          {success ? (
            <QuickChatSuccessCard
              message={success.message}
              onViewInLafina={viewInLafina}
              onDone={done}
            />
          ) : null}
          {multiStep ? (
            <View style={styles.card} testID="quick-multi-step">
              <Text style={[styles.notice, {color: colors.textPrimary}]}>
                {QUICK_CHAT_MULTI_STEP_TEXT}
              </Text>
              <TouchableOpacity
                onPress={openLafina}
                accessibilityRole="button"
                testID="quick-multi-step-open"
                style={styles.link}
              >
                <Text style={[styles.linkLabel, {color: colors.primary}]}>
                  Open LAFINA
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </ScrollView>
      )}

      {undoOffer ? (
        <UndoSnackbar
          offer={undoOffer}
          onUndo={token => {
            setUndoOffer(null);
            quickChatController.undo(userId, token);
          }}
          onHide={() => setUndoOffer(null)}
          testID="quick-undo"
        />
      ) : null}

      {notice ? (
        <Text
          style={[styles.notice, {color: colors.error}]}
          testID="quick-chat-notice"
          accessibilityLiveRegion="polite"
        >
          {notice}
        </Text>
      ) : null}

      <QuickChatComposer
        ref={inputRef}
        value={draft}
        onChangeText={text => {
          setDraft(text);
          if (notice) setNotice('');
        }}
        onSend={() => void send()}
        onStop={stop}
        busy={busy}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flexShrink: 1},
  hint: {
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
    marginBottom: Spacing.md,
  },
  transcript: {flexGrow: 0, flexShrink: 1, marginBottom: Spacing.sm},
  transcriptContent: {paddingBottom: Spacing.xs},
  notice: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    marginBottom: Spacing.sm,
  },
  card: {marginTop: Spacing.sm},
  link: {minHeight: 48, justifyContent: 'center'},
  linkLabel: {fontFamily: Fonts.heading, fontSize: FontSize.body},
});
