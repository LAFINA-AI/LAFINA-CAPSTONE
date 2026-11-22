import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {ArrowLeft} from 'lucide-react-native';
import {cardsFromSource} from '../../../skills/studyAi';
import {
  addDeck,
  buildQuizSourceFromDeck,
  mutateDecks,
  readDecks,
  subscribeDecks,
} from '../../../skills/studyDecks';
import {useStudyJob} from '../../../skills/studyJobs';
import {
  formatNextDueIn,
  getDeckStats,
  scheduleCard,
  type Deck,
  type Rating,
  type StudyCard,
} from '../../../skills/studyLogic';
import {generateId} from '../../../utils';
import {useScreenActive} from '../../navigation/RetainedTab';
import {useSkillsPalette} from '../../theme/skills';
import {
  Choices,
  Entry,
  SkillButton,
  SkillCard,
  SkillInput,
  SkillText,
  ui,
} from './SkillUI';
import {SourcePicker, type SkillSource} from './SourcePicker';
import {StudyDeckDetail} from './StudyDeckDetail';
import {StudySessionView} from './StudySessionView';
import type {SkillLaunchRequest} from '../../../skills/skillLaunch';

const MAX_REQUEUES_PER_CARD = 2;

interface StudyHistoryEntry {
  prevCard: StudyCard;
  prevIndex: number;
  prevRatingsLength: number;
  prevMissedIds: string[];
  requeuedCardId: string | null;
  prevRequeueCount: number;
  prevRetryCapNotice: string;
}

