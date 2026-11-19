import React, {useState} from 'react';
import {NativeModules, TouchableOpacity, View} from 'react-native';
import RNFS from 'react-native-fs';
import {notesQueryStore} from '../../../storage/notesQueryStore';
import type {NoteSnapshot} from '../../../storage/notesEditStore';
import {noteBodyToMarkdown} from '../../../utils';
import {pickDocument} from '../../components/tools/files';
import {useSkillsPalette} from '../../theme/skills';
import {
  Choices,
  SkillButton,
  SkillCard,
  SkillInput,
  SkillText,
  ui,
} from './SkillUI';

export interface SkillSource {
  text: string;
  label: string;
  noteId?: string;
}
export function SourcePicker({
  userId,
  source,
  onChange,
}: {
  userId: string;
  source: SkillSource;
  onChange: (source: SkillSource) => void;
}) {
  const p = useSkillsPalette();
  const [mode, setMode] = useState<'From notes' | 'Paste text' | 'Upload file'>(
    'From notes',
  );
  const [notes, setNotes] = useState<NoteSnapshot[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const load = (more = false) => {
    try {
      const page = notesQueryStore.page({
        userId,
        filter: 'All',
        limit: 50,
        after: more ? cursor : undefined,
      });
      setNotes(more ? [...notes, ...page.items] : page.items);
      setCursor(page.nextCursor);
      setLoaded(true);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const upload = async () => {
    setError('');
    const picked = await pickDocument([
      'text/plain',
      'text/markdown',
      'text/csv',
      'application/pdf',
    ]);
    if (picked.status === 'cancelled') return;
    if (picked.status === 'failed') {
      setError(picked.message);
      return;
    }
    if (picked.file.sizeBytes > 5 * 1024 * 1024) {
      setError('Choose a file smaller than 5 MB.');
      return;
    }
    try {
      let text: string;
      if (
        picked.file.mimeType === 'application/pdf' ||
        picked.file.name.toLowerCase().endsWith('.pdf')
      ) {
        const vision = NativeModules.LafinaVision as {
          extractPdfWords?: (
            uri: string,
          ) => Promise<{words?: Array<{t: string}>; pageCount?: number}>;
        };
        if (!vision?.extractPdfWords)
          throw new Error(
            'PDF text extraction is unavailable in this build. Paste text instead.',
          );
        const result = await vision.extractPdfWords(picked.file.uri);
        text = (result.words ?? []).map(w => w.t).join(' ');
        if ((result.pageCount ?? 1) > 1)
          setError(
            'PDF extraction uses the first page. Upload separate pages or paste the remaining text.',
          );
        if (!text.trim())
          throw new Error(
            'This PDF has no readable text. Paste its text or choose a text file.',
          );
      } else text = await RNFS.readFile(picked.file.uri, 'utf8');
      if (!text.trim()) throw new Error('This file is empty.');
      onChange({text: text.slice(0, 12000), label: picked.file.name});
      if (text.length > 12000)
        setError(
          'Using the first 12,000 characters. Split longer material into smaller files.',
        );
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <>
      <Choices
        label="Source"
        values={['From notes', 'Paste text', 'Upload file'] as const}
        value={mode}
        onChange={m => {
          setMode(m);
          setError('');
        }}
      />
      {mode === 'From notes' && (
        <>
          <SkillButton
            secondary
            label={loaded ? 'Refresh notes' : 'Choose notes'}
            onPress={() => load()}
          />
          {loaded && !notes.length && (
            <SkillText muted>
              No notes yet. Write a note or paste text to begin.
            </SkillText>
          )}
          {notes.map(n => (
            <TouchableOpacity
              accessibilityRole="checkbox"
              accessibilityLabel={n.title}
              accessibilityState={{checked: source.noteId === n.id}}
              key={n.id}
              onPress={() =>
                onChange({
                  noteId: n.id,
                  label: n.title,
                  text: noteBodyToMarkdown(n.body),
                })
              }
            >
              <SkillCard
                style={{
                  borderColor: source.noteId === n.id ? p.accent : p.border,
                }}
              >
                <SkillText strong>{n.title}</SkillText>
                <SkillText muted size={12}>
                  {n.category || 'Note'}
                </SkillText>
              </SkillCard>
            </TouchableOpacity>
          ))}
          {cursor && (
            <SkillButton
              secondary
              label="More notes"
              onPress={() => load(true)}
            />
          )}
        </>
      )}
      {mode === 'Paste text' && (
        <SkillInput
          label="Text to work with"
          value={source.noteId ? '' : source.text}
          multiline
          maxLength={12000}
          style={{minHeight: 140, textAlignVertical: 'top'}}
          onChangeText={text => onChange({text, label: 'Pasted text'})}
        />
      )}
      {mode === 'Upload file' && (
        <>
          <SkillButton
            secondary
            label="Choose text or PDF file"
            onPress={() => {
              void upload();
            }}
          />
          <SkillText muted size={12}>
            Text, Markdown, CSV and text-based PDF · up to 5 MB. Scanned files
            need pasted text.
          </SkillText>
        </>
      )}
      {!!source.text && (
        <View style={ui.field}>
          <SkillText muted size={12}>
            Selected: {source.label} · {source.text.length} characters
          </SkillText>
        </View>
      )}
      {!!error && <SkillText muted>{error}</SkillText>}
    </>
  );
}
