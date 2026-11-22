import type {SkillLaunch} from '../../skills/skillLaunch';

/** Local navigation requests carry owner identity, never provider-supplied owners. */
export interface CallNavigationTarget {
  /**
   * Open one skill in the Skills tab (ADR-041). Built on the device from a
   * validated launch, never from raw model text; `screen` is then `notes`.
   */
  skill?: SkillLaunch;
  ownerId: string;
  screen: 'notes' | 'calendar' | 'chat';
  notesTab?: 'alarms' | 'notes' | 'todo';
  entityId?: string;
  entityKind?: 'note' | 'task' | 'event' | 'block' | 'reminder';
  date?: string;
  /**
   * Legacy deep link from the dashboards: `'alarms'` is redirected in
   * `App.tsx` to Tools → Alarms (Alarms moved off the Schedule tab).
   */
  scheduleSection?: 'calendar' | 'alarms';
}

export interface CallNavigationRequest extends CallNavigationTarget {
  requestId: string;
}
