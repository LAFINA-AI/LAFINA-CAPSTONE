/** Supported synchronization scope namespaces. */
export type SyncScopeType = 'account';

/** Personal entity types supported by LAFINA-CAPSTONE and LAFINA-backend. */
export type SyncEntityType =
  | 'profile'
  | 'task'
  | 'event'
  | 'time_block'
  | 'reminder'
  | 'note'
  | 'custom_category';

/** Mutation verbs accepted by the cloud sync API. */
export type SyncOperation = 'create' | 'update' | 'delete';

/** JSON-compatible object sent to the cloud sync API. */
export type SyncPayload = Record<string, unknown>;

/** User-facing synchronization states persisted per account and scope. */
export type PersistedSyncStatus =
  | 'Local only'
  | 'Syncing'
  | 'Synced'
  | 'Offline'
  | 'Sign-in required'
  | 'Attention required';

/** User system authorization role. */
export type SystemRole = 'user' | 'admin';

/** Subscription billing and feature tier (student-only in LAFINA-CAPSTONE). */
export type SubscriptionPlan = 'student' | 'student_pro';
