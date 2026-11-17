/**
 * Floating LAFINA (ADR-036, UX `03` §5): the quick-action chips. A chip only
 * puts its starter into the composer; it never sends anything. Each starter,
 * completed the way a student would, is checked against the existing
 * fast-path parser in `__tests__/ai/quickChatStarters.test.ts`.
 */
export interface QuickChatStarter {
  id: 'schedule' | 'reminder' | 'note';
  label: string;
  starter: string;
}

export const QUICK_CHAT_STARTERS: readonly QuickChatStarter[] = Object.freeze([
  {id: 'schedule', label: 'Schedule', starter: 'Add '},
  {id: 'reminder', label: 'Reminder', starter: 'Remind me to '},
  {id: 'note', label: 'Note', starter: 'Note: '},
]);
