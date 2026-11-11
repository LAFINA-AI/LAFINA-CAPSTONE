export {db, StorageUnavailableError} from './database';
export type {
  QueryResult,
  DatabaseTransaction,
  StorageHealth,
  StorageFailureReason,
  StorageStatus,
} from './database';
export {initDatabase, CURRENT_SCHEMA_VERSION} from './dbInit';
export {
  hashPassword,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  normalizeEmail,
  validatePassword,
  verifyPassword,
} from './authUtils';
export type {PasswordValidationResult} from './authUtils';
export {userStore} from './userStore';
export type {User} from './userStore';
export {tasksStore} from './tasksStore';
export type {Task, Event} from './tasksStore';
export {notesStore} from './notesStore';
export type {Note} from './notesStore';
export {
  isNoteEditConflict,
  NoteEditConflictError,
  notesEditStore,
} from './notesEditStore';
export type {
  NoteEditFailure,
  NoteEditPatch,
  NoteSnapshot,
  NoteWriteTarget,
} from './notesEditStore';
export {
  InvalidNotesQueryError,
  NOTES_PAGE_SIZE,
  notesQueryStore,
} from './notesQueryStore';
export type {NotesPage, NotesQuery} from './notesQueryStore';
export {eventTimeStore} from './eventTimeStore';
export {
  checkEventWallTime,
  deviceTimeZone,
  EventTimeError,
  isEventTimeError,
  resolveEventZoneTiming,
} from './eventTime';
export type {
  EventFolds,
  EventZoneTiming,
  FoldChoice,
  WallTimeCheck,
} from './eventTime';
export {timeBlocksStore} from './timeBlocksStore';
export type {TimeBlock} from './timeBlocksStore';
export {chatStore, CHAT_PAGE_SIZE, InvalidChatCursorError} from './chatStore';
export type {
  ChatAttachment,
  ChatMessage,
  ChatMessageMetadata,
  ChatPage,
  ChatSession,
  ChatSummary,
  LegacyChatSummary,
} from './chatStore';
export {chatMemoryStore} from './chatMemoryStore';
export type {ChatMemory, ChatMemoryChanges} from './chatMemoryStore';
export {ownedChatSessionId} from './chatOwnership';
export {behaviorStore} from './behaviorStore';
export type {BehaviorLog, FeatureSnapshot} from './behaviorStore';
export {completeUserOnboarding} from './onboardingStore';
export {getDefaultUserPreferences, preferencesStore} from './preferencesStore';
export type {
  LongestClassGap,
  SnoozeTendency,
  StoredUserPreferences,
  StudyPeakHour,
  UserPreferences,
  WeeklyClassCount,
} from './preferencesStore';
export {remindersStore} from './remindersStore';
export type {Reminder, ReminderStatus} from './remindersStore';
export {
  deliveryStore,
  deliveryIdentityUri,
  deliveryNotificationTag,
  DeliveryFenceError,
} from './deliveryStore';
export type {
  DeliveryFenceReason,
  DeliveryIdentity,
  DeliveryJob,
  ReminderSourceType,
} from './deliveryStore';
export {syncOutboxStore} from './syncOutboxStore';
export type {OutboxItem} from './syncOutboxStore';
export {syncMetadataStore} from './syncMetadataStore';
export type {SyncMetadataInput} from './syncMetadataStore';
export {syncConflictStore} from './syncConflictStore';
export type {SyncConflict, SyncConflictInput} from './syncConflictStore';
export {syncStateStore} from './syncStateStore';
export type {PersistedSyncState, SyncStateUpdate} from './syncStateStore';
export type {
  PersistedSyncStatus,
  SyncEntityType,
  SyncOperation,
  SyncPayload,
  SyncScopeType,
  SystemRole,
  SubscriptionPlan,
} from './syncTypes';
export {localSettingsStore} from './localSettingsStore';
export {
  academicProfileStore,
  formatClassBlockNotes,
  parseClassBlockMetadata,
} from './academicProfileStore';
export type {
  AcademicCourseRecord,
  AcademicProfileRecord,
  ClassBlockMetadata,
  OnboardingScheduleSessionInput,
} from './academicProfileStore';
export {productTourStore, PRODUCT_TOUR_VERSION} from './productTourStore';
export {calendarVisibilityStore} from './calendarVisibilityStore';
export type {CalendarVisibilityMap} from './calendarVisibilityStore';
export {importedBatchesStore} from './importedBatchesStore';
export type {ImportBatch} from './importedBatchesStore';
export {generateIcsString, parseIcsString} from './icsHelper';
export {getOccurrences, parseRrule} from './rruleHelper';
export type {ParsedRrule} from './rruleHelper';
export {guestMigration} from './guestMigration';
export type {GuestDataSummary} from './guestMigration';
export {
  recordedMeetingStore,
  SYNCED_MEETING_STATUSES,
} from './recordedMeetingStore';
export type {MeetingPatch, RecordedMeeting} from './recordedMeetingStore';
export {assistantOperationStore} from './assistantOperationStore';
export type {OperationReceipt} from './assistantOperationStore';
export type {RevisionEntityType} from './assistantOperationSchema';
