import {useEffect, useRef, useState} from 'react';
import {Alert} from 'react-native';
import type {
  Note,
  NoteDraft,
  NoteFilter,
  NotesRepository,
} from '../../core/domain/notes';
import {openNotes} from '../../core/storage/openNotes';
import {NoteEditor} from './NoteEditor';
import {NotesList} from './NotesList';

const blankDraft: NoteDraft = {
  title: '',
  body: '',
  category: 'Personal',
  pinned: false,
};
const systemNow = () => new Date();

interface Editor {
  original: Note | null;
  draft: NoteDraft;
  token: string;
}
function isDirty(editor: Editor | null): boolean {
  if (!editor) {
    return false;
  }
  const previous = editor.original ?? blankDraft;
  return (
    previous.title !== editor.draft.title ||
    previous.body !== editor.draft.body ||
    previous.category !== editor.draft.category ||
    previous.pinned !== editor.draft.pinned
  );
}

/** Local notes presentation adapted from Nol's Notes screen; no account or AI transcript store. */
export function NotesScreen({
  factory = openNotes,
  now = systemNow,
  onDraftStateChange,
  onRouteChange,
  backRequest = 0,
}: {
  factory?: () => NotesRepository;
  now?: () => Date;
  onDraftStateChange: (dirty: boolean) => void;
  onRouteChange?: (subscreen: boolean) => void;
  backRequest?: number;
}) {
  const [repository, setRepository] = useState<NotesRepository | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Note[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState<NoteFilter>('All');
  const [search, setSearch] = useState('');
  const [searchVisible, setSearchVisible] = useState(false);
  const [compact, setCompact] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [refresh, setRefresh] = useState(0);
  const sequence = useRef(0);
  const lastBack = useRef(backRequest);
  const mounted = useRef(true);
  const dirty = isDirty(editor);
  const callback = useRef(onDraftStateChange);
  callback.current = onDraftStateChange;
  const routeCallback = useRef(onRouteChange);
  routeCallback.current = onRouteChange;
  const editorOpen = editor !== null;
  const identity = useRef(Math.random().toString(36).slice(2, 12));

  useEffect(() => {
    try {
      setRepository(factory());
      setError(null);
    } catch {
      setError(
        'Notes could not open local storage. Retry without clearing app data.',
      );
    }
  }, [factory]);
  useEffect(() => {
    if (!repository) {
      return;
    }
    try {
      const page = repository.page({filter, search, offset, limit: 20});
      setItems(page.items);
      setHasMore(page.hasMore);
      setError(null);
    } catch {
      setItems([]);
      setHasMore(false);
      setError(
        'Notes could not load. Your saved notes have not been removed. Retry.',
      );
    }
  }, [repository, filter, search, offset, refresh]);
  useEffect(() => {
    callback.current(dirty);
  }, [dirty]);
  useEffect(() => () => callback.current(false), []);
  useEffect(() => {
    routeCallback.current?.(editorOpen);
  }, [editorOpen]);
  useEffect(() => () => routeCallback.current?.(false), []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  function closeEditor() {
    if (!mounted.current) {
      return;
    }
    setEditor(null);
    setError(null);
  }
  function requestClose() {
    if (dirty) {
      Alert.alert(
        'Discard note changes?',
        'Your unsaved note text will be discarded.',
        [
          {text: 'Keep editing', style: 'cancel'},
          {text: 'Discard', style: 'destructive', onPress: closeEditor},
        ],
      );
    } else {
      closeEditor();
    }
  }
  // The app owns Android Back and tab guards; this request closes only this editor.
  useEffect(() => {
    if (backRequest !== lastBack.current) {
      lastBack.current = backRequest;
      if (editor) {
        requestClose();
      }
    }
  });

  function token() {
    sequence.current += 1;
    return `note_ui_${now().getTime()}_${identity.current}_${sequence.current}`;
  }
  function retry() {
    try {
      setRepository(factory());
      setRefresh(value => value + 1);
      setError(null);
    } catch {
      setError(
        'Notes could not open local storage. Retry without clearing app data.',
      );
    }
  }
  function save() {
    if (!editor || !repository) {
      return;
    }
    try {
      const command = {token: editor.token, draft: editor.draft};
      if (editor.original) {
        repository.update({
          ...command,
          id: editor.original.id,
          expectedVersion: editor.original.version,
        });
      } else {
        repository.create(command);
      }
      setOffset(0);
      setRefresh(value => value + 1);
      closeEditor();
    } catch (failure) {
      setError(
        failure instanceof Error &&
          /Enter a title|Choose Personal|note changed|no longer available/.test(
            failure.message,
          )
          ? failure.message
          : 'Your note could not be saved. Keep your draft and retry.',
      );
    }
  }
  function remove() {
    if (!editor?.original || !repository) {
      return;
    }
    const target = editor.original;
    Alert.alert(
      'Delete this note?',
      'This removes the saved note and any unsaved changes.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete note',
          style: 'destructive',
          onPress: () => {
            if (!mounted.current) {
              return;
            }
            try {
              repository.delete({
                token: token(),
                id: target.id,
                expectedVersion: target.version,
              });
              setOffset(0);
              setRefresh(value => value + 1);
              closeEditor();
            } catch {
              setError(
                'This note could not be deleted. Keep your draft and reopen the saved note before retrying.',
              );
            }
          },
        },
      ],
    );
  }
  function edit(note: Note) {
    if (!repository) {
      return;
    }
    try {
      const saved = repository.get(note.id);
      if (!saved) {
        throw new Error('Missing note');
      }
      setEditor({original: saved, draft: {...saved}, token: token()});
      setError(null);
    } catch {
      setError('This note could not open. Refresh Notes and try again.');
    }
  }
  function updateDraft(patch: Partial<NoteDraft>) {
    const nextToken = token();
    setEditor(previous =>
      previous
        ? {...previous, token: nextToken, draft: {...previous.draft, ...patch}}
        : previous,
    );
  }

  if (editor) {
    return (
      <NoteEditor
        draft={editor.draft}
        existing={editor.original !== null}
        dirty={dirty}
        error={error}
        onChange={updateDraft}
        onClose={requestClose}
        onRemove={remove}
        onSave={save}
      />
    );
  }
  return (
    <NotesList
      items={items}
      hasMore={hasMore}
      offset={offset}
      filter={filter}
      search={search}
      searchVisible={searchVisible}
      compact={compact}
      error={error}
      available={repository !== null}
      onToggleSearch={() => {
        setSearchVisible(value => !value);
        setSearch('');
        setOffset(0);
      }}
      onToggleCompact={() => setCompact(value => !value)}
      onSearchChange={value => {
        setSearch(value);
        setOffset(0);
      }}
      onFilterChange={value => {
        setFilter(value);
        setOffset(0);
      }}
      onOpen={edit}
      onRetry={retry}
      onPrevious={() => setOffset(value => Math.max(0, value - 20))}
      onNext={() => setOffset(value => value + 20)}
      onAdd={() => {
        setEditor({original: null, draft: {...blankDraft}, token: token()});
        setError(null);
      }}
    />
  );
}
