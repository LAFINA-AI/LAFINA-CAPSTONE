# Graph Report - LAFINA-CAPSTONE-agy-development-cont  (2026-11-24)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 5627 nodes · 18824 edges · 177 communities (172 shown, 5 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 223 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `9efa57e3`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- storage/index.ts
- DashboardScreen.tsx
- commandReview.ts
- scheduler/index.ts
- theme/index.ts
- fastPathParser.ts
- corReviewModel.ts
- useThemedStyles
- Fonts
- chatOrchestrator.ts
- reminderAlarm.ts
- calendarGroups.ts
- actionService.ts
- DatabaseTransaction
- useTheme
- ref_react_native
- VoiceConversationPanel.tsx
- OnboardingScreen.tsx
- calendarHelpers.ts
- PreferencesSettingsScreen.tsx
- icsHelper.ts
- developerTestService.ts
- IncomingCallScreen.tsx
- VoiceConversationController
- LessonQaSkill.tsx
- DocGenSkill.tsx
- RegisterScreen.tsx
- meetings/index.ts
- ProfileScreen.tsx
- OfflineVoice.tsx
- studyAi.ts
- FlashcardsSkill.tsx
- Task
- ProductTour.tsx
- deliveryStore.ts
- benchmarkRunner.ts
- corImportStore.ts
- PomodoroSkill.tsx
- voiceConversation/index.ts
- ai/index.ts
- voiceConversation/types.ts
- actionExecutor.ts
- cloud/index.ts
- OfflineCallController
- CallLafinaSettingsModal.tsx
- useVoiceConversation.ts
- generateId
- chatStore.ts
- onlineChatSkill.ts
- ttsService.ts
- handbookSearch.ts
- notesQueryStore.ts
- ChatScreen.tsx
- accountDataReset.ts
- localHandbookService.ts
- OnlineReminderCallView.tsx
- useCalendarData.ts
- CalendarScreen.tsx
- chatAgent.ts
- useCommandReview.ts
- alarmReview.ts
- ustpCorParser.ts
- useDashboardData.ts
- syncWorker.ts
- DatabaseService
- corLayoutParser.ts
- cloudClient.ts
- onboardingMemory.ts
- chatSyncStore.ts
- AppUpdatePrompt.tsx
- userStore.ts
- plannerQueries.ts
- characterAvatarGenerator.ts
- accountLinkService.ts
- synthWave.ts
- timingAdvisor.ts
- draftRegistry.ts
- materials/index.ts
- chatOwnership.ts
- philippineHolidays.ts
- NoteEditor.tsx
- SynthWaveAvatar.tsx
- IntroSlides.tsx
- NoteBody.tsx
- updateService.ts
- environment.ts
- introIcons.tsx
- ml/types.ts
- UstpSourcesSheet.tsx
- materialSearch.ts
- chatMemoryStore.ts
- ChatHistorySheet.tsx
- personalMemoryStore.ts
- introMotion.tsx
- AlarmEditorModal.tsx
- TodoListView.tsx
- updateManifest.ts
- utils/index.ts
- speechService.ts
- materialQa.ts
- syncTypes.ts
- chatMarkdown.ts
- FloatingOrbAppearance.tsx
- localConversation.ts
- OnboardingStep.tsx
- backendSelection.ts
- knowledgeLibrary.ts
- SourcePicker.tsx
- tasksStore.ts
- syncStateStore.ts
- UpdateSheet.tsx
- introTokens.ts
- SlideSay.tsx
- callGreetings.ts
- quickChatController.ts
- attachmentCleanup.ts
- DeveloperPerformanceTab.tsx
- meetingRecorder.ts
- MeetingsContext.tsx
- offlineCallController.ts
- FloatingAssistantSettings.tsx
- corOcrCleanup.ts
- useReducedMotion
- AppUpdateItem.tsx
- floatingAssistantNative.ts
- richText.ts
- LafinaMeetingRecorderNative
- deviceSpecs.ts
- knowledgeScope.ts
- materialStore.ts
- applyProfile
- ProfileStatsModal.tsx
- requestTrace.ts
- EwmaTracker
- normalizeNotes
- skillLaunch.ts
- CharacterAvatar.tsx
- morningBriefing.ts
- ChatMemorySettings.tsx
- corExtraction.ts
- materialChunker.ts
- alarmsStore.ts
- syncEntityTypes.ts
- callReplyFormatting.ts
- benchmarkExport.ts
- knn.ts
- ConversationController
- AlarmsView.tsx
- perfSettings.ts
- VoiceConversationDeps
- alarmSchedule.ts
- ChatMessage
- skillIntent.ts
- applyChange
- QuickChatRoot.tsx
- chatTimingStore.ts
- visionService.ts
- quickChatPresence.ts
- speechGhosts.ts
- scheduleParser.ts
- ScrollWheelPicker.tsx
- VirtualNoteGrid.tsx
- nativeUpdater.ts
- CorAccuracyCard.tsx
- stats.ts
- corDocument.ts
- NativeVoiceConversation
- NativeAlarmModule
- chatFiles.ts
- studentSetupStore
- useDraftProtection.ts
- reminderDeliveryStyleStore.ts
- syncScheduler.ts
- avatarFile.ts
- chatDraftStore.ts
- tabPerformance.ts
- lafina_logo_chat_header_xml.ts

## God Nodes (most connected - your core abstractions)
1. `useTheme()` - 285 edges
2. `useThemedStyles()` - 146 edges
3. `Fonts` - 119 edges
4. `generateId()` - 102 edges
5. `db` - 86 edges
6. `VoiceConversationPanel()` - 80 edges
7. `ProfileScreen` - 71 edges
8. `Spacing` - 69 edges
9. `DatabaseTransaction` - 65 edges
10. `VoiceConversationController` - 64 edges

## Surprising Connections (you probably didn't know these)
- `HomeTasksCardProps` --references--> `Task`  [EXTRACTED]
  ui/screens/dashboard/components/modern/HomeSectionCards.tsx → storage/tasksStore.ts
- `IncomingCallScreenProps` --references--> `NativeCallAction`  [EXTRACTED]
  ui/screens/IncomingCallScreen.tsx → scheduler/reminderAlarm.ts
- `ServerSwitchItem()` --indirect_call--> `localBackendUrl()`  [INFERRED]
  ui/components/profile/ServerSwitchItem.tsx → cloud/backendSelection.ts
- `parseNotesResult()` --calls--> `normalizeNotes()`  [EXTRACTED]
  skills/meetingNotesSkill.ts → meetings/meetingNotes.ts
- `ChatScreen` --indirect_call--> `isPerfTrackingEnabled()`  [INFERRED]
  ui/screens/ChatScreen.tsx → ai/benchmark/perfSettings.ts

## Import Cycles
- None detected.

## Communities (177 total, 5 thin omitted)

### Community 0 - "storage/index.ts"
Cohesion: 0.03
Nodes (105): avatarSeedStore, PROFILE_AVATAR_SEED_KEY, BehaviorLog, behaviorStore, FeatureSnapshot, MAX_BEHAVIOR_LOGS_PER_TYPE, MAX_FEATURE_SNAPSHOTS_PER_TYPE, CalendarVisibilityMap (+97 more)

### Community 1 - "DashboardScreen.tsx"
Cohesion: 0.05
Nodes (101): nextAlarm(), subscribePomodoro(), DashboardConfig, DashboardPresetId, DashboardScheduleFilter, DashboardWidgetId, MinFreeGapMinutes, NoteSnapshot (+93 more)

### Community 2 - "commandReview.ts"
Cohesion: 0.04
Nodes (111): computeDurationMinutes(), format12HourTime(), AlarmOperation, adaptiveReminderLine(), Applied, applyOperation(), applyReminderChanges(), buildBulkDelete() (+103 more)

