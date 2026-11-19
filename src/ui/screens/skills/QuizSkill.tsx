import React, {useEffect, useState} from 'react';
import {Alert, Text, TouchableOpacity, View} from 'react-native';
import {readSkillState, writeSkillState} from '../../../skills/skillsState';
import {quizFromSource} from '../../../skills/studyAi';
import type {QuizQuestion} from '../../../skills/studyAi';
import {useStudyJob} from '../../../skills/studyJobs';
import type {Deck} from '../../../skills/studyLogic';
import {generateId} from '../../../utils';
import {useSkillsPalette} from '../../theme/skills';
import {Choices, SkillButton, SkillCard, SkillText, ui} from './SkillUI';
import {SourcePicker} from './SourcePicker';
import type {SkillSource} from './SourcePicker';
import {SkillRing} from './SkillRing';

interface QuizSession {
  id: string;
  questions: QuizQuestion[];
  answers: number[];
  index: number;
  source: SkillSource;
}
export function QuizSkill({
  userId,
  onFlashcards,
  onNote,
}: {
  userId: string;
  onFlashcards: () => void;
  onNote: (id: string) => void;
}) {
  const p = useSkillsPalette();
  const [source, setSource] = useState<SkillSource>({text: '', label: ''});
  const [count, setCount] = useState<'5' | '10' | '20'>('10');
  const [type, setType] = useState<
    'Multiple choice' | 'True / False' | 'Mixed'
  >('Multiple choice');
  const [session, setSession] = useState<QuizSession | null>(() =>
    readSkillState(userId, 'quiz', null),
  );
  const [notice, setNotice] = useState('');
  const job = useStudyJob<QuizSession>(userId, 'quiz');
  const {result: completed, consume} = job;
  useEffect(() => {
    if (completed) {
      setSession(readSkillState(userId, 'quiz', completed));
      consume();
    }
  }, [completed, consume, userId]);
  const save = (next: QuizSession | null) => {
    try {
      writeSkillState(userId, 'quiz', next);
      setSession(next);
    } catch (e) {
      setNotice((e as Error).message);
    }
  };
  const generate = () => {
    void job.run(async () => {
      const questions = await quizFromSource(
        userId,
        source.text,
        Number(count),
        type,
      );
      const attributed = questions.map(q => {
        const note = source.notes?.find(n =>
          n.text
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .includes(q.source.toLowerCase().replace(/\s+/g, ' ').trim()),
        );
        return note
          ? {...q, sourceNoteId: note.id, sourceLabel: note.title}
          : q;
      });
      const next = {
        id: generateId('quiz'),
        questions: attributed,
        answers: [],
        index: 0,
        source,
      };
      writeSkillState(userId, 'quiz', next);
      return next;
    });
  };
  const done = session && session.index >= session.questions.length;
  const correct =
    session?.answers.reduce(
      (n, a, i) => n + (a === session.questions[i].correct ? 1 : 0),
      0,
    ) ?? 0;
  const mistakes =
    session?.questions.filter((q, i) => session.answers[i] !== q.correct) ?? [];
  const makeCards = () => {
    if (!mistakes.length) return;
    try {
      const decks = readSkillState<Deck[]>(userId, 'decks', []);
      const id = generateId('deck');
      writeSkillState(userId, 'decks', [
        ...decks,
        {
          id,
          title: `Quiz mistakes · ${session?.source.label || 'Review'}`,
          createdAt: new Date().toISOString(),
          cards: mistakes.map(q => ({
            id: generateId('card'),
            question: q.question,
            answer: `${q.options[q.correct]}\n\n${q.explanation}`,
            intervalDays: 0,
            ease: 2.5,
            dueAt: Date.now(),
            reviews: 0,
          })),
        },
      ]);
      setNotice('Deck saved. Open Flashcards to study.');
      Alert.alert('Flashcards saved', 'Your mistakes are ready to review.', [
        {text: 'Stay here'},
        {text: 'Open Flashcards', onPress: onFlashcards},
      ]);
    } catch (e) {
      setNotice((e as Error).message);
    }
  };
  if (done && session)
    return (
      <>
        <View style={[ui.center, {paddingTop: 30, gap: 16}]}>
          <SkillRing size={220} progress={correct / session.questions.length}>
            <SkillText strong size={42}>
              {Math.round((correct / session.questions.length) * 100)}%
            </SkillText>
            <SkillText muted>
              {correct} of {session.questions.length} correct
            </SkillText>
          </SkillRing>
          <SkillText strong size={24}>
            Quiz complete
          </SkillText>
        </View>
        <SkillButton
          label="Retake"
          onPress={() => save({...session, answers: [], index: 0})}
        />
        <SkillButton
          secondary
          label="Make flashcards from mistakes"
          disabled={!mistakes.length}
          onPress={makeCards}
        />
        <SkillButton
          secondary
          label="Make another quiz"
          onPress={() => {
            save(null);
            setSource(session.source);
          }}
        />
        {!!notice && <SkillText muted>{notice}</SkillText>}
      </>
    );
  if (session) {
    const q = session.questions[session.index];
    const picked = session.answers[session.index];
    const answered = picked !== undefined;
    return (
      <>
        <View style={ui.between}>
          <SkillText muted>
            Question {session.index + 1} of {session.questions.length}
          </SkillText>
          <SkillText muted>{correct} correct</SkillText>
        </View>
        <SkillCard>
          <SkillText strong size={24}>
            {q.question}
          </SkillText>
        </SkillCard>
        <View accessibilityRole="radiogroup" accessibilityLabel="Answer">
          {q.options.map((o, i) => (
            <TouchableOpacity
              key={i}
              accessibilityRole="radio"
              accessibilityLabel={`${o}${
                answered
                  ? i === q.correct
                    ? ', correct answer'
                    : i === picked
                    ? ', incorrect answer'
                    : ''
                  : ''
              }`}
              accessibilityState={{checked: i === picked, disabled: answered}}
              disabled={answered}
              onPress={() =>
                save({...session, answers: [...session.answers, i]})
              }
            >
              <SkillCard
                style={{
                  borderWidth:
                    answered && (i === picked || i === q.correct) ? 2 : 1,
                  borderColor: answered
                    ? i === q.correct
                      ? p.mintInk
                      : i === picked
                      ? p.danger
                      : p.border
                    : p.border,
                }}
              >
                <SkillText>
                  {String.fromCharCode(65 + i)}. {o}
                </SkillText>
                {answered && (i === q.correct || i === picked) && (
                  <SkillText strong>
                    {i === q.correct ? '✓ Correct answer' : '✕ Your answer'}
                  </SkillText>
                )}
              </SkillCard>
            </TouchableOpacity>
          ))}
        </View>
        {answered && (
          <SkillCard>
            <Text
              accessibilityLiveRegion="polite"
              style={{color: picked === q.correct ? p.mintInk : p.danger}}
            >
              {picked === q.correct ? 'Correct' : 'Not quite'}
            </Text>
            <SkillText>{q.explanation}</SkillText>
            <SkillText muted size={12}>
              Source: {q.sourceLabel ?? session.source.label}
            </SkillText>
            <SkillText muted size={12}>
              “{q.source}”
            </SkillText>
            {(q.sourceNoteId || session.source.noteId) && (
              <SkillButton
                secondary
                label="Open source note"
                onPress={() =>
                  onNote((q.sourceNoteId || session.source.noteId)!)
                }
              />
            )}
          </SkillCard>
        )}
        <SkillButton
          disabled={!answered}
          label={
            session.index === session.questions.length - 1
              ? 'See score'
              : 'Next question'
          }
          onPress={() => save({...session, index: session.index + 1})}
        />
        <SkillButton
          secondary
          label="Finish later"
          onPress={() => {
            setSession(null);
            setNotice('Quiz progress is saved. Reopen Quiz maker to resume.');
          }}
        />
        {!!notice && <SkillText muted>{notice}</SkillText>}
      </>
    );
  }
  return (
    <>
      <SkillText strong size={22}>
        A quick check of what you know
      </SkillText>
      <SkillText muted>Make a quiz from your own material.</SkillText>
      <SourcePicker userId={userId} source={source} onChange={setSource} />
      <Choices
        label="Questions"
        values={['5', '10', '20'] as const}
        value={count}
        onChange={setCount}
      />
      <Choices
        label="Question type"
        values={['Multiple choice', 'True / False', 'Mixed'] as const}
        value={type}
        onChange={setType}
      />
      <SkillButton
        label={job.busy ? 'Writing your quiz…' : 'Make quiz'}
        disabled={job.busy}
        onPress={generate}
      />
      {job.busy && (
        <SkillText muted>
          You can leave this page. Your quiz appears here when it is ready.
        </SkillText>
      )}
      {!!job.error && <SkillText muted>{job.error}</SkillText>}
      {!!notice && <SkillText muted>{notice}</SkillText>}
    </>
  );
}
