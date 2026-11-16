/** Local navigation requests carry owner identity, never provider-supplied owners. */
export interface CallNavigationTarget {
  ownerId: string;
  screen: 'notes' | 'calendar' | 'chat';
  notesTab?: 'alarms' | 'notes' | 'todo';
  entityId?: string;
  entityKind?: 'note' | 'task' | 'event' | 'block' | 'reminder';
  date?: string;
  /** Schedule tab: open the Alarms switch (alarm plan A2). */
  scheduleSection?: 'calendar' | 'alarms';
}

export interface CallNavigationRequest extends CallNavigationTarget {
  requestId: string;
}
