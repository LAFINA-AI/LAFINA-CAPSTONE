export type NoteCategory = 'Personal' | 'Coursework';
export type NoteFilter = 'All' | 'Pinned' | NoteCategory;

export interface NoteDraft {
  title: string;
  body: string;
  category: NoteCategory;
  pinned: boolean;
}
export interface Note extends NoteDraft {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
export interface NotesPageQuery {
  filter: NoteFilter;
  search?: string;
  offset?: number;
  limit?: number;
}
export interface NoteMutation {
  token: string;
  draft: NoteDraft;
}
export interface NoteTarget {
  token: string;
  id: string;
  expectedVersion: number;
}
export interface NotesRepository {
  page(query: NotesPageQuery): {items: Note[]; hasMore: boolean};
  get(id: string): Note | null;
  create(command: NoteMutation): Note;
  update(command: NoteTarget & {draft: NoteDraft}): Note;
  delete(command: NoteTarget): void;
  /** Exact saved counts, not the length of a paged UI list. */
  counts(): {completedTasks: number; notes: number};
}
