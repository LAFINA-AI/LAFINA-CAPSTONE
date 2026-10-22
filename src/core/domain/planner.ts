import type {WeeklyRule} from './scheduleTime';

export interface Clock {
  now(): string;
}
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export interface TaskDraft {
  title: string;
  notes: string;
  dueAt: string | null;
  dueDate: string | null;
  timezone: string;
  status: TaskStatus;
}
export interface Task extends TaskDraft {
  reminderLeadMinutes: number | null;
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}
export interface EventDraft {
  title: string;
  notes: string;
  startAt: string;
  endAt: string;
  timezone: string;
  recurrence: (WeeklyRule & {fold?: 'earlier' | 'later'}) | null;
  status: 'ACTIVE' | 'CANCELLED';
}
export interface AcademicEvent extends EventDraft {
  reminderLeadMinutes: number | null;
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}
export type ReminderStatus =
  | 'SCHEDULED'
  | 'RINGING'
  | 'ACKNOWLEDGED'
  | 'SNOOZED'
  | 'MISSED'
  | 'CANCELLED';
export interface Reminder {
  id: string;
  taskId: string | null;
  eventId: string | null;
  occurrenceKey: string;
  scheduledAt: string;
  leadMinutes: number;
  status: ReminderStatus;
  version: number;
  lastOutcomeAt: string | null;
}
export interface ReminderJob {
  id: string;
  reminderId: string;
  occurrenceKey: string;
  runAt: string;
  status: 'PENDING' | 'RINGING' | 'ACKNOWLEDGED' | 'MISSED' | 'CANCELLED';
  generation: number;
  attemptCount: number;
  deliveryState: 'UNAVAILABLE' | 'PENDING' | 'REGISTERED' | 'FAILED';
  deliveryReason: string | null;
}
export interface PlannerSnapshot {
  tasks: Task[];
  events: AcademicEvent[];
  reminders: Reminder[];
  jobs: ReminderJob[];
  truncated?: boolean;
}
export interface Mutation<T> {
  token: string;
  draft: T;
  reminderLeadMinutes: number | null;
}
export interface Edit<T> extends Mutation<T> {
  id: string;
  expectedVersion: number;
}
export interface Target {
  token: string;
  id: string;
  expectedVersion: number;
}
export type ReminderAction =
  | {
      kind: 'RING';
      timezone: string;
      quietHours: {start: string; end: string} | null;
    }
  | {kind: 'ACK'}
  | {kind: 'MISS'}
  | {kind: 'CANCEL'}
  | {kind: 'SNOOZE'; minutes: number};
export interface ReminderCommand {
  token: string;
  id: string;
  occurrenceKey: string;
  generation: number;
  action: ReminderAction;
}
export interface UpcomingItem {
  kind: 'task' | 'event';
  id: string;
  title: string;
  at: string | null;
  date: string | null;
  occurrenceKey: string;
}
export interface ChatMessage {
  id: string;
  createdAt: string;
  role: 'user' | 'assistant';
  text: string;
  actionId: string | null;
}
/** Synchronous bounded transactions never yield between paired SQL writes. */
export interface PlannerRepository {
  /** Debug-only finite view, capped at 500 rows per table. Product UI must use paged/windowed APIs. */
  snapshot(): PlannerSnapshot;
  createTask(command: Mutation<TaskDraft>): Task;
  updateTask(command: Edit<TaskDraft>): Task;
  deleteTask(command: Target): void;
  createEvent(command: Mutation<EventDraft>): AcademicEvent;
  updateEvent(command: Edit<EventDraft>): AcademicEvent;
  deleteEvent(command: Target): void;
  reminderAction(command: ReminderCommand): 'applied' | 'ignored';
  upcoming(fromUtc: string, toUtc: string, timezone: string): UpcomingItem[];
  appendChat(message: ChatMessage): void;
  recentChat(limit?: number): ChatMessage[];
}