### Community 3 - "scheduler/index.ts"
Cohesion: 0.04
Nodes (98): buildNativeAlertPayload(), isWithinQuietHours(), NativeAlertPreferencesPayload, parseHHMM(), syncAlertPreferencesToNative(), CallAdmission, CallRejection, CallCommand (+90 more)

### Community 4 - "theme/index.ts"
Cohesion: 0.05
Nodes (84): ModernAiButtonDesignId, ModernThemeId, UIVariant, styles, ACOUSTIC_BAR_OPACITIES, ACOUSTIC_BAR_RATIOS, ANIMATED_DESIGN_SET, buildArcPath() (+76 more)

### Community 5 - "fastPathParser.ts"
Cohesion: 0.05
Nodes (87): monotonicNow(), ActionExecutorOptions, COMMAND_GUIDE, CommandGuideExample, ALARM_DAY_CODES, alarmClock(), alarmDescriptorOk(), alarmLabelFrom() (+79 more)

### Community 6 - "corReviewModel.ts"
Cohesion: 0.05
Nodes (94): deleteCorCopy(), openCorOriginal(), pickCorFile(), acknowledgeOverlap(), addCourse(), addMeeting(), buildCorDraft(), BuildDraftInput (+86 more)

### Community 7 - "useThemedStyles"
Cohesion: 0.06
Nodes (73): isBusy(), wordCount(), CommandGuide(), CommandGuideProps, getThemedStyles(), styles, describeOnlineVoice(), getThemedStyles() (+65 more)

### Community 8 - "Fonts"
Cohesion: 0.05
Nodes (75): ActionCardHost(), getThemedStyles(), styles, CallReadResults(), styles, AgendaCard(), AgendaCardData, AgendaCardProps (+67 more)

### Community 9 - "chatOrchestrator.ts"
Cohesion: 0.05
Nodes (74): isForgetAllMemoriesRequest(), appendHandbookPart(), asksForUstpSchoolContent(), BenchmarkIsolation, benchmarkSkippedReply(), buildCompoundBatch(), ChatOrchestrator, ChatOrchestratorResult (+66 more)

### Community 10 - "reminderAlarm.ts"
Cohesion: 0.07
Nodes (72): deletePreCachedReminderAudio(), admitReminderCall(), CallRequest, recordRejection(), isCallInProgress(), CallLease, callLifecycle, Executor (+64 more)

### Community 11 - "calendarGroups.ts"
Cohesion: 0.07
Nodes (76): computeSemesterEndDate(), ACADEMIC_PROFILE_KEY, AcademicCourseRecord, AcademicProfileProvenance, AcademicProfileRecord, AcademicProfileSaveOptions, ClassBlockMetadata, CorCourseInput (+68 more)

### Community 12 - "actionService.ts"
Cohesion: 0.05
Nodes (61): SpokenTurnReview, REGISTERED_TOOLS, RegisteredToolDefinition, STRUCTURED_ACTIONS, TOOL_MAP, ToolParameterSchema, DATA_CONSENT_KEY, isToolExecutionPermitted() (+53 more)

### Community 13 - "DatabaseTransaction"
Cohesion: 0.04
Nodes (70): DEFAULT_BUSIEST_DAY, DEFAULT_CLASS_COUNT, DEFAULT_DAILY_DIGEST, DEFAULT_LONGEST_GAP, DEFAULT_NOTIFICATIONS, DEFAULT_QUIET_HOURS, DEFAULT_REMINDER_LEAD, DEFAULT_SLEEP_TIME (+62 more)

### Community 14 - "useTheme"
Cohesion: 0.04
Nodes (68): styles, ToneRowProps, ChatSyncNotice(), styles, themeStyles(), getThemedStyles(), styles, TypingBubble() (+60 more)

### Community 15 - "ref_react_native"
Cohesion: 0.05
Nodes (55): AlarmHealth, AuthBackdrop(), styles, useReducedMotion(), Grainient(), GrainientProps, nativeSupported, styles (+47 more)

### Community 16 - "VoiceConversationPanel.tsx"
Cohesion: 0.05
Nodes (68): chatSkillReply(), appliedReviewReply(), warmUpOfflineModel(), offlineReasonText(), ALARM_LINE, AlarmStatus, CHANGE_QUESTION, cleanTranscript() (+60 more)

### Community 17 - "OnboardingScreen.tsx"
Cohesion: 0.08
Nodes (60): visionService, getHandbookDemoExcerpt(), readOnboardingIdentity(), emptyAnswers(), INTRO_SEEN_KEY, ONBOARDING_PROGRESS_KEY, ONBOARDING_RESET_PENDING_KEY, OnboardingAnswers (+52 more)

### Community 18 - "calendarHelpers.ts"
Cohesion: 0.09
Nodes (55): parseClassBlockMetadata(), CalendarOptionsSidebar(), DayView, formatExactTimeLabel(), formatHourLabel(), HolidayChip(), HourItems(), styles (+47 more)

### Community 19 - "PreferencesSettingsScreen.tsx"
Cohesion: 0.08
Nodes (61): getModelEnvironment(), describeMissingModel(), ActiveModelDownload, ActiveOfflineModelConfig, cancelModelDownload(), deleteOfflineModel(), deleteQwenModel(), DownloadJob (+53 more)

### Community 20 - "icsHelper.ts"
Cohesion: 0.07
Nodes (58): checkEventWallTime(), deviceTimeZone(), endsNextDay(), engineFormatsWallTime(), eventEndDate(), eventSpanMinutes(), EventTimeError, EventTimeProblem (+50 more)

### Community 21 - "developerTestService.ts"
Cohesion: 0.05
Nodes (56): ALARM_TITLES, isAlarmTitle(), migrateAlarmReminders(), Row, AlarmNativeEvent, BRIEFING_WINDOW_MS, briefingListeners, getAlarmHealth() (+48 more)

### Community 22 - "IncomingCallScreen.tsx"
Cohesion: 0.09
Nodes (60): waitForVoiceConversationRelease(), CALL_RESULT_DELAY_MS, CallCommand, detectCallKeyword(), duration(), NUMBERS, answerCall(), audioRelease (+52 more)

### Community 23 - "VoiceConversationController"
Cohesion: 0.11
Nodes (4): humanizeProviderError(), VoiceConversationController, sanitizeSpeechText(), ApiOutcome

### Community 24 - "LessonQaSkill.tsx"
Cohesion: 0.07
Nodes (46): getMaterialOnlineStatus(), ingestMaterialForUser(), materialStore, UserMaterialRecord, notesEditStore, NoteWriteTarget, NOTES_PAGE_SIZE, notesQueryStore (+38 more)

### Community 25 - "DocGenSkill.tsx"
Cohesion: 0.07
Nodes (43): DetectedDocumentRequest, FORMAT_PATTERNS, buildSkillDocumentPrompt(), BackendDocumentResponse, describeDocumentFailure(), DOCUMENT_FORMAT_ORDER, DOCUMENT_FORMATS, DocumentFormat (+35 more)

### Community 26 - "RegisterScreen.tsx"
Cohesion: 0.07
Nodes (41): syncWorker, AuthButton(), AuthButtonProps, styles, AuthHeader(), styles, AuthInput(), AuthInputProps (+33 more)

### Community 27 - "meetings/index.ts"
Cohesion: 0.10
Nodes (44): CATALOG, classifyNotesFailure(), describeMeetingError(), isRetryable(), MeetingError, MeetingErrorCode, MeetingErrorInfo, RecoveryAction (+36 more)

