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
export {
  chatStore,
  CHAT_PAGE_SIZE,
  InvalidChatCursorError,
  USTP_CHAT_PREFIX,
  isUstpSessionId,
} from './chatStore';
export type {
  ChatAttachment,
  ChatMessage,
  ChatMessageMetadata,
  ChatPage,
  ChatReviewResolution,
  ChatReviewResolutionStatus,
  ChatSession,
  ChatSessionKind,
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
export {alarmsStore, onAlarmsChanged, validateAlarmInput} from './alarmsStore';
export type {Alarm, AlarmInput} from './alarmsStore';
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
export {
  ALERT_PREFERENCES_KEY,
  alertPreferencesStore,
  DEFAULT_ALERT_PREFERENCES,
  DEFAULT_CALLER_SUBTITLE,
  MAX_CALLER_SUBTITLE_LENGTH,
  onAlertPreferencesChanged,
  sanitizeToneUri,
} from './alertPreferencesStore';
export type {
  AlarmVolumeRampSec,
  AlertPreferences,
  AlertPreferencesPatch,
  CallAnswerMode,
  CallGreetingStyle,
  CallRingTimeoutSec,
  LockScreenPrivacy,
  NotificationSnoozeMinutes,
  VibrationPattern,
} from './alertPreferencesStore';
export {localSettingsStore} from './localSettingsStore';
export {
  DEFAULT_UI_VARIANT,
  getSavedUIVariant,
  normalizeUIVariant,
  saveUIVariant,
  UI_VARIANT_DEVICE_SCOPE,
  UI_VARIANT_SETTING_KEY,
} from './uiVariantStore';
export type {UIVariant} from './uiVariantStore';
export {
  DEFAULT_MODERN_AI_BUTTON_DESIGN,
  DEFAULT_MODERN_THEME,
  getSavedModernAiButtonDesign,
  getSavedModernTheme,
  MODERN_AI_BUTTON_DESIGN_IDS,
  MODERN_AI_BUTTON_DESIGN_SETTING_KEY,
  MODERN_THEME_DEVICE_SCOPE,
  MODERN_THEME_IDS,
  MODERN_THEME_SETTING_KEY,
  normalizeModernAiButtonDesign,
  normalizeModernTheme,
  saveModernAiButtonDesign,
  saveModernTheme,
} from './modernThemeStore';
export type {ModernAiButtonDesignId, ModernThemeId} from './modernThemeStore';
export {
  avatarSeedStore,
  generateAvatarSeed,
  PROFILE_AVATAR_SEED_KEY,
} from './avatarSeedStore';
export {
  academicProfileStore,
  formatClassBlockNotes,
  getNextDateForWeekday,
  mapCorCoursesToAcademicRecords,
  parseClassBlockMetadata,
  pickSubjectColor,
} from './academicProfileStore';
export type {
  AcademicCourseRecord,
  AcademicProfileRecord,
  ClassBlockMetadata,
  CorCourseInput,
  OnboardingScheduleSessionInput,
} from './academicProfileStore';
export {
  ALL_DASHBOARD_WIDGET_IDS,
  DASHBOARD_PRESETS,
  DASHBOARD_WIDGET_META,
  dashboardConfigStore,
  getDefaultDashboardConfig,
  normalizeDashboardConfig,
} from './dashboardConfigStore';
export type {
  DashboardConfig,
  DashboardPreset,
  DashboardPresetId,
  DashboardScheduleFilter,
  DashboardWidgetId,
  DashboardWidgetMeta,
  MinFreeGapMinutes,
} from './dashboardConfigStore';
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
export {
  KNOWLEDGE_COLLECTIONS,
  localHandbookStore,
  parseHandbookPack,
  parseKnowledgeMeta,
} from './localHandbookStore';
export type {
  HandbookFtsHit,
  HandbookMeta,
  HandbookPack,
  HandbookPackChunk,
  KnowledgeCaveat,
  KnowledgeChapter,
  KnowledgeChunkMeta,
  KnowledgeCollection,
  KnowledgeSourceRef,
} from './localHandbookStore';
export {materialStore} from './materialStore';
export type {
  MaterialChunkHit,
  MaterialChunkInput,
  MaterialCitation,
  MaterialFileKind,
  MaterialOutlineEntry,
  MaterialQaMessage,
  MaterialSection,
  UserMaterialRecord,
} from './materialStore';
export {
  completionRate,
  onTimeRate,
  profileStatisticsStore,
  UNAVAILABLE_DETAILED_STATISTICS,
  UNAVAILABLE_STATISTICS,
} from './profileStatisticsStore';
export type {
  DetailedProfileStatistics,
  ProfileStatistics,
} from './profileStatisticsStore';
export {
  baseScheduleEntityId,
  extractUrlsFromText,
  normalizeEntryUrl,
  resolveScheduleEntryTarget,
  SCHEDULE_ENTRIES_KEY,
  scheduleEntriesStore,
} from './scheduleEntriesStore';
export type {
  ResolvedScheduleEntryTarget,
  ScheduleAttachedEntry,
  ScheduleEntryTargetInput,
  ScheduleEntryTargetKind,
  ScheduleEntryType,
} from './scheduleEntriesStore';
