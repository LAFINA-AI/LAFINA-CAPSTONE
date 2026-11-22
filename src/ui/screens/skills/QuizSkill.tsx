import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Clock,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react-native';
import {
  attributeQuestionsToNotes,
  buildOfflineQuizFromDeck,
  countAnswered,
  deleteQuizFromHistory,
  discardActiveQuiz,
  formatMistakeDeckTitle,
  parseDeckFromQuizSource,
  quizShortfall,
  readQuizStore,
  saveActiveQuiz,
  scoreQuiz,
  shuffleQuestionOptions,
  shuffleQuizForRetake,
} from '../../../skills/quizLogic';
import type {
  QuizMode,
  QuizQuestionType,
  QuizSession,
} from '../../../skills/quizLogic';
import {writeSkillState} from '../../../skills/skillsState';
import {addDeck} from '../../../skills/studyDecks';
import {quizFromSource} from '../../../skills/studyAi';
import {useStudyJob} from '../../../skills/studyJobs';
import type {Deck} from '../../../skills/studyLogic';
import {generateId} from '../../../utils';
import {SkillFonts, useSkillsPalette} from '../../theme/skills';
import {Choices, SkillButton, SkillCard, SkillText, ui} from './SkillUI';
import {SourcePicker} from './SourcePicker';
import type {SkillSource} from './SourcePicker';
import {SkillRing} from './SkillRing';
import type {SkillLaunchRequest} from '../../../skills/skillLaunch';

export interface QuizInitialHandoff {
  nonce: string;
  deck?: Deck;
  source?: SkillSource;
}

const QUESTION_TYPES: readonly QuizQuestionType[] = [
  'Multiple choice',
  'True / False',
  'Mixed',
];

const QUIZ_MODES: ReadonlyArray<{id: QuizMode; label: string}> = [
  {id: 'practice', label: 'Practice'},
  {id: 'exam', label: 'Exam'},
];

const LETTERS = ['A', 'B', 'C', 'D'] as const;

