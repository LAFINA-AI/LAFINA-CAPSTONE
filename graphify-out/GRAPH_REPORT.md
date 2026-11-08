# Graph Report - src  (2026-11-08)

## Corpus Check
- 241 files · ~199,419 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 1 file(s) not represented in the graph (top: .ico 1)

## Summary
- 2245 nodes · 6630 edges · 79 communities (74 shown, 5 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 105 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8c8319e2`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- MeetingsContext.tsx
- timingAdvisor.ts
- chatOrchestrator.ts
- commandReview.ts
- MeetingDetail.tsx
- updateService.ts
- useTheme
- ref_react_native
- syncWorker.ts
- accountDataReset.ts
- callDispatcher.ts
- ProfileScreen.tsx
- database.ts
- ChatMessageItem.tsx
- syncOutboxStore.ts
- useCalendarData.ts
- ttsService.ts
- fastPathParser.ts
- dbInit.ts
- plannerQueries.ts
- controller.ts
- chatStore.ts
- OfflineVoice.tsx
- storage/index.ts
- reminderActions.ts
- OnboardingStep.tsx
- ProductTour.tsx
- synthWave.ts
- ai/index.ts
- meetingRecorder.ts
- VoiceModal.tsx
- icsHelper.ts
- scheduler/index.ts
- PreferencesSettingsScreen.tsx
- AddTaskEventModal.tsx
- deliveryReconciler.ts
- DatabaseService
- VoiceConversationController
- DayView.tsx
- NoteEditor.tsx
- actionExecutor.ts
- notesQueryStore.ts
- accountLinkService.ts
- cloudClient.ts
- eventTime.ts
- localConversation.ts
- CalendarScreen.tsx
- .onMessage
- reminderHealth.ts
- useScheduleItemModal.ts
- speechPreferences.ts
- cancelReminderAlarm
- deliveryStore.ts
- notesEditStore.ts
- NoteBody.tsx
- utils/index.ts
- onlineChatSkill.ts
- philippineHolidays.ts
- userStore
- cloud/index.ts
- assistantOperationSchema.ts
- richText.ts
- speechService.ts
- nativeTransport.ts
- ThemeContext.tsx
- useNotesData.ts
- NotesScreen.tsx
- CleanIntent
- VoiceConversationDeps
- voiceConversation/index.ts
- calendarVisibilityStore.ts
- AuthBackdrop.tsx
- OnlineVoice.tsx
- VoiceTransport
- VoiceConversationGates
- avatarFile.ts
- syncScheduler.ts
- StreamXhr
- lafina_logo_chat_header_xml.ts

## God Nodes (most connected - your core abstractions)
1. `useTheme()` - 109 edges
2. `useThemedStyles()` - 86 edges
3. `Fonts` - 48 edges
4. `VoiceConversationController` - 41 edges
5. `DatabaseTransaction` - 40 edges
6. `db` - 40 edges
7. `ThemeColors` - 39 edges
8. `generateId()` - 36 edges
9. `ProfileScreen()` - 27 edges
10. `executeNluAction()` - 26 edges

## Surprising Connections (you probably didn't know these)
- `ReminderHealth()` --indirect_call--> `openExactAlarmSettings()`  [INFERRED]
  src/ui/components/profile/ReminderHealth.tsx → src/scheduler/reminderAlarm.ts
- `ReminderHealth()` --indirect_call--> `openFullScreenIntentSettings()`  [INFERRED]
  src/ui/components/profile/ReminderHealth.tsx → src/scheduler/reminderAlarm.ts
- `ReminderHealth()` --indirect_call--> `openNotificationSettings()`  [INFERRED]
  src/ui/components/profile/ReminderHealth.tsx → src/scheduler/reminderAlarm.ts
- `createNotesQueryStore()` --indirect_call--> `toNoteSnapshot()`  [INFERRED]
  src/storage/notesQueryStore.ts → src/storage/notesEditStore.ts
- `MutationResult` --references--> `SyncEntityType`  [EXTRACTED]
  src/sync/syncWorker.ts → src/storage/syncTypes.ts

## Import Cycles
- None detected.

## Communities (79 total, 5 thin omitted)

### Community 0 - "MeetingsContext.tsx"
Cohesion: 0.06
Nodes (76): CloudResult, CATALOG, classifyNotesFailure(), describeMeetingError(), isRetryable(), MeetingError, MeetingErrorCode, MeetingErrorInfo (+68 more)

### Community 1 - "timingAdvisor.ts"
Cohesion: 0.06
Nodes (43): clampAlpha(), DEFAULT_EWMA_ALPHA, EwmaTracker, stepEwma(), extractStudentFeatures(), featuresToVector(), getEwmaLatency(), getInteractionHistory() (+35 more)

### Community 2 - "chatOrchestrator.ts"
Cohesion: 0.05
Nodes (54): chatOrchestrator, ChatOrchestratorResult, describeOnlineChatFailure(), format12HourTime(), INTERRUPTED_REPLY_NOTE, isHandbookQuestion(), isLocalReply(), minutesToTime() (+46 more)

### Community 3 - "commandReview.ts"
Cohesion: 0.07
Nodes (67): format12HourTime(), adaptiveReminderLine(), Applied, applyOperation(), applyReminderChanges(), buildCreateNote(), buildCreateReminder(), buildCreateTask() (+59 more)

### Community 4 - "MeetingDetail.tsx"
Cohesion: 0.08
Nodes (53): isBusy(), wordCount(), MIME_DOCX, MIME_PDF, MIME_PPTX, pickDocument(), PickedDocument, PickOutcome (+45 more)

### Community 5 - "updateService.ts"
Cohesion: 0.06
Nodes (55): APP_VERSION, AppUpdateItem(), AppUpdateItemProps, ask(), getThemedStyles(), labelFor(), notesPreview(), sizeLabel() (+47 more)

### Community 6 - "useTheme"
Cohesion: 0.08
Nodes (53): enableOnlineMode(), DOCUMENT_FORMATS, removeAttachmentFiles(), shareAttachment(), toLocalPath(), ChatInput(), getThemedStyles(), styles (+45 more)

### Community 7 - "ref_react_native"
Cohesion: 0.08
Nodes (37): accountLinkService, syncWorker, AuthButton(), AuthButtonProps, styles, AuthHeader(), styles, AuthInput() (+29 more)

### Community 8 - "syncWorker.ts"
Cohesion: 0.07
Nodes (48): AUTHORITATIVE_SYNC_ENTITY_TYPES, CLIENT_SYNC_ENTITY_TYPES, effectiveSyncEntityTypes(), LAST_WRITE_WINS_ENTITY_TYPES, LEGACY_SYNC_ENTITY_TYPES, PERSONAL_SYNC_ENTITY_TYPES, sameEntityTypeSet(), SINGLETON_SYNC_ENTITY_TYPES (+40 more)

### Community 9 - "accountDataReset.ts"
Cohesion: 0.06
Nodes (48): authorizeDataReset(), clearPlanner(), DataResetAuthority, DataResetOutcome, DataResetRefused, DataResetStep, finishAttachmentCleanup(), PLANNER_LEFT (+40 more)

### Community 10 - "callDispatcher.ts"
Cohesion: 0.10
Nodes (47): stopSpeechPlayback(), CallRequest, answerCall(), autoSnoozeCall(), buildAnnouncement(), CALL_SPOKEN_NUMBERS, CallDispatcherSession, CallResolution (+39 more)

### Community 11 - "ProfileScreen.tsx"
Cohesion: 0.07
Nodes (37): ARC_SCREEN_XML, hasAttachmentCleanup(), chatReplyFormatStore, ProfileStatistics, profileStatisticsStore, UNAVAILABLE_STATISTICS, avatarSource(), removeAvatarImage() (+29 more)

### Community 12 - "database.ts"
Cohesion: 0.05
Nodes (38): ATTACHMENT_CLEANUP_QUEUE_COLUMN, ATTACHMENT_CLEANUP_TABLE, migrateAttachmentCleanup(), migrateAttachmentCleanupQueue(), ADR-0026, DatabaseTransaction, db, FAILURE_MESSAGES (+30 more)

### Community 13 - "ChatMessageItem.tsx"
Cohesion: 0.08
Nodes (42): ttsService, formatFileSize(), isDocumentFormat(), CHAT_REPLY_FORMAT_KEY, ChatReplyFormat, DEFAULT_CHAT_REPLY_FORMAT, Listener, listeners (+34 more)

### Community 14 - "syncOutboxStore.ts"
Cohesion: 0.08
Nodes (28): SyncConflict, SyncConflictInput, syncConflictStore, SyncMetadataInput, syncMetadataStore, enqueueListeners, OutboxEnqueueListener, OutboxItem (+20 more)

### Community 15 - "useCalendarData.ts"
Cohesion: 0.10
Nodes (37): Candidate, ImportBatch, importedBatchesStore, isStringArray(), parseStoredBatch(), readStoredBatches(), StoredImportBatch, PlannerExport (+29 more)

### Community 16 - "ttsService.ts"
Cohesion: 0.09
Nodes (38): ActiveSpeech, applyConfiguration(), bounded(), configureChain, configureTts(), deletePreCachedReminderAudio(), eligibleOfflineVoices(), enableDucking() (+30 more)

### Community 17 - "fastPathParser.ts"
Cohesion: 0.11
Nodes (36): classifyCrudEntityType(), classifyMeridiemToken(), cleanCrudTargetTitle(), detectCategory(), detectContextPeriod(), distillScheduleTitle(), EndpointMeridiem, escapeRegExp() (+28 more)

### Community 18 - "dbInit.ts"
Cohesion: 0.11
Nodes (33): CALL_RESULT_DELAY_MS, DEFAULT_BUSIEST_DAY, DEFAULT_CLASS_COUNT, DEFAULT_DAILY_DIGEST, DEFAULT_LONGEST_GAP, DEFAULT_NOTIFICATIONS, DEFAULT_QUIET_HOURS, DEFAULT_REMINDER_LEAD (+25 more)

### Community 19 - "plannerQueries.ts"
Cohesion: 0.08
Nodes (30): EventZoneTiming, FoldChoice, EVENT_TIME_COLUMNS, eventTimeStore, EventWallRow, fold(), ADR-0021, VALID_EVENT_TIME_JOIN() (+22 more)

### Community 20 - "controller.ts"
Cohesion: 0.07
Nodes (22): ACTIVE, DEFAULT_LIMITS, FAILURE_MESSAGES, LiveSession, ownTimers(), PendingAnswer, randomId(), systemClock (+14 more)

### Community 21 - "chatStore.ts"
Cohesion: 0.09
Nodes (29): isValidChatOwner(), LEGACY_SHARED_SESSION_ID, LegacyChatDecision, LegacyChatOutcome, migrateChatOwnership(), NEW_SESSION_GENERATION_SQL, ownedChatSessionId(), transferChatOwnership() (+21 more)

### Community 22 - "OfflineVoice.tsx"
Cohesion: 0.10
Nodes (29): PreviewRefusal, TtsReadiness, ADR-0022, assertActive(), clampSpeechFactor(), DEFAULT_SPEECH_SETTINGS, NEUTRAL_FACTOR, parse() (+21 more)

### Community 23 - "storage/index.ts"
Cohesion: 0.14
Nodes (24): AuthResponseData, UserProfileData, hashPassword(), MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, normalizeEmail(), PasswordValidationResult, sha256() (+16 more)

### Community 24 - "reminderActions.ts"
Cohesion: 0.14
Nodes (29): recordReminderInteraction(), acknowledgeReminderAction(), autoSnoozeReminderAction(), createNextRecurringReminder(), fenceFailure(), FencePreparation, fenceRejection(), prepareFence() (+21 more)

### Community 25 - "OnboardingStep.tsx"
Cohesion: 0.09
Nodes (26): LongestClassGap, SnoozeTendency, StudyPeakHour, WeeklyClassCount, getThemedStyles(), OnboardingNavigation(), OnboardingNavigationProps, styles (+18 more)

### Community 26 - "ProductTour.tsx"
Cohesion: 0.12
Nodes (25): CustomTabBar(), CustomTabBarProps, getTabThemedStyles(), MIC_CENTER_FROM_BOTTOM, styles, TabType, TOUR_TABS, getThemedStyles() (+17 more)

### Community 27 - "synthWave.ts"
Cohesion: 0.12
Nodes (27): EMPTY_FRAME, Frame, styles, SynthSplash(), SynthSplashProps, bump(), clamp01(), DARK_STOPS (+19 more)

### Community 28 - "ai/index.ts"
Cohesion: 0.20
Nodes (24): cancelNativeQuietly(), cancelOfflineSpeechCapture(), getNativeModule(), hasOfflineSpeechCapture(), MAX_CAPTURE_DURATION_MS, MICROPHONE_BUSY_CODES, MicrophoneBusyError, OfflineSpeechCaptureHandle (+16 more)

### Community 29 - "meetingRecorder.ts"
Cohesion: 0.10
Nodes (11): MeetingTranscriptionProgress, transcribeMeetingChunks(), TranscribeMeetingOptions, ImportedAudioResult, LafinaMeetingRecorderNative, MeetingAudioChunk, MeetingAudioListing, meetingRecorder (+3 more)

### Community 30 - "VoiceModal.tsx"
Cohesion: 0.09
Nodes (25): isMicrophoneBusyError(), warmupOfflineSpeech(), stopSpeaking, NLU_PARSER_DELAY_MS, VOICE_SUCCESS_DELAY_MS, DraftDialogRequest, DRAFT_READY_NOTICE, executeDefaultCommand() (+17 more)

### Community 31 - "icsHelper.ts"
Cohesion: 0.14
Nodes (25): cleanIcsValue(), DATE_KEYS, escapeText(), expandRecurringEvent(), foldLine(), formatDateForRRule(), formatIcsDateTime(), formatIcsUtcInstant() (+17 more)

### Community 32 - "scheduler/index.ts"
Cohesion: 0.16
Nodes (25): CallCommand, CallResolutionOutcome, consumePendingNativeCall(), errorCode(), getNativeModule(), getReminderPermissionStatus(), isNativeReminderDeliveryAvailable(), LafinaReminderNativeModule (+17 more)

### Community 33 - "PreferencesSettingsScreen.tsx"
Cohesion: 0.14
Nodes (24): cancelModelDownload(), deleteQwenModel(), downloadQwenModel(), getModelsDirectory(), getModelStatus(), getQwenModelPath(), isQwenModelReady(), QWEN_MODEL_INFO (+16 more)

### Community 34 - "AddTaskEventModal.tsx"
Cohesion: 0.20
Nodes (21): overnightNote(), addDaysToDate(), checkEventWallTime(), endsNextDay(), eventEndDate(), isRealDate(), isWallTime(), endDateOf() (+13 more)

### Community 35 - "deliveryReconciler.ts"
Cohesion: 0.17
Nodes (23): boundedNative(), chain, claimForegroundRing(), DeliveryReconcileSummary, drainNativeDeliveryReceipts(), emptySummary(), isDesired(), matches() (+15 more)

### Community 36 - "DatabaseService"
Cohesion: 0.15
Nodes (12): DatabaseService, describeQuery(), storageErrorMessage(), StorageUnavailableError, applySessionPragmas(), assertFileIsUsable(), failureReasonFor(), initDatabase() (+4 more)

### Community 37 - "VoiceConversationController"
Cohesion: 0.21
Nodes (6): VoiceConversationController, registerVoiceConversation(), ConversationSnapshot, IDLE, useVoiceConversation(), VoiceConversationHandle

### Community 38 - "DayView.tsx"
Cohesion: 0.16
Nodes (22): DayView(), HolidayChip(), styles, TaskCheckbox(), tintFor(), describeHoliday(), getHolidaysOn(), buildDayEntries() (+14 more)

### Community 39 - "NoteEditor.tsx"
Cohesion: 0.16
Nodes (19): Note, NoteBody(), dragHandleStyles, getLocalImage(), NoteCardBase(), NoteCardBaseProps, NoteCardWithDrag, NoteCardWithDragProps (+11 more)

### Community 40 - "actionExecutor.ts"
Cohesion: 0.21
Nodes (20): computeAdaptiveTriggerAt(), ActionExecutorOptions, addMinutesToTime(), cleanupMatchingReminders(), computeDurationMinutes(), executeNluAction(), findMatchingEvent(), findMatchingNote() (+12 more)

### Community 41 - "notesQueryStore.ts"
Cohesion: 0.13
Nodes (21): NoteSnapshot, createNotesQueryStore(), decodeCursor(), escapeLike(), hasControlCharacter(), INDEX_BATCH, INDEX_CHAR_BUDGET, indexBatch() (+13 more)

### Community 42 - "accountLinkService.ts"
Cohesion: 0.16
Nodes (21): AccountFlowResult, AccountFlowStatus, attachAuthenticatedCloudSession(), authenticateExistingCloudAccount(), clearDeferredCredentialSafely(), completeDeferredCloudLink(), deferredLinkAttempts, isFlowResult() (+13 more)

### Community 43 - "cloudClient.ts"
Cohesion: 0.12
Nodes (16): androidConnectivity(), AndroidConnectivityModule, canResolveHost(), CLOUD_API_BASE_URL, CloudStreamOptions, defaultApiBaseUrls, describeConnectionFailure(), hostOf() (+8 more)

### Community 44 - "eventTime.ts"
Cohesion: 0.19
Nodes (20): deviceTimeZone(), engineFormatsWallTime(), eventSpanMinutes(), EventTimeError, EventTimeProblem, EventWallTime, formatterFor(), formatters (+12 more)

### Community 45 - "localConversation.ts"
Cohesion: 0.16
Nodes (19): buildLocalConversationReply(), classifySmallTalk(), DayGlance, firstName(), formatTime(), glanceLine(), glanceToday(), localDate() (+11 more)

### Community 46 - "CalendarScreen.tsx"
Cohesion: 0.16
Nodes (16): endReviewSession(), tasksStore, CalendarLayersModal(), CalendarScreen(), styles, WeekView(), defaultForm(), useTimeBlockModal() (+8 more)

### Community 48 - "reminderHealth.ts"
Cohesion: 0.15
Nodes (14): bounded(), HealthTimeoutError, isPermissionStatus(), PERMISSION_READ_TIMEOUT_MS, readReminderHealth(), recoverReminderHealth(), RECOVERY_TIMEOUT_MS, ReminderHealthSnapshot (+6 more)

### Community 49 - "useScheduleItemModal.ts"
Cohesion: 0.18
Nodes (16): EventFolds, isEventTimeError(), applyEventMemoryToDraft(), EventMemoryOffer, AddTaskEventModalProps, defaultForm(), LIVE_REMINDER_STATUSES, ownReminderIds() (+8 more)

### Community 50 - "speechPreferences.ts"
Cohesion: 0.18
Nodes (12): getActiveOfflineCaptureId(), admissionRefusal(), applySpeechPreferences(), createPreviewTicket(), meetingRecording(), PREVIEW_TEXT, PreviewHandle, PreviewTicket (+4 more)

### Community 51 - "cancelReminderAlarm"
Cohesion: 0.15
Nodes (14): admitReminderCall(), CallAdmission, CallRejection, recordRejection(), cancelReminderAlarm(), deliveryStore, enqueueReminderUpdate(), Reminder (+6 more)

### Community 52 - "deliveryStore.ts"
Cohesion: 0.13
Nodes (14): DeliveryEventName, DeliveryFenceError, DeliveryFenceResult, DeliveryIdentity, deliveryIdentityUri(), DeliveryJob, DeliveryJobState, deliveryNotificationTag() (+6 more)

### Community 53 - "notesEditStore.ts"
Cohesion: 0.16
Nodes (14): assertActiveOwner(), NoteEditConflictError, NoteEditFailure, NoteEditPatch, notesEditStore, NoteWriteTarget, read(), requireCurrent() (+6 more)

### Community 54 - "NoteBody.tsx"
Cohesion: 0.15
Nodes (16): compactSizes, compactText, fullSizes, fullText, NoteBodyProps, Spans(), spanStyle(), styles (+8 more)

### Community 55 - "utils/index.ts"
Cohesion: 0.21
Nodes (16): applyBlock(), applyIndent(), applyInline(), applyNoteFormat(), BlockFormat, continueListOnNewline(), escapeRegExp(), findInsertedNewline() (+8 more)

### Community 56 - "onlineChatSkill.ts"
Cohesion: 0.12
Nodes (11): BackendChatResponse, BackendChatSource, BackendHandbookStatusResponse, EMPTY_MESSAGE, HandbookSource, HandbookStatus, OnlineChatReply, onlineChatSkill (+3 more)

### Community 57 - "philippineHolidays.ts"
Cohesion: 0.17
Nodes (16): buildYear(), byYear, dateKey(), easterSunday(), getPhilippineHolidays(), Holiday, HOLIDAY_CALENDAR_ID, HOLIDAY_CALENDAR_NAME (+8 more)

### Community 58 - "userStore"
Cohesion: 0.22
Nodes (12): label(), loadOnlineVoices(), OnlineVoiceOption, GUEST_USER_ID, localSettingsStore, ONLINE_VOICE_KEY, OnlineVoiceChoice, onlineVoiceSettingsStore (+4 more)

### Community 59 - "cloud/index.ts"
Cohesion: 0.23
Nodes (12): cloudClient, CloudResultStatus, hasProEntitlement(), isGuestAccount(), isStudentProAccount(), isStudentProRole(), BackendMeetingSummaryResponse, MeetingActionItem (+4 more)

### Community 60 - "assistantOperationSchema.ts"
Cohesion: 0.18
Nodes (11): ASSISTANT_OPERATION_TABLES, bumpSql(), migrateAssistantOperations(), RECEIPT_RETENTION, REVISION_TRACKED_COLUMNS, REVISION_TRACKED_TABLES, RevisionEntityType, revisionTriggerNames() (+3 more)

### Community 61 - "richText.ts"
Cohesion: 0.22
Nodes (13): ChecklistStat, decodeEntities(), HtmlElement, HtmlNode, HtmlText, htmlToMarkdown(), inlineToMarkdown(), isList() (+5 more)

### Community 62 - "speechService.ts"
Cohesion: 0.22
Nodes (11): getNativeAudioPlayer(), playSpeechFile(), createCallSpeechProvider(), FIRST_SEGMENT_MAX_CHARS, FIRST_SEGMENT_MIN_CHARS, speakableText(), SPEECH_CHUNK_CHARS, splitForSpeech() (+3 more)

### Community 63 - "nativeTransport.ts"
Cohesion: 0.15
Nodes (5): NATIVE_EVENT, NativeVoiceConversation, nativeVoiceTransport, RawEvent, TransportEvent

### Community 64 - "ThemeContext.tsx"
Cohesion: 0.29
Nodes (11): darkColors, lightColors, ThemeContext, ThemeContextType, ThemeProvider(), captureForReveal(), isThemeRevealAvailable(), LafinaThemeRevealModule (+3 more)

### Community 65 - "useNotesData.ts"
Cohesion: 0.33
Nodes (11): isNoteEditConflict(), BUILT_IN_FILTERS, swapAnimation, targetOf(), useNotesData(), UseNotesDataOptions, extractChecklistItems(), isBodyEmpty() (+3 more)

### Community 66 - "NotesScreen.tsx"
Cohesion: 0.32
Nodes (8): NoteFilters(), NoteFiltersProps, styles, NotesScreen(), styles, FilterType, NotesScreenProps, Colors

### Community 67 - "CleanIntent"
Cohesion: 0.24
Nodes (10): COMMAND_GUIDE, CommandGuideExample, cleanDate(), CleanIntent, cleanMinutes(), cleanText(), cleanTime(), InvalidFieldError (+2 more)

### Community 68 - "VoiceConversationDeps"
Cohesion: 0.18
Nodes (3): VoiceConversationDeps, ConversationClock, ConversationPersistence

### Community 69 - "voiceConversation/index.ts"
Cohesion: 0.22
Nodes (8): allowLocalTestServer(), defaultVoiceConversationDeps(), isSignedInOwner(), ONLINE_MODE_CHANGED_EVENT, ONLINE_MODE_KEY, VOICE_CONSENT_KEY, voiceConsent, handbookPreference

### Community 70 - "calendarVisibilityStore.ts"
Cohesion: 0.28
Nodes (8): CalendarVisibilityMap, calendarVisibilityStore, DEFAULT_VISIBILITY, parseStoredFile(), parseVisibilityMap(), readStoredFile(), StoredUserVisibility, StoredVisibilityFile

### Community 71 - "AuthBackdrop.tsx"
Cohesion: 0.31
Nodes (7): AuthBackdrop(), styles, useReducedMotion(), Grainient(), GrainientProps, nativeSupported, styles

### Community 72 - "OnlineVoice.tsx"
Cohesion: 0.31
Nodes (8): audioBusy(), describeOnlineVoice(), getThemedStyles(), LANGUAGE_NAMES, ONLINE_PREVIEW_TEXT, OnlineVoice(), Props, styles

### Community 75 - "avatarFile.ts"
Cohesion: 0.38
Nodes (5): AVATARS_DIR, extensionOf(), isCancellation(), pickAvatarImage(), PickAvatarResult

### Community 76 - "syncScheduler.ts"
Cohesion: 0.33
Nodes (4): DEFAULT_SYNC_DEBOUNCE_MS, DEFAULT_SYNC_INTERVAL_MS, SyncScheduler, SyncSchedulerOptions

## Knowledge Gaps
- **22 isolated node(s):** `ADR-0018`, `ADR-0030`, `ADR-0030`, `ADR-0025`, `ADR-0026` (+17 more)
  These have ≤1 connection - possible missing edges. (Counts symbols only; 612 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useTheme()` connect `useTheme` to `MeetingDetail.tsx`, `updateService.ts`, `ref_react_native`, `callDispatcher.ts`, `ProfileScreen.tsx`, `ChatMessageItem.tsx`, `useCalendarData.ts`, `OnboardingStep.tsx`, `ProductTour.tsx`, `synthWave.ts`, `VoiceModal.tsx`, `scheduler/index.ts`, `PreferencesSettingsScreen.tsx`, `AddTaskEventModal.tsx`, `DayView.tsx`, `NoteEditor.tsx`, `CalendarScreen.tsx`, `NoteBody.tsx`, `ThemeContext.tsx`, `NotesScreen.tsx`, `AuthBackdrop.tsx`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._
- **What connects `ADR-0018`, `ADR-0030`, `ADR-0030` to the rest of the system?**
  _22 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `MeetingsContext.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.05854049719326383 - nodes in this community are weakly interconnected._
- **Why does `db` connect `database.ts` to `MeetingsContext.tsx`, `commandReview.ts`, `syncWorker.ts`, `accountDataReset.ts`, `callDispatcher.ts`, `ProfileScreen.tsx`, `syncOutboxStore.ts`, `useCalendarData.ts`, `dbInit.ts`, `plannerQueries.ts`, `chatStore.ts`, `OfflineVoice.tsx`, `storage/index.ts`, `reminderActions.ts`, `deliveryReconciler.ts`, `notesQueryStore.ts`, `reminderHealth.ts`, `useScheduleItemModal.ts`, `cancelReminderAlarm`, `deliveryStore.ts`, `notesEditStore.ts`, `userStore`, `assistantOperationSchema.ts`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Should `timingAdvisor.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06128364389233954 - nodes in this community are weakly interconnected._
- **Why does `DatabaseTransaction` connect `database.ts` to `MeetingsContext.tsx`, `commandReview.ts`, `syncWorker.ts`, `accountDataReset.ts`, `notesQueryStore.ts`, `syncOutboxStore.ts`, `useCalendarData.ts`, `dbInit.ts`, `plannerQueries.ts`, `deliveryStore.ts`, `chatStore.ts`, `notesEditStore.ts`, `storage/index.ts`, `reminderActions.ts`, `cancelReminderAlarm`, `OfflineVoice.tsx`, `assistantOperationSchema.ts`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Should `chatOrchestrator.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.051577152600170505 - nodes in this community are weakly interconnected._