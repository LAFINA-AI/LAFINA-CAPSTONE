# AGY feature inventory (read from code at b9433dc, AGY-PORT 00)

Static inventory from inspecting source. It says what exists, not that it works on a device.

## Screens and navigation

- Tabs (`src/ui/components/CustomTabBar.tsx`): `chat`, `calendar`, `notes`, `profile`.
- Rendered from `App.tsx`: SynthSplash, WelcomeScreen, LoginScreen, RegisterScreen, OnboardingScreen, ChatScreen, CalendarScreen, NotesScreen, ProfileScreen, IncomingCallScreen, ReminderPermissionModal, VoiceModal, ProductTour.
- Reached from Profile/tools: PreferencesSettingsScreen, MeetingsScreen and MeetingDetail (`src/ui/screens/meetings`), gated through `App.tsx` `hasPro`.

## Native modules (public names, `android/app/src/main/java/com/lafina/capstone`)

LafinaReminder, LafinaSpeechToText, LafinaMeetingRecorder, LafinaIntentExtractor, LafinaAudioPlayer, LafinaThemeReveal, LafinaGrainient / LafinaGrainientView, AndroidConnectivityModule, AndroidKeystoreModule, CapstoneBuild. JS also probes `LafinaUpdater` (`src/updates/nativeUpdater.ts`), and `LafinaTTS` as a legacy audio-player alias; neither is registered natively at this commit, and JS treats a missing module as unavailable.

Components: ReminderAlarmReceiver, ReminderBootReceiver, LafinaReminderReceiver, LafinaReminderService (FGS microphone), LafinaMeetingService (FGS microphone), MainActivity.

## ParsedIntentType (`src/ai/nlu/types.ts`)

create_task, create_time_block, create_reminder, create_note, update_task, update_time_block, update_note, delete_task, delete_time_block, delete_note, acknowledge, snooze, reschedule, query_schedule, chat, out_of_scope. `executeNluAction` has a `case` for each. Sources: `fast_path`, `on_device_slm`, `cloud`.

## Sync

Seven types (`src/sync/syncEntityTypes.ts`): profile, task, event, time_block, reminder, note, custom_category. Scope `account`. Endpoint `POST /v1/sync/batch` with `{mutations, cursor, entityTypes, snapshot?}`. Envelope `{mutationId, entityType, entityId, operation, clientUpdatedAt, payload, baseVersion?}`. Frozen create-payload field names live in `__tests__/preservation/agyPreservedContracts.test.ts`.

## Entitlements as actually coded

| Feature | Gate in code | guest | student | student_pro | admin |
|---|---|---|---|---|---|
| Meetings tool / summaries (`hasProEntitlement`) | `App.tsx:381`, `MeetingsContext.tsx:284` | no | no | yes | yes |
| Student Pro badge (`isStudentProAccount`) | `ProfileScreen.tsx:105` | no | no | yes | no |
| Cloud call speech | `src/cloud/speechService.ts` `getEntitlementSnapshot` | no | no | yes | see phase05 tests |
| Online chat, RAG, documents | Server decides; client needs online + access token (`requiresAuth`) | auth_required | server | server | server |

The speech gate is intentionally separate from `hasProEntitlement`. Do not normalize these.

## Online endpoints

`/v1/auth/{register,login,refresh,logout,me}`, `/v1/sync/batch`, `/v1/ai/chat` (`{messages, use_handbook}`), `/v1/ai/handbook/status`, `/v1/ai/documents`, `/v1/ai/tts`, `/v1/ai/meeting-notes/{section,generate}`, `/v1/meetings/summary` (`consent_given: true`). Hosts in `src/cloud/cloudClient.ts`.

## Handbook preference

Keys `chat.useHandbook` and alias `ustp_handbook_enabled`, default true. Source fields: title, section, page, snippet.

## Documents

Formats pdf, docx, xlsx, pptx. Natural-language routing in `src/ai/documentIntent.ts`, excluded for scheduling leads. Saved via RNFS and persisted as `messages.attachment_json` with uri, fileName, format, mimeType, sizeBytes.

## Meetings

Record/pause/resume/stop through `LafinaMeetingRecorder` plus FGS `LafinaMeetingService`; import with `importAudioFile`; chunked Whisper with timestamps in `meetingTranscriber.ts`; `keepAudio` defaults false and deletes raw chunks after transcription; recovery via `getRecoveryState`; online notes only with `consentGiven` and pro entitlement. Raw audio never uploads.

## Speech

STT: Whisper `ggml-base.en-q5_1.bin` plus `silero_vad.onnx`, ONNX Runtime 1.19.2. TTS: `react-native-tts` 4.1.1, with `selectOfflineVoice` rejecting cloud and uninstalled voices. Cloud TTS `/v1/ai/tts` for entitled accounts, falling back to `react-native-tts`.

## Microphone

`LafinaMicrophoneLease` is a process-local enum holder and is reentrant for the same holder. AGY-PORT 05 replaces this behind the same call sites.

## Update identity

Package `com.lafina.capstone`, debug `.debug`, versionCode 6, versionName 0.6.0, updater repo `LAFINA-AI/LAFINA-CAPSTONE`, `src/updates/releaseKey.ts` public key. Release uses the debug signing reference (a development preview) and this port does not change it.

## Known defects to fix in assigned phases (not encoded as desired behavior)

| Defect | Where | Phase |
|---|---|---|
| Native open failure enters a no-op database that reports success and runs after-commit callbacks | `src/storage/database.ts` | 01 |
| Rollback failure allows connection reuse | `src/storage/database.ts` | 01 |
| Migrations run outside a transaction; future `user_version` not refused | `src/storage/dbInit.ts` | 01 |
| All accounts share `default_chat_session`; `INSERT OR IGNORE` keeps the first owner | `src/storage/chatStore.ts` | 02 |
| `getMessages` reads whole history | `src/storage/chatStore.ts` | 02 |
| Reminder registrations in SharedPreferences with hashed request codes | `LafinaReminderModule.kt` | 03 |
| Reminders paired with tasks by title in poller/cleanup | `reminderPoller.ts`, `actionExecutor.ts` | 03, 04 |
| Assistant mutations run directly after parsing | `actionExecutor.ts`, `VoiceModal.tsx` | 04, 05 |
| Calendar and Notes read whole collections | `useCalendarData.ts`, `useNotesData.ts` | 06, 07 |
| Profile infers voice counts from note text/flags | Profile statistics | 09 |
| `initTts` can report initialized without a verified offline voice | `ttsService.ts` | 10 |
