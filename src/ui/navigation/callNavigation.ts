/** Local navigation requests carry owner identity, never provider-supplied owners. */
export interface CallNavigationTarget {
  ownerId: string;
  screen: 'notes' | 'calendar' | 'chat';
  notesTab?: 'notes' | 'todo';
  entityId?: string;
  entityKind?: 'note' | 'task' | 'event' | 'block' | 'reminder';
  date?: string;
}

export interface CallNavigationRequest extends CallNavigationTarget {
  requestId: string;
}