### Community 28 - "ProfileScreen.tsx"
Cohesion: 0.07
Nodes (48): ARC_SCREEN_XML, mapCorCoursesToAcademicRecords(), hasAttachmentCleanup(), generateAvatarSeed(), refreshAcademicMemories(), chooseUstpMode(), AppearancePickerModal(), AppearancePickerTab (+40 more)

### Community 29 - "OfflineVoice.tsx"
Cohesion: 0.08
Nodes (40): getActiveOfflineCaptureId(), admissionRefusal(), applySpeechPreferences(), createPreviewTicket(), meetingRecording(), PREVIEW_TEXT, PreviewHandle, PreviewRefusal (+32 more)

### Community 30 - "studyAi.ts"
Cohesion: 0.08
Nodes (44): effectiveGoal(), goalStarterPrompts(), LENGTH_TEXT, replyPreferenceInstruction(), SCHEDULING_PROMPTS, buildAvoidanceClause(), cardsFromSource(), cleanQuizOption() (+36 more)

### Community 31 - "FlashcardsSkill.tsx"
Cohesion: 0.15
Nodes (41): SKILLS_CAPABILITIES, buildQuizSourceFromDeck(), subscribeDecks(), Deck, formatNextDueIn(), getDeckStats(), previewCardInterval(), Rating (+33 more)

### Community 32 - "Task"
Cohesion: 0.10
Nodes (43): Candidate, EventFolds, isEventTimeError(), applyEventMemoryToDraft(), EventMemoryOffer, PlannerExport, PlannerWindow, Reminder (+35 more)

### Community 33 - "ProductTour.tsx"
Cohesion: 0.07
Nodes (41): buildCurvedTabBarPath(), CustomTabBar, CustomTabBarProps, getTabThemedStyles(), styles, TAB_ICONS, TAB_LABELS, TAB_ORDER (+33 more)

### Community 34 - "deliveryStore.ts"
Cohesion: 0.08
Nodes (38): boundedNative(), chain, claimForegroundRing(), DeliveryReconcileSummary, drainNativeDeliveryReceipts(), emptySummary(), isDesired(), matches() (+30 more)

### Community 35 - "benchmarkRunner.ts"
Cohesion: 0.08
Nodes (40): BENCHMARK_SUITE_VERSION, BenchmarkCase, CaseCategory, CaseExpectation, CASES, countProviderRequests(), customCase(), ExpectedDate (+32 more)

### Community 36 - "corImportStore.ts"
Cohesion: 0.06
Nodes (35): PlannedClassBlock, BlockSnapshot, CommitResult, COR_DRAFT_KEY, COR_LEDGER_KEY, CorImportBlockEntry, CorImportError, CorImportRecord (+27 more)

### Community 37 - "PomodoroSkill.tsx"
Cohesion: 0.11
Nodes (38): matchMaterial(), plural(), safely(), skillStatusLine(), ADR-0041, words(), applyPomodoro(), changes (+30 more)

### Community 38 - "voiceConversation/index.ts"
Cohesion: 0.07
Nodes (29): ACTIVE, DEFAULT_LIMITS, FAILURE_MESSAGES, LiveSession, ownTimers(), PendingAnswer, randomId(), systemClock (+21 more)

### Community 39 - "ai/index.ts"
Cohesion: 0.14
Nodes (35): cancelNativeQuietly(), cancelOfflineSpeechCapture(), getNativeModule(), hasOfflineSpeechCapture(), isMicrophoneBusyError(), MAX_CAPTURE_DURATION_MS, MICROPHONE_BUSY_CODES, MicrophoneBusyError (+27 more)

### Community 40 - "voiceConversation/types.ts"
Cohesion: 0.06
Nodes (17): Config, directTestChat(), directTestVoiceApi, NATIVE_EVENT, nativeVoiceTransport, RawEvent, ConversationFailure, ConversationTiming (+9 more)

### Community 41 - "actionExecutor.ts"
Cohesion: 0.12
Nodes (36): answerPlannerLookup(), cleanupMatchingReminders(), describeLength(), executeNluAction(), findMatchingEvent(), findMatchingNote(), findMatchingTask(), findMatchingTimeBlock() (+28 more)

### Community 42 - "cloud/index.ts"
Cohesion: 0.08
Nodes (34): CallMode, CallModeDecision, CallModeReason, choseOfflineMode(), isSignedInOwner(), predictCallMode(), resolveCallMode(), cloudClient (+26 more)

### Community 43 - "OfflineCallController"
Cohesion: 0.14
Nodes (5): OfflineCallController, ConversationClock, ConversationFailureKind, ConversationTurn, useOfflineCall()

### Community 44 - "CallLafinaSettingsModal.tsx"
Cohesion: 0.09
Nodes (34): label(), loadOnlineVoices(), OnlineVoiceOption, CALL_LAFINA_SETTINGS_KEYS, CallLafinaCaptionSize, CallLafinaLanguage, CallLafinaPacing, CallLafinaSettings (+26 more)

### Community 45 - "useVoiceConversation.ts"
Cohesion: 0.10
Nodes (28): reminderCallContext(), VoicePersonaPreferences, voicePreferenceContext(), ConversationSnapshot, OnlineReminderConversation, OnlineReminderHandle, Props, REMINDER_CALL_PLANNER_TOOLS (+20 more)

### Community 46 - "generateId"
Cohesion: 0.12
Nodes (35): attributeQuestionsToNotes(), buildOfflineQuizFromDeck(), countAnswered(), deleteQuizFromHistory(), discardActiveQuiz(), formatMistakeDeckTitle(), MAX_SAVED_QUIZZES, normalizeQuizSession() (+27 more)

### Community 47 - "chatStore.ts"
Cohesion: 0.08
Nodes (30): CHAT_PAGE_SIZE, ChatLimitReachedError, ChatPageQuery, ChatReviewResolution, ChatReviewResolutionStatus, ChatSession, CURRENT_CHAT_KEY, decodeCursor() (+22 more)

### Community 48 - "onlineChatSkill.ts"
Cohesion: 0.06
Nodes (21): RequestTrace, IntentExtractionOptions, AGENT_UNAVAILABLE, AgentExchangeMessage, AgentStepOptions, AgentStepReply, AgentToolCall, BackendAgentResponse (+13 more)

### Community 49 - "ttsService.ts"
Cohesion: 0.10
Nodes (32): ActiveSpeech, applyConfiguration(), bounded(), configureChain, configureTts(), eligibleOfflineVoices(), enableDucking(), establishOfflineVoice() (+24 more)

### Community 50 - "handbookSearch.ts"
Cohesion: 0.12
Nodes (34): acronymEvidence(), acronymsOf(), applyQuerySynonyms(), buildFtsQueries(), buildPromptHandbookContext(), BuiltFtsQueries, campusEntryLabel(), CONCEPT_GROUPS (+26 more)

### Community 51 - "notesQueryStore.ts"
Cohesion: 0.10
Nodes (29): assertActiveOwner(), NoteEditConflictError, NoteEditFailure, NoteEditPatch, read(), requireCurrent(), toNoteSnapshot(), ADR-0020 (+21 more)

### Community 52 - "ChatScreen.tsx"
Cohesion: 0.10
Nodes (33): subscribePerfTracking(), rebindReviewTurn(), formatResolvedReviewContent(), isRemoteOnlyAttachment(), ChatInput(), ChatInputProps, getThemedStyles(), styles (+25 more)

### Community 53 - "accountDataReset.ts"
Cohesion: 0.10
Nodes (31): hasMeetingSession(), stopMeetingSession(), GUEST_USER_ID, cancelFocusTimer(), FocusNativeModule, academicProfileStore, authorizeDataReset(), clearPlanner() (+23 more)

