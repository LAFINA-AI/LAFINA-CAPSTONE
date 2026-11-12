# Graph Report - src  (2026-11-12)

## Corpus Check
- 317 files · ~297,220 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 1 file(s) not represented in the graph (top: .ico 1)

## Summary
- 2924 nodes · 9227 edges · 98 communities (93 shown, 5 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 139 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `2c3298b3`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- commandReview.ts
- chatStore.ts
- timingAdvisor.ts
- ref_react
- ChatScreen.tsx
- storage/index.ts
- updateService.ts
- actionExecutor.ts
- actionService.ts
- ThemeColors
- synthWave.ts
- syncWorker.ts
- useTheme
- useDashboardData.ts
- database.ts
- ProfileScreen.tsx
- callDispatcher.ts
- CalendarScreen.tsx
- chatOrchestrator.ts
- OfflineVoice.tsx
- characterAvatarGenerator.ts
- ttsService.ts
- VoiceConversationController
- ref_react_native
- plannerQueries.ts
- db
- controller.ts
- VoiceConversationPanel.tsx
- speechService.ts
- useNotesData.ts
- NotesScreen.tsx
- ref_lucide_react_native
- scheduler/index.ts
- syncOutboxStore.ts
- notesQueryStore.ts
- ai/index.ts
- ReminderHealth.tsx
- accountDataReset.ts
- utils/index.ts
- ustpCorParser.ts
- voiceConversation/index.ts
- icsHelper.ts
- fastPathParser.ts
- draftRegistry.ts
- tools/index.ts
- ClassScheduleModal.tsx
- DatabaseService
- eventTime.ts
- useCalendarData.ts
- useThemedStyles
- DayView.tsx
- accountLinkService.ts
- notesPipeline.ts
- sourceReminders.ts
- personalMemoryStore.ts
- onlineChatSkill.ts
- OnboardingScreen.tsx
- ProductTour.tsx
- nativeTransport.ts
- Task
- OnboardingStep.tsx
- cloudClient.ts
- onlineIntentExtractor.ts
- CallLafinaSettingsModal.tsx
- ChatHistorySheet.tsx
- syncStateStore.ts
- localConversation.ts
- scheduleParser.ts
- backendSelection.ts
- src/meetings/index.ts
- deliveryStore.ts
- ThemeContext.tsx
- documentSkill.ts
- meetingRecorder.ts
- reminderActions.ts
- philippineHolidays.ts
- MeetingsContext.tsx
- normalizeNotes
- chatMarkdown.ts
- LafinaMeetingRecorderNative
- reminderAlarm.ts
- cloud/index.ts
- generateMeetingNotes
- assistantOperationSchema.ts
- useTodoData.ts
- VoiceConversationDeps
- notes/types.ts
- .finalAnswer
- developerTestService.ts
- NoteBody.tsx
- avatarFile.ts
- remindersStore.ts
- VoiceConversationGates
- CustomTabBar.tsx
- notesStore.ts
- syncScheduler.ts
- StreamXhr
- lafina_logo_chat_header_xml.ts

## God Nodes (most connected - your core abstractions)
1. `useTheme()` - 173 edges
2. `useThemedStyles()` - 126 edges
3. `Fonts` - 75 edges
4. `generateId()` - 63 edges
5. `ThemeColors` - 59 edges
6. `VoiceConversationController` - 53 edges
7. `db` - 51 edges
8. `Layout` - 48 edges
9. `DatabaseTransaction` - 47 edges
10. `Spacing` - 45 edges

## Surprising Connections (you probably didn't know these)
- `VoiceModal()` --indirect_call--> `warmupOfflineSpeech()`  [INFERRED]
  src/ui/components/VoiceModal.tsx → src/ai/native/speechCapture.ts
- `ServerSwitchItem()` --indirect_call--> `localBackendUrl()`  [INFERRED]
  src/ui/components/profile/ServerSwitchItem.tsx → src/cloud/backendSelection.ts
- `parseNotesResult()` --calls--> `normalizeNotes()`  [EXTRACTED]
  src/skills/meetingNotesSkill.ts → src/meetings/meetingNotes.ts
- `bumpRevision()` --calls--> `generateId()`  [EXTRACTED]
  src/storage/chatMemoryStore.ts → src/utils/id.ts
- `Section()` --indirect_call--> `getMeetingThemedStyles()`  [INFERRED]
  src/ui/screens/meetings/NotesView.tsx → src/ui/screens/meetings/meetingStyles.ts

## Import Cycles
- None detected.

## Communities (98 total, 5 thin omitted)

### Community 0 - "commandReview.ts"
Cohesion: 0.05
Nodes (88): addMinutesToTime(), computeDurationMinutes(), format12HourTime(), adaptiveReminderLine(), Applied, applyOperation(), applyReminderChanges(), buildCreateNote() (+80 more)

### Community 1 - "chatStore.ts"
Cohesion: 0.04
Nodes (58): ReviewDecisionResult, ConfirmResult, CHAT_MEMORY_CHANGED_EVENT, ChatMemoryChangedEvent, chatMemoryService, bumpRevision(), ChatMemory, ChatMemoryChanges (+50 more)

### Community 2 - "timingAdvisor.ts"
Cohesion: 0.06
Nodes (43): clampAlpha(), DEFAULT_EWMA_ALPHA, EwmaTracker, stepEwma(), extractStudentFeatures(), featuresToVector(), getEwmaLatency(), getInteractionHistory() (+35 more)

### Community 3 - "ref_react"
Cohesion: 0.06
Nodes (46): accountLinkService, syncWorker, AuthButton(), AuthButtonProps, styles, AuthHeader(), styles, AuthInput() (+38 more)

### Community 4 - "ChatScreen.tsx"
Cohesion: 0.06
Nodes (56): PrepareResult, ReviewEditPatch, readInitialOnlineMode(), ChatInput(), ChatInputProps, getThemedStyles(), isHallucinatedSpeech(), styles (+48 more)

### Community 5 - "storage/index.ts"
Cohesion: 0.06
Nodes (51): DATA_CONSENT_KEY, ToolPermissionResult, label(), loadOnlineVoices(), GUEST_USER_ID, GUEST_USERNAME, ACADEMIC_PROFILE_KEY, AcademicCourseRecord (+43 more)

### Community 6 - "updateService.ts"
Cohesion: 0.06
Nodes (55): APP_VERSION, AppUpdateItem(), AppUpdateItemProps, ask(), getThemedStyles(), labelFor(), notesPreview(), sizeLabel() (+47 more)

### Community 7 - "actionExecutor.ts"
Cohesion: 0.07
Nodes (53): ChatOrchestratorResult, computeAdaptiveTriggerAt(), ActionExecutorOptions, cleanupMatchingReminders(), executeNluAction(), findMatchingEvent(), findMatchingNote(), findMatchingTask() (+45 more)

### Community 8 - "actionService.ts"
Cohesion: 0.07
Nodes (43): SpokenTurnReview, getRegisteredTool(), REGISTERED_TOOLS, RegisteredToolDefinition, TOOL_MAP, ToolParameterSchema, isToolExecutionPermitted(), ActionLifecycleListener (+35 more)

### Community 9 - "ThemeColors"
Cohesion: 0.08
Nodes (47): ThemeColors, getThemedStyles(), styles, UNDATED_PAGE_SIZE, UndatedTasksModal(), CustomizeDashboardModal(), FILTER_OPTIONS, GAP_OPTIONS (+39 more)

### Community 10 - "synthWave.ts"
Cohesion: 0.06
Nodes (47): ConversationPhase, AuthBackdrop(), styles, useReducedMotion(), Grainient(), GrainientProps, nativeSupported, styles (+39 more)

### Community 11 - "syncWorker.ts"
Cohesion: 0.08
Nodes (45): AUTHORITATIVE_SYNC_ENTITY_TYPES, CLIENT_SYNC_ENTITY_TYPES, effectiveSyncEntityTypes(), LAST_WRITE_WINS_ENTITY_TYPES, LEGACY_SYNC_ENTITY_TYPES, PERSONAL_SYNC_ENTITY_TYPES, sameEntityTypeSet(), SINGLETON_SYNC_ENTITY_TYPES (+37 more)

### Community 12 - "useTheme"
Cohesion: 0.09
Nodes (42): CommandProposal, MultiActionItemData, ActionCardHost(), ActionCardHostProps, getThemedStyles(), styles, CallReadResults(), styles (+34 more)

### Community 13 - "useDashboardData.ts"
Cohesion: 0.08
Nodes (47): parseClassBlockMetadata(), CalendarVisibilityMap, calendarVisibilityStore, DEFAULT_VISIBILITY, parseStoredFile(), parseVisibilityMap(), readStoredFile(), StoredUserVisibility (+39 more)

### Community 14 - "database.ts"
Cohesion: 0.06
Nodes (40): ADR-0016, ATTACHMENT_CLEANUP_QUEUE_COLUMN, ATTACHMENT_CLEANUP_TABLE, migrateAttachmentCleanup(), migrateAttachmentCleanupQueue(), ADR-0026, migrateChatMemories(), DatabaseTransaction (+32 more)

### Community 15 - "ProfileScreen.tsx"
Cohesion: 0.07
Nodes (40): ARC_SCREEN_XML, hasAttachmentCleanup(), ProfileStatistics, profileStatisticsStore, UNAVAILABLE_STATISTICS, avatarSource(), removeAvatarImage(), areTraitsVisuallyDistinct() (+32 more)

### Community 16 - "callDispatcher.ts"
Cohesion: 0.11
Nodes (45): waitForVoiceConversationRelease(), ConversationSnapshot, CALL_RESULT_DELAY_MS, answerCall(), autoSnoozeCall(), buildAnnouncement(), CALL_SPOKEN_NUMBERS, CallResolution (+37 more)

### Community 17 - "CalendarScreen.tsx"
Cohesion: 0.11
Nodes (39): EventFolds, isEventTimeError(), ImportBatch, applyEventMemoryToDraft(), EventMemoryOffer, parseRrule(), CalendarLayersModal(), CalendarLayersModalProps (+31 more)

### Community 18 - "chatOrchestrator.ts"
Cohesion: 0.10
Nodes (39): isForgetAllMemoriesRequest(), buildCompoundBatch(), chatOrchestrator, describeOnlineChatFailure(), format12HourTime(), getNextDateForDay(), hasCompoundPlannerActions(), INTERRUPTED_REPLY_NOTE (+31 more)

### Community 19 - "OfflineVoice.tsx"
Cohesion: 0.08
Nodes (38): applySpeechPreferences(), createPreviewTicket(), meetingRecording(), PREVIEW_TEXT, PreviewHandle, PreviewRefusal, PreviewTicket, startVoicePreview() (+30 more)

### Community 20 - "characterAvatarGenerator.ts"
Cohesion: 0.06
Nodes (42): BACKDROP_ACCENTS, CharacterAvatar(), CharacterAvatarProps, renderAccessory(), renderBackHair(), renderBrows(), renderCheeks(), renderEyes() (+34 more)

### Community 21 - "ttsService.ts"
Cohesion: 0.09
Nodes (37): ActiveSpeech, applyConfiguration(), bounded(), configureChain, configureTts(), eligibleOfflineVoices(), enableDucking(), establishOfflineVoice() (+29 more)

### Community 22 - "VoiceConversationController"
Cohesion: 0.14
Nodes (3): humanizeProviderError(), VoiceConversationController, useVoiceConversation()

### Community 23 - "ref_react_native"
Cohesion: 0.15
Nodes (30): isBusy(), wordCount(), formatWhen(), useToolBack(), useMeetings(), describeMeetingProblem(), formatBytes(), formatClock() (+22 more)

### Community 24 - "plannerQueries.ts"
Cohesion: 0.08
Nodes (31): EventZoneTiming, FoldChoice, EVENT_TIME_COLUMNS, eventTimeStore, EventWallRow, fold(), ADR-0021, VALID_EVENT_TIME_JOIN() (+23 more)

### Community 25 - "db"
Cohesion: 0.10
Nodes (33): DEFAULT_BUSIEST_DAY, DEFAULT_CLASS_COUNT, DEFAULT_DAILY_DIGEST, DEFAULT_LONGEST_GAP, DEFAULT_NOTIFICATIONS, DEFAULT_QUIET_HOURS, DEFAULT_REMINDER_LEAD, DEFAULT_SLEEP_TIME (+25 more)

### Community 26 - "controller.ts"
Cohesion: 0.07
Nodes (21): ACTIVE, LiveSession, ownTimers(), PendingAnswer, systemClock, ADR-0030, VoiceConversationLimits, ApiOutcome (+13 more)

### Community 27 - "VoiceConversationPanel.tsx"
Cohesion: 0.11
Nodes (31): cancelReviewedCommand(), latestPendingReview(), parseEditedDateInput(), parseEditedTimeInput(), GroundedDraft, groundedVoiceDraft(), isVoiceScheduleStart(), validateIntent() (+23 more)

### Community 28 - "speechService.ts"
Cohesion: 0.10
Nodes (32): getActiveOfflineCaptureId(), admissionRefusal(), getNativeAudioPlayer(), isSpeechBusy(), playSpeechFile(), stopSpeechPlayback(), OnlineVoiceOption, isProviderTestingEnabled() (+24 more)

### Community 29 - "useNotesData.ts"
Cohesion: 0.11
Nodes (31): INJECTION_PATTERNS, sanitizeUntrustedContext(), readLocalVoiceData(), readLocalVoiceResult(), NOTES_PAGE_SIZE, notesQueryStore, BUILT_IN_FILTERS, swapAnimation (+23 more)

### Community 30 - "NotesScreen.tsx"
Cohesion: 0.12
Nodes (29): Note, NoteBody(), dragHandleStyles, getLocalImage(), NoteCardBase(), NoteCardBaseProps, NoteCardWithDrag, NoteCardWithDragProps (+21 more)

### Community 31 - "ref_lucide_react_native"
Cohesion: 0.10
Nodes (29): formatFileSize(), isDocumentFormat(), CHAT_REPLY_FORMAT_KEY, ChatReplyFormat, chatReplyFormatStore, DEFAULT_CHAT_REPLY_FORMAT, Listener, listeners (+21 more)

### Community 32 - "scheduler/index.ts"
Cohesion: 0.14
Nodes (30): CallCommand, CallResolutionOutcome, boundedNative(), chain, claimForegroundRing(), DeliveryReconcileSummary, drainNativeDeliveryReceipts(), emptySummary() (+22 more)

### Community 33 - "syncOutboxStore.ts"
Cohesion: 0.12
Nodes (22): AuthResponseData, UserProfileData, SyncConflict, SyncConflictInput, syncConflictStore, SyncMetadataInput, syncMetadataStore, enqueueListeners (+14 more)

### Community 34 - "notesQueryStore.ts"
Cohesion: 0.10
Nodes (29): assertActiveOwner(), NoteEditConflictError, NoteEditFailure, NoteEditPatch, NoteSnapshot, NoteWriteTarget, read(), requireCurrent() (+21 more)

### Community 35 - "ai/index.ts"
Cohesion: 0.18
Nodes (26): cancelNativeQuietly(), cancelOfflineSpeechCapture(), getNativeModule(), hasOfflineSpeechCapture(), isMicrophoneBusyError(), MAX_CAPTURE_DURATION_MS, MICROPHONE_BUSY_CODES, MicrophoneBusyError (+18 more)

### Community 36 - "ReminderHealth.tsx"
Cohesion: 0.11
Nodes (25): openExactAlarmSettings(), openFullScreenIntentSettings(), openNotificationSettings(), ReminderPermissionStatus, bounded(), HealthTimeoutError, isPermissionStatus(), PERMISSION_READ_TIMEOUT_MS (+17 more)

### Community 37 - "accountDataReset.ts"
Cohesion: 0.11
Nodes (28): authorizeDataReset(), clearPlanner(), DataResetAuthority, DataResetOutcome, DataResetRefused, DataResetStep, finishAttachmentCleanup(), PLANNER_LEFT (+20 more)

### Community 38 - "utils/index.ts"
Cohesion: 0.13
Nodes (27): getNotePreviewText(), ActiveLineFormat, applyBlock(), applyIndent(), applyInline(), applyNoteFormat(), BlockFormat, continueListOnNewline() (+19 more)

### Community 39 - "ustpCorParser.ts"
Cohesion: 0.15
Nodes (28): canJoinSplitCourseLine(), canStartSplitCourseRow(), COLLEGE_ACRONYMS, computeCorRecommendations(), computeSemesterEndDate(), DAY_MAP, deriveCollegeShort(), expandDays() (+20 more)

### Community 40 - "voiceConversation/index.ts"
Cohesion: 0.11
Nodes (23): DEFAULT_LIMITS, FAILURE_MESSAGES, allowLocalTestServer(), defaultVoiceConversationDeps(), endActiveVoiceConversation(), isSignedInOwner(), ONLINE_MODE_CHANGED_EVENT, ONLINE_MODE_KEY (+15 more)

### Community 41 - "icsHelper.ts"
Cohesion: 0.14
Nodes (26): cleanIcsValue(), DATE_KEYS, escapeText(), expandRecurringEvent(), foldLine(), formatDateForRRule(), formatIcsDateTime(), formatIcsUtcInstant() (+18 more)

### Community 42 - "fastPathParser.ts"
Cohesion: 0.14
Nodes (26): classifyCrudEntityType(), classifyMeridiemToken(), cleanCrudTargetTitle(), detectContextPeriod(), EndpointMeridiem, escapeRegExp(), extractPriority(), extractRecurrenceRule() (+18 more)

### Community 43 - "draftRegistry.ts"
Cohesion: 0.11
Nodes (15): checkScheduleConflict(), ConflictCheckResult, ConflictingItem, minutesToTime(), timeToMinutes(), CancelDraftResult, ConfirmDraftResult, DRAFT_TTL_MS (+7 more)

### Community 44 - "tools/index.ts"
Cohesion: 0.12
Nodes (20): MIME_DOCX, MIME_PDF, MIME_PPTX, pickDocument(), PickedDocument, PickOutcome, ShareOutcome, shareTextFile() (+12 more)

### Community 45 - "ClassScheduleModal.tsx"
Cohesion: 0.19
Nodes (24): pickSubjectColor(), ClassScheduleModal(), ClassScheduleModalProps, EMPTY_COR_INFO, styles, buildAcademicCoursesFromEntries(), buildMergedAcademicProfile(), ClassRecurrenceMode (+16 more)

### Community 46 - "DatabaseService"
Cohesion: 0.16
Nodes (11): DatabaseService, storageErrorMessage(), StorageUnavailableError, applySessionPragmas(), assertFileIsUsable(), failureReasonFor(), initDatabase(), readInstalledVersion() (+3 more)

### Community 47 - "eventTime.ts"
Cohesion: 0.16
Nodes (23): checkEventWallTime(), deviceTimeZone(), endsNextDay(), engineFormatsWallTime(), eventEndDate(), eventSpanMinutes(), EventTimeError, EventTimeProblem (+15 more)

### Community 48 - "useCalendarData.ts"
Cohesion: 0.13
Nodes (22): importedBatchesStore, isStringArray(), parseStoredBatch(), readStoredBatches(), StoredImportBatch, tasksStore, getExistingOwnedIds(), ImportedEntityTable (+14 more)

### Community 49 - "useThemedStyles"
Cohesion: 0.14
Nodes (21): CommandGuide(), CommandGuideProps, getThemedStyles(), styles, getThemedStyles(), PersonalMemory(), PersonalMemoryProps, Review (+13 more)

### Community 50 - "DayView.tsx"
Cohesion: 0.16
Nodes (22): DayView(), HolidayChip(), styles, TaskCheckbox(), tintFor(), describeHoliday(), getHolidaysOn(), buildDayEntries() (+14 more)

### Community 51 - "accountLinkService.ts"
Cohesion: 0.15
Nodes (23): AccountFlowResult, AccountFlowStatus, attachAuthenticatedCloudSession(), authenticateExistingCloudAccount(), clearDeferredCredentialSafely(), completeDeferredCloudLink(), deferredLinkAttempts, isFlowResult() (+15 more)

### Community 52 - "notesPipeline.ts"
Cohesion: 0.16
Nodes (20): CloudResult, MeetingErrorCode, MeetingNotes, GenerateNotesOptions, GenerateNotesResult, NotesSkill, SectionPromptInput, TranscriptSegment (+12 more)

### Community 53 - "sourceReminders.ts"
Cohesion: 0.13
Nodes (21): admitReminderCall(), CallAdmission, CallRejection, CallRequest, recordRejection(), NativeCallAction, alertSuppression(), inferLegacySource() (+13 more)

### Community 54 - "personalMemoryStore.ts"
Cohesion: 0.12
Nodes (20): assertActive(), EMPTY(), EVENT_MEMORY_KEY, EventMemoryError, EventMemoryInput, EventMemoryProblem, EventMemorySnapshot, EventMemoryValue (+12 more)

### Community 55 - "onlineChatSkill.ts"
Cohesion: 0.10
Nodes (15): Config, directTestChat(), directTestVoiceApi, BackendChatResponse, BackendChatSource, BackendHandbookStatusResponse, EMPTY_MESSAGE, handbookPreference (+7 more)

### Community 56 - "OnboardingScreen.tsx"
Cohesion: 0.14
Nodes (19): AcademicProfileRecord, mapCorCoursesToAcademicRecords(), chatMemoryStore, buildCorMemoryFacts(), Entry, formatCollegeForMemory(), formatGenderForMemory(), OnboardingIdentity (+11 more)

### Community 57 - "ProductTour.tsx"
Cohesion: 0.16
Nodes (18): TabType, getThemedStyles(), lerp(), MOVE_MS, placeCard(), ProductTour(), ProductTourProps, spotlightPath() (+10 more)

### Community 58 - "nativeTransport.ts"
Cohesion: 0.10
Nodes (5): NATIVE_EVENT, NativeVoiceConversation, nativeVoiceTransport, RawEvent, VoiceTransport

### Community 59 - "Task"
Cohesion: 0.23
Nodes (18): Candidate, PlannerExport, PlannerWindow, Event, Task, TimeBlock, DayViewProps, MonthViewProps (+10 more)

### Community 60 - "OnboardingStep.tsx"
Cohesion: 0.14
Nodes (19): ParsedUstpCorResult, UstpCorOnboardingRecommendations, ConversationTone, LongestClassGap, SnoozeTendency, StudyPeakHour, WeeklyClassCount, busiestDayOptions (+11 more)

### Community 61 - "cloudClient.ts"
Cohesion: 0.14
Nodes (14): androidConnectivity(), AndroidConnectivityModule, canResolveHost(), CloudStreamOptions, defaultApiBaseUrls, describeConnectionFailure(), hostOf(), renewAccessToken() (+6 more)

### Community 62 - "onlineIntentExtractor.ts"
Cohesion: 0.20
Nodes (18): detectCategory(), buildIntentExtractionPrompt(), cleanString(), ENTITY_TYPES, extractIntentWithDeepSeek(), extractJsonObject(), extractMultiIntentsWithDeepSeek(), formatReferenceClock() (+10 more)

### Community 63 - "CallLafinaSettingsModal.tsx"
Cohesion: 0.18
Nodes (16): CALL_LAFINA_SETTINGS_KEYS, CallLafinaCaptionSize, CallLafinaLanguage, CallLafinaPacing, CallLafinaSettings, CallLafinaVerbosity, DEFAULT_CALL_LAFINA_SETTINGS, getCallLafinaSettings() (+8 more)

### Community 64 - "ChatHistorySheet.tsx"
Cohesion: 0.15
Nodes (17): GeneratedDocument, CHAT_FILES_SUBDIR, ChatSessionKind, ChatSummary, isUstpSessionId(), MAX_CHAT_TITLE, getChatFilesDir(), removeAttachmentFiles() (+9 more)

### Community 65 - "syncStateStore.ts"
Cohesion: 0.13
Nodes (13): executorFor(), PersistedEntityTypes, PersistedSyncState, saveTypeList(), syncStateStore, SyncStateUpdate, PersistedSyncStatus, currentState (+5 more)

### Community 66 - "localConversation.ts"
Cohesion: 0.18
Nodes (17): buildLocalConversationReply(), DayGlance, firstName(), formatTime(), glanceLine(), glanceToday(), localDate(), LocalReplyOptions (+9 more)

### Community 67 - "scheduleParser.ts"
Cohesion: 0.17
Nodes (13): checkDayHeader(), computeSemesterEndDate(), DAY_MAP, expandDays(), isDocumentHeader(), isInvalidSubject(), normalizeTime24(), ParsedScheduleResult (+5 more)

### Community 68 - "backendSelection.ts"
Cohesion: 0.15
Nodes (15): BACKEND_CHOICE_KEY, BACKEND_LABELS, BackendChoice, backendSelection, backendUrlFor(), DEVICE_SETTINGS_OWNER, LOCAL_BACKEND_URL_KEY, localBackendUrl() (+7 more)

### Community 69 - "src/meetings/index.ts"
Cohesion: 0.19
Nodes (15): CATALOG, classifyNotesFailure(), isRetryable(), MeetingErrorInfo, RecoveryAction, canTransition(), isInterruptible(), MeetingFacts (+7 more)

### Community 70 - "deliveryStore.ts"
Cohesion: 0.13
Nodes (14): DeliveryEventName, DeliveryFenceError, DeliveryFenceResult, DeliveryIdentity, deliveryIdentityUri(), DeliveryJob, DeliveryJobState, deliveryNotificationTag() (+6 more)

### Community 71 - "ThemeContext.tsx"
Cohesion: 0.20
Nodes (15): formatMiniDuration(), getThemedStyles(), MiniCallBar(), styles, darkColors, lightColors, ThemeContext, ThemeContextType (+7 more)

### Community 72 - "documentSkill.ts"
Cohesion: 0.14
Nodes (11): DetectedDocumentRequest, FORMAT_PATTERNS, BackendDocumentResponse, DOCUMENT_FORMAT_ORDER, DOCUMENT_FORMATS, DocumentFormat, DocumentFormatMeta, documentSkill (+3 more)

### Community 73 - "meetingRecorder.ts"
Cohesion: 0.24
Nodes (12): MeetingTranscriptionProgress, transcribeMeetingChunks(), TranscribeMeetingOptions, ImportedAudioResult, MeetingAudioChunk, MeetingAudioListing, meetingRecorder, MeetingRecordingResult (+4 more)

### Community 74 - "reminderActions.ts"
Cohesion: 0.30
Nodes (16): recordReminderInteraction(), acknowledgeReminderAction(), autoSnoozeReminderAction(), createNextRecurringReminder(), fenceFailure(), FencePreparation, fenceRejection(), prepareFence() (+8 more)

### Community 75 - "philippineHolidays.ts"
Cohesion: 0.17
Nodes (16): buildYear(), byYear, dateKey(), easterSunday(), getPhilippineHolidays(), Holiday, HOLIDAY_CALENDAR_ID, HOLIDAY_CALENDAR_NAME (+8 more)

### Community 76 - "MeetingsContext.tsx"
Cohesion: 0.17
Nodes (13): describeMeetingError(), ActiveRecording, defaultMeetingTitle(), detailOf(), elapsedOf(), isDefaultTitle(), MAX_RECORDING_MS, MeetingsContext (+5 more)

### Community 77 - "normalizeNotes"
Cohesion: 0.23
Nodes (15): ActionItem, cleanActionItems(), cleanMultiline(), cleanStringList(), cleanText(), cleanTopics(), deadlinesOf(), emptyNotes() (+7 more)

### Community 78 - "chatMarkdown.ts"
Cohesion: 0.20
Nodes (15): ChatBlock, ChatInline, ChatMarkdownOptions, chatMarkdownToPlainText(), count(), dropLast(), hideDanglingMarkers(), INLINE_RULES (+7 more)

### Community 80 - "reminderAlarm.ts"
Cohesion: 0.23
Nodes (13): consumePendingNativeCall(), errorCode(), getNativeModule(), getReminderPermissionStatus(), LafinaReminderNativeModule, reconcileReminderAlarms(), recordReceipt(), ScheduleAlarmOptions (+5 more)

### Community 81 - "cloud/index.ts"
Cohesion: 0.25
Nodes (11): cloudClient, hasProEntitlement(), isGuestAccount(), isStudentProAccount(), isStudentProRole(), BackendMeetingSummaryResponse, MeetingActionItem, MeetingSummaryResponse (+3 more)

### Community 82 - "generateMeetingNotes"
Cohesion: 0.26
Nodes (13): MeetingError, checkAborted(), generateMeetingNotes(), wait(), withRetry(), cleanSegments(), formatTimestamp(), HALLUCINATION_PATTERNS (+5 more)

### Community 83 - "assistantOperationSchema.ts"
Cohesion: 0.18
Nodes (11): ASSISTANT_OPERATION_TABLES, bumpSql(), migrateAssistantOperations(), RECEIPT_RETENTION, REVISION_TRACKED_COLUMNS, REVISION_TRACKED_TABLES, RevisionEntityType, revisionTriggerNames() (+3 more)

### Community 84 - "useTodoData.ts"
Cohesion: 0.26
Nodes (12): cancelReminderAlarm(), isNoteEditConflict(), remindersForSource(), TodoListViewProps, LIVE_REMINDER_STATUSES, NoteChecklistTodoItem, PRIORITY_RANK, retireTaskReminders() (+4 more)

### Community 85 - "VoiceConversationDeps"
Cohesion: 0.23
Nodes (3): randomId(), VoiceConversationDeps, voicePreferenceContext()

### Community 86 - "notes/types.ts"
Cohesion: 0.27
Nodes (8): VoiceConversationPanelProps, CallNavigationRequest, CallNavigationTarget, CallLafinaScreenProps, NoteFiltersProps, FilterType, NotesScreenProps, NotesSubTab

### Community 88 - "developerTestService.ts"
Cohesion: 0.24
Nodes (9): NativeDeliveryRegistration, StorageHealth, deliveryStore, AlarmDiagnostics, DatabaseDiagnostics, DEV_FIXTURE_TAG, DEVELOPER_MODE_KEY, SyncDiagnostics (+1 more)

### Community 89 - "NoteBody.tsx"
Cohesion: 0.25
Nodes (8): compactSizes, compactText, fullSizes, fullText, NoteBodyProps, Spans(), spanStyle(), styles

### Community 90 - "avatarFile.ts"
Cohesion: 0.32
Nodes (5): AVATARS_DIR, extensionOf(), isCancellation(), pickAvatarImage(), PickAvatarResult

### Community 91 - "remindersStore.ts"
Cohesion: 0.29
Nodes (5): enqueueReminderUpdate(), ReminderMutationGuard, reminderPayload(), ReminderStatus, StoredReminderRow

### Community 93 - "CustomTabBar.tsx"
Cohesion: 0.38
Nodes (6): CustomTabBar(), CustomTabBarProps, getTabThemedStyles(), styles, TOUR_TABS, tourTargetRef()

### Community 94 - "notesStore.ts"
Cohesion: 0.40
Nodes (4): enqueueNoteUpdate(), notePayload(), StoredNoteRow, syncOutboxStore

### Community 95 - "syncScheduler.ts"
Cohesion: 0.33
Nodes (4): DEFAULT_SYNC_DEBOUNCE_MS, DEFAULT_SYNC_INTERVAL_MS, SyncScheduler, SyncSchedulerOptions

## Knowledge Gaps
- **23 isolated node(s):** `ADR-0018`, `ADR-0030`, `ADR-0030`, `ADR-0030`, `ADR-0025` (+18 more)
  These have ≤1 connection - possible missing edges. (Counts symbols only; 801 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useTheme()` connect `useTheme` to `ref_react`, `ChatScreen.tsx`, `updateService.ts`, `actionExecutor.ts`, `ThemeColors`, `synthWave.ts`, `ProfileScreen.tsx`, `callDispatcher.ts`, `CalendarScreen.tsx`, `ref_react_native`, `VoiceConversationPanel.tsx`, `NotesScreen.tsx`, `ref_lucide_react_native`, `ReminderHealth.tsx`, `tools/index.ts`, `ClassScheduleModal.tsx`, `useThemedStyles`, `DayView.tsx`, `OnboardingScreen.tsx`, `ProductTour.tsx`, `Task`, `OnboardingStep.tsx`, `CallLafinaSettingsModal.tsx`, `ChatHistorySheet.tsx`, `backendSelection.ts`, `ThemeContext.tsx`, `NoteBody.tsx`, `CustomTabBar.tsx`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **What connects `ADR-0018`, `ADR-0030`, `ADR-0030` to the rest of the system?**
  _23 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `commandReview.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.054706163401815576 - nodes in this community are weakly interconnected._
- **Why does `db` connect `db` to `commandReview.ts`, `chatStore.ts`, `storage/index.ts`, `syncWorker.ts`, `database.ts`, `ProfileScreen.tsx`, `callDispatcher.ts`, `CalendarScreen.tsx`, `chatOrchestrator.ts`, `OfflineVoice.tsx`, `plannerQueries.ts`, `VoiceConversationPanel.tsx`, `scheduler/index.ts`, `syncOutboxStore.ts`, `notesQueryStore.ts`, `ReminderHealth.tsx`, `accountDataReset.ts`, `ClassScheduleModal.tsx`, `useCalendarData.ts`, `notesPipeline.ts`, `sourceReminders.ts`, `personalMemoryStore.ts`, `OnboardingScreen.tsx`, `CallLafinaSettingsModal.tsx`, `syncStateStore.ts`, `deliveryStore.ts`, `reminderActions.ts`, `assistantOperationSchema.ts`, `useTodoData.ts`, `developerTestService.ts`, `remindersStore.ts`, `notesStore.ts`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Should `chatStore.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.04146612365790448 - nodes in this community are weakly interconnected._
- **Why does `VoiceConversationController` connect `VoiceConversationController` to `voiceConversation/index.ts`, `callDispatcher.ts`, `VoiceConversationDeps`, `.finalAnswer`, `controller.ts`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Should `timingAdvisor.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06128364389233954 - nodes in this community are weakly interconnected._