export function QuizSkill({
  userId,
  onFlashcards,
  onNote,
  initialHandoff,
  initialSource,
  initialMaterialId,
  onHandoffConsumed,
  onInitialSourceConsumed,
  launch,
  onLaunchHandled,
}: {
  userId: string;
  onFlashcards: () => void;
  onNote: (id: string) => void;
  initialHandoff?: QuizInitialHandoff | null;
  initialSource?: SkillSource | null;
  initialMaterialId?: string;
  onHandoffConsumed?: () => void;
  onInitialSourceConsumed?: () => void;
  /** LAFINA opened the Quiz maker (ADR-041). */
  launch?: SkillLaunchRequest | null;
  onLaunchHandled?: (id: string) => void;
}) {
  const p = useSkillsPalette();
  const [store, setStore] = useState(() => readQuizStore(userId));
  const session = store.active;
  const history = store.history;

  const [source, setSource] = useState<SkillSource>({text: '', label: ''});
  const [count, setCount] = useState<'5' | '10' | '20'>('10');
  const [type, setType] = useState<QuizQuestionType>('Multiple choice');
  const [mode, setMode] = useState<QuizMode>('practice');
  const [viewIndex, setViewIndex] = useState<number>(
    () => store.active?.index ?? 0,
  );
  const [reviewFilter, setReviewFilter] = useState<'missed' | 'all'>('missed');
  const [expandedQuotes, setExpandedQuotes] = useState<Record<number, boolean>>(
    {},
  );
  const [notice, setNotice] = useState<{text: string; danger?: boolean} | null>(
    null,
  );

  const job = useStudyJob<QuizSession>(userId, 'quiz');
  const {result: completed, consume} = job;

  const prevUserIdRef = useRef(userId);
  useEffect(() => {
    if (prevUserIdRef.current === userId) return;
    prevUserIdRef.current = userId;
    const fresh = readQuizStore(userId);
    setStore(fresh);
    setSource({text: '', label: ''});
    setViewIndex(fresh.active?.index ?? 0);
    setReviewFilter('missed');
    setExpandedQuotes({});
    setNotice(null);
  }, [userId]);

  useEffect(() => {
    if (completed) {
      const fresh = readQuizStore(userId);
      setStore(fresh);
      setViewIndex(0);
      setReviewFilter('missed');
      setExpandedQuotes({});
      setNotice(null);
      consume();
    }
  }, [completed, consume, userId]);

  const handledLaunchRef = useRef<string | null>(null);
  useEffect(() => {
    if (!launch || handledLaunchRef.current === launch.id) return;
    handledLaunchRef.current = launch.id;
    onLaunchHandled?.(launch.id);
    if (launch.count)
      setCount(launch.count <= 7 ? '5' : launch.count <= 15 ? '10' : '20');
    if (launch.action === 'create' && !launch.materialId)
      setNotice({
        text: launch.topic
          ? `Add your material on ${launch.topic}, then tap Make quiz.`
          : 'Add your material, then tap Make quiz.',
      });
    // Runs once per launch id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launch]);

  const handledHandoffRef = useRef<string | null>(null);
  useEffect(() => {
    if (!initialHandoff || handledHandoffRef.current === initialHandoff.nonce) {
      return;
    }
    handledHandoffRef.current = initialHandoff.nonce;
    try {
      const current = readQuizStore(userId);
      let nextHistory = current.history;
      if (
        current.active &&
        !current.active.isMissedDrill &&
        current.active.questions.length > 0 &&
        current.active.index < current.active.questions.length
      ) {
        const pausedPrev: QuizSession = {
          ...current.active,
          paused: true,
          updatedAt: new Date().toISOString(),
        };
        nextHistory = saveActiveQuiz(
          userId,
          pausedPrev,
          current.history,
        ).history;
      }

      if (initialHandoff.deck) {
        const deck = initialHandoff.deck;
        const offlineQuiz = buildOfflineQuizFromDeck(deck);
        if (offlineQuiz) {
          const saved = saveActiveQuiz(userId, offlineQuiz, nextHistory);
          setStore(saved);
          setViewIndex(0);
          setExpandedQuotes({});
          setReviewFilter('missed');
          setNotice({text: `Offline quiz built from "${deck.title}".`});
        } else {
          const deckText = deck.cards
            .map(c => `${c.question}\n${c.answer}`)
            .join('\n\n')
            .slice(0, 12000);
          writeSkillState(userId, 'quiz', null);
          setStore({active: null, history: nextHistory});
          setSource({text: deckText, label: deck.title});
          setNotice({
            text: 'Add at least 2 cards with different answers for instant offline quizzes, or tap Make quiz to generate with AI.',
          });
        }
      } else if (initialHandoff.source) {
        writeSkillState(userId, 'quiz', null);
        setStore({active: null, history: nextHistory});
        setSource(initialHandoff.source);
        setNotice(null);
      }
    } catch (e) {
      setNotice({
        text: (e as Error).message || 'Could not load quiz material.',
        danger: true,
      });
    } finally {
      onHandoffConsumed?.();
    }
  }, [initialHandoff, onHandoffConsumed, userId]);

  const onInitialSourceConsumedRef = useRef(onInitialSourceConsumed);
  onInitialSourceConsumedRef.current = onInitialSourceConsumed;
  useEffect(() => {
    if (!initialSource) return;
    try {
      const current = readQuizStore(userId);
      let nextHistory = current.history;
      if (
        current.active &&
        !current.active.isMissedDrill &&
        current.active.questions.length > 0 &&
        current.active.index < current.active.questions.length
      ) {
        const pausedPrev: QuizSession = {
          ...current.active,
          paused: true,
          updatedAt: new Date().toISOString(),
        };
        nextHistory = saveActiveQuiz(
          userId,
          pausedPrev,
          current.history,
        ).history;
      }
      writeSkillState(userId, 'quiz', null);
      setStore({active: null, history: nextHistory});
      setSource(initialSource);
      setViewIndex(0);
      setExpandedQuotes({});
      setNotice(null);
    } catch (e) {
      setNotice({
        text: (e as Error).message || 'Could not load quiz material.',
        danger: true,
      });
    } finally {
      onInitialSourceConsumedRef.current?.();
    }
  }, [initialSource, userId]);

  const offlineDeck = useMemo(() => {
    const parsed = parseDeckFromQuizSource(source);
    if (!parsed) return null;
    const distinct = new Set(
      parsed.cards.map(c => c.answer.trim().toLowerCase().replace(/\s+/g, ' ')),
    );
    return distinct.size >= 2 ? parsed : null;
  }, [source]);

  const handledMaterialRef = useRef<string | null>(null);
  useEffect(() => {
    if (!initialMaterialId) return;
    const key = `${userId}:${initialMaterialId}`;
    if (handledMaterialRef.current === key) return;
    handledMaterialRef.current = key;
    const current = readQuizStore(userId);
    if (current.active && !current.active.paused) {
      try {
        const saved = saveActiveQuiz(
          userId,
          {
            ...current.active,
            paused: true,
            updatedAt: new Date().toISOString(),
          },
          current.history,
        );
        setStore(saved);
      } catch {
        // Keep current session untouched if storage fails
      }
    }
  }, [initialMaterialId, userId]);

  const save = (next: QuizSession | null) => {
    try {
      const saved = saveActiveQuiz(userId, next, history);
      setStore(saved);
      return true;
    } catch (e) {
      setNotice({
        text: (e as Error).message || 'Could not save quiz progress.',
        danger: true,
      });
      return false;
    }
  };

  const startOfflineDeckQuiz = () => {
    if (!offlineDeck) return;
    const offlineQuiz = buildOfflineQuizFromDeck(offlineDeck, Number(count));
    if (!offlineQuiz) return;
    const adjusted: QuizSession = {...offlineQuiz, mode};
    if (save(adjusted)) {
      setViewIndex(0);
      setExpandedQuotes({});
      setReviewFilter('missed');
      setNotice({text: `Offline quiz built from "${offlineDeck.title}".`});
    }
  };

  const handleDiscardActive = () => {
    try {
      const nextStore = discardActiveQuiz(userId, session, history);
      setStore(nextStore);
      setViewIndex(0);
      setNotice(null);
    } catch (e) {
      setNotice({
        text: (e as Error).message || 'Could not discard quiz.',
        danger: true,
      });
    }
  };

  const openSetupClean = () => {
    try {
      writeSkillState(userId, 'quiz', null);
      setStore(prev => ({...prev, active: null}));
      setSource({text: '', label: ''});
      setViewIndex(0);
      setExpandedQuotes({});
      setNotice(null);
    } catch (e) {
      setNotice({
        text: (e as Error).message || 'Could not open quiz setup.',
        danger: true,
      });
    }
  };

  const generate = () => {
    setNotice(null);
    job.clearError();
    const trimmed = source.text.trim();
    if (!trimmed) {
      setNotice({
        text: 'Choose a source or paste some text first.',
        danger: true,
      });
      return;
    }
    if (trimmed.length < 40) {
      setNotice({
        text: 'Add a bit more material (at least 40 characters) so LAFINA can write reliable questions.',
        danger: true,
      });
      return;
    }
    const capturedSource = source;
    const capturedCount = Number(count);
    const capturedType = type;
    const capturedMode = mode;

    void job.run(async ctx => {
      ctx.setProgress(0.05, 'Preparing study material…');
      const questions = await quizFromSource(
        userId,
        capturedSource.text,
        capturedCount,
        capturedType,
        {
          shuffleOptions: true,
          allowPartial: true,
          isCancelled: ctx.isCancelled,
          signal: ctx.signal,
          onProgress: info => {
            const frac =
              info.totalBatches > 0 ? info.batch / info.totalBatches : 0.5;
            ctx.setProgress(
              Math.min(0.95, Math.max(0.1, frac)),
              info.totalBatches > 1
                ? `Writing batch ${info.batch} of ${info.totalBatches} (${info.collected}/${info.target} ready)…`
                : `Writing ${info.target} questions…`,
            );
          },
        },
      );
      if (ctx.isCancelled()) {
        throw new Error('Quiz generation cancelled.');
      }
      const attributed = attributeQuestionsToNotes(
        questions,
        capturedSource.notes,
      );
      const now = new Date().toISOString();
      const next: QuizSession = {
        id: generateId('quiz'),
        title: capturedSource.label.trim() || 'Quiz',
        questions: attributed,
        answers: [],
        index: 0,
        mode: capturedMode,
        paused: false,
        source: {
          label: capturedSource.label.trim() || 'Study material',
          ...(capturedSource.noteId ? {noteId: capturedSource.noteId} : {}),
          ...(capturedSource.materialId
            ? {materialId: capturedSource.materialId}
            : {}),
        },
        createdAt: now,
        updatedAt: now,
        attempt: 1,
        bestScorePct: null,
        lastScorePct: null,
        mistakesSavedAttempt: null,
        ...(attributed.length < capturedCount
          ? {requestedCount: capturedCount}
          : {}),
      };
      if (ctx.isCancelled()) {
        throw new Error('Quiz generation cancelled.');
      }
      const latest = readQuizStore(userId);
      saveActiveQuiz(userId, next, latest.history);
      return next;
    });
  };

  const jobBanner = (
    <>
      {job.busy && (
        <SkillCard style={{borderColor: p.accent}}>
          <View style={ui.between}>
            <View style={[ui.row, ui.fill]}>
              <ActivityIndicator size="small" color={p.accent} />
              <View style={ui.fill}>
                <SkillText strong size={14}>
                  {job.statusText || 'Writing your quiz…'}
                </SkillText>
                <SkillText muted size={12}>
                  You can leave this page. Your quiz appears here when it is
                  ready.
                </SkillText>
              </View>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Cancel quiz generation"
              onPress={job.cancel}
              style={styles.smallTap}
            >
              <SkillText danger strong size={13}>
                Cancel
              </SkillText>
            </TouchableOpacity>
          </View>
          <View style={[styles.progressTrack, {backgroundColor: p.surface}]}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${Math.max(8, Math.round(job.progress * 100))}%`,
                  backgroundColor: p.accent,
                },
              ]}
            />
          </View>
        </SkillCard>
      )}
      {!!job.error && (
        <SkillCard
          style={{borderColor: p.danger, backgroundColor: p.dangerSoft}}
        >
          <View style={ui.between}>
            <View style={ui.fill}>
              <SkillText danger strong size={13}>
                {job.error}
              </SkillText>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Dismiss quiz error"
              onPress={job.clearError}
              style={styles.smallTap}
            >
              <SkillText danger strong size={12}>
                Dismiss
              </SkillText>
            </TouchableOpacity>
          </View>
        </SkillCard>
      )}
    </>
  );

  const totalQuestions = session?.questions.length ?? 0;
  const done = Boolean(
    session &&
      !session.paused &&
      totalQuestions > 0 &&
      session.index >= totalQuestions,
  );
  const score = session ? scoreQuiz(session) : null;
  const mistakes = score?.mistakes ?? [];
  const mistakesAlreadySaved = Boolean(
    session && session.mistakesSavedAttempt === session.attempt,
  );

  const makeCards = () => {
    if (!session || !mistakes.length || mistakesAlreadySaved) return;
    try {
      const id = generateId('deck');
      const fallbackLabel = (
        session.source.label ||
        session.title ||
        ''
      ).trim();
      addDeck(userId, {
        id,
        title: formatMistakeDeckTitle(
          session.source.label || session.title || 'Review',
        ),
        createdAt: new Date().toISOString(),
        cards: mistakes.map(m => {
          const noteId = m.question.sourceNoteId || session.source.noteId;
          const cardLabel = (m.question.sourceLabel || fallbackLabel).trim();
          return {
            id: generateId('card'),
            question: m.question.question,
            answer: `${m.question.options[m.question.correct]}\n\n${
              m.question.explanation
            }`,
            ...(noteId ? {sourceNoteId: noteId} : {}),
            ...(cardLabel ? {sourceLabel: cardLabel} : {}),
            intervalDays: 0,
            ease: 2.5,
            dueAt: Date.now(),
            reviews: 0,
          };
        }),
      });
      save({
        ...session,
        mistakesSavedAttempt: session.attempt,
        updatedAt: new Date().toISOString(),
      });
      setNotice({text: 'Deck saved. Open Flashcards to study.'});
      Alert.alert('Flashcards saved', 'Your mistakes are ready to review.', [
        {text: 'Stay here'},
        {text: 'Open Flashcards', onPress: onFlashcards},
      ]);
    } catch (e) {
      setNotice({
        text: (e as Error).message || 'Could not create flashcards.',
        danger: true,
      });
    }
  };

  if (session && !session.paused && totalQuestions === 0) {
    return (
      <>
        {jobBanner}
        <SkillCard>
          <SkillText strong size={17}>
            This saved quiz has no questions
          </SkillText>
          <SkillText muted>
            Discard it and create a new quiz from your notes or file.
          </SkillText>
        </SkillCard>
        <SkillButton label="Start a new quiz" onPress={handleDiscardActive} />
      </>
    );
  }

  if (done && session && score) {
    const ringColor =
      score.pct >= 80 ? p.mintInk : score.pct >= 50 ? p.accent : p.danger;
    const resultTitle =
      score.pct === 100
        ? 'Perfect score!'
        : score.pct >= 80
        ? 'Nice work'
        : score.pct >= 50
        ? 'Good effort'
        : 'Keep practicing';
    const resultSubtitle =
      mistakes.length === 0
        ? 'You nailed every question on this quiz.'
        : `You missed ${mistakes.length} ${
            mistakes.length === 1 ? 'question' : 'questions'
          }. Drill them now or save them as flashcards.`;

    const allReviewItems = session.questions.map((question, idx) => {
      const raw = session.answers[idx];
      const picked =
        typeof raw === 'number' && Number.isInteger(raw) ? raw : null;
      return {index: idx, question, picked};
    });
    const reviewItems =
      reviewFilter === 'missed' && mistakes.length > 0
        ? mistakes
        : allReviewItems;

    return (
      <>
        {jobBanner}
        <View style={[ui.center, {paddingTop: 18, gap: 14, marginBottom: 8}]}>
          <View
            accessible
            accessibilityLabel={`Score ${score.pct} percent, ${score.correct} of ${totalQuestions} correct`}
          >
            <SkillRing
              size={180}
              progress={score.correct / totalQuestions}
              animateOnMount
              color={ringColor}
            >
              <SkillText strong size={38}>
                {score.pct}%
              </SkillText>
              <SkillText muted size={13}>
                {score.correct} of {totalQuestions} correct
              </SkillText>
            </SkillRing>
          </View>
          <View style={[ui.center, {gap: 4, paddingHorizontal: 12}]}>
            <SkillText strong size={24} center>
              {resultTitle}
            </SkillText>
            <SkillText muted size={14} center>
              {resultSubtitle}
            </SkillText>
          </View>
          <View style={styles.statRow}>
            <View
              style={[
                styles.statPill,
                {backgroundColor: p.mint, borderColor: p.border},
              ]}
            >
              <Text style={[styles.statValue, {color: p.mintInk}]}>
                {score.correct}
              </Text>
              <Text style={[styles.statLabel, {color: p.mintInk}]}>
                Correct
              </Text>
            </View>
            <View
              style={[
                styles.statPill,
                {
                  backgroundColor:
                    mistakes.length > 0 ? p.dangerSoft : p.surface,
                  borderColor: p.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.statValue,
                  {color: mistakes.length > 0 ? p.danger : p.muted},
                ]}
              >
                {mistakes.length}
              </Text>
              <Text
                style={[
                  styles.statLabel,
                  {color: mistakes.length > 0 ? p.danger : p.muted},
                ]}
              >
                Missed
              </Text>
            </View>
            {!session.isMissedDrill && session.bestScorePct !== null && (
              <View
                style={[
                  styles.statPill,
                  {backgroundColor: p.blueSoft, borderColor: p.border},
                ]}
              >
                <Text style={[styles.statValue, {color: p.accent}]}>
                  {session.bestScorePct}%
                </Text>
                <Text style={[styles.statLabel, {color: p.accent}]}>Best</Text>
              </View>
            )}
          </View>
        </View>

        {mistakes.length > 0 && (
          <>
            <SkillButton
              label={`Practice missed (${mistakes.length})`}
              onPress={() => {
                const drillQuestions = mistakes.map(m =>
                  shuffleQuestionOptions(m.question),
                );
                const now = new Date().toISOString();
                const drill: QuizSession = {
                  id: generateId('quiz'),
                  title: `${session.title} (Mistakes)`,
                  questions: drillQuestions,
                  answers: [],
                  index: 0,
                  mode: 'practice',
                  paused: false,
                  source: session.source,
                  createdAt: now,
                  updatedAt: now,
                  attempt: 1,
                  bestScorePct: null,
                  lastScorePct: null,
                  mistakesSavedAttempt: null,
                  isMissedDrill: true,
                  parentQuizId: session.parentQuizId ?? session.id,
                };
                if (save(drill)) {
                  setViewIndex(0);
                  setExpandedQuotes({});
                  setNotice(null);
                }
              }}
            />
            <SkillButton
              secondary
              label={
                mistakesAlreadySaved
                  ? 'Flashcards saved'
                  : 'Make flashcards from mistakes'
              }
              disabled={mistakesAlreadySaved}
              onPress={makeCards}
            />
            {mistakesAlreadySaved && (
              <SkillButton
                secondary
                label="Open Flashcards"
                onPress={onFlashcards}
              />
            )}
          </>
        )}

        <SkillButton
          secondary={mistakes.length > 0}
          label="Retake"
          onPress={() => {
            setNotice(null);
            setExpandedQuotes({});
            setViewIndex(0);
            save({
              ...session,
              questions: shuffleQuizForRetake(session.questions),
              answers: [],
              index: 0,
              paused: false,
              attempt: session.attempt + 1,
              updatedAt: new Date().toISOString(),
            });
          }}
        />
        <SkillButton
          secondary
          label="Make another quiz"
          onPress={openSetupClean}
        />

        {!!notice && (
          <SkillText danger={notice.danger} muted={!notice.danger}>
            {notice.text}
          </SkillText>
        )}

        <View style={[ui.between, ui.section]}>
          <SkillText strong size={17}>
            Review answers
          </SkillText>
          {mistakes.length > 0 && (
            <View style={styles.filterPills}>
              {(
                [
                  {id: 'missed', label: `Missed (${mistakes.length})`},
                  {id: 'all', label: `All (${totalQuestions})`},
                ] as const
              ).map(tab => {
                const active = reviewFilter === tab.id;
                return (
                  <TouchableOpacity
                    key={tab.id}
                    accessibilityRole="button"
                    accessibilityState={{selected: active}}
                    onPress={() => setReviewFilter(tab.id)}
                    style={[
                      styles.filterPill,
                      {
                        backgroundColor: active ? p.accent : p.surface,
                        borderColor: p.border,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        fontFamily: SkillFonts.semibold,
                        fontSize: 12,
                        color: active ? p.onAccent : p.text,
                      }}
                    >
                      {tab.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {reviewItems.map(item => {
          const isCorrect = item.picked === item.question.correct;
          const noteId = item.question.sourceNoteId || session.source.noteId;
          return (
            <SkillCard
              key={item.index}
              style={{
                borderColor: isCorrect ? p.mintInk : p.danger,
              }}
            >
              <View style={ui.between}>
                <SkillText muted size={12}>
                  Question {item.index + 1}
                </SkillText>
                <View
                  style={[
                    styles.statusTag,
                    {
                      backgroundColor: isCorrect ? p.mint : p.dangerSoft,
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontFamily: SkillFonts.semibold,
                      fontSize: 11,
                      color: isCorrect ? p.mintInk : p.danger,
                    }}
                  >
                    {isCorrect ? 'Correct' : 'Missed'}
                  </Text>
                </View>
              </View>
              <SkillText strong size={15}>
                {item.question.question}
              </SkillText>
              {!isCorrect && (
                <Text
                  style={{
                    fontFamily: SkillFonts.medium,
                    fontSize: 13,
                    color: p.danger,
                  }}
                >
                  Your answer:{' '}
                  {item.picked !== null && item.question.options[item.picked]
                    ? item.question.options[item.picked]
                    : 'Not answered'}
                </Text>
              )}
              <Text
                style={{
                  fontFamily: SkillFonts.semibold,
                  fontSize: 13,
                  color: p.mintInk,
                }}
              >
                {isCorrect ? 'Answer: ' : 'Correct answer: '}
                {item.question.options[item.question.correct]}
              </Text>
              <SkillText muted size={13}>
                {item.question.explanation}
              </SkillText>
              <SkillText muted size={12}>
                Source: {item.question.sourceLabel ?? session.source.label}
              </SkillText>
              {noteId && (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`Open source note for question ${
                    item.index + 1
                  }`}
                  onPress={() => onNote(noteId)}
                  style={styles.inlineAction}
                >
                  <Text style={[styles.inlineActionText, {color: p.accent}]}>
                    Open source note →
                  </Text>
                </TouchableOpacity>
              )}
            </SkillCard>
          );
        })}
      </>
    );
  }

  if (session && !session.paused) {
    const activeIdx = Math.min(
      Math.max(0, viewIndex),
      Math.min(session.index, totalQuestions - 1),
    );
    const q = session.questions[activeIdx];
    if (!q) {
      return (
        <SkillButton label="Reset invalid quiz" onPress={handleDiscardActive} />
      );
    }
    const rawPicked = session.answers[activeIdx];
    const picked =
      typeof rawPicked === 'number' &&
      Number.isInteger(rawPicked) &&
      rawPicked >= 0 &&
      rawPicked < q.options.length
        ? rawPicked
        : undefined;
    const answered = picked !== undefined;
    const isPractice = session.mode === 'practice';
    const revealFeedback = isPractice && answered;
    const isReviewingPrevious = activeIdx < session.index;
    const isLocked = isPractice && (answered || isReviewingPrevious);
    const correctCount = score?.correct ?? 0;
    const progressRatio =
      totalQuestions > 0
        ? (activeIdx + (answered ? 1 : 0)) / totalQuestions
        : 0;
    const noteId = q.sourceNoteId || session.source.noteId;
    const shortfall = session.index === 0 ? quizShortfall(session) : null;
    const quoteLong = q.source.length > 180;
    const quoteExpanded = Boolean(expandedQuotes[activeIdx]);
    const displayQuote =
      quoteLong && !quoteExpanded
        ? `${q.source.slice(0, 177).trimEnd()}…`
        : q.source;

    const advanceQuestion = () => {
      if (isReviewingPrevious) {
        setViewIndex(activeIdx + 1);
        return;
      }
      if (!answered) return;
      const nextIndex = session.index + 1;
      const now = new Date().toISOString();
      if (nextIndex >= totalQuestions) {
        const finalScore = scoreQuiz({...session, index: nextIndex});
        const nextBest =
          session.bestScorePct === null
            ? finalScore.pct
            : Math.max(session.bestScorePct, finalScore.pct);
        save({
          ...session,
          index: nextIndex,
          paused: false,
          lastScorePct: finalScore.pct,
          bestScorePct: nextBest,
          updatedAt: now,
        });
      } else if (
        save({
          ...session,
          index: nextIndex,
          updatedAt: now,
        })
      ) {
        setViewIndex(nextIndex);
      }
    };

    const pauseQuiz = () => {
      if (
        save({
          ...session,
          paused: true,
          updatedAt: new Date().toISOString(),
        })
      ) {
        setNotice({
          text: 'Quiz progress is saved. Resume whenever you are ready.',
        });
      }
    };

    return (
      <>
        {jobBanner}
        <View style={styles.quizTopBar}>
          <View style={styles.quizMetaLeft}>
            <Text style={[styles.counterText, {color: p.muted}]}>
              Question {activeIdx + 1} of {totalQuestions}
            </Text>
            <Text style={[styles.counterText, {color: p.muted}]}>
              {isPractice ? `· ${correctCount} correct` : '· Exam mode'}
            </Text>
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Finish later"
            onPress={pauseQuiz}
            style={[
              styles.headerActionChip,
              {backgroundColor: p.surface, borderColor: p.border},
            ]}
          >
            <Clock size={13} color={p.text} />
            <Text style={[styles.headerActionText, {color: p.text}]}>
              Finish later
            </Text>
          </TouchableOpacity>
        </View>

        <View
          accessibilityRole="progressbar"
          accessibilityValue={{
            min: 0,
            max: totalQuestions,
            now: activeIdx + (answered ? 1 : 0),
          }}
          style={[styles.progressTrack, {backgroundColor: p.surface}]}
        >
          <View
            style={[
              styles.progressFill,
              {
                width: `${Math.round(progressRatio * 100)}%`,
                backgroundColor: p.mintInk,
              },
            ]}
          />
        </View>

        {shortfall && (
          <View testID="quiz-shortfall-notice">
            <SkillText muted size={12}>
              {`LAFINA could write ${shortfall.written} of the ${shortfall.requested} questions you asked for. The material did not support more without repeating or guessing.`}
            </SkillText>
          </View>
        )}

        <Text style={[styles.questionStem, {color: p.text}]}>{q.question}</Text>

        <View
          accessibilityRole="radiogroup"
          accessibilityLabel="Answer"
          style={styles.optionsGroup}
        >
          {q.options.map((o, i) => {
            const isCorrectOpt = i === q.correct;
            const isPickedOpt = i === picked;
            const state = revealFeedback
              ? isCorrectOpt
                ? 'right'
                : isPickedOpt
                ? 'wrong'
                : 'dim'
              : !isPractice && isPickedOpt
              ? 'selected'
              : 'idle';

            const borderColor =
              state === 'right'
                ? p.mintInk
                : state === 'wrong'
                ? p.danger
                : state === 'selected'
                ? p.accent
                : p.border;
            const bgColor =
              state === 'right'
                ? p.mint
                : state === 'wrong'
                ? p.dangerSoft
                : state === 'selected'
                ? p.blueSoft
                : p.card;
            const keyBg =
              state === 'right'
                ? p.mintInk
                : state === 'wrong'
                ? p.danger
                : state === 'selected'
                ? p.accent
                : p.surface;
            const keyInk =
              state === 'right' || state === 'wrong' || state === 'selected'
                ? '#FFFFFF'
                : p.muted;
            const badgeText =
              q.options.length === 2
                ? o.trim().toLowerCase().startsWith('t')
                  ? 'T'
                  : o.trim().toLowerCase().startsWith('f')
                  ? 'F'
                  : LETTERS[i] ?? String(i + 1)
                : LETTERS[i] ?? String(i + 1);

            return (
              <TouchableOpacity
                key={i}
                accessibilityRole="radio"
                accessibilityLabel={`${o}${
                  revealFeedback
                    ? isCorrectOpt
                      ? ', correct answer'
                      : isPickedOpt
                      ? ', incorrect answer'
                      : ''
                    : ''
                }`}
                accessibilityState={{
                  checked: isPickedOpt,
                  disabled: isLocked,
                }}
                disabled={isLocked}
                onPress={() => {
                  if (isLocked) return;
                  const nextAnswers = [...session.answers];
                  nextAnswers[activeIdx] = i;
                  save({
                    ...session,
                    answers: nextAnswers,
                    updatedAt: new Date().toISOString(),
                  });
                }}
                style={[
                  styles.optionRow,
                  {
                    backgroundColor: bgColor,
                    borderColor,
                    borderWidth:
                      state === 'right' ||
                      state === 'wrong' ||
                      state === 'selected'
                        ? 2
                        : 1,
                    opacity: state === 'dim' ? 0.58 : 1,
                  },
                ]}
              >
                <View style={[styles.keycap, {backgroundColor: keyBg}]}>
                  <Text style={[styles.keycapText, {color: keyInk}]}>
                    {badgeText}
                  </Text>
                </View>
                <Text style={[styles.optionLabel, {color: p.text}]}>{o}</Text>
                {revealFeedback && isCorrectOpt && (
                  <Check size={18} color={p.mintInk} />
                )}
                {revealFeedback && !isCorrectOpt && isPickedOpt && (
                  <X size={18} color={p.danger} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {revealFeedback && (
          <View
            style={[
              styles.feedbackCard,
              {
                backgroundColor: picked === q.correct ? p.mint : p.dangerSoft,
                borderColor: picked === q.correct ? p.mintInk : p.danger,
              },
            ]}
          >
            <Text
              accessibilityLiveRegion="polite"
              style={[
                styles.feedbackTitle,
                {color: picked === q.correct ? p.mintInk : p.danger},
              ]}
            >
              {picked === q.correct ? 'Correct' : 'Not quite'}
            </Text>
            {picked !== q.correct && (
              <SkillText strong size={13}>
                The answer is {q.options[q.correct]}.
              </SkillText>
            )}
            <SkillText size={14}>{q.explanation}</SkillText>
            <View style={styles.quoteBlock}>
              <SkillText muted size={12}>
                Source: {q.sourceLabel ?? session.source.label}
              </SkillText>
              <SkillText muted size={12}>
                “{displayQuote}”
              </SkillText>
              {quoteLong && (
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={() =>
                    setExpandedQuotes(prev => ({
                      ...prev,
                      [activeIdx]: !quoteExpanded,
                    }))
                  }
                >
                  <Text style={[styles.inlineActionText, {color: p.accent}]}>
                    {quoteExpanded ? 'Show less' : 'Show full quote'}
                  </Text>
                </TouchableOpacity>
              )}
              {noteId && (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Open source note"
                  onPress={() => onNote(noteId)}
                  style={styles.inlineAction}
                >
                  <Text style={[styles.inlineActionText, {color: p.accent}]}>
                    Open source note →
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        <View style={styles.navFooter}>
          <View style={ui.row}>
            {activeIdx > 0 && (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Previous question"
                onPress={() => setViewIndex(activeIdx - 1)}
                style={[
                  styles.prevBtn,
                  {backgroundColor: p.card, borderColor: p.border},
                ]}
              >
                <ArrowLeft size={18} color={p.text} />
              </TouchableOpacity>
            )}
            <View style={ui.fill}>
              <SkillButton
                disabled={!isReviewingPrevious && !answered}
                label={
                  isReviewingPrevious
                    ? 'Next question'
                    : session.index === totalQuestions - 1
                    ? isPractice
                      ? 'See score'
                      : 'Submit quiz'
                    : 'Next question'
                }
                onPress={advanceQuestion}
              />
            </View>
          </View>
          {isReviewingPrevious && (
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => setViewIndex(session.index)}
              style={styles.jumpCurrentBtn}
            >
              <Text style={[styles.inlineActionText, {color: p.accent}]}>
                Jump to current (Q{session.index + 1})
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {!!notice && (
          <SkillText danger={notice.danger} muted={!notice.danger}>
            {notice.text}
          </SkillText>
        )}
      </>
    );
  }

  const pausedSession =
    session && totalQuestions > 0 && session.paused ? session : null;
  const pausedAnswered = pausedSession
    ? countAnswered(pausedSession.answers, pausedSession.questions.length)
    : 0;
  const recentQuizzes = history.filter(
    item => !pausedSession || item.id !== pausedSession.id,
  );

  return (
    <>
      {jobBanner}
      <SkillText strong size={22}>
        A quick check of what you know
      </SkillText>
      <SkillText muted>Make a quiz from your own material.</SkillText>

      {pausedSession && (
        <SkillCard style={{borderColor: p.accent}}>
          <View style={ui.between}>
            <View style={ui.fill}>
              <SkillText strong>Saved quiz in progress</SkillText>
              <SkillText muted size={12}>
                {pausedSession.title || pausedSession.source.label || 'Quiz'} ·{' '}
                {pausedAnswered} of {pausedSession.questions.length} answered
              </SkillText>
            </View>
            <View style={[styles.modeTag, {backgroundColor: p.blueSoft}]}>
              <Text style={[styles.modeTagText, {color: p.accent}]}>
                {pausedSession.mode === 'exam' ? 'Exam' : 'Practice'}
              </Text>
            </View>
          </View>
          <View style={[styles.progressTrack, {backgroundColor: p.surface}]}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${Math.round(
                    (pausedAnswered / pausedSession.questions.length) * 100,
                  )}%`,
                  backgroundColor: p.accent,
                },
              ]}
            />
          </View>
          <SkillButton
            label="Resume quiz"
            onPress={() => {
              setNotice(null);
              setViewIndex(pausedSession.index);
              save({...pausedSession, paused: false});
            }}
          />
          <SkillButton
            secondary
            label="Discard saved quiz"
            onPress={handleDiscardActive}
          />
        </SkillCard>
      )}

      <SourcePicker
        userId={userId}
        source={source}
        onChange={setSource}
        initialMaterialId={initialMaterialId}
      />

      <Choices
        label="Questions"
        values={['5', '10', '20'] as const}
        value={count}
        onChange={setCount}
      />

      <View style={ui.field}>
        <SkillText strong size={13}>
          Question type
        </SkillText>
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel="Question type"
          style={styles.pillGroup}
        >
          {QUESTION_TYPES.map(t => {
            const active = type === t;
            return (
              <TouchableOpacity
                key={t}
                accessibilityRole="radio"
                accessibilityLabel={t}
                accessibilityState={{checked: active}}
                onPress={() => setType(t)}
                style={[
                  styles.typePill,
                  {
                    backgroundColor: active ? p.blueSoft : p.card,
                    borderColor: active ? p.accent : p.border,
                  },
                ]}
              >
                <Text
                  style={{
                    fontFamily: active ? SkillFonts.semibold : SkillFonts.body,
                    fontSize: 13,
                    color: active ? p.accent : p.text,
                  }}
                >
                  {t}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={ui.field}>
        <SkillText strong size={13}>
          Mode
        </SkillText>
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel="Quiz mode"
          style={[ui.choices, {backgroundColor: p.surface}]}
        >
          {QUIZ_MODES.map(item => {
            const active = mode === item.id;
            return (
              <TouchableOpacity
                key={item.id}
                accessibilityRole="radio"
                accessibilityLabel={item.label}
                accessibilityState={{checked: active}}
                onPress={() => setMode(item.id)}
                style={[
                  ui.choice,
                  {backgroundColor: active ? p.card : 'transparent'},
                ]}
              >
                <Text
                  style={{
                    fontFamily: active ? SkillFonts.semibold : SkillFonts.body,
                    color: active ? p.text : p.muted,
                    fontSize: 13,
                    textAlign: 'center',
                  }}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <SkillText muted size={12}>
          {mode === 'practice'
            ? 'Practice shows instant answers and explanations after each question.'
            : 'Exam hides answers until you submit the entire quiz.'}
        </SkillText>
      </View>

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={job.busy ? 'Writing your quiz…' : 'Make quiz'}
        accessibilityState={{disabled: job.busy}}
        disabled={job.busy}
        onPress={generate}
        style={[
          ui.button,
          styles.primaryCta,
          {backgroundColor: p.accent, opacity: job.busy ? 0.55 : 1},
        ]}
      >
        <Sparkles size={18} color={p.onAccent} />
        <Text style={[styles.primaryCtaText, {color: p.onAccent}]}>
          {job.busy ? 'Writing your quiz…' : 'Make quiz'}
        </Text>
      </TouchableOpacity>

      {offlineDeck && (
        <SkillButton
          secondary
          disabled={job.busy}
          label="Start instant offline quiz"
          onPress={startOfflineDeckQuiz}
        />
      )}

      {!!notice && (
        <SkillText danger={notice.danger} muted={!notice.danger}>
          {notice.text}
        </SkillText>
      )}

      {recentQuizzes.length > 0 && (
        <>
          <View style={ui.section}>
            <SkillText strong size={17}>
              Recent quizzes
            </SkillText>
          </View>
          {recentQuizzes.map(item => {
            const total = item.questions.length;
            const answeredN = countAnswered(item.answers, total);
            const inProgress = item.index < total;
            return (
              <SkillCard key={item.id}>
                <View style={ui.between}>
                  <View style={ui.fill}>
                    <SkillText strong size={15}>
                      {item.title}
                    </SkillText>
                    <SkillText muted size={12}>
                      {total} questions ·{' '}
                      {inProgress
                        ? `${answeredN} of ${total} answered`
                        : item.lastScorePct !== null
                        ? `Last ${item.lastScorePct}%${
                            item.bestScorePct !== null
                              ? ` · Best ${item.bestScorePct}%`
                              : ''
                          }`
                        : 'Completed'}
                    </SkillText>
                  </View>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={`Delete quiz ${item.title}`}
                    onPress={() =>
                      Alert.alert('Delete quiz?', item.title, [
                        {text: 'Cancel', style: 'cancel'},
                        {
                          text: 'Delete',
                          style: 'destructive',
                          onPress: () => {
                            try {
                              setStore(
                                deleteQuizFromHistory(
                                  userId,
                                  item.id,
                                  session,
                                  history,
                                ),
                              );
                            } catch (e) {
                              setNotice({
                                text:
                                  (e as Error).message ||
                                  'Could not delete quiz.',
                                danger: true,
                              });
                            }
                          },
                        },
                      ])
                    }
                    style={ui.icon}
                  >
                    <Trash2 size={17} color={p.danger} />
                  </TouchableOpacity>
                </View>
                <View style={ui.row}>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={
                      inProgress
                        ? `Resume ${item.title}`
                        : `Review ${item.title}`
                    }
                    onPress={() => {
                      const resumed: QuizSession = {
                        ...item,
                        paused: false,
                        updatedAt: new Date().toISOString(),
                      };
                      if (save(resumed)) {
                        setViewIndex(resumed.index);
                        setExpandedQuotes({});
                        setNotice(null);
                      }
                    }}
                    style={[
                      styles.historyBtn,
                      {backgroundColor: p.surface, borderColor: p.border},
                    ]}
                  >
                    <Text style={[styles.historyBtnText, {color: p.text}]}>
                      {inProgress ? 'Resume' : 'Review'}
                    </Text>
                    <ChevronRight size={15} color={p.muted} />
                  </TouchableOpacity>
                  {!inProgress && (
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={`Retake ${item.title}`}
                      onPress={() => {
                        const retaken: QuizSession = {
                          ...item,
                          questions: shuffleQuizForRetake(item.questions),
                          answers: [],
                          index: 0,
                          paused: false,
                          attempt: item.attempt + 1,
                          updatedAt: new Date().toISOString(),
                        };
                        if (save(retaken)) {
                          setViewIndex(0);
                          setExpandedQuotes({});
                          setNotice(null);
                        }
                      }}
                      style={[
                        styles.historyBtn,
                        {backgroundColor: p.blueSoft, borderColor: p.accent},
                      ]}
                    >
                      <RotateCcw size={14} color={p.accent} />
                      <Text style={[styles.historyBtnText, {color: p.accent}]}>
                        Retake
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </SkillCard>
            );
          })}
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  smallTap: {
    minHeight: 40,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 6,
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
  },
  quizTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  quizMetaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  counterText: {
    fontFamily: SkillFonts.medium,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  headerActionChip: {
    minHeight: 38,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerActionText: {
    fontFamily: SkillFonts.semibold,
    fontSize: 12,
  },
  questionStem: {
    fontFamily: SkillFonts.semibold,
    fontSize: 22,
    lineHeight: 30,
    marginTop: 22,
    marginBottom: 18,
  },
  optionsGroup: {
    gap: 10,
  },
  optionRow: {
    minHeight: 58,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  keycap: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keycapText: {
    fontFamily: SkillFonts.semibold,
    fontSize: 13,
  },
  optionLabel: {
    flex: 1,
    fontFamily: SkillFonts.medium,
    fontSize: 15,
    lineHeight: 21,
  },
  feedbackCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginTop: 16,
    gap: 6,
  },
  feedbackTitle: {
    fontFamily: SkillFonts.semibold,
    fontSize: 15,
  },
  quoteBlock: {
    marginTop: 4,
    gap: 4,
  },
  inlineAction: {
    minHeight: 34,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  inlineActionText: {
    fontFamily: SkillFonts.semibold,
    fontSize: 13,
  },
  navFooter: {
    marginTop: 14,
    gap: 6,
  },
  prevBtn: {
    width: 52,
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 6,
  },
  jumpCurrentBtn: {
    alignSelf: 'center',
    minHeight: 36,
    justifyContent: 'center',
  },
  statRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
  },
  statPill: {
    minWidth: 82,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
  },
  statValue: {
    fontFamily: SkillFonts.bold,
    fontSize: 18,
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    fontFamily: SkillFonts.medium,
    fontSize: 11,
  },
  filterPills: {
    flexDirection: 'row',
    gap: 6,
  },
  filterPill: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
  },
  statusTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  modeTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  modeTagText: {
    fontFamily: SkillFonts.semibold,
    fontSize: 11,
  },
  pillGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typePill: {
    minHeight: 42,
    paddingHorizontal: 14,
    borderRadius: 19,
    borderWidth: 1.5,
    justifyContent: 'center',
  },
  primaryCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryCtaText: {
    fontFamily: SkillFonts.semibold,
    fontSize: 16,
  },
  historyBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  historyBtnText: {
    fontFamily: SkillFonts.semibold,
    fontSize: 13,
  },
});