### Community 54 - "localHandbookService.ts"
Cohesion: 0.10
Nodes (31): freeTokensOf(), LocalHandbookMatch, LocalHandbookSource, buildStatusFromMeta(), HandbookPackOrigin, loadBestAvailablePack(), LocalHandbookStatus, OfflineHandbookAnswer (+23 more)

### Community 55 - "OnlineReminderCallView.tsx"
Cohesion: 0.10
Nodes (32): CallResolution, CallState, CHAT_REPLY_FORMAT_KEY, ChatReplyFormat, chatReplyFormatStore, DEFAULT_CHAT_REPLY_FORMAT, Listener, listeners (+24 more)

### Community 56 - "useCalendarData.ts"
Cohesion: 0.10
Nodes (31): writeCalendarExport(), escapeText(), foldLine(), formatIcsUtcInstant(), generateIcsString(), MAX_ICS_BYTES, cloneBatch(), ImportBatch (+23 more)

### Community 57 - "CalendarScreen.tsx"
Cohesion: 0.12
Nodes (30): baseScheduleEntityId(), extractUrlsFromText(), isBirthdayEventLike(), normalizeEntryUrl(), resolveScheduleEntryTarget(), ScheduleEntryType, CalendarLayersModal(), CalendarScreen (+22 more)

### Community 58 - "chatAgent.ts"
Cohesion: 0.09
Nodes (31): asText(), bound(), CHAT_AGENT_MAX_STEPS, CHAT_TOOLS, ChatAgentOptions, ChatAgentResult, intentFromRequestText(), runChatAgent() (+23 more)

### Community 59 - "useCommandReview.ts"
Cohesion: 0.09
Nodes (29): ReviewDecisionResult, cancelReviewedCommand(), CommandProposal, ConfirmResult, Draft, PendingReview, PlannedReminderWithAdvice, PrepareResult (+21 more)

### Community 60 - "alarmReview.ts"
Cohesion: 0.14
Nodes (33): ALARM_INTENTS, AlarmApplied, AlarmBuild, AlarmDraft, AlarmIntentKind, AlarmRef, AlarmRequest, applyAlarmOperation() (+25 more)

### Community 61 - "ustpCorParser.ts"
Cohesion: 0.13
Nodes (33): assembleUstpCorResult(), canJoinSplitCourseLine(), canStartSplitCourseRow(), COLLEGE_ACRONYMS, computeCorRecommendations(), computeSemesterEndDate(), CorCheckSeverity, CorExtractionInfo (+25 more)

### Community 62 - "useDashboardData.ts"
Cohesion: 0.13
Nodes (30): getDefaultUserPreferences(), isBirthdayEvent(), formatReminderTrigger(), addDaysToDate(), baseEntityId(), buildDayScheduleItems(), compareTasks(), computeFreeStudySummary() (+22 more)

### Community 63 - "syncWorker.ts"
Cohesion: 0.08
Nodes (27): authoritativeSyncEntityTypes(), isChatSyncEntityType(), activeSyncServerKey(), AppliedChange, ApplyPageResult, ChatApplyTally, failOversizedMutations(), formatMutation() (+19 more)

### Community 64 - "DatabaseService"
Cohesion: 0.12
Nodes (13): DatabaseService, describeQuery(), extractLocalSettingsNamespace(), storageErrorMessage(), StorageUnavailableError, applySessionPragmas(), assertFileIsUsable(), failureReasonFor() (+5 more)

### Community 65 - "corLayoutParser.ts"
Cohesion: 0.09
Nodes (30): anchorKey(), Anchors, buildPlacement(), centerY(), Column, COLUMN_STARTS, columnOf(), CorLayoutFailure (+22 more)

### Community 66 - "cloudClient.ts"
Cohesion: 0.09
Nodes (20): accountChangedResult(), androidConnectivity(), AndroidConnectivityModule, canResolveHost(), CloudRequestOptions, CloudStreamOptions, defaultApiBaseUrls, describeConnectionFailure() (+12 more)

### Community 67 - "onboardingMemory.ts"
Cohesion: 0.11
Nodes (29): MemoryTier, academicMemoryIds(), buildAcademicMemoryFacts(), buildCorMemoryFacts(), Entry, Executor, formatCollegeForMemory(), formatGenderForMemory() (+21 more)

### Community 68 - "chatSyncStore.ts"
Cohesion: 0.10
Nodes (28): asTransaction(), CHAT_BACKFILL_BATCH, CHAT_LIMIT_HELD_KEY, CHAT_LIMIT_REASON, CHAT_SYNC_NOTICE_KEY, CHAT_SYNC_SETTING_KEY, ChatEntityType, ChatRemoteDeleteResult (+20 more)

### Community 69 - "AppUpdatePrompt.tsx"
Cohesion: 0.14
Nodes (23): APP_VERSION, AppUpdatePrompt(), readNetwork(), loadUpdateMemory(), onUpdateSheetRequest(), requestUpdateSheet(), saveUpdateMemory(), SheetListener (+15 more)

### Community 70 - "userStore.ts"
Cohesion: 0.11
Nodes (22): accountLinkService, off(), OnlineModeDecision, OnlineModeReason, resolveOnlineMode(), ADR-0036, isProviderTestingEnabled(), readInitialOnlineMode() (+14 more)

### Community 71 - "plannerQueries.ts"
Cohesion: 0.11
Nodes (24): VALID_EVENT_TIME_JOIN(), createPlannerQueries(), dayEnd(), dayStart(), DEFAULT_EXPORT_BATCH, expand(), MAX_PAGE_SIZE, mapRowToEvent() (+16 more)

### Community 72 - "characterAvatarGenerator.ts"
Cohesion: 0.08
Nodes (28): ACCESSORIES, ACCESSORY_LABELS, AVATAR_BACKDROPS, AVATAR_HAIR_COLORS, AVATAR_OUTFIT_COLORS, AVATAR_SKIN_TONES, AvatarAccessory, AvatarBackdrop (+20 more)

### Community 73 - "accountLinkService.ts"
Cohesion: 0.15
Nodes (26): AccountFlowResult, AccountFlowStatus, attachAuthenticatedCloudSession(), authenticateExistingCloudAccount(), clearDeferredCredentialSafely(), completeDeferredCloudLink(), deferredLinkAttempts, isFlowResult() (+18 more)

### Community 74 - "synthWave.ts"
Cohesion: 0.12
Nodes (25): EMPTY_FRAME, Frame, styles, SynthSplash(), SynthSplashProps, bump(), clamp01(), DARK_STOPS (+17 more)

### Community 75 - "timingAdvisor.ts"
Cohesion: 0.15
Nodes (25): extractStudentFeatures(), featuresToVector(), getEwmaLatency(), getInteractionHistory(), getInteractionSummary(), isPeakStudyHour(), PEAK_HOUR_HOURS, recordReminderInteraction() (+17 more)

### Community 76 - "draftRegistry.ts"
Cohesion: 0.11
Nodes (15): checkScheduleConflict(), ConflictCheckResult, ConflictingItem, minutesToTime(), timeToMinutes(), CancelDraftResult, ConfirmDraftResult, DRAFT_TTL_MS (+7 more)

### Community 77 - "materials/index.ts"
Cohesion: 0.15
Nodes (22): detectFileKind(), ExtractedDocument, ExtractedPage, MaterialExtractProgress, MAX_MATERIAL_FILE_BYTES, MAX_MATERIAL_PDF_PAGES, MIME_CSV, MIME_DOCX (+14 more)

### Community 78 - "chatOwnership.ts"
Cohesion: 0.12
Nodes (25): requireOwner(), isValidChatOwner(), LEGACY_SHARED_SESSION_ID, LegacyChatDecision, LegacyChatOutcome, MAX_CHATS_PER_ACCOUNT, migrateChatOwnership(), NEW_CHAT_PREFIX (+17 more)

