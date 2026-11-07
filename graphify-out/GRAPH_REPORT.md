# Graph Report - src  (2026-11-06)

## Corpus Check
- 186 files · ~161,783 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1320 nodes · 3799 edges · 57 communities (51 shown, 6 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 53 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Reminder Alarms and Calls
- App Version and Updates
- Offline Speech and Audio Capture
- Sync Entity Types and Rules
- Cloud Auth and Session Linking
- Chat Orchestrator and Local Fallback
- Guest Migration and Behavior Store
- Meeting Transcription UI Helpers
- Themed Calls and Active Voice UI
- User Profile and Preferences Defaults
- Meeting Error Handling
- Meeting Notes Pipeline Catalog
- Onboarding Flow Navigation
- Notes Core and Rich Text Cards
- Navigation Tab Bar and Tour
- SynthSplash Animation and Effects
- Meeting Audio Recorder and Transcriber
- Calendar Timeline and Grid Layout
- Auth Screen Layout and Headers
- Local Storage and Tour State
- Fast-Path Intent Parser
- On-Device NLU Model Manager
- User Profile Screen and Avatars
- Calendar Recurrence Rules (RRULE)
- Action Items and Meeting Notes
- Action Categorization and Titles
- Chat Attachments and Document Formats
- ICS Calendar Import and Export
- Schedule Action Executor and Reminders
- Calendar Screen and View Layouts
- Markdown Notes Parsing and Bodies
- Add Event and Block Modals
- Authentication Utilities and Password Hashing
- Sync State Store and Executors
- Privacy Policy and Legal Modal
- Document MIME Types and Formatting
- Philippine Academic Holiday Calendar
- Notes Filtering and Animation State
- Calendar Batch Import Store
- Rich Text HTML Decoding
- Academic Onboarding Step Configuration
- Note Rich Text Editing Actions
- Calendar Layer Visibility Store
- Auth Backdrop Gradient and Motion
- Note Typography and Compact Layout
- Cloud Notes Generation Client
- Holiday Chip and Color Tinting
- Notes Filter Toolbar
- Chat Message History Store
- Academic Load and Onboarding State
- Local SQLite Database Service
- Background Sync Scheduler
- Chat Header Logo Vector XML
- Legacy App Icon Asset
- LAFINA App Logo Asset
- App Icon Asset
- LAFINA App Brand Asset

## God Nodes (most connected - your core abstractions)
1. `useTheme()` - 93 edges
2. `useThemedStyles()` - 66 edges
3. `Fonts` - 37 edges
4. `ThemeColors` - 28 edges
5. `generateId()` - 27 edges
6. `Shadows` - 26 edges
7. `Colors` - 24 edges
8. `executeNluAction()` - 22 edges
9. `Layout` - 22 edges
10. `db` - 21 edges

## Surprising Connections (you probably didn't know these)
- `parseNotesResult()` --calls--> `normalizeNotes()`  [EXTRACTED]
  skills/meetingNotesSkill.ts → meetings/meetingNotes.ts
- `PreferencesSettingsScreenProps` --references--> `UserPreferences`  [EXTRACTED]
  ui/screens/PreferencesSettingsScreen.tsx → storage/preferencesStore.ts
- `MutationResult` --references--> `SyncEntityType`  [EXTRACTED]
  sync/syncWorker.ts → storage/syncTypes.ts
- `SnapshotPage` --references--> `SyncEntityType`  [EXTRACTED]
  sync/syncWorker.ts → storage/syncTypes.ts
- `SnapshotPosition` --references--> `SyncEntityType`  [EXTRACTED]
  sync/syncWorker.ts → storage/syncTypes.ts

## Import Cycles
- None detected.

## Communities (57 total, 6 thin omitted)

### Community 0 - "Reminder Alarms and Calls"
Cohesion: 0.06
Nodes (91): deletePreCachedReminderAudio(), CALL_RESULT_DELAY_MS, answerCall(), autoSnoozeCall(), buildAnnouncement(), CALL_SPOKEN_NUMBERS, CallCommand, CallResolution (+83 more)

### Community 1 - "App Version and Updates"
Cohesion: 0.06
Nodes (55): APP_VERSION, AppUpdateItem(), AppUpdateItemProps, ask(), getThemedStyles(), labelFor(), notesPreview(), sizeLabel() (+47 more)

### Community 2 - "Offline Speech and Audio Capture"
Cohesion: 0.09
Nodes (51): cancelOfflineSpeechCapture(), getActiveOfflineCaptureId(), getNativeModule(), hasOfflineSpeechCapture(), OfflineSpeechCaptureHandle, OfflineSpeechCaptureMode, OfflineSpeechCaptureOptions, OfflineSpeechNativeModule (+43 more)

### Community 3 - "Sync Entity Types and Rules"
Cohesion: 0.07
Nodes (48): AUTHORITATIVE_SYNC_ENTITY_TYPES, CLIENT_SYNC_ENTITY_TYPES, effectiveSyncEntityTypes(), LAST_WRITE_WINS_ENTITY_TYPES, LEGACY_SYNC_ENTITY_TYPES, PERSONAL_SYNC_ENTITY_TYPES, sameEntityTypeSet(), SINGLETON_SYNC_ENTITY_TYPES (+40 more)

### Community 4 - "Cloud Auth and Session Linking"
Cohesion: 0.07
Nodes (46): AccountFlowResult, AccountFlowStatus, attachAuthenticatedCloudSession(), authenticateExistingCloudAccount(), clearDeferredCredentialSafely(), completeDeferredCloudLink(), deferredLinkAttempts, isFlowResult() (+38 more)

### Community 5 - "Chat Orchestrator and Local Fallback"
Cohesion: 0.08
Nodes (34): buildLocalChatFallback(), ChatOrchestrator, format12HourTime(), minutesToTime(), ProcessMessageOptions, ScheduleConflict, TimeSlot, timeToMinutes() (+26 more)

### Community 6 - "Guest Migration and Behavior Store"
Cohesion: 0.08
Nodes (23): GUEST_USER_ID, BehaviorLog, FeatureSnapshot, DatabaseTransaction, db, NativeSQLiteConnection, QueryResult, SqlValue (+15 more)

### Community 7 - "Meeting Transcription UI Helpers"
Cohesion: 0.14
Nodes (30): isBusy(), wordCount(), formatWhen(), useToolBack(), useMeetings(), describeMeetingProblem(), formatBytes(), formatClock() (+22 more)

### Community 8 - "Themed Calls and Active Voice UI"
Cohesion: 0.11
Nodes (26): CallAnsweredView(), formatCallDuration(), lafinaLogo, styles, getThemedStyles(), styles, TypingBubble(), TypingBubbleProps (+18 more)

### Community 9 - "User Profile and Preferences Defaults"
Cohesion: 0.13
Nodes (30): DEFAULT_BUSIEST_DAY, DEFAULT_CLASS_COUNT, DEFAULT_DAILY_DIGEST, DEFAULT_LONGEST_GAP, DEFAULT_NOTIFICATIONS, DEFAULT_QUIET_HOURS, DEFAULT_REMINDER_LEAD, DEFAULT_SLEEP_TIME (+22 more)

### Community 10 - "Meeting Error Handling"
Cohesion: 0.10
Nodes (29): describeMeetingError(), MeetingError, MeetingErrorCode, MeetingErrorInfo, MeetingNotes, GenerateNotesOptions, GenerateNotesResult, TranscriptSegment (+21 more)

### Community 11 - "Meeting Notes Pipeline Catalog"
Cohesion: 0.14
Nodes (27): CATALOG, classifyNotesFailure(), isRetryable(), RecoveryAction, isNotesEmpty(), canTransition(), isInterruptible(), MeetingFacts (+19 more)

### Community 12 - "Onboarding Flow Navigation"
Cohesion: 0.11
Nodes (26): userStore, getThemedStyles(), OnboardingNavigation(), OnboardingNavigationProps, styles, getThemedStyles(), OnboardingProgress(), OnboardingProgressProps (+18 more)

### Community 13 - "Notes Core and Rich Text Cards"
Cohesion: 0.12
Nodes (25): LAFINA Logo Gradient Background, Splash Icon Asset, Note, dragHandleStyles, getLocalImage(), lafinaDefaultLogo, lafinaLogoGradient, NoteCardBase() (+17 more)

### Community 14 - "Navigation Tab Bar and Tour"
Cohesion: 0.12
Nodes (25): CustomTabBar(), CustomTabBarProps, getTabThemedStyles(), MIC_CENTER_FROM_BOTTOM, styles, TabType, TOUR_TABS, getThemedStyles() (+17 more)

### Community 15 - "SynthSplash Animation and Effects"
Cohesion: 0.12
Nodes (27): EMPTY_FRAME, Frame, styles, SynthSplash(), SynthSplashProps, bump(), clamp01(), DARK_STOPS (+19 more)

### Community 16 - "Meeting Audio Recorder and Transcriber"
Cohesion: 0.10
Nodes (11): MeetingTranscriptionProgress, transcribeMeetingChunks(), TranscribeMeetingOptions, ImportedAudioResult, LafinaMeetingRecorderNative, MeetingAudioChunk, MeetingAudioListing, meetingRecorder (+3 more)

### Community 17 - "Calendar Timeline and Grid Layout"
Cohesion: 0.17
Nodes (24): Event, Task, TimeBlock, DayView(), DayViewProps, styles, MonthViewProps, styles (+16 more)

### Community 18 - "Auth Screen Layout and Headers"
Cohesion: 0.11
Nodes (22): LAFINA Default Logo, accountLinkService, syncWorker, AuthButton(), AuthButtonProps, styles, AuthHeader(), logo (+14 more)

### Community 19 - "Local Storage and Tour State"
Cohesion: 0.19
Nodes (18): localSettingsStore, PRODUCT_TOUR_VERSION, productTourStore, SyncConflict, SyncConflictInput, syncConflictStore, SyncMetadataInput, syncMetadataStore (+10 more)

### Community 20 - "Fast-Path Intent Parser"
Cohesion: 0.15
Nodes (25): classifyCrudEntityType(), classifyMeridiemToken(), cleanCrudTargetTitle(), detectContextPeriod(), EndpointMeridiem, escapeRegExp(), extractRecurrenceRule(), formatLocalTime() (+17 more)

### Community 21 - "On-Device NLU Model Manager"
Cohesion: 0.14
Nodes (22): cancelModelDownload(), deleteQwenModel(), downloadQwenModel(), getModelsDirectory(), getModelStatus(), getQwenModelPath(), QWEN_MODEL_INFO, BUSIEST_DAY_OPTIONS (+14 more)

### Community 22 - "User Profile Screen and Avatars"
Cohesion: 0.14
Nodes (20): ARC_SCREEN_XML, AVATARS_DIR, avatarSource(), extensionOf(), isCancellation(), pickAvatarImage(), PickAvatarResult, removeAvatarImage() (+12 more)

### Community 23 - "Calendar Recurrence Rules (RRULE)"
Cohesion: 0.16
Nodes (21): DAY_CODES, formatLocalDate(), getOccurrences(), getSunday(), ParsedRrule, parseLocalDate(), RFC-5545, getExistingOwnedIds() (+13 more)

### Community 24 - "Action Items and Meeting Notes"
Cohesion: 0.16
Nodes (21): ActionItem, cleanActionItems(), cleanMultiline(), cleanStringList(), cleanText(), cleanTopics(), deadlinesOf(), emptyNotes() (+13 more)

### Community 25 - "Action Categorization and Titles"
Cohesion: 0.17
Nodes (18): ActionExecutorOptions, detectCategory(), distillScheduleTitle(), isTitleNoisy(), toTitleCase(), formatSlmTitle(), IntentExtractionOptions, IntentService (+10 more)

### Community 26 - "Chat Attachments and Document Formats"
Cohesion: 0.14
Nodes (18): DOCUMENT_FORMATS, formatFileSize(), isDocumentFormat(), chatStore, removeAttachmentFiles(), shareAttachment(), toLocalPath(), ChatInput() (+10 more)

### Community 27 - "ICS Calendar Import and Export"
Cohesion: 0.21
Nodes (20): cleanIcsValue(), escapeText(), expandRecurringEvent(), foldLine(), formatDateForRRule(), formatIcsDateTime(), formatUtcDate(), formatUtcTime() (+12 more)

### Community 28 - "Schedule Action Executor and Reminders"
Cohesion: 0.28
Nodes (17): addMinutesToTime(), cleanupMatchingReminders(), computeDurationMinutes(), executeNluAction(), findMatchingEvent(), findMatchingNote(), findMatchingTask(), findMatchingTimeBlock() (+9 more)

### Community 29 - "Calendar Screen and View Layouts"
Cohesion: 0.22
Nodes (14): CalendarScreen(), styles, AddBlockModalProps, WeekView(), defaultForm(), useTimeBlockModal(), UseTimeBlockModalOptions, CalendarScreenProps (+6 more)

### Community 30 - "Markdown Notes Parsing and Bodies"
Cohesion: 0.18
Nodes (15): NoteBody(), BlockFormat, InlineFormat, NoteEdit, NoteSelection, CHECKLIST_LINE, indentDepth(), INLINE_RULES (+7 more)

### Community 31 - "Add Event and Block Modals"
Cohesion: 0.29
Nodes (13): parseRrule(), AddBlockModal(), styles, AddTaskEventModal(), AddTaskEventModalProps, styles, MonthView(), ScheduleItemModalState (+5 more)

### Community 32 - "Authentication Utilities and Password Hashing"
Cohesion: 0.17
Nodes (12): GUEST_USERNAME, hashPassword(), MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, PasswordValidationResult, sha256(), validatePassword(), verifyPassword() (+4 more)

### Community 33 - "Sync State Store and Executors"
Cohesion: 0.14
Nodes (10): executorFor(), PersistedEntityTypes, saveTypeList(), syncStateStore, currentState, listeners, syncState, SyncStateData (+2 more)

### Community 34 - "Privacy Policy and Legal Modal"
Cohesion: 0.17
Nodes (13): getThemedStyles(), PrivacyModal(), PrivacyModalProps, styles, getThemedStyles(), ProfileStats(), ProfileStatsProps, styles (+5 more)

### Community 35 - "Document MIME Types and Formatting"
Cohesion: 0.21
Nodes (12): MIME_DOCX, MIME_PDF, MIME_PPTX, pickDocument(), PickedDocument, PickOutcome, ShareOutcome, shareTextFile() (+4 more)

### Community 36 - "Philippine Academic Holiday Calendar"
Cohesion: 0.19
Nodes (15): buildYear(), byYear, dateKey(), easterSunday(), getHolidaysOn(), getPhilippineHolidays(), Holiday, HolidayKind (+7 more)

### Community 37 - "Notes Filtering and Animation State"
Cohesion: 0.24
Nodes (13): BUILT_IN_FILTERS, swapAnimation, useNotesData(), UseNotesDataOptions, CATEGORIES, Category, CATEGORY_COLOR_MAP, registerCustomCategoryColor() (+5 more)

### Community 38 - "Calendar Batch Import Store"
Cohesion: 0.21
Nodes (11): ImportBatch, importedBatchesStore, isStringArray(), parseStoredBatch(), readStoredBatches(), StoredImportBatch, CalendarLayersModal(), CalendarLayersModalProps (+3 more)

### Community 39 - "Rich Text HTML Decoding"
Cohesion: 0.24
Nodes (12): decodeEntities(), HtmlElement, HtmlNode, HtmlText, htmlToMarkdown(), inlineToMarkdown(), isList(), NAMED_ENTITIES (+4 more)

### Community 40 - "Academic Onboarding Step Configuration"
Cohesion: 0.18
Nodes (11): busiestDayOptions, classCountOptions, getThemedStyles(), longestGapOptions, OnboardingStep(), reminderLeadOptions, sleepTimeOptions, snoozeTendencyOptions (+3 more)

### Community 41 - "Note Rich Text Editing Actions"
Cohesion: 0.29
Nodes (11): applyBlock(), applyIndent(), applyInline(), applyNoteFormat(), continueListOnNewline(), escapeRegExp(), findInsertedNewline(), lineBounds() (+3 more)

### Community 42 - "Calendar Layer Visibility Store"
Cohesion: 0.28
Nodes (8): CalendarVisibilityMap, calendarVisibilityStore, DEFAULT_VISIBILITY, parseStoredFile(), parseVisibilityMap(), readStoredFile(), StoredUserVisibility, StoredVisibilityFile

### Community 43 - "Auth Backdrop Gradient and Motion"
Cohesion: 0.28
Nodes (7): AuthBackdrop(), styles, useReducedMotion(), Grainient(), GrainientProps, nativeSupported, styles

### Community 44 - "Note Typography and Compact Layout"
Cohesion: 0.25
Nodes (8): compactSizes, compactText, fullSizes, fullText, NoteBodyProps, Spans(), spanStyle(), styles

### Community 45 - "Cloud Notes Generation Client"
Cohesion: 0.29
Nodes (7): cloudClient, CloudResult, NotesSkill, SectionPromptInput, BackendNotesResponse, meetingNotesSkill, parseNotesResult()

### Community 46 - "Holiday Chip and Color Tinting"
Cohesion: 0.32
Nodes (7): HolidayChip(), tintFor(), describeHoliday(), mixColors(), parse(), Rgb, toHex()

### Community 47 - "Notes Filter Toolbar"
Cohesion: 0.39
Nodes (5): NoteFiltersProps, styles, NotesScreen(), FilterType, NotesScreenProps

### Community 48 - "Chat Message History Store"
Cohesion: 0.38
Nodes (5): ChatOrchestratorResult, ChatAttachment, ChatMessage, ChatSession, ChatMessageItemProps

### Community 49 - "Academic Load and Onboarding State"
Cohesion: 0.38
Nodes (6): behaviorStore, completeUserOnboarding(), getAcademicLoadScore(), getFreeTimeGapHours(), StoredUserPreferences, UserPreferences

### Community 51 - "Background Sync Scheduler"
Cohesion: 0.33
Nodes (4): DEFAULT_SYNC_DEBOUNCE_MS, DEFAULT_SYNC_INTERVAL_MS, SyncScheduler, SyncSchedulerOptions

## Knowledge Gaps
- **283 isolated node(s):** `ScheduleConflict`, `TimeSlot`, `FORMAT_PATTERNS`, `ImportedAudioResult`, `OfflineSpeechNativeModule` (+278 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useTheme()` connect `Themed Calls and Active Voice UI` to `Reminder Alarms and Calls`, `App Version and Updates`, `Offline Speech and Audio Capture`, `Meeting Transcription UI Helpers`, `Onboarding Flow Navigation`, `Notes Core and Rich Text Cards`, `Navigation Tab Bar and Tour`, `SynthSplash Animation and Effects`, `Calendar Timeline and Grid Layout`, `Auth Screen Layout and Headers`, `On-Device NLU Model Manager`, `User Profile Screen and Avatars`, `Action Items and Meeting Notes`, `Chat Attachments and Document Formats`, `Calendar Screen and View Layouts`, `Markdown Notes Parsing and Bodies`, `Add Event and Block Modals`, `Privacy Policy and Legal Modal`, `Calendar Batch Import Store`, `Academic Onboarding Step Configuration`, `Auth Backdrop Gradient and Motion`, `Note Typography and Compact Layout`, `Notes Filter Toolbar`?**
  _High betweenness centrality (0.113) - this node is a cross-community bridge._
- **Why does `useThemedStyles()` connect `Privacy Policy and Legal Modal` to `App Version and Updates`, `Offline Speech and Audio Capture`, `Meeting Transcription UI Helpers`, `Themed Calls and Active Voice UI`, `Academic Onboarding Step Configuration`, `Onboarding Flow Navigation`, `Navigation Tab Bar and Tour`, `Auth Screen Layout and Headers`, `User Profile Screen and Avatars`, `Action Items and Meeting Notes`, `Chat Attachments and Document Formats`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Why does `APP_VERSION` connect `App Version and Updates` to `User Profile Screen and Avatars`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **What connects `ScheduleConflict`, `TimeSlot`, `FORMAT_PATTERNS` to the rest of the system?**
  _283 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Reminder Alarms and Calls` be split into smaller, more focused modules?**
  _Cohesion score 0.06129830573005901 - nodes in this community are weakly interconnected._
- **Should `App Version and Updates` be split into smaller, more focused modules?**
  _Cohesion score 0.059027777777777776 - nodes in this community are weakly interconnected._
- **Should `Offline Speech and Audio Capture` be split into smaller, more focused modules?**
  _Cohesion score 0.08825248392752776 - nodes in this community are weakly interconnected._