export function FlashcardsSkill({
  userId,
  onQuiz,
  onBack,
  onOpenNote,
  initialDeckId,
  onInitialDeckConsumed,
  initialMaterialId,
  launch,
  onLaunchHandled,
}: {
  userId: string;
  onQuiz: (payload?: {deck?: Deck; source?: SkillSource}) => void;
  onBack?: () => void;
  onOpenNote?: (noteId: string) => void;
  initialDeckId?: string | null;
  onInitialDeckConsumed?: () => void;
  initialMaterialId?: string;
  /** LAFINA opened Flashcards (ADR-041): "create" opens the AI maker. */
  launch?: SkillLaunchRequest | null;
  onLaunchHandled?: (id: string) => void;
}) {
  const p = useSkillsPalette();
  const active = useScreenActive();

  const [decks, setDecks] = useState<Deck[]>(() => readDecks(userId));
  const [now, setNow] = useState(() => Date.now());
  const [deckQuery, setDeckQuery] = useState('');
  const [sortBy, setSortBy] = useState<'Due first' | 'Newest' | 'A–Z'>(
    'Due first',
  );
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [studyDeckId, setStudyDeckId] = useState<string | null>(null);
  const [creatingDeckId, setCreatingDeckId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [addedNotice, setAddedNotice] = useState('');
  const [bannerNotice, setBannerNotice] = useState('');
  const [method, setMethod] = useState<'Manual' | 'Generate with AI'>('Manual');
  const [aiCount, setAiCount] = useState<'6' | '12' | '20'>('12');
  const [source, setSource] = useState<SkillSource>({text: '', label: ''});
  const [error, setError] = useState('');

  const [queue, setQueue] = useState<StudyCard[]>([]);
  const [index, setIndex] = useState(0);
  const [studying, setStudying] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [practiceMode, setPracticeMode] = useState(false);
  const [swapped, setSwapped] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [missedIds, setMissedIds] = useState<string[]>([]);
  const [history, setHistory] = useState<StudyHistoryEntry[]>([]);
  const [requeuedCounts, setRequeuedCounts] = useState<Record<string, number>>(
    {},
  );
  const [uniqueCardCount, setUniqueCardCount] = useState(0);
  const [retryCapNotice, setRetryCapNotice] = useState('');

  const job = useStudyJob<Deck>(userId, 'flashcards');
  const summaryCardsJob = useStudyJob<{deckTitle: string; sourceText: string}>(
    userId,
    'summary-cards',
  );
  const {result: completedDeck, consume, clearError} = job;
  const {result: completedSummaryDeck} = summaryCardsJob;
  const questionInputRef = useRef<TextInput>(null);
  const prevUserId = useRef(userId);

  useEffect(() => {
    setDecks(readDecks(userId));
    setNow(Date.now());
    if (prevUserId.current !== userId) {
      prevUserId.current = userId;
      setSelectedDeckId(null);
      setStudyDeckId(null);
      setCreatingDeckId(null);
      setCreating(false);
      setStudying(false);
      setQueue([]);
      setIndex(0);
      setFlipped(false);
      setPracticeMode(false);
      setSwapped(false);
      setEditModalVisible(false);
      setRatings([]);
      setMissedIds([]);
      setHistory([]);
      setRequeuedCounts({});
      setUniqueCardCount(0);
      setRetryCapNotice('');
      setDeckQuery('');
      setTitle('');
      setQuestion('');
      setAnswer('');
      setAddedNotice('');
      setBannerNotice('');
      setSource({text: '', label: ''});
      setError('');
    }
    return subscribeDecks(userId, () => {
      setDecks(readDecks(userId));
      setNow(Date.now());
    });
  }, [userId]);

  const handledLaunchRef = useRef<string | null>(null);
  useEffect(() => {
    if (!launch || handledLaunchRef.current === launch.id) return;
    handledLaunchRef.current = launch.id;
    onLaunchHandled?.(launch.id);
    if (launch.action !== 'create') return;
    // Ready for the student's material; nothing is generated until they tap.
    setStudying(false);
    setSelectedDeckId(null);
    setStudyDeckId(null);
    setCreatingDeckId(null);
    setCreating(true);
    setMethod('Generate with AI');
    if (launch.count)
      setAiCount(launch.count <= 8 ? '6' : launch.count <= 15 ? '12' : '20');
    // Runs once per launch id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launch]);

  const handledMaterialRef = useRef<string | null>(null);
  useEffect(() => {
    if (!initialMaterialId) return;
    const key = `${userId}:${initialMaterialId}`;
    if (handledMaterialRef.current === key) return;
    handledMaterialRef.current = key;
    setStudying(false);
    setSelectedDeckId(null);
    setStudyDeckId(null);
    setCreatingDeckId(null);
    setCreating(true);
    setMethod('Generate with AI');
  }, [initialMaterialId, userId]);

  useEffect(() => {
    if (completedSummaryDeck) {
      setDecks(readDecks(userId));
      setNow(Date.now());
    }
  }, [completedSummaryDeck, userId]);

  useEffect(() => {
    if (!initialDeckId) return;
    const target = readDecks(userId).find(d => d.id === initialDeckId);
    if (target) {
      setSelectedDeckId(target.id);
      setCreating(false);
      setCreatingDeckId(null);
      setStudying(false);
      setStudyDeckId(null);
      setError('');
    }
    onInitialDeckConsumed?.();
  }, [initialDeckId, onInitialDeckConsumed, userId]);

  useEffect(() => {
    if (completedDeck) {
      setDecks(readDecks(userId));
      setNow(Date.now());
      setCreating(false);
      setCreatingDeckId(null);
      setSelectedDeckId(completedDeck.id);
      setTitle('');
      setQuestion('');
      setAnswer('');
      setAddedNotice('');
      setSource({text: '', label: ''});
      setError('');
      setBannerNotice(
        `Created ${completedDeck.cards.length} ${
          completedDeck.cards.length === 1 ? 'card' : 'cards'
        } in ${completedDeck.title}.`,
      );
      consume();
    }
  }, [completedDeck, consume, userId]);

  useEffect(() => {
    if (active) {
      setNow(Date.now());
    }
  }, [active]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') {
        setNow(Date.now());
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!active) return;
    const checkTime = Date.now();
    const hasNearDue = decks.some(d =>
      d.cards.some(c => c.dueAt > checkTime && c.dueAt <= checkTime + 3600000),
    );
    if (!hasNearDue) return;
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, [active, decks]);

  const studyDeck = decks.find(d => d.id === studyDeckId);
  const selectedDeck = decks.find(d => d.id === selectedDeckId);
  const creatingDeck = decks.find(d => d.id === creatingDeckId);

  const beginStudyQueue = useCallback(
    (d: Deck, cardsToStudy: StudyCard[], practice = false) => {
      setStudyDeckId(d.id);
      setSelectedDeckId(null);
      setCreating(false);
      setCreatingDeckId(null);
      setQueue(cardsToStudy);
      setIndex(0);
      setRatings([]);
      setMissedIds([]);
      setHistory([]);
      setRequeuedCounts({});
      setUniqueCardCount(new Set(cardsToStudy.map(c => c.id)).size);
      setFlipped(false);
      setPracticeMode(practice);
      setSwapped(false);
      setEditModalVisible(false);
      setRetryCapNotice('');
      setStudying(true);
      setAddedNotice('');
      setBannerNotice('');
      setError('');
    },
    [],
  );

  const start = useCallback(
    (d: Deck, all = false) => {
      const currentNow = Date.now();
      setNow(currentNow);
      const due = all ? d.cards : d.cards.filter(c => c.dueAt <= currentNow);
      beginStudyQueue(d, due, all);
    },
    [beginStudyQueue],
  );

  const endSession = useCallback(() => {
    setStudying(false);
    setFlipped(false);
    setStudyDeckId(null);
    setSelectedDeckId(null);
    setPracticeMode(false);
    setSwapped(false);
    setEditModalVisible(false);
    setRetryCapNotice('');
    setHistory([]);
    setError('');
    setNow(Date.now());
  }, []);

  const closeCreateFlow = useCallback(() => {
    setCreating(false);
    setCreatingDeckId(null);
    setQuestion('');
    setAnswer('');
    setSource({text: '', label: ''});
    setAddedNotice('');
    setError('');
    clearError();
  }, [clearError]);

  const handleStepBack = useCallback((): boolean => {
    if (studying) {
      if (editModalVisible) {
        setEditModalVisible(false);
        return true;
      }
      endSession();
      return true;
    }
    if (creating) {
      if (
        method === 'Manual' &&
        (question.trim().length > 0 || answer.trim().length > 0)
      ) {
        Alert.alert(
          'Discard unsaved card?',
          'You have unsaved text in your card draft.',
          [
            {text: 'Keep editing', style: 'cancel'},
            {
              text: 'Discard',
              style: 'destructive',
              onPress: closeCreateFlow,
            },
          ],
        );
        return true;
      }
      closeCreateFlow();
      return true;
    }
    if (selectedDeck) {
      setSelectedDeckId(null);
      setBannerNotice('');
      setError('');
      return true;
    }
    if (onBack) {
      onBack();
      return true;
    }
    return false;
  }, [
    answer,
    closeCreateFlow,
    creating,
    editModalVisible,
    endSession,
    method,
    onBack,
    question,
    selectedDeck,
    studying,
  ]);

  const handleStepBackRef = useRef(handleStepBack);
  handleStepBackRef.current = handleStepBack;

  useEffect(() => {
    if (!active) return;
    if (!onBack && !studying && !creating && !selectedDeck) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () =>
      handleStepBackRef.current(),
    );
    return () => sub.remove();
  }, [active, creating, onBack, selectedDeck, studying]);

  const openCreateDeck = () => {
    setCreatingDeckId(null);
    setSelectedDeckId(null);
    setTitle('');
    setQuestion('');
    setAnswer('');
    setAddedNotice('');
    setBannerNotice('');
    setSource({text: '', label: ''});
    setError('');
    clearError();
    setCreating(true);
  };

  const openAddCards = (d: Deck) => {
    setCreatingDeckId(d.id);
    setTitle(d.title);
    setQuestion('');
    setAnswer('');
    setAddedNotice('');
    setBannerNotice('');
    setSource({text: '', label: ''});
    setError('');
    clearError();
    setCreating(true);
  };

  const add = (keepOpen = false) => {
    if (job.busy) return;
    setError('');
    clearError();
    setAddedNotice('');
    const targetDeck = creatingDeck;
    if (method === 'Manual') {
      if (!title.trim() && !targetDeck) {
        setError('Give your deck a name.');
        return;
      }
      if (!question.trim() || !answer.trim()) {
        setError('Write both a question and an answer.');
        return;
      }
      const card: StudyCard = {
        id: generateId('card'),
        question: question.trim(),
        answer: answer.trim(),
        intervalDays: 0,
        ease: 2.5,
        dueAt: Date.now(),
        reviews: 0,
      };
      try {
        let totalInDeck = 1;
        if (targetDeck) {
          const next = mutateDecks(userId, latest =>
            latest.map(d =>
              d.id === targetDeck.id ? {...d, cards: [...d.cards, card]} : d,
            ),
          );
          setDecks(next);
          totalInDeck =
            next.find(d => d.id === targetDeck.id)?.cards.length ?? 1;
        } else {
          const created: Deck = {
            id: generateId('deck'),
            title: title.trim(),
            cards: [card],
            createdAt: new Date().toISOString(),
          };
          const next = addDeck(userId, created);
          setDecks(next);
          setCreatingDeckId(created.id);
          setTitle(created.title);
        }
        setQuestion('');
        setAnswer('');
        if (keepOpen) {
          setAddedNotice(
            `Card saved! ${totalInDeck} ${
              totalInDeck === 1 ? 'card' : 'cards'
            } in deck.`,
          );
          questionInputRef.current?.focus();
        } else {
          setTitle('');
          setCreatingDeckId(null);
          setCreating(false);
        }
      } catch (e) {
        setError((e as Error).message);
      }
      return;
    }

    if (!source.text.trim()) {
      setError('Choose a source or paste some text first.');
      return;
    }
    const resolvedTitle =
      title.trim() || source.label.trim() || 'Study flashcards';
    const capturedSource = source;
    const capturedTargetDeckId = targetDeck?.id ?? null;
    const capturedCount = Number(aiCount);

    void job.run(async ({isCancelled, signal}) => {
      const cards = await cardsFromSource(
        userId,
        capturedSource.text,
        capturedCount,
        {
          isCancelled,
          signal,
          onProgress: (done, total) =>
            job.setProgress(
              done,
              total > 1
                ? `Creating cards (part ${done} of ${total})…`
                : 'Creating cards…',
            ),
        },
      );
      if (isCancelled()) {
        throw new Error('Cancelled');
      }
      const trimmedLabel = capturedSource.label.trim();
      const enriched = cards.map(c => ({
        ...c,
        ...(capturedSource.noteId ? {sourceNoteId: capturedSource.noteId} : {}),
        ...(trimmedLabel ? {sourceLabel: trimmedLabel} : {}),
      }));
      if (capturedTargetDeckId) {
        const latestDecks = readDecks(userId);
        if (latestDecks.some(d => d.id === capturedTargetDeckId)) {
          const nextDecks = mutateDecks(userId, latest =>
            latest.map(d =>
              d.id === capturedTargetDeckId
                ? {...d, cards: [...d.cards, ...enriched]}
                : d,
            ),
          );
          const updated = nextDecks.find(d => d.id === capturedTargetDeckId);
          if (updated) return updated;
        }
      }
      const created: Deck = {
        id: generateId('deck'),
        title: resolvedTitle,
        cards: enriched,
        createdAt: new Date().toISOString(),
      };
      addDeck(userId, created);
      return created;
    });
  };

  const rate = (rating: Rating) => {
    const activeCard = queue[index];
    if (!studyDeck || !activeCard || !flipped) return;
    try {
      const repeats = requeuedCounts[activeCard.id] ?? 0;
      const isRetry = repeats > 0;
      const updated = scheduleCard(activeCard, rating, Date.now(), {
        practice: practiceMode,
        isRetry,
      });
      const nextDecks = mutateDecks(userId, latest =>
        latest.map(d =>
          d.id === studyDeck.id
            ? {
                ...d,
                cards: d.cards.map(c => (c.id === updated.id ? updated : c)),
              }
            : d,
        ),
      );
      setDecks(nextDecks);
      const shouldRequeue =
        rating === 'Again' && repeats < MAX_REQUEUES_PER_CARD;
      setHistory(prev => [
        ...prev,
        {
          prevCard: activeCard,
          prevIndex: index,
          prevRatingsLength: ratings.length,
          prevMissedIds: missedIds,
          requeuedCardId: shouldRequeue ? updated.id : null,
          prevRequeueCount: repeats,
          prevRetryCapNotice: retryCapNotice,
        },
      ]);
      setRatings(prev => [...prev, rating]);
      if (rating === 'Again' || rating === 'Hard') {
        setMissedIds(prev =>
          prev.includes(activeCard.id) ? prev : [...prev, activeCard.id],
        );
      }
      if (shouldRequeue) {
        setQueue(prev => [...prev, updated]);
        setRequeuedCounts(prev => ({
          ...prev,
          [activeCard.id]: repeats + 1,
        }));
        setRetryCapNotice('');
      } else if (rating === 'Again') {
        setRetryCapNotice(
          'Max retries reached for this card in this session — review it again in missed cards.',
        );
      } else {
        setRetryCapNotice('');
      }
      setIndex(prev => prev + 1);
      setFlipped(false);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const undoLastRating = () => {
    if (!studyDeck || !history.length) return;
    const last = history[history.length - 1];
    try {
      const nextDecks = mutateDecks(userId, latest =>
        latest.map(d =>
          d.id === studyDeck.id
            ? {
                ...d,
                cards: d.cards.map(c =>
                  c.id === last.prevCard.id ? last.prevCard : c,
                ),
              }
            : d,
        ),
      );
      setDecks(nextDecks);
      if (last.requeuedCardId) {
        const targetId = last.requeuedCardId;
        setQueue(prev => {
          const removeAt = prev.map(c => c.id).lastIndexOf(targetId);
          if (removeAt < 0) return prev;
          return [...prev.slice(0, removeAt), ...prev.slice(removeAt + 1)];
        });
        setRequeuedCounts(prev => ({
          ...prev,
          [last.prevCard.id]: last.prevRequeueCount,
        }));
      }
      setRatings(prev => prev.slice(0, last.prevRatingsLength));
      setMissedIds(last.prevMissedIds);
      setRetryCapNotice(last.prevRetryCapNotice);
      setHistory(prev => prev.slice(0, -1));
      setIndex(last.prevIndex);
      setFlipped(true);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const shuffleRemaining = () => {
    if (queue.length - index <= 1) return;
    const head = queue.slice(0, index);
    const tail = [...queue.slice(index)];
    for (let i = tail.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [tail[i], tail[j]] = [tail[j], tail[i]];
    }
    setQueue([...head, ...tail]);
    setFlipped(false);
  };

  const editCardInDeck = (
    targetDeckId: string,
    cardId: string,
    rawQ: string,
    rawA: string,
  ): boolean => {
    const q = rawQ.trim();
    const a = rawA.trim();
    if (!q || !a) {
      setError('Write both a question and an answer.');
      return false;
    }
    try {
      const nextDecks = mutateDecks(userId, latest =>
        latest.map(d =>
          d.id === targetDeckId
            ? {
                ...d,
                cards: d.cards.map(c =>
                  c.id === cardId ? {...c, question: q, answer: a} : c,
                ),
              }
            : d,
        ),
      );
      setDecks(nextDecks);
      setQueue(prev =>
        prev.map(c => (c.id === cardId ? {...c, question: q, answer: a} : c)),
      );
      setHistory(prev =>
        prev.map(entry =>
          entry.prevCard.id === cardId
            ? {...entry, prevCard: {...entry.prevCard, question: q, answer: a}}
            : entry,
        ),
      );
      setError('');
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  };

  const deleteCard = (targetDeckId: string, cardId: string) => {
    try {
      const nextDecks = mutateDecks(userId, latest =>
        latest.map(d =>
          d.id === targetDeckId
            ? {...d, cards: d.cards.filter(c => c.id !== cardId)}
            : d,
        ),
      );
      setDecks(nextDecks);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const renameDeck = (targetDeckId: string, rawTitle: string): boolean => {
    const nextTitle = rawTitle.trim();
    if (!nextTitle) {
      setError('Give your deck a name.');
      return false;
    }
    try {
      const nextDecks = mutateDecks(userId, latest =>
        latest.map(d => (d.id === targetDeckId ? {...d, title: nextTitle} : d)),
      );
      setDecks(nextDecks);
      setError('');
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  };

  const deleteDeck = (targetDeck: Deck) => {
    try {
      const nextDecks = mutateDecks(userId, latest =>
        latest.filter(d => d.id !== targetDeck.id),
      );
      setDecks(nextDecks);
      if (selectedDeckId === targetDeck.id) setSelectedDeckId(null);
      if (studyDeckId === targetDeck.id) setStudyDeckId(null);
      if (creatingDeckId === targetDeck.id) setCreatingDeckId(null);
      setBannerNotice('');
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const headerTitle = studying
    ? studyDeck?.title ?? 'Flashcards'
    : creating
    ? creatingDeck
      ? 'Add cards'
      : 'Create a deck'
    : selectedDeck
    ? selectedDeck.title
    : 'Flashcards';

  const showBackButton =
    studying || creating || Boolean(selectedDeck) || Boolean(onBack);

  const normalizedDeckQuery = deckQuery.trim().toLowerCase();
  const visibleDecks = [...decks]
    .filter(
      d =>
        !normalizedDeckQuery ||
        d.title.toLowerCase().includes(normalizedDeckQuery),
    )
    .sort((a, b) => {
      if (sortBy === 'A–Z') return a.title.localeCompare(b.title);
      if (sortBy === 'Newest') return b.createdAt.localeCompare(a.createdAt);
      const aDue = getDeckStats(a, now).due > 0 ? 1 : 0;
      const bDue = getDeckStats(b, now).due > 0 ? 1 : 0;
      return bDue - aDue || b.createdAt.localeCompare(a.createdAt);
    });

  const totalDue = decks.reduce((sum, d) => sum + getDeckStats(d, now).due, 0);
  const creatingDeckStats = creatingDeck
    ? getDeckStats(creatingDeck, now)
    : null;

  return (
    <View style={[ui.fill, {backgroundColor: p.bg}]}>
      <View style={ui.header}>
        {showBackButton && (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={
              studying || creating || selectedDeck
                ? 'Back to decks'
                : 'Back to Skills'
            }
            onPress={() => {
              void handleStepBack();
            }}
            style={ui.icon}
          >
            <ArrowLeft size={24} color={p.text} />
          </TouchableOpacity>
        )}
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          style={[
            ui.pageTitle,
            {color: p.text, paddingLeft: showBackButton ? 0 : 12},
          ]}
        >
          {headerTitle}
        </Text>
        {studying && queue[index] && (
          <View style={{paddingRight: 12}}>
            <SkillText muted>
              {index + 1} / {queue.length}
            </SkillText>
          </View>
        )}
      </View>

      {studying ? (
        <StudySessionView
          userId={userId}
          deck={studyDeck}
          queue={queue}
          index={index}
          flipped={flipped}
          practiceMode={practiceMode}
          swapped={swapped}
          ratings={ratings}
          missedIds={missedIds}
          historyLength={history.length}
          requeuedCounts={requeuedCounts}
          uniqueCardCount={uniqueCardCount}
          retryCapNotice={retryCapNotice}
          error={error}
          onToggleFlip={() => setFlipped(prev => !prev)}
          onSetFlipped={setFlipped}
          onRate={rate}
          onUndo={undoLastRating}
          onShuffle={shuffleRemaining}
          onToggleSwap={() => setSwapped(prev => !prev)}
          onEditCardInSession={(cardId, q, a) =>
            studyDeck ? editCardInDeck(studyDeck.id, cardId, q, a) : false
          }
          onReviewMissed={(d, cards) => beginStudyQueue(d, cards, false)}
          onStudyAgain={d => start(d, true)}
          onQuiz={d => onQuiz({deck: d, source: buildQuizSourceFromDeck(d)})}
          onEndSession={endSession}
          onOpenNote={onOpenNote}
          editModalVisible={editModalVisible}
          onSetEditModalVisible={setEditModalVisible}
        />
      ) : creating ? (
        <KeyboardAvoidingView
          style={ui.fill}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={ui.content}
          >
            <Entry>
              <View style={ui.section}>
                <SkillText strong size={20}>
                  {creatingDeck
                    ? `Add cards · ${creatingDeck.title}`
                    : 'Create a deck'}
                </SkillText>
                {creatingDeck && (
                  <SkillText muted size={13}>
                    {creatingDeck.cards.length}{' '}
                    {creatingDeck.cards.length === 1 ? 'card' : 'cards'} in this
                    deck
                  </SkillText>
                )}
              </View>
              {!creatingDeck && (
                <SkillInput
                  label={
                    method === 'Generate with AI'
                      ? 'Deck name (optional)'
                      : 'Deck name'
                  }
                  placeholder={
                    method === 'Generate with AI' && source.label
                      ? source.label
                      : 'e.g. Biology Midterm'
                  }
                  value={title}
                  onChangeText={setTitle}
                  maxLength={120}
                />
              )}
              <Choices
                label="Create cards"
                values={['Manual', 'Generate with AI'] as const}
                value={method}
                onChange={m => {
                  setMethod(m);
                  setError('');
                  clearError();
                  setAddedNotice('');
                }}
              />
              {method === 'Manual' ? (
                <>
                  <View style={ui.field}>
                    <SkillText size={13} strong>
                      Question
                    </SkillText>
                    <TextInput
                      ref={questionInputRef}
                      accessibilityLabel="Question"
                      placeholderTextColor={p.muted}
                      value={question}
                      onChangeText={setQuestion}
                      multiline
                      maxLength={2000}
                      style={[
                        ui.input,
                        {
                          color: p.text,
                          backgroundColor: p.card,
                          borderColor: p.border,
                        },
                      ]}
                    />
                    {question.length > 1600 && (
                      <SkillText muted size={11}>
                        {question.length} / 2000
                      </SkillText>
                    )}
                  </View>
                  <SkillInput
                    label="Answer"
                    value={answer}
                    onChangeText={setAnswer}
                    multiline
                    maxLength={5000}
                  />
                  {answer.length > 4000 && (
                    <SkillText muted size={11}>
                      {answer.length} / 5000
                    </SkillText>
                  )}
                  {!!addedNotice && <SkillText strong>{addedNotice}</SkillText>}
                  <SkillButton
                    disabled={job.busy}
                    label="Save card"
                    onPress={() => add(false)}
                  />
                  <SkillButton
                    secondary
                    disabled={job.busy}
                    label="Save & add another"
                    onPress={() => add(true)}
                  />
                  {creatingDeck && creatingDeck.cards.length > 0 && (
                    <SkillButton
                      secondary
                      label="Study deck"
                      onPress={() =>
                        start(creatingDeck, (creatingDeckStats?.due ?? 0) === 0)
                      }
                    />
                  )}
                </>
              ) : (
                <>
                  <SourcePicker
                    userId={userId}
                    source={source}
                    onChange={setSource}
                    initialMaterialId={initialMaterialId}
                  />
                  <Choices
                    label="Cards"
                    values={['6', '12', '20'] as const}
                    value={aiCount}
                    onChange={setAiCount}
                  />
                  <SkillButton
                    disabled={job.busy}
                    label={
                      job.busy
                        ? job.statusText || 'Creating cards…'
                        : 'Create with LAFINA'
                    }
                    onPress={() => add(false)}
                  />
                  {job.busy && (
                    <SkillCard>
                      <View style={ui.row}>
                        <ActivityIndicator color={p.accent} />
                        <View style={ui.fill}>
                          <SkillText strong>
                            {job.statusText || 'Creating flashcards…'}
                          </SkillText>
                          <SkillText muted size={12}>
                            You can leave this page or cancel anytime.
                          </SkillText>
                        </View>
                      </View>
                      <SkillButton
                        secondary
                        label="Cancel generation"
                        onPress={job.cancel}
                      />
                    </SkillCard>
                  )}
                </>
              )}
              <SkillButton
                secondary
                label={addedNotice ? 'Done' : 'Cancel'}
                disabled={job.busy}
                onPress={() => {
                  void handleStepBack();
                }}
              />
              {!!job.error && (
                <SkillCard style={{borderColor: p.danger}}>
                  <SkillText danger>{job.error}</SkillText>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Dismiss error"
                    onPress={clearError}
                    style={{minHeight: 44, justifyContent: 'center'}}
                  >
                    <SkillText strong size={12}>
                      Dismiss
                    </SkillText>
                  </TouchableOpacity>
                </SkillCard>
              )}
              {!!error && <SkillText danger>{error}</SkillText>}
            </Entry>
          </ScrollView>
        </KeyboardAvoidingView>
      ) : selectedDeck ? (
        <StudyDeckDetail
          deck={selectedDeck}
          now={now}
          error={error}
          notice={bannerNotice}
          onClearError={() => setError('')}
          onClearNotice={() => setBannerNotice('')}
          onStudy={start}
          onAddCards={openAddCards}
          onRenameDeck={renameDeck}
          onEditCard={editCardInDeck}
          onDeleteCard={deleteCard}
          onDeleteDeck={deleteDeck}
          onBack={() => {
            setSelectedDeckId(null);
            setBannerNotice('');
            setError('');
          }}
          onOpenNote={onOpenNote}
        />
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={ui.content}
        >
          <Entry>
            <View style={ui.section}>
              <SkillText strong size={22}>
                Your decks
              </SkillText>
              <SkillText muted>
                {decks.length > 0
                  ? `${totalDue} due today · ${decks.length} ${
                      decks.length === 1 ? 'deck' : 'decks'
                    }`
                  : 'A little practice, a little more remembered.'}
              </SkillText>
              <SkillText muted size={12}>
                Saved on this device
              </SkillText>
            </View>
            <SkillButton label="Create a deck" onPress={openCreateDeck} />
            {(job.busy || summaryCardsJob.busy) && (
              <SkillCard>
                <View style={ui.row}>
                  <ActivityIndicator color={p.accent} />
                  <View style={ui.fill}>
                    <SkillText strong>
                      {job.busy
                        ? job.statusText || 'Creating flashcards…'
                        : 'Creating flashcards from summary…'}
                    </SkillText>
                    <SkillText muted size={12}>
                      You can leave this page. Your deck will appear here when
                      ready.
                    </SkillText>
                  </View>
                </View>
                {job.busy && (
                  <SkillButton
                    secondary
                    label="Cancel generation"
                    onPress={job.cancel}
                  />
                )}
              </SkillCard>
            )}
            {!!job.error && (
              <SkillCard style={{borderColor: p.danger}}>
                <View style={ui.between}>
                  <View style={ui.fill}>
                    <SkillText danger>{job.error}</SkillText>
                  </View>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Dismiss error"
                    onPress={clearError}
                    style={{
                      minHeight: 44,
                      justifyContent: 'center',
                      paddingLeft: 10,
                    }}
                  >
                    <SkillText strong size={12}>
                      Dismiss
                    </SkillText>
                  </TouchableOpacity>
                </View>
              </SkillCard>
            )}
            {!!error && <SkillText danger>{error}</SkillText>}
            {decks.length >= 2 && (
              <View style={{marginTop: 4}}>
                <SkillInput
                  label="Search decks"
                  placeholder="Filter by deck name…"
                  value={deckQuery}
                  onChangeText={setDeckQuery}
                  maxLength={120}
                />
                <Choices
                  label="Sort"
                  values={['Due first', 'Newest', 'A–Z'] as const}
                  value={sortBy}
                  onChange={setSortBy}
                />
              </View>
            )}
            {!decks.length && !job.busy && !summaryCardsJob.busy && (
              <SkillCard>
                <SkillText strong>No decks yet</SkillText>
                <SkillText muted>
                  Create your first card or turn your notes into a deck.
                </SkillText>
              </SkillCard>
            )}
            {decks.length > 0 && visibleDecks.length === 0 && (
              <SkillCard>
                <SkillText muted>No decks match this search.</SkillText>
              </SkillCard>
            )}
            {visibleDecks.map(d => {
              const stats = getDeckStats(d, now);
              const nextDueHint =
                stats.due === 0 ? formatNextDueIn(stats.nextDueAt, now) : null;
              return (
                <SkillCard key={d.id}>
                  <View style={ui.between}>
                    <View style={ui.fill}>
                      <SkillText strong size={17}>
                        {d.title}
                      </SkillText>
                    </View>
                    <SkillText muted size={12}>
                      {stats.total} {stats.total === 1 ? 'card' : 'cards'}
                    </SkillText>
                  </View>
                  <SkillText muted>
                    {stats.total === 0
                      ? 'No cards yet'
                      : stats.due > 0
                      ? `${stats.due} due today`
                      : 'All caught up today'}
                  </SkillText>
                  {!!nextDueHint && (
                    <SkillText muted size={12}>
                      {nextDueHint}
                    </SkillText>
                  )}
                  {stats.total > 0 && (
                    <View style={{gap: 4}}>
                      <View
                        style={{
                          height: 6,
                          borderRadius: 3,
                          overflow: 'hidden',
                          flexDirection: 'row',
                          backgroundColor: p.surface,
                        }}
                      >
                        {stats.masteredCount > 0 && (
                          <View
                            style={{
                              flex: stats.masteredCount,
                              backgroundColor: p.mintInk,
                            }}
                          />
                        )}
                        {stats.learningCount > 0 && (
                          <View
                            style={{
                              flex: stats.learningCount,
                              backgroundColor: p.accent,
                            }}
                          />
                        )}
                        {stats.newCount > 0 && (
                          <View
                            style={{
                              flex: stats.newCount,
                              backgroundColor: p.border,
                            }}
                          />
                        )}
                      </View>
                      <SkillText muted size={11}>
                        {stats.newCount} new · {stats.learningCount} learning ·{' '}
                        {stats.masteredCount} mastered
                      </SkillText>
                    </View>
                  )}
                  {stats.total === 0 ? (
                    <View style={ui.row}>
                      <View style={ui.fill}>
                        <SkillButton
                          label="Add cards"
                          onPress={() => openAddCards(d)}
                        />
                      </View>
                      <View style={ui.fill}>
                        <SkillButton
                          secondary
                          label="Manage cards"
                          onPress={() => {
                            setSelectedDeckId(d.id);
                            setBannerNotice('');
                            setError('');
                          }}
                        />
                      </View>
                    </View>
                  ) : stats.due > 0 ? (
                    <>
                      <View style={ui.row}>
                        <View style={ui.fill}>
                          <SkillButton
                            label="Study deck"
                            onPress={() => start(d, false)}
                          />
                        </View>
                        {stats.due < stats.total && (
                          <SkillButton
                            secondary
                            label={`Study all (${stats.total})`}
                            onPress={() => start(d, true)}
                          />
                        )}
                      </View>
                      <View style={ui.row}>
                        <View style={ui.fill}>
                          <SkillButton
                            secondary
                            label="Add cards"
                            onPress={() => openAddCards(d)}
                          />
                        </View>
                        <View style={ui.fill}>
                          <SkillButton
                            secondary
                            label="Manage cards"
                            onPress={() => {
                              setSelectedDeckId(d.id);
                              setBannerNotice('');
                              setError('');
                            }}
                          />
                        </View>
                      </View>
                    </>
                  ) : (
                    <>
                      <SkillButton
                        label="Study all cards"
                        onPress={() => start(d, true)}
                      />
                      <View style={ui.row}>
                        <View style={ui.fill}>
                          <SkillButton
                            secondary
                            label="Add cards"
                            onPress={() => openAddCards(d)}
                          />
                        </View>
                        <View style={ui.fill}>
                          <SkillButton
                            secondary
                            label="Manage cards"
                            onPress={() => {
                              setSelectedDeckId(d.id);
                              setBannerNotice('');
                              setError('');
                            }}
                          />
                        </View>
                      </View>
                    </>
                  )}
                </SkillCard>
              );
            })}
          </Entry>
        </ScrollView>
      )}
    </View>
  );
}