### Community 79 - "philippineHolidays.ts"
Cohesion: 0.12
Nodes (23): formatHolidayDateBadge(), HolidaysGroupModal(), HolidaysGroupModalProps, KIND_BADGE, SHORT_MONTHS, SHORT_WEEKDAYS, styles, buildYear() (+15 more)

### Community 80 - "NoteEditor.tsx"
Cohesion: 0.16
Nodes (19): Note, NoteBody(), dragHandleStyles, getLocalImage(), NoteCardBase(), NoteCardBaseProps, NoteCardWithDrag, NoteCardWithDragProps (+11 more)

### Community 81 - "SynthWaveAvatar.tsx"
Cohesion: 0.16
Nodes (22): ConversationPhase, CallWaveform(), CallWaveformProps, getTruthfulStateText(), normalizeAmplitude(), CallDurationText, formatCallDuration(), MeteredCallWaveform (+14 more)

### Community 82 - "IntroSlides.tsx"
Cohesion: 0.12
Nodes (21): HANDBOOK_DEMO_CHUNK_ID, HANDBOOK_DEMO_QUESTION, HandbookDemoExcerpt, Pack, PackChunk, ExternalIcon(), WifiOffIcon(), useIntroReducedMotion() (+13 more)

### Community 83 - "NoteBody.tsx"
Cohesion: 0.11
Nodes (22): indexBatch(), normalizeNoteForSearch(), getNotePreviewText(), compactSizes, compactText, fullSizes, fullText, gridPreviewSizes (+14 more)

### Community 84 - "updateService.ts"
Cohesion: 0.16
Nodes (20): NativeUpdater, RELEASE_APK_SIGNER_SHA256, UPDATE_PUBLIC_KEY, latestAssetUrl(), latestReleaseApiUrl(), latestReleasePageUrl(), repoUrl(), UPDATE_CONFIG (+12 more)

### Community 85 - "environment.ts"
Cohesion: 0.12
Nodes (21): BenchmarkMode, SuiteId, BenchmarkRun, RunBenchmarkOptions, RunnerDeps, RunProgress, CHANGE_COLUMN, CheckStatus (+13 more)

### Community 86 - "introIcons.tsx"
Cohesion: 0.19
Nodes (21): AnimatedPath, BackIcon(), BookIcon(), CalendarIcon(), CheckIcon(), ClockIcon(), CloudIcon(), DashedCircle() (+13 more)

### Community 87 - "ml/types.ts"
Cohesion: 0.17
Nodes (13): evaluateForestClassification(), evaluateForestRegression(), evaluateTree(), RandomForestEnsemble, AdaptiveScheduleRecommendation, DecisionTree, DecisionTreeNode, ForestClassificationResult (+5 more)

### Community 88 - "UstpSourcesSheet.tsx"
Cohesion: 0.16
Nodes (21): getPassagesById(), listChapterPassages(), listKnowledgeChapters(), listOfficialPages(), prepareKnowledgeLibrary(), searchKnowledgePassages(), ChaptersPage(), firstPage() (+13 more)

### Community 89 - "materialSearch.ts"
Cohesion: 0.21
Nodes (21): buildDocWordSet(), buildOutlineHint(), buildQueryExpressions(), expandTopNeighbors(), extractMaterialTokens(), hitToCitation(), isOverviewQuery(), MaterialMatch (+13 more)

### Community 90 - "chatMemoryStore.ts"
Cohesion: 0.14
Nodes (20): AddMemoryChangeInput, AddMemoryOptions, bumpRevision(), cleanText(), evictOverflow(), Executor, inferMemoryCategory(), inferMemoryTier() (+12 more)

### Community 91 - "ChatHistorySheet.tsx"
Cohesion: 0.13
Nodes (20): isUstpSessionId(), ChatSessionKind, ChatSummary, isChatLimitReachedError(), isUstpSessionId(), MAX_CHAT_TITLE, CHAT_REMOTE_CHANGED_EVENT, ChatRemoteChangedEvent (+12 more)

### Community 92 - "personalMemoryStore.ts"
Cohesion: 0.13
Nodes (19): assertActive(), EMPTY(), EVENT_MEMORY_KEY, EventMemoryError, EventMemoryInput, EventMemoryProblem, EventMemorySnapshot, EventMemoryValue (+11 more)

### Community 93 - "introMotion.tsx"
Cohesion: 0.12
Nodes (21): BASE, EASE_IN_OUT, EASE_OUT, EASE_SPRING, EasingFn, fadeIn, initialValue(), LINEAR (+13 more)

### Community 94 - "AlarmEditorModal.tsx"
Cohesion: 0.13
Nodes (20): DAY_BITS, DAY_ORDER, DAY_SHORT, EVERY_DAY, WEEKDAYS, WEEKEND, AlarmEditorModal(), DayCircleButton() (+12 more)

### Community 95 - "TodoListView.tsx"
Cohesion: 0.15
Nodes (19): BASE_CATEGORIES, CUSTOM_COLOR_OPTIONS, formatDisplayTime(), PRIORITIES, styles, timeStringToDate(), TodoEditorModal(), FILTER_OPTIONS (+11 more)

### Community 96 - "updateManifest.ts"
Cohesion: 0.13
Nodes (19): ApkAsset, isRecord(), isReleaseKey(), MAX_APK_BYTES, MAX_BUNDLE_BYTES, MAX_NOTES_CHARS, MAX_TITLE_CHARS, ParsedVersion (+11 more)

### Community 97 - "utils/index.ts"
Cohesion: 0.19
Nodes (18): ActiveLineFormat, applyBlock(), applyIndent(), applyInline(), applyNoteFormat(), BlockFormat, continueListOnNewline(), escapeRegExp() (+10 more)

### Community 98 - "speechService.ts"
Cohesion: 0.17
Nodes (17): getNativeAudioPlayer(), playSpeechFile(), speakTextWithTts(), stopSpeechPlayback(), createCallSpeechProvider(), FIRST_SEGMENT_MAX_CHARS, FIRST_SEGMENT_MIN_CHARS, speakableText() (+9 more)

### Community 99 - "materialQa.ts"
Cohesion: 0.16
Nodes (18): buildMaterialPromptContext(), extractExplicitPageNumber(), formatOfflineMaterialReply(), MATERIAL_NO_EVIDENCE_REPLY, sanitizeMaterialPassage(), AskMaterialsResult, askUserMaterials(), buildGroundedMessages() (+10 more)

### Community 100 - "syncTypes.ts"
Cohesion: 0.18
Nodes (16): SyncConflict, SyncConflictInput, syncConflictStore, SyncMetadataInput, OutboxItem, PendingMutationRow, SyncEntityType, SyncOperation (+8 more)

### Community 101 - "chatMarkdown.ts"
Cohesion: 0.16
Nodes (18): openSource(), SourceNoteText(), SourceNoteTextProps, ChatBlock, ChatInline, ChatMarkdownOptions, chatMarkdownToPlainText(), count() (+10 more)

### Community 102 - "FloatingOrbAppearance.tsx"
Cohesion: 0.13
Nodes (19): BUBBLE_SIZE, ChoiceRow(), ChoiceRowProps, describeOrbLook(), FloatingOrbAppearance(), FloatingOrbAppearanceProps, HANDLE_SIZE, isLight() (+11 more)

### Community 103 - "localConversation.ts"
Cohesion: 0.17
Nodes (18): buildLocalConversationReply(), DayGlance, firstName(), formatTime(), glanceLine(), glanceToday(), localDate(), LocalReplyOptions (+10 more)

