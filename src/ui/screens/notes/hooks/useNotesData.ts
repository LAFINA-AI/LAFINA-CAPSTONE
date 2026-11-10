import {useState, useEffect, useCallback, useRef, useMemo} from 'react';
import {Alert, Animated, LayoutAnimation, UIManager} from 'react-native';
import type {NoteSnapshot, NoteWriteTarget} from '../../../../storage';
import {
  isNoteEditConflict,
  localSettingsStore,
  NOTES_PAGE_SIZE,
  notesEditStore,
  notesQueryStore,
  notesStore,
  tasksStore,
} from '../../../../storage';
import {FilterType} from '../types';
import {
  applyNoteFormat,
  continueListOnNewline,
  extractChecklistItems,
  generateId,
  isBodyEmpty,
  isHtmlBody,
  noteBodyToMarkdown,
  toggleChecklistItem,
} from '../../../../utils';
import type {NoteFormat} from '../../../../utils';
import {registerCustomCategoryColor} from '../../../theme/categoryColors';

// Enable LayoutAnimation on Android
if (UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/** Smooth spring-like LayoutAnimation preset for swap transitions */
const swapAnimation = {
  duration: 300,
  create: {
    type: LayoutAnimation.Types.spring,
    property: LayoutAnimation.Properties.scaleXY,
    springDamping: 0.7,
  },
  update: {
    type: LayoutAnimation.Types.spring,
    springDamping: 0.7,
  },
};

/** Where the chosen note filter is kept between visits to the screen. */
const NOTES_FILTER_KEY = 'notes.selectedFilter';
const DEFAULT_FILTER: FilterType = 'All';
/** Filters that are always offered, whatever categories the account has. */
const BUILT_IN_FILTERS: readonly FilterType[] = [
  'All',
  'AI Transcribed',
  'Pinned',
  'Personal',
  'Work',
  'Health',
  'Learning',
];

/** Delay before asking again while the search cache is still being built. */
const INDEXING_RETRY_MS = 30;

const targetOf = (note: NoteSnapshot): NoteWriteTarget => ({
  id: note.id,
  userId: note.userId,
  revision: note.revision,
});

interface UseNotesDataOptions {
  userId: string;
  refreshTrigger: number;
  onRefresh: () => void;
}

export const useNotesData = (options: UseNotesDataOptions) => {
  const {userId, refreshTrigger, onRefresh} = options;

  const [customCategories, setCustomCategories] = useState<string[]>(() => {
    const cats = notesStore.getCustomCategories(userId);
    cats.forEach(c => registerCustomCategoryColor(c.name, c.color));
    return cats.map(c => c.name);
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchActive, setSearchActive] = useState(false);
  const [selectedFilter, setSelectedFilterState] = useState<FilterType>(() => {
    const saved =
      localSettingsStore.get(userId, NOTES_FILTER_KEY, DEFAULT_FILTER) ??
      DEFAULT_FILTER;
    return BUILT_IN_FILTERS.includes(saved) || customCategories.includes(saved)
      ? saved
      : DEFAULT_FILTER;
  });
  // Keep AGY's immediate first paint using the bounded, revision-aware page.
  const [initialPage] = useState(() => {
    try {
      return notesQueryStore.page({
        userId,
        filter: selectedFilter,
        limit: NOTES_PAGE_SIZE,
      });
    } catch {
      return null;
    }
  });
  const [notes, setNotes] = useState<NoteSnapshot[]>(initialPage?.items ?? []);
  const [cursor, setCursor] = useState<string | null>(
    initialPage?.nextCursor ?? null,
  );
  const [indexing, setIndexing] = useState(initialPage?.indexing ?? false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [isGridView, setIsGridView] = useState(true);

  // Editor state
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingNote, setEditingNote] = useState<NoteSnapshot | null>(null);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const [noteCategory, setNoteCategory] = useState('Personal');
  const [noteTags, setNoteTags] = useState<string[]>([]);
  const [isPinned, setIsPinned] = useState(false);
  const [isVoice, setIsVoice] = useState(false);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [selection, setSelection] = useState({start: 0, end: 0});

  // Drag state
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragXRef = useRef(new Animated.Value(0));
  const dragYRef = useRef(new Animated.Value(0));
  const [renderGen, setRenderGen] = useState(0);
  const notesRef = useRef<NoteSnapshot[]>(notes);
  const activeDragIdRef = useRef<string | null>(null);
  const cardLayoutsRef = useRef<{
    [id: string]: {x: number; y: number; width: number; height: number};
  }>({});
  const dragStartLayoutRef = useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const dragOffsetRef = useRef({x: 0, y: 0});
  notesRef.current = notes;

  // AI loading
  const [aiLoading, setAiLoading] = useState(false);
  const [aiActionType, setAiActionType] = useState('');

  // Late work (indexing retries, AI timers, delete prompts) runs only while the
  // owner, query and editor session it started under are still current.
  const ownerRef = useRef(userId);
  ownerRef.current = userId;
  const queryTokenRef = useRef(0);
  const editorTokenRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setSelectedFilter = useCallback(
    (filter: FilterType) => {
      setSelectedFilterState(filter);
      localSettingsStore.set(userId, NOTES_FILTER_KEY, filter);
    },
    [userId],
  );

  const loadCategories = useCallback(() => {
    const cats = notesStore.getCustomCategories(userId);
    cats.forEach(c => {
      registerCustomCategoryColor(c.name, c.color);
    });
    const names = cats.map(c => c.name);
    setCustomCategories(names);
    setSelectedFilterState(current =>
      BUILT_IN_FILTERS.includes(current) || names.includes(current)
        ? current
        : DEFAULT_FILTER,
    );
  }, [userId]);

  /** Reads the first page for the current owner, filter and search. */
  const loadNotes = useCallback(() => {
    loadCategories();
    queryTokenRef.current += 1;
    const token = queryTokenRef.current;
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
    try {
      const page = notesQueryStore.page({
        userId,
        filter: selectedFilter,
        search: searchQuery,
        limit: NOTES_PAGE_SIZE,
      });
      setNotes(page.items);
      setCursor(page.nextCursor);
      setIndexing(page.indexing);
      setQueryError(null);
      if (page.indexing) {
        // Bounded batches: ask again until every note is searchable.
        retryTimerRef.current = setTimeout(() => {
          if (queryTokenRef.current === token && ownerRef.current === userId)
            loadNotesRef.current();
        }, INDEXING_RETRY_MS);
      }
    } catch (error) {
      setNotes([]);
      setCursor(null);
      setIndexing(false);
      setQueryError(
        error instanceof Error && error.name === 'InvalidNotesQueryError'
          ? error.message
          : 'Notes could not be loaded. Reopen Notes to try again.',
      );
    }
  }, [userId, selectedFilter, searchQuery, loadCategories]);
  const loadNotesRef = useRef(loadNotes);
  loadNotesRef.current = loadNotes;

  /** Appends the next page; duplicates (a note edited meanwhile) are skipped. */
  const loadMoreNotes = useCallback(() => {
    if (!cursor) return;
    const token = queryTokenRef.current;
    try {
      const page = notesQueryStore.page({
        userId,
        filter: selectedFilter,
        search: searchQuery,
        after: cursor,
        limit: NOTES_PAGE_SIZE,
      });
      if (queryTokenRef.current !== token) return;
      setNotes(current => {
        const seen = new Set(current.map(n => n.id));
        return [...current, ...page.items.filter(n => !seen.has(n.id))];
      });
      setCursor(page.nextCursor);
    } catch {
      loadNotes();
    }
  }, [cursor, userId, selectedFilter, searchQuery, loadNotes]);

  useEffect(
    () => () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    },
    [],
  );

  const addCategory = useCallback(
    (name: string, color: string) => {
      if (!name.trim()) return;
      const normalizedName = name.trim();
      const standard = ['Work', 'Personal', 'Health', 'Learning'];
      if (
        standard.includes(normalizedName) ||
        customCategories.includes(normalizedName)
      ) {
        Alert.alert('Duplicate Category', 'This category already exists.');
        return;
      }
      notesStore.addCustomCategory(userId, normalizedName, color);
      registerCustomCategoryColor(normalizedName, color);
      loadNotes();
    },
    [userId, customCategories, loadNotes],
  );

  useEffect(() => {
    loadNotes();
  }, [userId, refreshTrigger, loadNotes]);

  // A different account never sees, saves or deletes the previous one's note.
  const previousOwnerRef = useRef(userId);
  useEffect(() => {
    if (previousOwnerRef.current === userId) return;
    previousOwnerRef.current = userId;
    editorTokenRef.current += 1;
    setEditorVisible(false);
    setEditingNote(null);
    setNoteTitle('');
    setNoteBody('');
    setNoteTags([]);
    setImageUri(null);
    setAiLoading(false);
  }, [userId]);

  // Drag lifecycle
  const onCardLayout = useCallback(
    (
      id: string,
      layout: {x: number; y: number; width: number; height: number},
    ) => {
      cardLayoutsRef.current[id] = layout;
    },
    [],
  );

  const handleDragStart = useCallback((noteId: string, _index: number) => {
    activeDragIdRef.current = noteId;
    dragOffsetRef.current = {x: 0, y: 0};
    const layout = cardLayoutsRef.current[noteId];
    dragStartLayoutRef.current = layout ? {...layout} : null;
    setActiveDragId(noteId);
    setIsDragging(true);
  }, []);

  const handleDragMove = useCallback((dx: number, dy: number) => {
    const draggedId = activeDragIdRef.current;
    if (!draggedId) return;
    const initialLayout = dragStartLayoutRef.current;
    if (!initialLayout) return;

    const currentX = initialLayout.x + dx + dragOffsetRef.current.x;
    const currentY = initialLayout.y + dy + dragOffsetRef.current.y;

    dragXRef.current.setValue(dx + dragOffsetRef.current.x);
    dragYRef.current.setValue(dy + dragOffsetRef.current.y);

    const centerX = currentX + initialLayout.width / 2;
    const centerY = currentY + initialLayout.height / 2;

    const currentNotes = notesRef.current;
    const curIdx = currentNotes.findIndex(n => n.id === draggedId);
    if (curIdx === -1) return;

    const draggedNote = currentNotes[curIdx];
    if (!draggedNote) return;

    let targetIdx = -1;
    let minDistance = Infinity;
    const baseCenterX =
      initialLayout.x + dragOffsetRef.current.x + initialLayout.width / 2;
    const baseCenterY =
      initialLayout.y + dragOffsetRef.current.y + initialLayout.height / 2;
    const distToSelfSqr =
      Math.pow(centerX - baseCenterX, 2) + Math.pow(centerY - baseCenterY, 2);

    for (let i = 0; i < currentNotes.length; i++) {
      const note = currentNotes[i];
      if (note.id === draggedId || note.isPinned) continue;
      const layout = cardLayoutsRef.current[note.id];
      if (layout) {
        const d =
          Math.pow(centerX - (layout.x + layout.width / 2), 2) +
          Math.pow(centerY - (layout.y + layout.height / 2), 2);
        if (d < distToSelfSqr && d < minDistance) {
          minDistance = d;
          targetIdx = i;
        }
      }
    }

    if (targetIdx === -1 || targetIdx === curIdx) return;
    const targetNote = currentNotes[targetIdx];
    const targetLayout = cardLayoutsRef.current[targetNote.id];
    if (!targetLayout) return;

    LayoutAnimation.configureNext(swapAnimation);
    const newNotes = [...currentNotes];
    newNotes.splice(curIdx, 1);
    newNotes.splice(targetIdx, 0, draggedNote);

    const oldLayoutsMap = {...cardLayoutsRef.current};
    for (let i = 0; i < currentNotes.length; i++) {
      const oldNote = currentNotes[i];
      const newIndex = newNotes.findIndex(n => n.id === oldNote.id);
      if (newIndex !== -1) {
        cardLayoutsRef.current[oldNote.id] =
          oldLayoutsMap[currentNotes[newIndex].id];
      }
    }

    notesRef.current = newNotes;
    setNotes(newNotes);

    const oldBaseX = initialLayout.x + dragOffsetRef.current.x;
    const oldBaseY = initialLayout.y + dragOffsetRef.current.y;
    dragOffsetRef.current.x += oldBaseX - targetLayout.x;
    dragOffsetRef.current.y += oldBaseY - targetLayout.y;
    dragXRef.current.setValue(dx + dragOffsetRef.current.x);
    dragYRef.current.setValue(dy + dragOffsetRef.current.y);
    dragStartLayoutRef.current = {
      x: targetLayout.x - dragOffsetRef.current.x,
      y: targetLayout.y - dragOffsetRef.current.y,
      width: initialLayout.width,
      height: initialLayout.height,
    };
  }, []);

  const handleDragEnd = useCallback(() => {
    const latestNotes = notesRef.current;
    let orderSaved = true;
    try {
      // Only the complete, unchanged collection may set the global order.
      notesQueryStore.reorder(userId, latestNotes);
    } catch {
      orderSaved = false;
    }

    activeDragIdRef.current = null;
    setActiveDragId(null);
    setIsDragging(false);
    dragOffsetRef.current = {x: 0, y: 0};
    dragStartLayoutRef.current = null;
    setRenderGen(g => g + 1);
    // Reload either way: saved notes have new revisions, refused ones their old order.
    loadNotes();
    if (!orderSaved) {
      Alert.alert(
        'Note order not saved',
        'Your notes keep their previous order. Please try again.',
      );
    }
    onRefresh();
  }, [userId, loadNotes, onRefresh]);

  const handleDragRelease = useCallback(() => {
    handleDragEnd();
  }, [handleDragEnd]);

  // Editor
  const openNewNote = useCallback(() => {
    editorTokenRef.current += 1;
    setEditingNote(null);
    setNoteTitle('');
    setNoteBody('');
    setNoteCategory('Personal');
    setNoteTags([]);
    setIsPinned(false);
    setIsVoice(false);
    setImageUri(null);
    setSelection({start: 0, end: 0});
    setEditorVisible(true);
  }, []);

  const openEditNote = useCallback(
    (listed: NoteSnapshot) => {
      if (isDragging) return;
      // Open the saved version as it is now, with its revision, not a stale card.
      const note = notesEditStore.getSnapshot(userId, listed.id);
      if (!note) {
        Alert.alert(
          'Note not found',
          'This note was deleted or moved to another account.',
        );
        loadNotes();
        return;
      }
      editorTokenRef.current += 1;
      const body = noteBodyToMarkdown(note.body);
      setEditingNote(note);
      setNoteTitle(note.title);
      setNoteBody(body);
      setNoteCategory(note.category);
      setNoteTags(note.tags);
      setIsPinned(note.isPinned);
      setIsVoice(note.isVoiceTranscribed);
      setImageUri(note.imageUri || null);
      setSelection({start: body.length, end: body.length});
      setEditorVisible(true);
    },
    [isDragging, userId, loadNotes],
  );

  const closeEditor = useCallback(() => {
    editorTokenRef.current += 1;
    setEditorVisible(false);
  }, []);

  const applyFormatting = useCallback(
    (type: NoteFormat) => {
      const edit = applyNoteFormat(noteBody, selection, type);
      setNoteBody(edit.body);
      setSelection(edit.selection);
    },
    [noteBody, selection],
  );

  const changeBody = useCallback(
    (next: string) => {
      const carried = continueListOnNewline(noteBody, next);
      if (!carried) {
        setNoteBody(next);
        return;
      }
      setNoteBody(carried.body);
      setSelection(carried.selection);
    },
    [noteBody],
  );

  const toggleEditorChecklist = useCallback((index: number) => {
    setEditingNote(note => {
      if (!note) return note;
      const body = toggleChecklistItem(note.body, index);
      return body === note.body ? note : {...note, body};
    });
    setNoteBody(previous => toggleChecklistItem(previous, index));
  }, []);

  const toggleNoteChecklist = useCallback(
    (note: NoteSnapshot, index: number) => {
      const body = toggleChecklistItem(note.body, index);
      if (body === note.body) return;
      try {
        // Only over the version this card shows (AGY-PORT 07).
        notesEditStore.save(targetOf(note), {body});
      } catch (error) {
        loadNotes();
        Alert.alert(
          isNoteEditConflict(error)
            ? 'Note changed elsewhere'
            : 'Checklist not saved',
          isNoteEditConflict(error)
            ? 'The latest version is shown now. Tap the item again if you still want to change it.'
            : 'Please try again.',
        );
        return;
      }
      loadNotes();
      onRefresh();
    },
    [loadNotes, onRefresh],
  );

  const saveNote = useCallback(() => {
    if (!noteTitle.trim() && !noteBody.trim() && !imageUri) {
      setEditorVisible(false);
      return;
    }
    const titleStr = noteTitle.trim() || 'Untitled Note';
    const finish = () => {
      editorTokenRef.current += 1;
      setEditorVisible(false);
      loadNotes();
      onRefresh();
    };
    const createFromDraft = (title: string, tags: string[]) =>
      notesEditStore.create({
        id: generateId('note'),
        userId,
        title,
        body: noteBody,
        category: noteCategory,
        isPinned: isPinned,
        tags,
        isVoiceTranscribed: isVoice,
        imageUri: imageUri,
      });

    try {
      if (editingNote) {
        const bodyUnchanged =
          isHtmlBody(editingNote.body) &&
          noteBody === noteBodyToMarkdown(editingNote.body);
        // Revision-checked (AGY-PORT 07): never over a newer saved version.
        notesEditStore.save(targetOf(editingNote), {
          title: titleStr,
          body: bodyUnchanged ? editingNote.body : noteBody,
          category: noteCategory,
          isPinned: isPinned,
          tags: noteTags,
          imageUri: imageUri,
        });
      } else {
        createFromDraft(titleStr, isVoice ? ['AI Transcribed'] : noteTags);
      }
    } catch (error) {
      // The editor stays open so the student's text is not lost.
      if (isNoteEditConflict(error) && error.reason !== 'owner_changed') {
        const token = editorTokenRef.current;
        const reason = error.reason;
        Alert.alert(
          reason === 'deleted'
            ? 'Note was deleted elsewhere'
            : 'Note changed elsewhere',
          'Your text is still here. Keep editing, or save your text as a new note so nothing is overwritten.',
          [
            {text: 'Keep editing', style: 'cancel'},
            {
              text: 'Save as a copy',
              onPress: () => {
                if (
                  editorTokenRef.current !== token ||
                  ownerRef.current !== userId
                )
                  return;
                try {
                  createFromDraft(
                    reason === 'changed' ? `${titleStr} (copy)` : titleStr,
                    noteTags,
                  );
                } catch {
                  Alert.alert(
                    'Note not saved',
                    'Your text is still here. Please try again.',
                  );
                  return;
                }
                finish();
              },
            },
          ],
        );
        return;
      }
      Alert.alert(
        'Note not saved',
        isNoteEditConflict(error)
          ? error.message
          : 'Your text is still here. Please try again.',
      );
      return;
    }

    finish();
  }, [
    noteTitle,
    noteBody,
    imageUri,
    editingNote,
    noteCategory,
    isPinned,
    noteTags,
    isVoice,
    userId,
    loadNotes,
    onRefresh,
  ]);

  const deleteNote = useCallback(
    (id: string) => {
      // The version being deleted is the one on screen when the prompt opened.
      const shown =
        editingNote && editingNote.id === id
          ? editingNote
          : notesRef.current.find(n => n.id === id);
      if (!shown) return;
      const target = targetOf(shown);
      const token = editorTokenRef.current;
      Alert.alert('Delete Note', 'Are you sure you want to delete this note?', [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            if (
              editorTokenRef.current !== token ||
              ownerRef.current !== target.userId
            )
              return;
            try {
              notesEditStore.remove(target);
            } catch (error) {
              Alert.alert(
                'Note not deleted',
                isNoteEditConflict(error) && error.reason === 'changed'
                  ? 'This note changed since you opened it, so it was not deleted. Your text is still here.'
                  : 'This note could not be deleted. Please try again.',
              );
              return;
            }
            editorTokenRef.current += 1;
            setEditorVisible(false);
            loadNotes();
            onRefresh();
          },
        },
      ]);
    },
    [editingNote, loadNotes, onRefresh],
  );

  /** Filtering and search run in SQL; the loaded pages are already the result. */
  const getFilteredNotes = useCallback(() => notes, [notes]);

  const triggerAiAction = useCallback(
    (action: 'summarize' | 'clean' | 'tasks') => {
      if (isBodyEmpty(noteBody)) {
        Alert.alert(
          'Nothing to work with',
          'Write something in the note body first.',
        );
        return;
      }
      setAiActionType(action);
      setAiLoading(true);
      const token = editorTokenRef.current;
      const owner = userId;

      setTimeout(() => {
        setAiLoading(false);
        // Retired if the editor closed, another note opened or the account changed.
        if (editorTokenRef.current !== token || ownerRef.current !== owner)
          return;
        if (action === 'summarize') {
          setNoteBody(
            prev =>
              `${prev}\n\n### AI summary\n` +
              '- Key focus of this note centers on productivity details.\n' +
              '- Critical path action items should be extracted and scheduled.',
          );
        } else if (action === 'clean') {
          setNoteBody(prev =>
            prev
              .split('\n')
              .map(line => line.replace(/[ \t]+$/, ''))
              .join('\n')
              .replace(/\n{3,}/g, '\n\n')
              .trim(),
          );
          Alert.alert(
            'AI Clean Up',
            'Empty blocks were collapsed and spacing was tidied.',
          );
        } else if (action === 'tasks') {
          const checklist = extractChecklistItems(noteBody).filter(
            item => !item.done,
          );
          const candidates =
            checklist.length > 0
              ? checklist.map(item => item.text)
              : noteBodyToMarkdown(noteBody)
                  .split('\n')
                  .map(line => line.replace(/^[-*#>\s]+/, '').trim())
                  .filter(line => line.length > 5);

          const today = new Date().toISOString().split('T')[0];
          candidates.forEach(title => {
            tasksStore.insertTask({
              id: generateId('task'),
              userId,
              title,
              dueDate: today,
              dueTime: '09:00',
              isCompleted: false,
              priority: 'Medium',
              category: noteCategory,
              notes: `Extracted from note: ${noteTitle}`,
            });
          });

          if (candidates.length > 0) {
            Alert.alert(
              'AI Task Extractor',
              `Successfully created ${candidates.length} task${
                candidates.length === 1 ? '' : 's'
              } in your Schedule!`,
            );
          } else {
            tasksStore.insertTask({
              id: generateId('task'),
              userId,
              title: noteTitle || 'Untitled Note',
              dueDate: today,
              dueTime: '09:00',
              isCompleted: false,
              priority: 'Medium',
              category: noteCategory,
              notes: noteBody,
            });
            Alert.alert(
              'AI Task Extractor',
              `Created 1 task based on note: "${noteTitle}".`,
            );
          }
          onRefresh();
        }
      }, 1500);
    },
    [noteBody, noteTitle, noteCategory, userId, onRefresh],
  );

  const deleteCategory = useCallback(
    (name: string) => {
      notesStore.deleteCustomCategory(userId, name);
      loadNotes();
    },
    [userId, loadNotes],
  );

  const updateCategory = useCallback(
    (oldName: string, newName: string, color: string) => {
      if (!newName.trim()) return;
      const normalizedName = newName.trim();
      const standard = ['Work', 'Personal', 'Health', 'Learning'];
      if (
        normalizedName !== oldName &&
        (standard.includes(normalizedName) ||
          customCategories.includes(normalizedName))
      ) {
        Alert.alert('Duplicate Category', 'This category name already exists.');
        return;
      }
      notesStore.updateCustomCategory(userId, oldName, normalizedName, color);
      registerCustomCategoryColor(normalizedName, color);
      loadNotes();
      if (noteCategory === oldName) {
        setNoteCategory(normalizedName);
      }
    },
    [userId, customCategories, noteCategory, loadNotes],
  );

  const filtered = useMemo(() => getFilteredNotes(), [getFilteredNotes]);
  // Manual order is saved only from the complete, unfiltered collection.
  const canReorder =
    selectedFilter === 'All' && !searchQuery.trim() && cursor === null;

  return {
    // Data
    notes,
    filtered,
    searchQuery,
    searchActive,
    selectedFilter,
    isGridView,
    hasMore: cursor !== null,
    indexing,
    queryError,
    canReorder,
    // Editor
    editorVisible,
    editingNote,
    noteTitle,
    noteBody,
    noteCategory,
    noteTags,
    isPinned,
    isVoice,
    imageUri,
    selection,
    customCategories,
    // Drag
    activeDragId,
    isDragging,
    dragXRef,
    dragYRef,
    renderGen,
    // AI
    aiLoading,
    aiActionType,
    // Setters
    setSearchQuery,
    setSearchActive,
    setSelectedFilter,
    setIsGridView,
    setNoteTitle,
    setNoteBody,
    setNoteCategory,
    setNoteTags,
    setIsPinned,
    setIsVoice,
    setImageUri,
    setSelection,
    // Actions
    loadNotes,
    loadMoreNotes,
    onCardLayout,
    handleDragStart,
    handleDragMove,
    handleDragRelease,
    openNewNote,
    openEditNote,
    closeEditor,
    applyFormatting,
    changeBody,
    toggleEditorChecklist,
    toggleNoteChecklist,
    saveNote,
    deleteNote,
    triggerAiAction,
    addCategory,
    deleteCategory,
    updateCategory,
  };
};
