import React, {useEffect, useState} from 'react';
import {NativeModules} from 'react-native';
import {notesEditStore} from '../../../storage/notesEditStore';
import {readSkillState, writeSkillState} from '../../../skills/skillsState';
import {cardsFromSource, studyReply} from '../../../skills/studyAi';
import {useStudyJob} from '../../../skills/studyJobs';
import type {Deck} from '../../../skills/studyLogic';
import {generateId} from '../../../utils';
import {Choices, SkillButton, SkillCard, SkillText} from './SkillUI';
import {SourcePicker} from './SourcePicker';
import type {SkillSource} from './SourcePicker';

interface Summary {
  text: string;
  source: SkillSource;
  length: string;
}
export function SummarizerSkill({
  userId,
  onFlashcards,
}: {
  userId: string;
  onFlashcards: () => void;
}) {
  const [source, setSource] = useState<SkillSource>({text: '', label: ''});
  const [length, setLength] = useState<'Key points' | 'Short' | 'Detailed'>(
    'Key points',
  );
  const [result, setResult] = useState<Summary | null>(() =>
    readSkillState(userId, 'summary', null),
  );
  const [notice, setNotice] = useState('');
  const job = useStudyJob<Summary>(userId, 'summary');
  const cards = useStudyJob<string>(userId, 'summary-cards');
  const {result: completed, consume} = job;
  useEffect(() => {
    if (completed) {
      setResult(completed);
      consume();
    }
  }, [completed, consume]);
  const summarize = () => {
    void job.run(async () => {
      const text = await studyReply(
        userId,
        `Summarize this source. Length: ${length}. ${
          length === 'Key points'
            ? 'Use concise bullet points.'
            : length === 'Short'
            ? 'Use one short paragraph.'
            : 'Use structured headings and explain key ideas.'
        } Preserve uncertainty and do not add outside facts.`,
        source.text,
      );
      const next = {text, source, length};
      writeSkillState(userId, 'summary', next);
      return next;
    });
  };
  const saveNote = () => {
    if (!result) return;
    try {
      notesEditStore.create({
        id: generateId('note'),
        userId,
        title: `Summary · ${result.source.label}`,
        body: result.text,
        category: 'Learning',
        isPinned: false,
        tags: ['Summary'],
        isVoiceTranscribed: false,
      });
      setNotice('Saved to your existing Notes.');
    } catch (e) {
      setNotice((e as Error).message);
    }
  };
  const makeCards = () => {
    if (!result) return;
    void cards.run(async () => {
      const generated = await cardsFromSource(userId, result.text);
      const decks = readSkillState<Deck[]>(userId, 'decks', []);
      writeSkillState(userId, 'decks', [
        ...decks,
        {
          id: generateId('deck'),
          title: `Summary · ${result.source.label}`,
          cards: generated,
          createdAt: new Date().toISOString(),
        },
      ]);
      return 'Flashcards saved.';
    });
  };
  return (
    <>
      <SourcePicker userId={userId} source={source} onChange={setSource} />
      <Choices
        label="Length"
        values={['Key points', 'Short', 'Detailed'] as const}
        value={length}
        onChange={setLength}
      />
      <SkillButton
        disabled={job.busy}
        label={job.busy ? 'Reading your source…' : 'Summarize with LAFINA'}
        onPress={summarize}
      />
      {!!job.error && <SkillText muted>{job.error}</SkillText>}
      {result && (
        <>
          <SkillCard>
            <SkillText strong size={17}>
              Your summary
            </SkillText>
            <SkillText muted size={12}>
              {result.source.label} · {result.length}
            </SkillText>
            <SkillText>{result.text}</SkillText>
          </SkillCard>
          <SkillButton
            secondary
            label="Copy"
            onPress={() => {
              const clipboard = NativeModules.LafinaSkillsFiles as {
                copy?: (text: string) => void;
              };
              if (clipboard?.copy) {
                clipboard.copy(result.text);
                setNotice('Copied.');
              } else setNotice('Copy is unavailable in this build.');
            }}
          />
          <SkillButton secondary label="Save to notes" onPress={saveNote} />
          <SkillButton
            secondary
            label={cards.busy ? 'Creating flashcards…' : 'Make flashcards'}
            disabled={cards.busy}
            onPress={makeCards}
          />
          {cards.result && (
            <SkillButton
              secondary
              label="Open Flashcards"
              onPress={onFlashcards}
            />
          )}
        </>
      )}
      {!!cards.error && <SkillText muted>{cards.error}</SkillText>}
      {!!notice && <SkillText muted>{notice}</SkillText>}
    </>
  );
}