### Community 104 - "OnboardingStep.tsx"
Cohesion: 0.15
Nodes (18): ParsedScheduleResult, UstpCorOnboardingRecommendations, ConversationTone, LongestClassGap, SnoozeTendency, WeeklyClassCount, busiestDayOptions, classCountOptions (+10 more)

### Community 105 - "backendSelection.ts"
Cohesion: 0.14
Nodes (16): BACKEND_CHOICE_KEY, BACKEND_LABELS, BackendChoice, backendSelection, backendUrlFor(), LOCAL_BACKEND_URL_KEY, localBackendUrl(), validLocalBackendUrl() (+8 more)

### Community 106 - "knowledgeLibrary.ts"
Cohesion: 0.21
Nodes (17): formatCampusBlock(), formatOfflineHandbookReply(), linkifyUrls(), LocalHandbookSearchResult, CampusCitationSource, campusSourceNote(), labelText(), pagesText() (+9 more)

### Community 107 - "SourcePicker.tsx"
Cohesion: 0.13
Nodes (15): STUDY_OFFLINE_MESSAGE, MIME_DOCX, MIME_PDF, MIME_PPTX, pickDocument(), PickedDocument, PickOutcome, ShareOutcome (+7 more)

### Community 108 - "tasksStore.ts"
Cohesion: 0.13
Nodes (14): EventZoneTiming, EVENT_TIME_TABLE, EVENT_TIME_TRIGGERS, migrateEventTime(), ADR-0021, EVENT_TIME_COLUMNS, eventTimeStore, EventWallRow (+6 more)

### Community 109 - "syncStateStore.ts"
Cohesion: 0.13
Nodes (13): executorFor(), PersistedEntityTypes, PersistedSyncState, saveTypeList(), syncStateStore, SyncStateUpdate, PersistedSyncStatus, currentState (+5 more)

### Community 110 - "UpdateSheet.tsx"
Cohesion: 0.18
Nodes (16): getThemedStyles(), openLink(), ReleaseNotes(), ReleaseNotesProps, styles, InlineSpan, NoteBlock, parseInline() (+8 more)

### Community 111 - "introTokens.ts"
Cohesion: 0.18
Nodes (16): ArrowRightIcon(), ScaledCanvas(), useFitScale(), IntroSlides(), em(), FRAME_WIDTH, IntroColors, introFont() (+8 more)

### Community 112 - "SlideSay.tsx"
Cohesion: 0.17
Nodes (17): BellIcon(), Sparkle(), EASE, MOTION, formatIntroToday(), WelcomeHero(), Marker, markerStyles (+9 more)

### Community 113 - "callGreetings.ts"
Cohesion: 0.14
Nodes (15): callGreetingFor(), DAYTIME, Greeting, GreetingContext, GreetingMode, greetingOptions(), GreetingTone, greetingToneFor() (+7 more)

### Community 114 - "quickChatController.ts"
Cohesion: 0.14
Nodes (14): Listener, listeners, now(), prepareFor(), QUICK_CHAT_DATA_CHANGED_EVENT, QUICK_CHAT_IDLE_MS, QUICK_CHAT_MAX_MESSAGES, QuickChatDataChangedEvent (+6 more)

### Community 115 - "attachmentCleanup.ts"
Cohesion: 0.16
Nodes (17): AttachmentCleanupResult, attachmentCleanupTarget(), CHAT_FILES_SUBDIR, claimTurn(), cleanupPass(), countPending(), Executor, MAX_CLEANUP_PER_RUN (+9 more)

### Community 116 - "DeveloperPerformanceTab.tsx"
Cohesion: 0.22
Nodes (15): buildCsv(), buildJson(), runOnlinePreflight(), isPerfTrackingSwitchOn(), setPerfTrackingEnabled(), formatMs, clearBenchmarkExports(), exportBenchmarkRun() (+7 more)

### Community 117 - "meetingRecorder.ts"
Cohesion: 0.24
Nodes (12): MeetingTranscriptionProgress, transcribeMeetingChunks(), TranscribeMeetingOptions, ImportedAudioResult, MeetingAudioChunk, MeetingAudioListing, meetingRecorder, MeetingRecordingResult (+4 more)

### Community 118 - "MeetingsContext.tsx"
Cohesion: 0.16
Nodes (14): registerMeetingSession(), sessions, ActiveRecording, defaultMeetingTitle(), detailOf(), elapsedOf(), isDefaultTitle(), MAX_RECORDING_MS (+6 more)

### Community 119 - "offlineCallController.ts"
Cohesion: 0.12
Nodes (16): CAPTURE_STUCK_MESSAGE, DEFAULT_OFFLINE_LIMITS, isOwnCaptureBusy(), LIVE, NOT_CAUGHT_REPLY, OFFLINE_CALL_END_SILENCE_MS, OFFLINE_CALL_LEAD_IN_IGNORE_MS, OFFLINE_IDLE_SNAPSHOT (+8 more)

### Community 120 - "FloatingAssistantSettings.tsx"
Cohesion: 0.14
Nodes (14): quickChatController, FLOATING_COPY, FLOATING_SECOND_READ_MS, floatingAssistantSetting, FloatingAssistantSettingsProps, floatingAssistantSummary(), styles, ADR-0036 (+6 more)

### Community 121 - "corOcrCleanup.ts"
Cohesion: 0.22
Nodes (16): readHeader(), ACRONYMS, allowedDistance(), cleanOcrCurriculum(), cleanOcrMajor(), cleanOcrRoom(), cleanOcrYearLevel(), editDistance() (+8 more)

### Community 122 - "useReducedMotion"
Cohesion: 0.20
Nodes (13): SAVED_EXIT_MS, SAVED_HOLD_MS, SAVED_REDUCED_MS, ensureSubscribed(), getSnapshot(), listeners, subscribe(), useReducedMotion() (+5 more)

### Community 123 - "AppUpdateItem.tsx"
Cohesion: 0.18
Nodes (16): AppUpdateItem(), AppUpdateItemProps, ask(), getThemedStyles(), labelFor(), notesPreview(), sizeLabel(), styles (+8 more)

### Community 124 - "floatingAssistantNative.ts"
Cohesion: 0.15
Nodes (15): getModule(), invoke(), isValidOrbChange(), NativeFloatingAssistant, normalizeOrbCustomization(), ORB_COLOR_CHOICES, ORB_OPACITY_CHOICES, OrbSide (+7 more)

### Community 125 - "richText.ts"
Cohesion: 0.18
Nodes (16): ChecklistStat, decodeEntities(), extractDeltaText(), HtmlElement, HtmlNode, HtmlText, htmlToMarkdown(), inlineToMarkdown() (+8 more)

### Community 127 - "deviceSpecs.ts"
Cohesion: 0.21
Nodes (15): classifyAdvertisedRamGb(), createUndetectedRecommendation(), formatStorageSpace(), getDeviceAiRecommendation(), getDeviceHardwareSpecs(), getRequiredStorageBytes(), hasEnoughStorageForPreset(), normalizeRawDeviceSpecs() (+7 more)

### Community 128 - "knowledgeScope.ts"
Cohesion: 0.16
Nodes (15): wrongAcademicYearReply(), KnowledgeSourceSummary, PassageView, analyzeKnowledgeQuery(), FRESH_DAYS, KnowledgeQueryScope, MONTHS, normalizeAy() (+7 more)

### Community 129 - "materialStore.ts"
Cohesion: 0.17
Nodes (10): createMaterialFtsIndex(), materialFtsIndexExists(), migrateMaterialIndex(), mapMaterialRow(), mapQaMessageRow(), MaterialChunkInput, MaterialOutlineEntry, MaterialSection (+2 more)

