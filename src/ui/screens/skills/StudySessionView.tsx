import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  ArrowLeftRight,
  Pencil,
  RotateCw,
  Shuffle,
  Volume2,
  VolumeX,
} from 'lucide-react-native';
import {startOwnedSpeech, stopOwnedSpeech} from '../../../ai/tts/ttsService';
import {db} from '../../../storage';
import {
  formatNextDueIn,
  getDeckStats,
  previewCardInterval,
  type Deck,
  type Rating,
  type StudyCard,
} from '../../../skills/studyLogic';
import {useReducedMotion} from '../../hooks/useReducedMotion';
import {SkillFonts, SkillMotion, useSkillsPalette} from '../../theme/skills';
import {SkillRing} from './SkillRing';
import {SkillButton, SkillCard, SkillInput, SkillText, ui} from './SkillUI';

export interface StudySessionViewProps {
  userId: string;
  deck: Deck | undefined;
  queue: StudyCard[];
  index: number;
  flipped: boolean;
  practiceMode: boolean;
  swapped: boolean;
  ratings: Rating[];
  missedIds: string[];
  historyLength: number;
  requeuedCounts: Record<string, number>;
  uniqueCardCount: number;
  retryCapNotice: string;
  error: string;
  onToggleFlip: () => void;
  onSetFlipped: (value: boolean) => void;
  onRate: (rating: Rating) => void;
  onUndo: () => void;
  onShuffle: () => void;
  onToggleSwap: () => void;
  onEditCardInSession: (
    cardId: string,
    question: string,
    answer: string,
  ) => boolean;
  onReviewMissed: (deck: Deck, cards: StudyCard[]) => void;
  onStudyAgain: (deck: Deck) => void;
  onQuiz: (deck: Deck) => void;
  onEndSession: () => void;
  onOpenNote?: (noteId: string) => void;
  editModalVisible: boolean;
  onSetEditModalVisible: (visible: boolean) => void;
}

