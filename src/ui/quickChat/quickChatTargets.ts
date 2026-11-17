/**
 * Floating LAFINA (ADR-036): where "View in LAFINA" goes for a confirmed
 * change. Built only from the local operation receipt and the current owner
 * (never from model or provider text), and consumed by `App.tsx` through
 * `quickChatPresence` with an owner check.
 */
import type {OperationReceipt} from '../../storage/assistantOperationStore';
import type {CallNavigationTarget} from '../navigation/callNavigation';

export const quickChatTargetFor = (
  ownerId: string,
  receipt: Pick<OperationReceipt, 'entityType' | 'entityId'> | null | undefined,
): CallNavigationTarget => {
  const entityId = receipt?.entityId ?? undefined;
  switch (receipt?.entityType) {
    case 'event':
      return {ownerId, screen: 'calendar', entityKind: 'event', entityId};
    case 'time_block':
      return {ownerId, screen: 'calendar', entityKind: 'block', entityId};
    case 'reminder':
      return {ownerId, screen: 'calendar', entityKind: 'reminder', entityId};
    case 'task':
      return {
        ownerId,
        screen: 'notes',
        notesTab: 'todo',
        entityKind: 'task',
        entityId,
      };
    case 'note':
      return {
        ownerId,
        screen: 'notes',
        notesTab: 'notes',
        entityKind: 'note',
        entityId,
      };
    case 'alarm':
      // App.tsx redirects this legacy section to Tools → Alarms.
      return {ownerId, screen: 'calendar', scheduleSection: 'alarms'};
    default:
      return {ownerId, screen: 'calendar'};
  }
};