### Community 130 - "applyProfile"
Cohesion: 0.28
Nodes (16): applyCustomCategory(), applyEvent(), applyNote(), applyProfile(), applyReminder(), applyTask(), applyTimeBlock(), assertEntityOwnership() (+8 more)

### Community 131 - "ProfileStatsModal.tsx"
Cohesion: 0.21
Nodes (13): getThemedStyles(), ProfileStats(), styles, DetailRow(), DetailRowProps, getThemedStyles(), MetricCell(), MetricCellProps (+5 more)

### Community 132 - "requestTrace.ts"
Cohesion: 0.19
Nodes (14): compactTimingLabel(), createRequestTrace(), CreateTraceOptions, deriveExecutionPath(), durationOrReason(), EXECUTION_PATH_LABEL, fmtMs(), isoWithOffset() (+6 more)

### Community 133 - "EwmaTracker"
Cohesion: 0.22
Nodes (6): clampAlpha(), DEFAULT_EWMA_ALPHA, EwmaTracker, stepEwma(), EwmaConfig, EwmaState

### Community 134 - "normalizeNotes"
Cohesion: 0.25
Nodes (14): ActionItem, cleanActionItems(), cleanMultiline(), cleanStringList(), cleanText(), cleanTopics(), deadlinesOf(), emptyNotes() (+6 more)

### Community 135 - "skillLaunch.ts"
Cohesion: 0.17
Nodes (14): CatalogEntry, cleanTopic(), handoffLine(), isAction(), isSkill(), LAUNCHABLE_SKILLS, LaunchableSkill, SKILL_ACTIONS (+6 more)

### Community 136 - "CharacterAvatar.tsx"
Cohesion: 0.22
Nodes (14): BACKDROP_ACCENTS, CharacterAvatar, CharacterAvatarProps, renderAccessory(), renderBackHair(), renderBrows(), renderCheeks(), renderEyes() (+6 more)

### Community 137 - "morningBriefing.ts"
Cohesion: 0.25
Nodes (13): buildMorningBriefing(), clock(), findPeakOpenSlot(), listJoin(), MONTHS, PEAK_WINDOWS, speakMorningBriefing(), spokenTitle() (+5 more)

### Community 138 - "ChatMemorySettings.tsx"
Cohesion: 0.18
Nodes (13): AdaptiveGrowthInsights, ChatMemory, MAX_MEMORY_TEXT, MemoryCategory, MemoryGrowthStats, reconcileClearedMemories(), reconcileDeletedMemory(), CATEGORY_LABELS (+5 more)

### Community 139 - "corExtraction.ts"
Cohesion: 0.26
Nodes (12): checkCorExtraction(), checkScore(), minutesOf(), near(), chooseCorReading(), CorReading, usable(), withChecks() (+4 more)

### Community 140 - "materialChunker.ts"
Cohesion: 0.25
Nodes (13): chunkExtractedPages(), cleanTitleFromFileName(), detectHeading(), extractTopKeywords(), findRunningEdgeLines(), formatMaterialPageLabel(), KEYWORD_STOP_WORDS, normalizeEdgeKey() (+5 more)

### Community 141 - "alarmsStore.ts"
Cohesion: 0.15
Nodes (10): Alarm, ALARM_LABEL_MAX, AlarmInput, DEFAULT_SNOOZE_MINUTES, Executor, listeners, MAX_ALARMS_PER_OWNER, Row (+2 more)

### Community 142 - "syncEntityTypes.ts"
Cohesion: 0.14
Nodes (12): AUTHORITATIVE_SYNC_ENTITY_TYPES, CHAT_AUTHORITATIVE_SYNC_ENTITY_TYPES, CHAT_SYNC_ENTITY_TYPES, CLIENT_SYNC_ENTITY_TYPES, declaredSyncEntityTypes(), effectiveSyncEntityTypes(), LAST_WRITE_WINS_ENTITY_TYPES, LEGACY_SYNC_ENTITY_TYPES (+4 more)

### Community 143 - "callReplyFormatting.ts"
Cohesion: 0.34
Nodes (13): createStash(), EXPLICIT_MARKDOWN_PATTERNS, formatCallReplyMarkdown(), formatColonListSentence(), formatInlineNumbered(), formatInlineSteps(), formatOrdinalSentences(), formatPlainParagraph() (+5 more)

### Community 144 - "benchmarkExport.ts"
Cohesion: 0.21
Nodes (12): listCases(), attemptRow(), CSV_COLUMNS, csvField(), DURATION_COLUMNS, expectedIntent(), MARK_COLUMNS, promptFor() (+4 more)

### Community 145 - "knn.ts"
Cohesion: 0.28
Nodes (6): classifyKnn(), euclideanDistance(), KnnClassifier, KnnClassificationResult, KnnNeighbor, KnnPoint

### Community 146 - "ConversationController"
Cohesion: 0.19
Nodes (5): endActiveVoiceConversation(), notifyVoiceOwner(), registerVoiceConversation(), startVoiceConversation(), ConversationController

### Community 147 - "AlarmsView.tsx"
Cohesion: 0.21
Nodes (12): describeTimeUntil(), alarmsStore, AlarmArrivalWrapper(), AlarmArrivalWrapperProps, AlarmsView(), AlarmsViewProps, animateAlarmListLayout(), formatRelativeAlarmDay() (+4 more)

### Community 148 - "perfSettings.ts"
Cohesion: 0.21
Nodes (9): benchmarkResultsStore, MAX_SAVED_RUNS, DEVELOPER_MODE_KEY, isPerfTrackingEnabled(), listeners, PERF_TRACKING_KEY, readFlag(), refreshPerfTrackingCache() (+1 more)

### Community 150 - "alarmSchedule.ts"
Cohesion: 0.31
Nodes (10): repeatFor(), AlarmDayKey, AlarmTiming, atTime(), bitForDate(), localDateKey(), nextAlarmTrigger(), oneShotDateFor() (+2 more)

### Community 151 - "ChatMessage"
Cohesion: 0.22
Nodes (10): QuickChatState, ChatMemoryChangedEvent, ChatMemoryChanges, ChatMessage, ChatMessageMetadata, ChatPage, MemoryNoteProps, compareChatMessages() (+2 more)

### Community 152 - "skillIntent.ts"
Cohesion: 0.27
Nodes (10): countIn(), detectSkillIntent(), materialHintIn(), normalize(), re(), SkillIntent, SkillStatusTopic, topicIn() (+2 more)

### Community 153 - "applyChange"
Cohesion: 0.27
Nodes (11): applyAuthoritativeSnapshot(), applyChange(), applyChatChange(), applyDelete(), applyPage(), getPersonalEntityTable(), hasPendingLocalMutation(), notifyRemoteChanges() (+3 more)

### Community 154 - "QuickChatRoot.tsx"
Cohesion: 0.22
Nodes (8): QuickChatPanelState, OrbColorSync(), Phase, QUICK_CHAT_VISIBILITY_EVENT, QuickChatRoot(), styles, ADR-0036, confirmLaunch()

### Community 155 - "chatTimingStore.ts"
Cohesion: 0.22
Nodes (8): AttemptResult, ChatTimingEntry, chatTimingStore, entries, listeners, MAX_CHAT_TIMINGS, TraceOutcome, TraceSnapshot

### Community 156 - "visionService.ts"
Cohesion: 0.24
Nodes (4): CorPageWords, CorWord, NativeVisionModule, PhotoCaptureResult

### Community 157 - "quickChatPresence.ts"
Cohesion: 0.20
Nodes (6): deferred, DeferredTask, Listener, listeners, QUICK_CHAT_SETTLE_FALLBACK_MS, ADR-0036