export function StudySessionView({
  userId,
  deck,
  queue,
  index,
  flipped,
  practiceMode,
  swapped,
  ratings,
  missedIds,
  historyLength,
  requeuedCounts,
  uniqueCardCount,
  retryCapNotice,
  error,
  onToggleFlip,
  onSetFlipped,
  onRate,
  onUndo,
  onShuffle,
  onToggleSwap,
  onEditCardInSession,
  onReviewMissed,
  onStudyAgain,
  onQuiz,
  onEndSession,
  onOpenNote,
  editModalVisible,
  onSetEditModalVisible,
}: StudySessionViewProps) {
  const p = useSkillsPalette();
  const reduced = useReducedMotion();
  const {
    height: windowHeight,
    width: windowWidth,
    fontScale,
  } = useWindowDimensions();

  const flip = useRef(new Animated.Value(flipped ? 1 : 0)).current;
  const prevIndex = useRef(index);
  const mountedRef = useRef(true);
  const speechTokenRef = useRef<number | null>(null);
  const speechRequestIdRef = useRef(0);
  const [speaking, setSpeaking] = useState(false);
  const [ttsNotice, setTtsNotice] = useState('');
  const [editQuestion, setEditQuestion] = useState('');
  const [editAnswer, setEditAnswer] = useState('');

  const stopAloud = useCallback(async () => {
    speechRequestIdRef.current += 1;
    const token = speechTokenRef.current;
    speechTokenRef.current = null;
    if (mountedRef.current) setSpeaking(false);
    if (token !== null) {
      await stopOwnedSpeech(token).catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      void stopAloud();
    };
  }, [stopAloud]);

  useEffect(() => {
    void stopAloud();
  }, [index, flipped, swapped, deck?.id, stopAloud]);

  useEffect(() => {
    if (prevIndex.current !== index) {
      prevIndex.current = index;
      flip.stopAnimation();
      flip.setValue(flipped ? 1 : 0);
      return;
    }
    if (reduced) {
      flip.stopAnimation();
      flip.setValue(flipped ? 1 : 0);
      return;
    }
    const a = Animated.timing(flip, {
      toValue: flipped ? 1 : 0,
      duration: SkillMotion.flip,
      easing: Easing.bezier(0.2, 0.8, 0.2, 1),
      useNativeDriver: true,
    });
    a.start();
    return () => a.stop();
  }, [flip, flipped, index, reduced]);

  const ratingThemes: Record<
    Rating,
    {bg: string; border: string; ink: string}
  > = {
    Again: {bg: p.dangerSoft, border: p.againInk, ink: p.againInk},
    Hard: {bg: p.peach, border: p.hardInk, ink: p.hardInk},
    Good: {bg: p.blueSoft, border: p.goodInk, ink: p.goodInk},
    Easy: {bg: p.mint, border: p.easyInk, ink: p.easyInk},
  };

  const activeCard = queue[index];
  const activeSourceNoteId = activeCard?.sourceNoteId;
  const activeSourceLabel = activeCard?.sourceLabel;

  const resolvedSourceLabel = useMemo(() => {
    if (activeSourceLabel?.trim()) return activeSourceLabel.trim();
    if (!activeSourceNoteId) return null;
    try {
      const row = db.executeSync(
        'SELECT title FROM notes WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1',
        [activeSourceNoteId, userId],
      ).rows?.[0];
      return typeof row?.title === 'string' && row.title.trim()
        ? row.title.trim()
        : null;
    } catch {
      return null;
    }
  }, [activeSourceLabel, activeSourceNoteId, userId]);

  const toggleSpeak = async (textToSpeak: string) => {
    setTtsNotice('');
    if (speaking) {
      await stopAloud();
      return;
    }
    const clean = textToSpeak.trim();
    if (!clean) return;
    const reqId = ++speechRequestIdRef.current;
    setSpeaking(true);
    const {token, result} = startOwnedSpeech(
      clean,
      'flashcards',
      () => mountedRef.current && speechRequestIdRef.current === reqId,
    );
    const assignedToken = await token;
    if (!mountedRef.current || speechRequestIdRef.current !== reqId) {
      if (assignedToken !== null) {
        void stopOwnedSpeech(assignedToken).catch(() => undefined);
      }
      return;
    }
    speechTokenRef.current = assignedToken;
    const outcome = await result;
    if (!mountedRef.current || speechRequestIdRef.current !== reqId) return;
    if (speechTokenRef.current === assignedToken) {
      speechTokenRef.current = null;
      setSpeaking(false);
    }
    if (outcome === 'failed') {
      setTtsNotice('Offline speech is unavailable on this device.');
    }
  };

  if (index >= queue.length) {
    const missedCards = deck?.cards.filter(c => missedIds.includes(c.id)) ?? [];
    const positiveRatings = ratings.filter(
      r => r === 'Good' || r === 'Easy',
    ).length;
    const recallRatio =
      ratings.length > 0 ? positiveRatings / ratings.length : 1;
    const deckStats = deck ? getDeckStats(deck) : null;
    const nextDueHint = deckStats ? formatNextDueIn(deckStats.nextDueAt) : null;
    const studiedUnique = new Set(queue.map(c => c.id)).size;

    return (
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[ui.content, {paddingTop: 18, gap: 12}]}
      >
        <View style={[ui.center, {gap: 12}]}>
          {ratings.length > 0 && (
            <SkillRing size={168} progress={recallRatio}>
              <SkillText strong size={34}>
                {Math.round(recallRatio * 100)}%
              </SkillText>
              <SkillText muted size={12}>
                recall
              </SkillText>
            </SkillRing>
          )}
          <SkillText strong size={26} center>
            {ratings.length ? 'Session complete' : 'All caught up'}
          </SkillText>
          <SkillText muted center>
            {ratings.length
              ? `${studiedUnique} ${studiedUnique === 1 ? 'card' : 'cards'} · ${
                  ratings.length
                } review${ratings.length === 1 ? '' : 's'} completed`
              : deck?.cards.length
              ? 'No cards are due right now.'
              : 'This deck has no cards yet.'}
          </SkillText>
          {!!nextDueHint && (
            <SkillText muted size={12} center>
              {nextDueHint}
            </SkillText>
          )}
        </View>
        {ratings.length > 0 && (
          <View style={[ui.row, {flexWrap: 'wrap', justifyContent: 'center'}]}>
            {(['Again', 'Hard', 'Good', 'Easy'] as Rating[]).map(r => {
              const tone = ratingThemes[r];
              return (
                <SkillCard
                  key={r}
                  style={{
                    minWidth: 74,
                    alignItems: 'center',
                    backgroundColor: tone.bg,
                    borderColor: tone.border,
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: SkillFonts.bold,
                      fontSize: 20,
                      color: tone.ink,
                    }}
                  >
                    {ratings.filter(x => x === r).length}
                  </Text>
                  <Text
                    style={{
                      fontFamily: SkillFonts.medium,
                      fontSize: 12,
                      color: tone.ink,
                    }}
                  >
                    {r}
                  </Text>
                </SkillCard>
              );
            })}
          </View>
        )}
        {historyLength > 0 && (
          <SkillButton
            secondary
            label="Undo last"
            onPress={() => {
              void stopAloud();
              onUndo();
            }}
          />
        )}
        {deck && missedCards.length > 0 && (
          <SkillButton
            label={`Review missed (${missedCards.length})`}
            onPress={() => onReviewMissed(deck, missedCards)}
          />
        )}
        {deck && deck.cards.length > 0 && (
          <SkillButton
            secondary={missedCards.length > 0}
            label={ratings.length ? 'Study again' : 'Study all cards'}
            onPress={() => onStudyAgain(deck)}
          />
        )}
        <SkillButton
          secondary
          label="Back to decks"
          onPress={() => {
            void stopAloud();
            onEndSession();
          }}
        />
        {deck && deck.cards.length > 0 && (
          <SkillButton
            secondary
            label="Test yourself with a quiz"
            onPress={() => onQuiz(deck)}
          />
        )}
        {!!error && <SkillText danger>{error}</SkillText>}
      </ScrollView>
    );
  }

  if (!activeCard) return null;

  const now = Date.now();
  const isRetry = (requeuedCounts[activeCard.id] ?? 0) > 0;
  const remainingUnique = new Set(queue.slice(index).map(c => c.id)).size;
  const completedUnique = Math.max(0, uniqueCardCount - remainingUnique);
  const progressPct =
    uniqueCardCount > 0
      ? Math.min(
          100,
          ((completedUnique + (flipped ? 0.5 : 0)) / uniqueCardCount) * 100,
        )
      : 0;
  const remainingRetries = Math.max(0, queue.length - index - remainingUnique);
  const cardHeight = Math.min(
    360,
    Math.max(230, Math.round(windowHeight * 0.38)),
  );
  const useTwoByTwo = windowWidth < 360 || fontScale > 1.25;

  const frontOpacity = reduced
    ? flipped
      ? 0
      : 1
    : flip.interpolate({
        inputRange: [0, 0.499, 0.5, 1],
        outputRange: [1, 1, 0, 0],
      });
  const backOpacity = reduced
    ? flipped
      ? 1
      : 0
    : flip.interpolate({
        inputRange: [0, 0.499, 0.5, 1],
        outputRange: [0, 0, 1, 1],
      });
  const frontTransform = reduced
    ? undefined
    : [
        {perspective: 1200},
        {
          rotateY: flip.interpolate({
            inputRange: [0, 1],
            outputRange: ['0deg', '180deg'],
          }),
        },
      ];
  const backTransform = reduced
    ? undefined
    : [
        {perspective: 1200},
        {
          rotateY: flip.interpolate({
            inputRange: [0, 1],
            outputRange: ['-180deg', '0deg'],
          }),
        },
      ];

  const isPracticeCard = practiceMode && activeCard.dueAt > now;
  const statusLabel = isPracticeCard
    ? 'Practice'
    : isRetry
    ? 'Retry'
    : activeCard.reviews === 0
    ? 'New'
    : `${activeCard.reviews} ${
        activeCard.reviews === 1 ? 'review' : 'reviews'
      }`;

  const frontLabel = swapped ? 'ANSWER' : 'QUESTION';
  const backLabel = swapped ? 'QUESTION' : 'ANSWER';
  const frontText = swapped ? activeCard.answer : activeCard.question;
  const backText = swapped ? activeCard.question : activeCard.answer;
  const backPromptPrefix = swapped ? 'A' : 'Q';
  const remainingInQueue = queue.length - index;

  return (
    <View
      style={{
        flex: 1,
        paddingHorizontal: 20,
        paddingBottom: 16,
        justifyContent: 'space-between',
      }}
    >
      <View>
        <View
          accessibilityRole="progressbar"
          accessibilityValue={{
            min: 0,
            max: uniqueCardCount,
            now: completedUnique,
          }}
          style={{
            height: 6,
            borderRadius: 3,
            backgroundColor: p.surface,
            marginTop: 4,
          }}
        >
          <View
            style={{
              width: `${progressPct}%`,
              height: 6,
              borderRadius: 3,
              backgroundColor: p.accent,
            }}
          />
        </View>
        <View style={[ui.between, {marginTop: 8}]}>
          <SkillText muted size={12}>
            {completedUnique} of {uniqueCardCount} studied
            {remainingRetries > 0 ? ` · +${remainingRetries} retry` : ''}
          </SkillText>
          <View style={[ui.row, {gap: 6}]}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Shuffle remaining cards"
              disabled={remainingInQueue <= 1}
              onPress={onShuffle}
              style={{
                minHeight: 44,
                minWidth: 44,
                paddingHorizontal: 8,
                borderRadius: 12,
                backgroundColor: p.surface,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: remainingInQueue <= 1 ? 0.4 : 1,
              }}
            >
              <Shuffle size={16} color={p.text} />
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Swap question and answer"
              accessibilityState={{selected: swapped}}
              onPress={onToggleSwap}
              style={{
                minHeight: 44,
                paddingHorizontal: 10,
                borderRadius: 12,
                backgroundColor: swapped ? p.blueSoft : p.surface,
                borderWidth: swapped ? 1 : 0,
                borderColor: p.goodInk,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <ArrowLeftRight size={15} color={swapped ? p.goodInk : p.text} />
              <Text
                style={{
                  fontFamily: SkillFonts.medium,
                  fontSize: 12,
                  color: swapped ? p.goodInk : p.text,
                }}
              >
                Q/A
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={speaking ? 'Stop reading' : 'Read aloud'}
              onPress={() => {
                void toggleSpeak(flipped ? backText : frontText);
              }}
              style={{
                minHeight: 44,
                minWidth: 44,
                paddingHorizontal: 8,
                borderRadius: 12,
                backgroundColor: speaking ? p.blueSoft : p.surface,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {speaking ? (
                <VolumeX size={16} color={p.goodInk} />
              ) : (
                <Volume2 size={16} color={p.text} />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Edit active card"
              onPress={() => {
                setEditQuestion(activeCard.question);
                setEditAnswer(activeCard.answer);
                onSetEditModalVisible(true);
              }}
              style={{
                minHeight: 44,
                minWidth: 44,
                paddingHorizontal: 8,
                borderRadius: 12,
                backgroundColor: p.surface,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Pencil size={16} color={p.text} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <TouchableOpacity
        key={`${activeCard.id}-${index}`}
        accessibilityRole="button"
        accessibilityLabel={`${flipped ? backLabel : frontLabel}: ${
          flipped ? backText : frontText
        }. ${flipped ? 'Tap to flip back' : 'Tap to reveal answer'}`}
        activeOpacity={0.95}
        onPress={onToggleFlip}
        style={{height: cardHeight, marginVertical: 10, marginHorizontal: 2}}
      >
        <View style={ui.fill}>
          <Animated.View
            pointerEvents={flipped ? 'none' : 'auto'}
            accessibilityElementsHidden={flipped}
            importantForAccessibility={flipped ? 'no-hide-descendants' : 'auto'}
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: flipped ? 1 : 2,
              opacity: frontOpacity,
              borderRadius: 26,
              backgroundColor: p.card,
              borderWidth: 1,
              borderColor: p.border,
              padding: 22,
              transform: frontTransform,
              justifyContent: 'space-between',
            }}
          >
            <View style={ui.between}>
              <Text
                style={{
                  fontFamily: SkillFonts.semibold,
                  fontSize: 12,
                  letterSpacing: 1.2,
                  color: p.accent,
                }}
              >
                {frontLabel}
              </Text>
              <Text
                style={{
                  fontFamily: SkillFonts.medium,
                  fontSize: 12,
                  color: isRetry ? p.danger : p.muted,
                }}
              >
                {statusLabel}
              </Text>
            </View>
            <ScrollView
              style={ui.fill}
              contentContainerStyle={{
                flexGrow: 1,
                justifyContent: 'center',
                paddingVertical: 12,
              }}
              nestedScrollEnabled
            >
              <TouchableOpacity
                accessible={false}
                activeOpacity={0.95}
                onPress={onToggleFlip}
                style={{flexGrow: 1, justifyContent: 'center'}}
              >
                <Text
                  style={{
                    fontFamily: SkillFonts.semibold,
                    fontSize: 24,
                    lineHeight: 32,
                    color: p.text,
                  }}
                >
                  {frontText}
                </Text>
              </TouchableOpacity>
            </ScrollView>
            <View style={ui.between}>
              <View style={[ui.row, {gap: 6}]}>
                <RotateCw size={14} color={p.muted} />
                <Text
                  style={{
                    fontFamily: SkillFonts.body,
                    fontSize: 13,
                    color: p.muted,
                  }}
                >
                  Tap card to reveal answer
                </Text>
              </View>
              {frontText.length > 140 && (
                <Text
                  style={{
                    fontFamily: SkillFonts.body,
                    fontSize: 11,
                    color: p.muted,
                  }}
                >
                  Scroll
                </Text>
              )}
            </View>
          </Animated.View>
          <Animated.View
            pointerEvents={flipped ? 'auto' : 'none'}
            accessibilityElementsHidden={!flipped}
            importantForAccessibility={flipped ? 'auto' : 'no-hide-descendants'}
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: flipped ? 2 : 1,
              opacity: backOpacity,
              borderRadius: 26,
              backgroundColor: p.answerCardBg,
              borderWidth: 1,
              borderColor: p.isDarkMode ? p.accent : 'rgba(255,255,255,0.16)',
              padding: 22,
              transform: backTransform,
              justifyContent: 'space-between',
            }}
          >
            <View style={{gap: 6}}>
              <View style={ui.between}>
                <Text
                  style={{
                    fontFamily: SkillFonts.semibold,
                    fontSize: 12,
                    letterSpacing: 1.2,
                    color: '#FFFFFF',
                  }}
                >
                  {backLabel}
                </Text>
                <Text
                  style={{
                    fontFamily: SkillFonts.body,
                    fontSize: 12,
                    color: 'rgba(255,255,255,0.75)',
                  }}
                >
                  Tap to flip back
                </Text>
              </View>
              <Text
                numberOfLines={2}
                style={{
                  fontFamily: SkillFonts.body,
                  fontSize: 13,
                  lineHeight: 18,
                  color: 'rgba(255,255,255,0.72)',
                }}
              >
                {backPromptPrefix}: {frontText}
              </Text>
            </View>
            <ScrollView
              style={ui.fill}
              contentContainerStyle={{
                flexGrow: 1,
                justifyContent: 'center',
                paddingVertical: 12,
              }}
              nestedScrollEnabled
            >
              <TouchableOpacity
                accessible={false}
                activeOpacity={0.95}
                onPress={onToggleFlip}
                style={{flexGrow: 1, justifyContent: 'center'}}
              >
                <Text
                  style={{
                    fontFamily: SkillFonts.semibold,
                    fontSize: 21,
                    lineHeight: 30,
                    color: '#FFFFFF',
                  }}
                >
                  {backText}
                </Text>
              </TouchableOpacity>
            </ScrollView>
            {(resolvedSourceLabel || activeSourceNoteId) &&
              (activeSourceNoteId && onOpenNote ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`Open source note ${
                    resolvedSourceLabel || ''
                  }`}
                  onPress={() => onOpenNote(activeSourceNoteId)}
                  style={{minHeight: 32, justifyContent: 'center'}}
                >
                  <Text
                    numberOfLines={1}
                    style={{
                      fontFamily: SkillFonts.medium,
                      fontSize: 12,
                      color: 'rgba(255,255,255,0.9)',
                      textDecorationLine: 'underline',
                    }}
                  >
                    From: {resolvedSourceLabel || 'Open source note'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <Text
                  numberOfLines={1}
                  style={{
                    fontFamily: SkillFonts.body,
                    fontSize: 12,
                    color: 'rgba(255,255,255,0.82)',
                  }}
                >
                  From: {resolvedSourceLabel}
                </Text>
              ))}
          </Animated.View>
        </View>
      </TouchableOpacity>

      <View>
        {flipped ? (
          <View style={{gap: 8}}>
            <SkillText muted size={13} center>
              How well did you remember?
            </SkillText>
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              {(['Again', 'Hard', 'Good', 'Easy'] as Rating[]).map(r => {
                const tone = ratingThemes[r];
                const intervalLabel = previewCardInterval(activeCard, r, {
                  practice: practiceMode,
                  isRetry,
                  now,
                });
                return (
                  <TouchableOpacity
                    key={r}
                    accessibilityRole="button"
                    accessibilityLabel={r}
                    accessibilityHint={`Next review: ${intervalLabel}`}
                    onPress={() => {
                      void stopAloud();
                      onRate(r);
                    }}
                    style={[
                      useTwoByTwo
                        ? {width: '48%', flexGrow: 1}
                        : {flex: 1, minWidth: 72},
                      {
                        minHeight: 58,
                        borderRadius: 16,
                        paddingHorizontal: 8,
                        paddingVertical: 10,
                        justifyContent: 'center',
                        alignItems: 'center',
                        backgroundColor: tone.bg,
                        borderWidth: 1,
                        borderColor: tone.border,
                        gap: 2,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        fontFamily: SkillFonts.semibold,
                        fontSize: 14,
                        color: tone.ink,
                        textAlign: 'center',
                      }}
                    >
                      {r}
                    </Text>
                    <Text
                      style={{
                        fontFamily: SkillFonts.body,
                        fontSize: 11,
                        color: tone.ink,
                        textAlign: 'center',
                      }}
                    >
                      {intervalLabel}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ) : (
          <SkillButton
            label="Reveal answer"
            onPress={() => onSetFlipped(true)}
          />
        )}

        {!!retryCapNotice && (
          <SkillText muted size={12} center>
            {retryCapNotice}
          </SkillText>
        )}
        {!!ttsNotice && (
          <SkillText muted size={12} center>
            {ttsNotice}
          </SkillText>
        )}
        {!!error && <SkillText danger>{error}</SkillText>}

        <View style={[ui.between, {marginTop: 6}]}>
          {historyLength > 0 ? (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Undo last rating"
              onPress={() => {
                void stopAloud();
                onUndo();
              }}
              style={{
                minHeight: 44,
                justifyContent: 'center',
                paddingRight: 12,
              }}
            >
              <SkillText strong size={13}>
                Undo last
              </SkillText>
            </TouchableOpacity>
          ) : (
            <View />
          )}
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="End study session"
            onPress={() => {
              void stopAloud();
              onEndSession();
            }}
            style={{minHeight: 44, justifyContent: 'center', paddingLeft: 12}}
          >
            <SkillText muted size={13}>
              End study session
            </SkillText>
          </TouchableOpacity>
        </View>
      </View>

      <Modal
        visible={editModalVisible}
        transparent
        animationType="none"
        onRequestClose={() => onSetEditModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{
            flex: 1,
            justifyContent: 'center',
            padding: 20,
            backgroundColor: '#00000088',
          }}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={{maxHeight: '85%'}}
            contentContainerStyle={{flexGrow: 1, justifyContent: 'center'}}
          >
            <SkillCard style={{backgroundColor: p.card}}>
              <SkillText strong size={18}>
                Edit card
              </SkillText>
              <SkillInput
                label="Edit active question"
                value={editQuestion}
                onChangeText={setEditQuestion}
                multiline
                maxLength={2000}
              />
              <SkillInput
                label="Edit active answer"
                value={editAnswer}
                onChangeText={setEditAnswer}
                multiline
                maxLength={5000}
              />
              {!!error && <SkillText danger>{error}</SkillText>}
              <View style={ui.row}>
                <View style={ui.fill}>
                  <SkillButton
                    label="Save changes"
                    onPress={() => {
                      if (
                        onEditCardInSession(
                          activeCard.id,
                          editQuestion,
                          editAnswer,
                        )
                      ) {
                        onSetEditModalVisible(false);
                      }
                    }}
                  />
                </View>
                <View style={ui.fill}>
                  <SkillButton
                    secondary
                    label="Cancel"
                    onPress={() => onSetEditModalVisible(false)}
                  />
                </View>
              </View>
            </SkillCard>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
