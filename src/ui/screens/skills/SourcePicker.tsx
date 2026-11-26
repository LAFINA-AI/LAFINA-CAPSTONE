import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import NetInfo from '@react-native-community/netinfo';
import {
  NativeModules,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import RNFS from 'react-native-fs';
import {
  BookOpen,
  Check,
  ClipboardPaste,
  FileText,
  Search,
  Upload,
  WifiOff,
  X,
} from 'lucide-react-native';
import {cloudClient} from '../../../cloud';
import {directProviderTestEnabled} from '../../../cloud/directProviderTest';
import {notesQueryStore} from '../../../storage/notesQueryStore';
import type {NoteSnapshot} from '../../../storage/notesEditStore';
import {
  materialStore,
  type MaterialSection,
  type UserMaterialRecord,
} from '../../../storage/materialStore';
import {noteBodyToMarkdown} from '../../../utils';
import {
  MIME_DOCX,
  MIME_PDF,
  MIME_PPTX,
  pickDocument,
} from '../../components/tools/files';
import {SkillFonts, useSkillsPalette} from '../../theme/skills';
import {useStorageRevision} from '../../hooks/useStorageRevision';
import {SKILLS_CAPABILITIES} from '../../../skills/skillsCapabilities';
import {localSettingsStore} from '../../../storage/localSettingsStore';
import {STUDY_OFFLINE_MESSAGE} from '../../../skills/studyAi';
import {readTextFileSafely} from '../../../materials/textFileReader';
import {SkillButton, SkillCard, SkillInput, SkillText, ui} from './SkillUI';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_SOURCE_CHARS = 12000;
const MAX_PDF_PAGES = 10;

type SourceMode = 'From notes' | 'From library' | 'Paste text' | 'Upload file';
export type SkillSourceKind = 'notes' | 'library' | 'paste' | 'file';

const SOURCE_MODES: ReadonlyArray<{
  id: SourceMode;
  label: string;
  Icon: typeof FileText;
}> = [
  {id: 'From notes', label: 'Notes', Icon: FileText},
  {id: 'From library', label: 'Library', Icon: BookOpen},
  {id: 'Paste text', label: 'Paste text', Icon: ClipboardPaste},
  {id: 'Upload file', label: 'Upload file', Icon: Upload},
];

interface VisionExtractor {
  extractDocumentText?: (
    uri: string,
    maxPages: number,
  ) => Promise<{
    text?: string;
    pageCount?: number;
    pagesRead?: number;
    ocrPages?: number;
  } | null>;
  extractPdfWords?: (
    uri: string,
  ) => Promise<{words?: Array<{t: string}>; pageCount?: number} | null>;
  extractOfficeDocumentPages?: (
    uri: string,
    fileName: string,
  ) => Promise<{
    kind?: string;
    pageCount?: number;
    pagesRead?: number;
    pages?: Array<{pageNumber?: number; text?: string}>;
  } | null>;
}

export interface SkillSource {
  text: string;
  label: string;
  kind?: SkillSourceKind;
  noteId?: string;
  materialId?: string;
  /** Which part of a long lesson is used (see materialStore.getMaterialSections). */
  sectionIndex?: number;
  notes?: Array<{id: string; title: string; text: string}>;
}

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function modeFromSource(source: SkillSource): SourceMode {
  if (source.kind === 'paste') return 'Paste text';
  if (source.kind === 'library' || source.materialId) return 'From library';
  if (source.kind === 'file') return 'Upload file';
  if (source.kind === 'notes' || source.notes?.length || source.noteId) {
    return 'From notes';
  }
  if (source.text) return 'Paste text';
  return 'From notes';
}

export function SourcePicker({
  userId,
  source,
  onChange,
  initialMaterialId,
  maxEffectiveChars,
  longSourceNote,
  hideOfflineNotice = false,
  compactList = false,
}: {
  userId: string;
  source: SkillSource;
  onChange: (source: SkillSource) => void;
  initialMaterialId?: string;
  maxEffectiveChars?: number;
  /** Shown instead of "Only the first N characters" when the screen handles long sources. */
  longSourceNote?: string;
  hideOfflineNotice?: boolean;
  compactList?: boolean;
}) {
  const p = useSkillsPalette();
  const settingsRevision = useStorageRevision(['local_settings']);
  const initialVisibleNotes = compactList ? 3 : 5;
  const [connected, setConnected] = useState(true);
  const connectedRef = useRef(true);
  useEffect(() => {
    let alive = true;
    let receivedEvent = false;
    const applyNet = (
      state: {
        isConnected: boolean | null;
        isInternetReachable?: boolean | null;
      },
      fromEvent: boolean,
    ) => {
      if (!alive) return;
      if (fromEvent) {
        receivedEvent = true;
      } else if (receivedEvent) {
        return;
      }
      const next =
        state.isConnected !== false && state.isInternetReachable !== false;
      if (connectedRef.current !== next) {
        connectedRef.current = next;
        setConnected(next);
      }
    };
    const unsub = NetInfo.addEventListener(state => applyNet(state, true));
    void NetInfo.fetch()
      .then(state => applyNet(state, false))
      .catch(() => undefined);
    return () => {
      alive = false;
      unsub();
    };
  }, []);

  const [mode, setMode] = useState<SourceMode>(() => modeFromSource(source));
  const [notes, setNotes] = useState<NoteSnapshot[]>([]);
  const [noteSearch, setNoteSearch] = useState('');
  const [showAllNotes, setShowAllNotes] = useState(false);
  const [materials, setMaterials] = useState<UserMaterialRecord[]>([]);
  const [libraryLoaded, setLibraryLoaded] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [readingFile, setReadingFile] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const mountedRef = useRef(true);
  const activeUserRef = useRef(userId);
  activeUserRef.current = userId;
  const readingFileRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const appliedInitialRef = useRef<string | undefined>(undefined);
  const internalSourceRef = useRef<SkillSource | null>(null);
  const prevSourceRef = useRef<SkillSource>(source);

  const emitSource = useCallback((next: SkillSource) => {
    internalSourceRef.current = next;
    prevSourceRef.current = next;
    onChangeRef.current(next);
  }, []);

  /**
   * Uses one part of a lesson. A lesson longer than the source limit is split
   * into parts so the student can choose any of it, not only the opening pages.
   */
  const emitMaterialSection = useCallback(
    (
      material: Pick<UserMaterialRecord, 'id' | 'title'>,
      sections: readonly MaterialSection[],
      index: number,
    ): boolean => {
      const section = sections[index];
      if (!section?.text.trim()) {
        setError('This library material has no readable text.');
        return false;
      }
      const split = sections.length > 1;
      emitSource({
        text: section.text,
        label: split ? `${material.title} · ${section.label}` : material.title,
        materialId: material.id,
        kind: 'library',
        ...(split ? {sectionIndex: index} : {}),
      });
      setInfo(
        split
          ? `This lesson is long, so it is split into ${sections.length} parts. Using ${section.label}; pick another part below.`
          : '',
      );
      return true;
    },
    [emitSource],
  );

  const loadNotesPage = useCallback(
    (more = false, afterCursor?: string | null) => {
      try {
        const page = notesQueryStore.page({
          userId,
          filter: 'All',
          limit: 50,
          after: more ? afterCursor : undefined,
        });
        setNotes(prev => (more ? [...prev, ...page.items] : page.items));
        setCursor(page.nextCursor);
        setLoaded(true);
        setError('');
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [userId],
  );

  const loadLibrary = useCallback(() => {
    try {
      setMaterials(materialStore.listMaterials(userId));
      setLibraryLoaded(true);
      setError('');
    } catch (e) {
      setError((e as Error).message || 'Could not read Lesson Q&A library.');
    }
  }, [userId]);

  useEffect(() => {
    appliedInitialRef.current = undefined;
    setNotes([]);
    setMaterials([]);
    setLibraryLoaded(false);
    setCursor(null);
    setLoaded(false);
    setNoteSearch('');
    setShowAllNotes(false);
    setError('');
    setInfo('');
    loadNotesPage(false, null);
  }, [userId, loadNotesPage]);

  useEffect(() => {
    if (
      !initialMaterialId ||
      appliedInitialRef.current === `${userId}:${initialMaterialId}`
    ) {
      return;
    }
    try {
      const list = materialStore.listMaterials(userId);
      setMaterials(list);
      setLibraryLoaded(true);
      const match = list.find(m => m.id === initialMaterialId);
      if (match) {
        appliedInitialRef.current = `${userId}:${initialMaterialId}`;
        setMode('From library');
        setError('');
        emitMaterialSection(
          match,
          materialStore.getMaterialSections(userId, match.id, MAX_SOURCE_CHARS),
          0,
        );
      }
    } catch (e) {
      setError((e as Error).message || 'Could not read Lesson Q&A library.');
    }
  }, [emitMaterialSection, initialMaterialId, userId]);

  useEffect(() => {
    if (source.materialId && !libraryLoaded) {
      loadLibrary();
    }
    if (
      prevSourceRef.current === source ||
      source === internalSourceRef.current
    ) {
      return;
    }
    prevSourceRef.current = source;
    if (
      source.kind ||
      source.materialId ||
      source.text ||
      source.notes?.length ||
      source.noteId
    ) {
      setMode(modeFromSource(source));
    }
  }, [source, libraryLoaded, loadLibrary]);

  const noteMetaList = useMemo(
    () =>
      notes.map(n => {
        const md = noteBodyToMarkdown(n.body);
        return {note: n, md, words: countWords(md)};
      }),
    [notes],
  );

  const filteredNotes = useMemo(() => {
    const q = noteSearch.trim().toLowerCase();
    if (!q) return noteMetaList;
    return noteMetaList.filter(
      item =>
        item.note.title.toLowerCase().includes(q) ||
        (item.note.category || '').toLowerCase().includes(q),
    );
  }, [noteMetaList, noteSearch]);

  const visibleNotes = useMemo(() => {
    if (noteSearch.trim() || showAllNotes) return filteredNotes;
    return filteredNotes.slice(0, initialVisibleNotes);
  }, [filteredNotes, noteSearch, showAllNotes, initialVisibleNotes]);

  const selectedNotes =
    source.notes ??
    (source.noteId
      ? [{id: source.noteId, title: source.label, text: source.text}]
      : []);

  const selectNote = (note: NoteSnapshot, md: string) => {
    setInfo('');
    const already = selectedNotes.some(n => n.id === note.id);
    const next = already
      ? selectedNotes.filter(n => n.id !== note.id)
      : [...selectedNotes, {id: note.id, title: note.title, text: md}];
    const rawText = next.map(n => `## ${n.title}\n${n.text}`).join('\n\n');
    if (next.length === 1 && rawText.length > MAX_SOURCE_CHARS) {
      const truncated = rawText.slice(0, MAX_SOURCE_CHARS);
      setError('');
      setInfo('Using the first 12,000 characters from this note.');
      emitSource({
        text: truncated,
        label: next[0].title,
        kind: 'notes',
        notes: [{...next[0], text: truncated}],
        noteId: next[0].id,
      });
      return;
    }
    if (rawText.length > MAX_SOURCE_CHARS) {
      setError(
        'Too much combined text (max 12,000 characters). Deselect a note or use Paste text for an excerpt.',
      );
      return;
    }
    setError('');
    emitSource({
      text: rawText,
      label: next.map(n => n.title).join(', '),
      kind: 'notes',
      notes: next,
      ...(next.length === 1 ? {noteId: next[0].id} : {}),
    });
  };

  const selectMaterial = (material: UserMaterialRecord) => {
    setError('');
    try {
      emitMaterialSection(
        material,
        materialStore.getMaterialSections(
          userId,
          material.id,
          MAX_SOURCE_CHARS,
        ),
        0,
      );
    } catch (e) {
      setError((e as Error).message || 'Could not read that lesson.');
    }
  };

  const activeMaterialId = source.materialId;
  const activeSections = useMemo(() => {
    if (!activeMaterialId) return [] as MaterialSection[];
    try {
      return materialStore.getMaterialSections(
        userId,
        activeMaterialId,
        MAX_SOURCE_CHARS,
      );
    } catch {
      return [] as MaterialSection[];
    }
  }, [activeMaterialId, userId]);

  const upload = async () => {
    if (readingFileRef.current || readingFile) return;
    const reqUserId = userId;
    readingFileRef.current = true;
    setError('');
    setInfo('');
    try {
    const picked = await pickDocument([
      'text/plain',
      'text/markdown',
      'text/csv',
      MIME_PDF,
      MIME_DOCX,
      MIME_PPTX,
    ]);
    if (!mountedRef.current || activeUserRef.current !== reqUserId) return;
    if (picked.status === 'cancelled') return;
    if (picked.status === 'failed') {
      setError(picked.message);
      return;
    }
    let knownSize = picked.file.sizeBytes;
    if (!knownSize) {
      const stat = await RNFS.stat(picked.file.uri).catch(() => null);
      if (!mountedRef.current || activeUserRef.current !== reqUserId) return;
      const statSize = Number(stat?.size);
      if (Number.isFinite(statSize) && statSize > 0) knownSize = statSize;
    }
    if (knownSize > MAX_FILE_BYTES) {
      setError('Choose a file smaller than 5 MB.');
      return;
    }
    setReadingFile(true);
    try {
      let text = '';
      const infoNotes: string[] = [];
      const lowerName = picked.file.name.toLowerCase();
      const isPdf =
        picked.file.mimeType === MIME_PDF || lowerName.endsWith('.pdf');
      const isOffice =
        picked.file.mimeType === MIME_DOCX ||
        picked.file.mimeType === MIME_PPTX ||
        lowerName.endsWith('.docx') ||
        lowerName.endsWith('.pptx');
      if (isPdf) {
        const vision = NativeModules.LafinaVision as
          | VisionExtractor
          | undefined;
        if (vision?.extractDocumentText) {
          const result = await vision.extractDocumentText(
            picked.file.uri,
            MAX_PDF_PAGES,
          );
          if (!result) {
            throw new Error(
              'Could not read that PDF. Paste its text or choose a different file.',
            );
          }
          text = (result.text ?? '').trim();
          const totalPages = result.pageCount ?? 1;
          const pagesRead = result.pagesRead ?? totalPages;
          if (totalPages > pagesRead) {
            infoNotes.push(
              `Read the first ${pagesRead} of ${totalPages} PDF pages.`,
            );
          }
          if ((result.ocrPages ?? 0) > 0) {
            infoNotes.push(
              `Used on-device OCR on ${result.ocrPages} scanned page${
                result.ocrPages === 1 ? '' : 's'
              }.`,
            );
          }
        } else if (vision?.extractPdfWords) {
          const result = await vision.extractPdfWords(picked.file.uri);
          if (!result) {
            throw new Error(
              'Could not inspect that PDF URI. Try choosing it from local Downloads or paste its text.',
            );
          }
          text = (result.words ?? []).map(w => w.t).join(' ');
          if ((result.pageCount ?? 1) > 1) {
            infoNotes.push(
              'PDF extraction read page 1. Paste additional pages if needed.',
            );
          }
        } else {
          throw new Error(
            'PDF text extraction is unavailable in this build. Paste text instead.',
          );
        }
        if (!text.trim()) {
          throw new Error(
            'This PDF has no readable text. Paste its text or choose a text file.',
          );
        }
      } else if (isOffice) {
        const vision = NativeModules.LafinaVision as
          | VisionExtractor
          | undefined;
        if (!vision?.extractOfficeDocumentPages) {
          throw new Error(
            'Word and PowerPoint extraction is unavailable in this build. Export as PDF or paste text instead.',
          );
        }
        const office = await vision.extractOfficeDocumentPages(
          picked.file.uri,
          picked.file.name,
        );
        if (!office || !Array.isArray(office.pages)) {
          throw new Error('Could not read that Office document.');
        }
        text = office.pages
          .map(page => (typeof page.text === 'string' ? page.text.trim() : ''))
          .filter(Boolean)
          .join('\n\n');
        if (
          typeof office.pageCount === 'number' &&
          typeof office.pagesRead === 'number' &&
          office.pageCount > office.pagesRead
        ) {
          infoNotes.push(
            `Read the first ${office.pagesRead} of ${office.pageCount} pages.`,
          );
        }
      } else {
        text = await readTextFileSafely(picked.file.uri);
      }
      if (!mountedRef.current || activeUserRef.current !== reqUserId) return;
      if (!text.trim()) throw new Error('This file is empty.');
      const trimmed = text.trim();
      emitSource({
        text: trimmed.slice(0, MAX_SOURCE_CHARS),
        label: picked.file.name,
        kind: 'file',
      });
      if (trimmed.length > MAX_SOURCE_CHARS) {
        infoNotes.push(
          'Using the first 12,000 characters. Split longer material into smaller files.',
        );
      }
      setInfo(infoNotes.join(' '));
    } catch (e) {
      if (mountedRef.current && activeUserRef.current === reqUserId) {
        setError((e as Error).message || 'Could not read the selected file.');
      }
    } finally {
      if (mountedRef.current) {
        setReadingFile(false);
      }
    }
    } finally {
      readingFileRef.current = false;
    }
  };

  const onlineModeEnabled =
    settingsRevision >= 0 &&
    localSettingsStore.get(userId, 'chat.onlineMode') === 'true';
  const hasCloudSession =
    Boolean(cloudClient.getAccessToken()) || directProviderTestEnabled();
  const statusWarning = hideOfflineNotice
    ? null
    : !connected || !onlineModeEnabled
    ? STUDY_OFFLINE_MESSAGE
    : !hasCloudSession
    ? 'Sign in to a LAFINA account to generate AI study material.'
    : null;

  const budgetProgress = Math.min(1, source.text.length / MAX_SOURCE_CHARS);

  return (
    <>
      {statusWarning && (
        <View
          style={[
            styles.banner,
            {backgroundColor: p.peach, borderColor: p.border},
          ]}
        >
          <WifiOff size={16} color={p.peachInk} />
          <View style={ui.fill}>
            <Text style={[styles.bannerText, {color: p.peachInk}]}>
              {statusWarning}
            </Text>
          </View>
        </View>
      )}

      <View style={ui.field}>
        <SkillText strong size={13}>
          Source
        </SkillText>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          accessibilityRole="radiogroup"
          accessibilityLabel="Source"
          contentContainerStyle={styles.modeRow}
        >
          {SOURCE_MODES.map(({id, label, Icon}) => {
            const active = mode === id;
            return (
              <TouchableOpacity
                key={id}
                accessibilityRole="radio"
                accessibilityLabel={id}
                accessibilityState={{checked: active}}
                onPress={() => {
                  setMode(id);
                  setError('');
                  if (id === 'From library' && !libraryLoaded) {
                    loadLibrary();
                  }
                }}
                style={[
                  styles.modeChip,
                  {
                    backgroundColor: active ? p.blueSoft : p.card,
                    borderColor: active ? p.accent : p.border,
                  },
                ]}
              >
                <Icon size={15} color={active ? p.accent : p.muted} />
                <Text
                  style={[
                    styles.modeChipText,
                    {
                      color: active ? p.accent : p.text,
                      fontFamily: active
                        ? SkillFonts.semibold
                        : SkillFonts.medium,
                    },
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {mode === 'From notes' && (
        <>
          <View style={ui.between}>
            <SkillText muted size={12}>
              {notes.length
                ? `Select one or more notes (${selectedNotes.length} chosen)`
                : loaded
                ? 'No saved notes yet'
                : 'Loading notes…'}
            </SkillText>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Refresh notes"
              onPress={() => loadNotesPage(false, null)}
              style={styles.inlineLink}
            >
              <Text style={[styles.inlineLinkText, {color: p.accent}]}>
                Refresh
              </Text>
            </TouchableOpacity>
          </View>

          {notes.length > initialVisibleNotes && (
            <View
              style={[
                styles.noteSearchWrap,
                {backgroundColor: p.surface, borderColor: p.border},
              ]}
            >
              <Search size={15} color={p.muted} />
              <TextInput
                accessibilityLabel="Filter notes"
                placeholder="Filter notes by title…"
                placeholderTextColor={p.muted}
                value={noteSearch}
                onChangeText={setNoteSearch}
                style={[styles.noteSearchInput, {color: p.text}]}
              />
              {!!noteSearch && (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Clear note filter"
                  onPress={() => setNoteSearch('')}
                  style={styles.clearIconBtn}
                >
                  <X size={14} color={p.muted} />
                </TouchableOpacity>
              )}
            </View>
          )}

          {loaded && !notes.length && (
            <SkillCard>
              <SkillText muted>
                No notes yet. Write a note, pick from Library, or paste text to
                begin.
              </SkillText>
            </SkillCard>
          )}

          {loaded && notes.length > 0 && !filteredNotes.length && (
            <SkillText muted size={13}>
              No notes match “{noteSearch.trim()}”.
            </SkillText>
          )}

          {visibleNotes.length > 0 && (
            <View
              style={[
                styles.groupedList,
                {backgroundColor: p.card, borderColor: p.border},
              ]}
            >
              {visibleNotes.map(({note, md, words}, idx) => {
                const checked = selectedNotes.some(item => item.id === note.id);
                return (
                  <TouchableOpacity
                    key={note.id}
                    accessibilityRole="checkbox"
                    accessibilityLabel={note.title}
                    accessibilityState={{checked}}
                    onPress={() => selectNote(note, md)}
                    style={[
                      styles.noteRow,
                      idx > 0 && {
                        borderTopWidth: StyleSheet.hairlineWidth,
                        borderTopColor: p.border,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        {
                          backgroundColor: checked ? p.accent : p.bg,
                          borderColor: checked ? p.accent : p.border,
                        },
                      ]}
                    >
                      {checked && <Check size={14} color={p.onAccent} />}
                    </View>
                    <View style={ui.fill}>
                      <SkillText strong size={15}>
                        {note.title}
                      </SkillText>
                      <SkillText muted size={12}>
                        {note.category || 'Note'} · {words}{' '}
                        {words === 1 ? 'word' : 'words'}
                      </SkillText>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {!noteSearch.trim() && filteredNotes.length > initialVisibleNotes && (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={
                showAllNotes
                  ? 'Show fewer notes'
                  : `Show all ${filteredNotes.length} notes`
              }
              onPress={() => setShowAllNotes(prev => !prev)}
              style={styles.showAllBtn}
            >
              <Text style={[styles.inlineLinkText, {color: p.accent}]}>
                {showAllNotes
                  ? 'Show fewer notes'
                  : `Show all ${filteredNotes.length} notes`}
              </Text>
            </TouchableOpacity>
          )}

          {cursor &&
            (showAllNotes || filteredNotes.length <= initialVisibleNotes) && (
              <SkillButton
                secondary
                label="More notes"
                onPress={() => loadNotesPage(true, cursor)}
              />
            )}
        </>
      )}

      {mode === 'From library' && (
        <>
          <View style={ui.between}>
            <SkillText muted size={12}>
              {libraryLoaded && materials.length > 0
                ? 'Choose a file from Lesson Q&A'
                : 'Lesson Q&A library'}
            </SkillText>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Refresh library"
              onPress={loadLibrary}
              style={styles.inlineLink}
            >
              <Text style={[styles.inlineLinkText, {color: p.accent}]}>
                {libraryLoaded ? 'Refresh' : 'Load library'}
              </Text>
            </TouchableOpacity>
          </View>
          {libraryLoaded && !materials.length && (
            <SkillCard>
              <SkillText muted>
                No uploaded lesson files yet. Upload a file in Lesson Q&A or
                switch to Upload file.
              </SkillText>
            </SkillCard>
          )}
          {materials.map(m => {
            const active = source.materialId
              ? source.materialId === m.id
              : !source.noteId &&
                !source.notes?.length &&
                source.label === m.title;
            return (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`Select lesson ${m.title}`}
                key={m.id}
                onPress={() => selectMaterial(m)}
              >
                <SkillCard
                  style={{
                    borderColor: active ? p.accent : p.border,
                    borderWidth: active ? 2 : 1,
                    backgroundColor: active ? p.blueSoft : p.card,
                  }}
                >
                  <SkillText strong>{m.title}</SkillText>
                  <SkillText muted size={12}>
                    {m.fileKind.toUpperCase()} · {m.pagesRead} page
                    {m.pagesRead === 1 ? '' : 's'} ·{' '}
                    {m.totalChars.toLocaleString()} chars
                  </SkillText>
                  {active && activeSections.length > 1 && (
                    <View
                      accessibilityRole="radiogroup"
                      accessibilityLabel="Part of the lesson to use"
                      style={styles.sectionChips}
                    >
                      {activeSections.map(section => {
                        const chosen =
                          (source.sectionIndex ?? 0) === section.index;
                        const headingHint = section.heading
                          ? `, ${section.heading}`
                          : '';
                        return (
                          <TouchableOpacity
                            key={section.index}
                            testID={`source-section-${section.index}`}
                            accessibilityRole="radio"
                            accessibilityState={{selected: chosen}}
                            accessibilityLabel={`Use ${section.label}${headingHint}`}
                            onPress={() =>
                              emitMaterialSection(
                                m,
                                activeSections,
                                section.index,
                              )
                            }
                            style={[
                              styles.sectionChip,
                              {
                                backgroundColor: chosen ? p.accent : p.surface,
                                borderColor: chosen ? p.accent : p.border,
                              },
                            ]}
                          >
                            <Text
                              numberOfLines={1}
                              style={[
                                styles.sectionChipText,
                                {color: chosen ? p.onAccent : p.text},
                              ]}
                            >
                              {section.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </SkillCard>
              </TouchableOpacity>
            );
          })}
        </>
      )}

      {mode === 'Paste text' &&
        (() => {
          const isOtherSourceActive =
            selectedNotes.length > 0 ||
            Boolean(source.materialId) ||
            (Boolean(source.label) && source.label !== 'Pasted text');
          return (
            <>
              {isOtherSourceActive && source.text.trim().length > 0 && (
                <SkillText muted size={12}>
                  Currently using{' '}
                  {source.label ||
                    `${selectedNotes.length} selected note${
                      selectedNotes.length === 1 ? '' : 's'
                    }`}
                  . Pasting here replaces that source.
                </SkillText>
              )}
              <SkillInput
                label="Text to work with"
                placeholder="Paste lecture notes, definitions, or reading excerpts…"
                value={isOtherSourceActive ? '' : source.text}
                multiline
                maxLength={MAX_SOURCE_CHARS}
                style={{minHeight: 140, textAlignVertical: 'top'}}
                onChangeText={text => {
                  setInfo('');
                  setError('');
                  emitSource({
                    text,
                    label: text.trim() ? 'Pasted text' : '',
                    kind: 'paste',
                  });
                }}
              />
            </>
          );
        })()}

      {mode === 'Upload file' && (
        <>
          <SkillButton
            secondary
            disabled={readingFile}
            label={readingFile ? 'Reading file…' : 'Choose lesson or text file'}
            onPress={() => {
              void upload();
            }}
          />
          <SkillText muted size={12}>
            PDF (text & scanned OCR, up to 10 pages), Word (.docx), PowerPoint
            (.pptx), Text, Markdown & CSV · up to 5 MB.
          </SkillText>
          {!SKILLS_CAPABILITIES.docxSourceExtraction && (
            <SkillText muted size={12}>
              Word uploads are not available yet. Choose text or a PDF file.
            </SkillText>
          )}
        </>
      )}

      {!!source.text && (
        <View
          style={[
            styles.selectedBar,
            {backgroundColor: p.surface, borderColor: p.border},
          ]}
        >
          <View style={ui.between}>
            <View style={ui.fill}>
              <SkillText strong size={12}>
                {source.label || 'Selected material'}
              </SkillText>
              <SkillText muted size={12}>
                {source.text.length.toLocaleString()} / 12,000 characters
              </SkillText>
              {maxEffectiveChars !== undefined &&
                source.text.length > maxEffectiveChars && (
                  <SkillText muted size={12}>
                    {longSourceNote ??
                      `Only the first ${maxEffectiveChars.toLocaleString()} characters will be used.`}
                  </SkillText>
                )}
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Clear selected source"
              onPress={() => {
                setError('');
                setInfo('');
                emitSource({text: '', label: ''});
              }}
              style={ui.icon}
            >
              <SkillText muted size={12} strong>
                Clear
              </SkillText>
            </TouchableOpacity>
          </View>
          <View style={[styles.budgetTrack, {backgroundColor: p.card}]}>
            <View
              style={[
                styles.budgetFill,
                {
                  width: `${Math.round(budgetProgress * 100)}%`,
                  backgroundColor:
                    budgetProgress >= 0.95 ? p.peachInk : p.accent,
                },
              ]}
            />
          </View>
        </View>
      )}
      {!!info && (
        <SkillText muted size={12}>
          {info}
        </SkillText>
      )}
      {!!error && (
        <SkillText danger size={13}>
          {error}
        </SkillText>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  bannerText: {
    fontFamily: SkillFonts.medium,
    fontSize: 12,
    lineHeight: 17,
  },
  modeRow: {
    gap: 8,
    paddingVertical: 2,
  },
  modeChip: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  modeChipText: {
    fontSize: 13,
  },
  inlineLink: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  inlineLinkText: {
    fontFamily: SkillFonts.semibold,
    fontSize: 13,
  },
  sectionChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  sectionChip: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1,
    justifyContent: 'center',
    maxWidth: '100%',
  },
  sectionChipText: {
    fontFamily: SkillFonts.semibold,
    fontSize: 13,
  },
  noteSearchWrap: {
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 4,
  },
  noteSearchInput: {
    flex: 1,
    fontFamily: SkillFonts.body,
    fontSize: 14,
    paddingVertical: 6,
  },
  clearIconBtn: {
    minWidth: 32,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupedList: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    marginVertical: 6,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 58,
    paddingVertical: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  showAllBtn: {
    minHeight: 40,
    justifyContent: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 4,
  },
  selectedBar: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginVertical: 8,
    gap: 8,
  },
  budgetTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  budgetFill: {
    height: 4,
    borderRadius: 2,
  },
});