### Community 158 - "speechGhosts.ts"
Cohesion: 0.28
Nodes (8): ALWAYS_GHOSTS, GHOST_VAD_CONFIDENCE, isEchoOfLine(), isHallucinatedSpeech(), normalize(), PLAUSIBLE_GHOSTS, PUSH_TO_TALK_GHOSTS, isHallucinatedSpeech()

### Community 159 - "scheduleParser.ts"
Cohesion: 0.39
Nodes (8): checkDayHeader(), DAY_MAP, expandDays(), isDocumentHeader(), isInvalidSubject(), normalizeTime24(), parseScannedSchedule(), ScannedClassItem

### Community 160 - "ScrollWheelPicker.tsx"
Cohesion: 0.25
Nodes (7): ScrollWheelOption, ScrollWheelPickerInner(), ScrollWheelPickerProps, styles, WheelEntry, WheelRow, WheelRowProps

### Community 161 - "VirtualNoteGrid.tsx"
Cohesion: 0.25
Nodes (7): CardLayout, CellOrigin, GridRow, Row, RowLayout, styles, VirtualNoteGrid

### Community 162 - "nativeUpdater.ts"
Cohesion: 0.22
Nodes (8): ApkDownloadRequest, ApkInstallRequest, DownloadProgress, DownloadRequest, getNativeUpdater(), InstallStatus, LafinaUpdaterNativeModule, UpdaterInfo

### Community 163 - "CorAccuracyCard.tsx"
Cohesion: 0.32
Nodes (7): CorDraftAccuracy, CorAccuracyLevel, CorExtractionMethod, CorAccuracyCard(), detail(), headline(), styles

### Community 164 - "stats.ts"
Cohesion: 0.38
Nodes (6): LatencyStats, medianOf(), MIN_SAMPLES_FOR_MEDIAN, MIN_SAMPLES_FOR_P95, nearestRankPercentile(), PERCENTILE_METHOD

### Community 165 - "corDocument.ts"
Cohesion: 0.33
Nodes (5): COR_DRAFT_DIR, CorPickOutcome, extensionFor(), PickedCorFile, retainCorCopy()

### Community 168 - "chatFiles.ts"
Cohesion: 0.43
Nodes (6): GeneratedDocument, getChatFilesDir(), pruneStaleShareCache(), saveGeneratedFile(), shareAttachment(), toLocalPath()

### Community 169 - "studentSetupStore"
Cohesion: 0.43
Nodes (6): removeAcademicMemories(), removeOnboardingMemoryKeys(), chooseNotUstpMode(), StudentSetupState, studentSetupStore, StudentSetupModalProps

### Community 170 - "useDraftProtection.ts"
Cohesion: 0.33
Nodes (6): DraftDialogRequest, DISCARD_COPY, DiscardDraftCopy, DraftProtection, ReplaceDraftCopy, SPEECH_REPLACE_COPY

### Community 171 - "reminderDeliveryStyleStore.ts"
Cohesion: 0.40
Nodes (5): DEFAULT_REMINDER_DELIVERY_STYLE, Executor, getExplicit(), isReminderDeliveryStyle(), reminderDeliveryStyleStore

### Community 172 - "syncScheduler.ts"
Cohesion: 0.33
Nodes (4): DEFAULT_SYNC_DEBOUNCE_MS, DEFAULT_SYNC_INTERVAL_MS, SyncScheduler, SyncSchedulerOptions

### Community 173 - "avatarFile.ts"
Cohesion: 0.47
Nodes (5): AVATARS_DIR, extensionOf(), isCancellation(), pickAvatarImage(), PickAvatarResult

### Community 174 - "chatDraftStore.ts"
Cohesion: 0.33
Nodes (4): chatDraftStore, drafts, Listener, listeners

### Community 175 - "tabPerformance.ts"
Cohesion: 0.60
Nodes (4): beginTabSwitch(), enabled(), finishTabSwitch(), visited

## Knowledge Gaps
- **73 isolated node(s):** `ADR-0026`, `ADR-0040`, `ADR-0021`, `ADR-0021`, `ADR-0036` (+68 more)
  These have ≤1 connection - possible missing edges. (Counts symbols only; 1555 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useTheme()` connect `useTheme` to `DashboardScreen.tsx`, `scheduler/index.ts`, `theme/index.ts`, `ProfileStatsModal.tsx`, `useThemedStyles`, `Fonts`, `ChatMemorySettings.tsx`, `calendarGroups.ts`, `ref_react_native`, `VoiceConversationPanel.tsx`, `OnboardingScreen.tsx`, `calendarHelpers.ts`, `PreferencesSettingsScreen.tsx`, `icsHelper.ts`, `developerTestService.ts`, `AlarmsView.tsx`, `IncomingCallScreen.tsx`, `LessonQaSkill.tsx`, `RegisterScreen.tsx`, `QuickChatRoot.tsx`, `ProfileScreen.tsx`, `ProductTour.tsx`, `VirtualNoteGrid.tsx`, `ai/index.ts`, `CallLafinaSettingsModal.tsx`, `useVoiceConversation.ts`, `ChatScreen.tsx`, `OnlineReminderCallView.tsx`, `CalendarScreen.tsx`, `useCommandReview.ts`, `synthWave.ts`, `NoteEditor.tsx`, `SynthWaveAvatar.tsx`, `NoteBody.tsx`, `UstpSourcesSheet.tsx`, `ChatHistorySheet.tsx`, `AlarmEditorModal.tsx`, `TodoListView.tsx`, `FloatingOrbAppearance.tsx`, `OnboardingStep.tsx`, `backendSelection.ts`, `UpdateSheet.tsx`, `DeveloperPerformanceTab.tsx`, `FloatingAssistantSettings.tsx`, `AppUpdateItem.tsx`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **What connects `ADR-0026`, `ADR-0040`, `ADR-0021` to the rest of the system?**
  _73 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `storage/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.02973852541802267 - nodes in this community are weakly interconnected._
- **Why does `db` connect `storage/index.ts` to `materialStore.ts`, `commandReview.ts`, `scheduler/index.ts`, `chatOrchestrator.ts`, `reminderAlarm.ts`, `calendarGroups.ts`, `actionService.ts`, `alarmsStore.ts`, `DatabaseTransaction`, `OnboardingScreen.tsx`, `developerTestService.ts`, `IncomingCallScreen.tsx`, `LessonQaSkill.tsx`, `QuickChatRoot.tsx`, `meetings/index.ts`, `OfflineVoice.tsx`, `FlashcardsSkill.tsx`, `Task`, `deliveryStore.ts`, `corImportStore.ts`, `studentSetupStore`, `reminderDeliveryStyleStore.ts`, `CallLafinaSettingsModal.tsx`, `chatStore.ts`, `tabPerformance.ts`, `notesQueryStore.ts`, `ChatScreen.tsx`, `accountDataReset.ts`, `localHandbookService.ts`, `useCalendarData.ts`, `useCommandReview.ts`, `syncWorker.ts`, `onboardingMemory.ts`, `chatSyncStore.ts`, `userStore.ts`, `plannerQueries.ts`, `environment.ts`, `chatMemoryStore.ts`, `personalMemoryStore.ts`, `syncTypes.ts`, `tasksStore.ts`, `syncStateStore.ts`, `attachmentCleanup.ts`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **Should `DashboardScreen.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.04789272030651341 - nodes in this community are weakly interconnected._
- **Why does `VoiceConversationController` connect `VoiceConversationController` to `voiceConversation/types.ts`, `OfflineCallController`, `useVoiceConversation.ts`, `voiceConversation/index.ts`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **Should `commandReview.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.04487989886219975 - nodes in this community are weakly interconnected._