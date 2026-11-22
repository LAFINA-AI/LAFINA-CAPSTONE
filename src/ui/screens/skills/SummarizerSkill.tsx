import React, {useEffect, useState} from 'react';
import {NativeModules} from 'react-native';
import {notesEditStore} from '../../../storage/notesEditStore';
import {readSkillState, writeSkillState} from '../../../skills/skillsState';
import {addDeck} from '../../../skills/studyDecks';
import {cardsFromSource, studyReply} from '../../../skills/studyAi';
import {useStudyJob} from '../../../skills/studyJobs';
import {generateId} from '../../../utils';
import {docGenDraftStore} from '../../drafts/docGenDraftStore';
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
  initialMaterialId,
  onCreateDocument,
}: {
  userId: string;
  onFlashcards: () => void;
  initialMaterialId?: string;
  onCreateDocument?: () => void;
}) {
  const [source, setSource] = useState<SkillSource>({text: '', label: ''});
  const [length, setLength] = useState<'Key points' | 'Short' | 'Detailed'>(
    'Key points',
  );
  const [result, setResult] = useState<Summary | null>(() =>
    readSkillState(userId, 'summary', null),
  );
  const [notice, setNotice] = useState<{text: string; danger?: boolean} | null>(
    null,
  );
  const [savedNoteKey, setSavedNoteKey] = useState<string | null>(null);
  const [savedCardsKey, setSavedCardsKey] = useState<string | null>(null);
  const job = useStudyJob<Summary>(userId, 'summary');
  const cards = useStudyJob<{deckTitle: string; sourceText: string}>(
    userId,
    'summary-cards',
  );
  const {result: completed, consume} = job;
  const {result: cardsCompleted, consume: consumeCards} = cards;
  useEffect(() => {
    if (completed) {
      setResult(completed);
      setSavedNoteKey(null);
      setSavedCardsKey(null);
      consume();
    }
  }, [completed, consume]);
  useEffect(() => {
    if (cardsCompleted) {
      setSavedCardsKey(cardsCompleted.sourceText);
      consumeCards();
    }
  }, [cardsCompleted, consumeCards]);
  const summarize = () => {
    setNotice(null);
    if (!source.text.trim()) {
      setNotice({
        text: 'Choose a source or paste some text first.',
        danger: true,
      });
      return;
    }
    void job.run(async ({signal}) => {
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
        {signal},
      );
      const next = {text, source, length};
      writeSkillState(userId, 'summary', next);
      return next;
    });
  };
  const saveNote = () => {
    if (!result || savedNoteKey === result.text) return;
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
      setSavedNoteKey(result.text);
      setNotice({text: 'Saved to your existing Notes.'});
    } catch (e) {
      setNotice({
        text: (e as Error).message || 'Could not save note.',
        danger: true,
      });
    }
  };
  const makeCards = () => {
    if (!result || savedCardsKey === result.text) return;
    const targetResult = result;
    void cards.run(async () => {
      const generated = await cardsFromSource(userId, targetResult.text);
      const sourceLabel = targetResult.source.label.trim();
      const enriched = generated.map(card => ({
        ...card,
        ...(targetResult.source.noteId
          ? {sourceNoteId: targetResult.source.noteId}
          : {}),
        ...(sourceLabel ? {sourceLabel} : {}),
      }));
      const deckTitle = `Summary · ${targetResult.source.label}`;
      addDeck(userId, {
        id: generateId('deck'),
        title: deckTitle,
        cards: enriched,
        createdAt: new Date().toISOString(),
      });
      return {
        deckTitle,
        sourceText: targetResult.text,
      };
    });
  };
  const copySummary = async () => {
    if (!result) return;
    const clipboard = NativeModules.LafinaSkillsFiles as {
      copy?: (text: string) => Promise<boolean> | void;
    };
    if (!clipboard?.copy) {
      setNotice({text: 'Copy is unavailable in this build.', danger: true});
      return;
    }
    try {
      await clipboard.copy(result.text);
      setNotice({text: 'Copied.'});
    } catch (e) {
      setNotice({
        text: (e as Error).message || 'Could not copy to clipboard.',
        danger: true,
      });
    }
  };
  return (
    <>
      <SourcePicker
        userId={userId}
        source={source}
        onChange={setSource}
        initialMaterialId={initialMaterialId}
      />
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
      {!!job.error && <SkillText danger>{job.error}</SkillText>}
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
              void copySummary();
            }}
          />
          <SkillButton
            secondary
            disabled={savedNoteKey === result.text}
            label={
              savedNoteKey === result.text ? 'Saved to notes' : 'Save to notes'
            }
            onPress={saveNote}
          />
          <SkillButton
            secondary
            label={
              cards.busy
                ? 'Creating flashcards…'
                : savedCardsKey === result.text
                ? 'Flashcards saved'
                : 'Make flashcards'
            }
            disabled={cards.busy || savedCardsKey === result.text}
            onPress={makeCards}
          />
          {savedCardsKey === result.text && (
            <SkillButton
              secondary
              label="Open Flashcards"
              onPress={onFlashcards}
            />
          )}
          {onCreateDocument && (
            <SkillButton
              secondary
              label="Create slides or PDF"
              onPress={() => {
                docGenDraftStore.seedSource(userId, {
                  text: result.text,
                  label: `Summary · ${result.source.label || 'Notes'}`,
                  kind: 'paste',
                });
                onCreateDocument();
              }}
            />
          )}
        </>
      )}
      {!!cards.error && <SkillText danger>{cards.error}</SkillText>}
      {!!notice && (
        <SkillText danger={notice.danger} muted={!notice.danger}>
          {notice.text}
        </SkillText>
      )}
    </>
  );
}
