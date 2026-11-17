# 01 — Repository Audit

- **Verified on:** 2026-11-17, branch `feature/uniguide-inspired-ui-overhaul`, HEAD `1757a0a`, about 135 uncommitted changes in the working tree.
- Every statement is **[V] verified by reading the file** unless marked **[A]** (assumption) or **[U]** (unverified).
- Line numbers may drift. Search for the symbol if a line does not match.

## 1. Project facts

| Fact | Value | Evidence |
| --- | --- | --- |
| Framework | React Native 0.86.0, React 19.2.3, TypeScript 5.9.3 strict | `package.json:30-31, 58` |
| Expo | Not used. Bare React Native CLI project | `package.json` (no `expo`), `index.js` |
| New Architecture / Hermes | Both on (bridgeless, Fabric) | `android/gradle.properties` (`newArchEnabled=true`, `hermesEnabled=true`) |
| Edge-to-edge | On | `android/gradle.properties` (`edgeToEdgeEnabled=true`) |
| SDK levels | `minSdk 30`, `compileSdk 36`, `targetSdk 36` | `android/build.gradle:4-6` |
| Kotlin / NDK | 2.1.20 / 27.1.12297006 | `android/build.gradle:7-8` |
| Application ID | `com.lafina.capstone` (`.debug` suffix on debug builds) | `android/app/build.gradle:23, 57` |
| ABIs | `arm64-v8a`, `x86_64` | `android/gradle.properties` |
| Distribution | Sideloaded preview APK with in-app updater; release signed with the debug key | `android/app/build.gradle:61-64`, `src/updates/` |
| Jetpack Compose | Not present | `android/app/build.gradle:102-111` |
| Navigation library | None. Tab state lives in `App.tsx` | `App.tsx:116, 658-738` |
| State management | React state + module-level stores over SQLite; no Redux/Zustand | `package.json`, `src/storage/` |
| Database | One SQLite file `lafina.db` through `@op-engineering/op-sqlite` 16.2.0, synchronous API | `src/storage/database.ts:81, 167`, `package.json:24` |
| Entry points | `index.js` registers one component, `LafinaCapstone` | `index.js`, `app.json`, `MainActivity.kt:51` |
| React host | One `ReactHost` created lazily in `MainApplication` | `MainApplication.kt:12-21` |
| Native modules | Registered by hand in `CapstoneBuildPackage` | `CapstoneBuildPackage.kt:13-28` |

## 2. Android manifest today

`android/app/src/main/AndroidManifest.xml` **[V]**

- Permissions: `INTERNET`, `ACCESS_NETWORK_STATE`, `RECORD_AUDIO`, `POST_NOTIFICATIONS`, `SCHEDULE_EXACT_ALARM`, `USE_EXACT_ALARM`, `USE_FULL_SCREEN_INTENT`, `RECEIVE_BOOT_COMPLETED`, `VIBRATE`, `WAKE_LOCK`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MICROPHONE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK` (lines 3-16).
- **Not present:** `SYSTEM_ALERT_WINDOW`, `FOREGROUND_SERVICE_SPECIAL_USE`, any share (`ACTION_SEND`) filter, app shortcuts, widgets, Quick Settings tiles.
- Activities: `MainActivity` (`singleTask`, `showWhenLocked`, `adjustResize`, handles `configChanges` itself, lines 122-135) and `AlarmRingingActivity` (native, own task affinity, lines 90-98).
- Services: `LafinaAlarmService` (`mediaPlayback`), `LafinaReminderService` (`microphone`), `LafinaMeetingService` (`microphone`).
- **Build guard:** `scripts/check-architecture.mjs:170-198` reads the manifest and fails on any permission outside its `allowedPermissions` set. A comment there records the precedent: "Alarm plan A1 (owner approved 2026-11-15)".

## 3. Assistant architecture

### 3.1 How a chat message flows

```
ChatScreen.handleSend                      src/ui/screens/ChatScreen.tsx:1185
  -> chatOrchestrator.processMessage       src/ai/chatOrchestrator.ts:621
       1. save user message (or temp)      :640-651
       2. conversational yes/no on a card  :818-974   (skipped in temporary chat)
       3. intentService.extractIntent      :1181      (fast path, optional on-device SLM)
       4. optional DeepSeek extraction     :1186-1200 (only when onlineMode)
       5. routeIntent                      :1258      src/ai/nlu/intentRoutes.ts:83
            reviewed_mutation -> executeLowRiskCommand or prepareReviewedCommand  :1261-1293
            read_only         -> executeNluAction (reads only)                    :1340
            conversation      -> online agent / online chat / local reply         :1355-1676
       6. save assistant message           :1697-1718
  <- ChatOrchestratorResult {reply, review?, undo?, multiBatch?, ...}             :152-176
ChatScreen: review.present(result.review)  ChatScreen.tsx:1282
CommandReviewCard: Confirm -> useCommandReview.confirm -> chatOrchestrator.confirmReview :1782
  -> confirmReviewedCommand (one SQLite transaction + receipt)  src/ai/nlu/commandReview.ts:3844
```

### 3.2 Facts that drive the design

| Topic | Finding | Evidence |
| --- | --- | --- |
| UI independence | `processMessage` needs only `userId`, text and options. It imports no UI module. | `chatOrchestrator.ts:1-93, 621-625` |
| Options | `onlineMode`, `reviewSurface`, `onReplyText` (streaming), `temporaryChat`, `temporaryHistory`, `isCurrent`, `referenceDate`, `speakReply`, `useHandbook`, `ustpRagOnly`, `ringingCall` | `chatOrchestrator.ts:108-136` |
| No session option | The user message is saved with `chatStore.addMessage(userId, 'user', trimmed)`, which uses the user's **current** chat. There is no `sessionId` option. | `chatOrchestrator.ts:651`, `src/storage/chatStore.ts:749-775` |
| Temporary chat | With `temporaryChat: true` nothing is written to `chat_messages`; history comes from `temporaryHistory`. Explicit memory, the conversational yes/no, and the online tool agent are skipped. Proposals still work. | `chatOrchestrator.ts:628, 640-651, 688, 820-823, 1467-1482, 1697-1718` |
| DeepSeek | Never called directly from the app. Requests go to `LAFINA-backend` (`/v1/ai/chat`, `/v1/ai/chat/stream`, `/v1/ai/chat/agent`) with a bearer token. | `src/skills/onlineChatSkill.ts:283, 363, 427`, `src/cloud/cloudClient.ts:35, 537-541` |
| Tool calls | Online agent (ADR-033): at most 4 steps, 5 calls per step; tools run on local data; `prepare_lafina_action` only prepares a card and hard-codes `surface: 'chat'`; deletes are never prepared from model text. | `src/ai/chatAgent.ts:38-49, 149-175` |
| Tool validation | `validatePayload` against the registered tool definition | `chatAgent.ts:113-117`, `src/ai/voiceActions/actionValidator.ts`, `actionRegistry.ts` |
| Online Mode gate | Opt-in setting `chat.onlineMode` in `local_settings`, plus connectivity, plus `accountLinkService.authorizeOnlineMode(userId)`. Guests are refused. This logic sits inside `ChatScreen` and is **not** a shared function. | `ChatScreen.tsx:885-935, 1057-1100`, `src/cloud/accountLinkService.ts:725-733` |
| Error handling | Online failure falls back to a local reply or `describeOnlineChatFailure(status)`; a thrown error in `handleSend` restores the typed text. | `chatOrchestrator.ts:1601-1648, 334`, `ChatScreen.tsx:1291-1299` |
| Foreground dependence | The pipeline itself has no foreground check, but React Native stops JS timers when the host activity is paused (see `02`, section 3.3). | `node_modules/react-native/.../JavaTimerManager.kt:72-76` |

### 3.3 Review (confirmation) system

| Topic | Finding | Evidence |
| --- | --- | --- |
| Surfaces | `type ReviewSurface = 'chat' \| 'voice'`. Any other value is normalised to `'chat'`. | `commandReview.ts:75, 2819` |
| One card per owner and surface | A new proposal cancels the older pending one on the same surface. | `commandReview.ts:2881-2890` |
| In-memory | `reviews` map and `sessionId` are module variables. `endReviewSession()` clears them. | `commandReview.ts:359-360, 4722-4726` |
| Session reset on user change | `App.tsx` calls `endReviewSession()` whenever `userId` changes, **including the first time the main app sets the user after mounting**. | `App.tsx:237-259` |
| Expiry | 30 minutes (`REVIEW_TTL_MS`). The card never confirms itself. | `commandReview.ts:81`, `useCommandReview.ts:74-81` |
| Idempotent confirm | An existing receipt for the `operationId` returns `applied, repeated: true`. The hook also blocks double taps with `busyRef`. | `commandReview.ts:3848-3863`, `useCommandReview.ts:146-170`, `src/storage/assistantOperationStore.ts:44-78` |
| Refusal reasons | `not_found`, `expired`, `cancelled`, `owner_mismatch`, `session_ended`, `stale`, `failed`. Only `failed` keeps the card for retry. | `commandReview.ts:314-321`, `useCommandReview.ts:156-165` |
| Editing | Inline edit of title, date, time, end time, category, notes; conflict alternatives as one-tap chips; "Call me / Notify only" for reminders. | `CommandReviewCard.tsx:32-45, 300-520, 580-660`, `commandReview.ts:4101, 4327` |
| Content duplicates | **There is no "same title and time already exists" check.** Protection is by operation receipt, single open card, and a schedule-overlap warning. | `commandReview.ts:2893-2916` (conflict only), grep for `duplicate` |
| Low-risk actions | Completing a task, checklist toggle, note pin/category, acknowledge/snooze run immediately with an Undo offer. | `commandReview.ts:4387-4391, 4416`, `chatOrchestrator.ts:1262-1276` |
| Unreviewed writers are fenced | The build fails if any module other than the listed ones references `executeNluAction` or `processAndExecuteIntent`. | `scripts/check-architecture.mjs:43-58` |

## 4. Scheduling architecture

| Question | Answer | Evidence |
| --- | --- | --- |
| How is a schedule created from text? | Fast-path parser → validated intent → `prepareReviewedCommand` builds a `PlannedOperation` (`create_event`, `create_time_block`, `create_task`, `create_reminder`, …) → Confirm applies it. | `src/ai/nlu/fastPathParser.ts:2117`, `commandReview.ts:110-231, 2766, 3844` |
| Example | "add math exam on friday at 9am" → intent `create_time_block`, target `event`, card heading "Create event", detail "Reminder: rings 15 minutes before". | `__tests__/ai/agentAuditFixes.test.ts:275-281, 353-365` |
| Date and time parsing | `parseDateAndTime` in the fast path, relative to `referenceDate` (defaults to `new Date()`), using device-local time. Taglish phrases are translated first. | `fastPathParser.ts:1004, 411`, `chatOrchestrator.ts:627` |
| Time zones | Events are floating wall times (`date`, `start_time`, `end_time`). The IANA zone and exact UTC instants are stored on the device only in `event_time_local`. Reminders store an absolute instant. Non-existent or repeated wall times are refused or need a choice. | `src/storage/eventTime.ts:1-20`, `docs/decisions/ADR-021-event-time-local-metadata.md` |
| Recurrence | RRULE strings from `extractRecurrenceRule`; `rrule` 2.8.1 and `rruleHelper`. | `fastPathParser.ts:580`, `src/storage/rruleHelper.ts`, `package.json:37` |
| Confirmation | Review card, section 3.3. | — |
| Persistence | SQLite stores (`tasksStore`, `timeBlocksStore`, `remindersStore`, `notesStore`) written inside the confirm transaction together with `sync_outbox`. | `commandReview.ts:16-43, 3881-3906` |
| Offline creation | Yes. Parsing, proposal and confirm need no network. Guests (`local_guest_user`) can use it. | `intentService.ts:96-143`, `README.md` §7 |
| Reminder alarms | Registered with the native `AlarmManager` after commit (`tx.afterCommit` → `scheduleReminderAlarm`). | `commandReview.ts:3018-3019`, `src/scheduler/reminderAlarm.ts` |
| Cloud sync | Outbox rows are pushed by `syncWorker` driven from `App.tsx` while the app is active. | `App.tsx:442-519`, `src/sync/syncWorker.ts` |

## 5. Reminders and notes

Both already go through the same reviewed pipeline: `create_reminder`, `create_note`, `update_note`, linked reminders ("remind me 30 minutes before my math exam") are routed as `reviewed_mutation` (`src/ai/nlu/intentRoutes.ts:29-41`) and produce the same `CommandProposal`. **No new action code is needed for quick reminder or quick note creation.** What must be checked during implementation is only which starter phrases the fast-path parser recognises for notes (**[U]**: the exact note-creation phrasing was not traced; see FLOAT-05).

## 6. Voice architecture

| System | What it is | Background behaviour | Evidence |
| --- | --- | --- | --- |
| Push-to-talk STT | `LafinaSpeechToTextModule` records with `AudioRecord` inside the module (no foreground service), runs Silero VAD + `whisper.cpp`, returns a transcript. JS API: `sttService.startListening / stopListening / cancelListening / ensureMicrophonePermission`. | Needs the app to count as foreground for the microphone. A visible activity satisfies this. | `src/ai/stt/sttService.ts`, `src/ai/native/speechCapture.ts`, `LafinaSpeechToTextModule.kt:338, 504` |
| Microphone lease | Token-fenced, one recorder at a time across STT, meeting recorder and voice conversation. Busy codes `MIC_IN_USE`, `CAPTURE_BUSY`. | — | `LafinaMicrophoneLease.kt`, `MicrophoneLeaseRegistry.kt`, `speechCapture.ts:36-58` |
| Chat mic UI | Hold-to-talk inside `ChatInput`, with slide-to-cancel and hallucination filtering. Tightly coupled to `ChatInput` (759 lines, also holds camera scan and Call Lafina). | — | `src/ui/components/chat/ChatInput.tsx:137-300, 57` |
| Call LAFINA (ElevenLabs live conversation) | `LafinaVoiceConversationModule` + `src/cloud/voiceConversation/controller.ts` (1,343 lines). Uses `currentActivity` for volume routing and requests audio focus. | **Ends when the app is backgrounded; OS-level background calls are deferred by ADR-031.** | `LafinaVoiceConversationModule.kt:308-328`, `docs/decisions/ADR-031-background-call-and-multimodal-feasibility.md` §2.3 |
| ElevenLabs STT / TTS | Server-relayed (`elevenlabsTranscriber.ts`, `speechService.ts`, `/v1/ai/tts`). | — | `src/cloud/` |
| Local TTS | `react-native-tts` through `ttsService`. | — | `src/ai/tts/ttsService.ts` |

Conclusions: the push-to-talk STT service is reusable from a slim Quick Chat mic button **as long as Quick Chat is a visible activity**. Call LAFINA must not be embedded; ADR-031 already defers it.

## 7. UI architecture

| Area | Finding | Evidence |
| --- | --- | --- |
| Chat tab | `ChatScreen.tsx` is 2,746 lines and owns history, online toggle, streaming, temp chat, multi-action batches, undo. Not reusable as a unit. | `src/ui/screens/ChatScreen.tsx` |
| Reusable components | `CommandReviewCard` (props only, no screen coupling), `ChatMessageItem`, `ChatReplyText` (Markdown), `TypingBubble`, `UndoSnackbar`. | `src/ui/components/chat/` |
| Not reusable | `ChatInput` (too many unrelated features), `ChatHistorySheet`, `ChatEngineSheet`. | same directory |
| Theme | `ThemeProvider userId=…` reads dark mode, UI variant (`classic`/`modern`) and modern color theme per user. Hooks: `useTheme()`, `useThemedStyles()`. Tokens: `Spacing`, `Layout`, `Fonts`, `FontSize`, `Shadows`, `ThemeColors`, `ModernPalette`. | `src/ui/contexts/ThemeContext.tsx:58-200`, `src/ui/theme/index.ts`, `spacing.ts`, `layout.ts`, `typography.ts`, `palettes.ts:39-78` |
| Token values | `Spacing` 2/4/8/12/16/20/24/32; `Layout.borderRadiusCard 16`, `borderRadiusButton 12`, `borderRadiusPill 999`; `FontSize` 10/12/14/15/18/22/24/28; fonts `sans-serif-medium`, `sans-serif`. | `spacing.ts`, `layout.ts`, `typography.ts` |
| Dynamic color (Material You) | Not used. Palettes are fixed in `palettes.ts`. | `src/ui/theme/` |
| Reduced motion | `useReducedMotion()` exists. | `src/ui/hooks/useReducedMotion.ts` |
| Keyboard handling | `ChatScreen` listens to `Keyboard` events and offsets its composer manually (edge-to-edge window). | `ChatScreen.tsx:452, 625-627, 769-781` |
| Safe area | `react-native-safe-area-context` 5.8.0. | `App.tsx:19-22` |
| Icons | `lucide-react-native`. | `package.json:29` |
| Settings location | There is **no** "Settings → Assistant" screen. Settings are `SettingItem` rows inside `ProfileScreen`; assistant-related rows ("Detailed AI Summaries", "Markdown Chat Replies", "Test TTS Voice", "Offline Voice", "Online Voice · ElevenLabs") sit together, and each opens a component such as `OfflineVoice`, `OnlineVoice`, `ReminderHealth`. | `src/ui/screens/ProfileScreen.tsx` ≈1648-1680, 2278-2310, `src/ui/components/profile/SettingItem.tsx` |
| Permission education precedent | `ReminderPermissionModal` + `LafinaReminderModule.getPermissionStatus / open…Settings`. | `src/ui/components/call/ReminderPermissionModal.tsx`, `LafinaReminderModule.kt:239-275` |
| In-app navigation requests | `CallNavigationTarget {ownerId, screen, entityId, entityKind, date, …}` is how a screen asks `App.tsx` to open an item. | `src/ui/navigation/callNavigation.ts`, `App.tsx:122-130, 603-645` |
| Brand assets | Launcher foreground is a placeholder "L" vector; brand red `#B8002E` (`launcher_background`). PNG logos live in `src/assets/` (JS side only). | `android/app/src/main/res/drawable/ic_launcher.xml`, `res/values/colors.xml`, `src/assets/` |

## 8. Native precedents to copy

| Need | Existing example | Evidence |
| --- | --- | --- |
| Foreground service with channel + notification | `LafinaReminderService` (119 lines) | `LafinaReminderService.kt` |
| Native UI built in code, no XML | `AlarmRingingActivity` | `AlarmRingingActivity.kt:38-70` |
| Pure-Kotlin logic with JUnit tests | `AlarmSchedule.kt` + `AlarmScheduleTest.kt`, `VoiceConversationRules.kt` + test | `android/app/src/test/java/com/lafina/capstone/` |
| RN module with permission status and "open settings" methods | `LafinaReminderModule` | `LafinaReminderModule.kt:239-275` |
| Passing a native intent into JS after launch | `LafinaReminderModule.captureActivityIntent` + `consumePendingNativeCall` | `MainActivity.kt:25-31`, `App.tsx:371-373` |
| Jest stubs for native modules | `jest.setup.js` assigns `NativeModules.Lafina…` | `jest.setup.js:2-81` |

## 9. Reusable modules (summary)

| Reuse | For |
| --- | --- |
| `chatOrchestrator.processMessage / confirmReview / cancelReview / undoAction` | All assistant behaviour |
| `useCommandReview(userId, surface)` | Card state, double-tap guard, expiry |
| `CommandReviewCard` | Confirmation UI including edit |
| `ChatMessageItem` or `ChatReplyText`, `TypingBubble` | Transcript rendering |
| `ThemeProvider`, tokens, `useThemedStyles` | Visual identity |
| `userStore.getCurrentUser()`, `userStore.isGuest()` | Identity |
| `localSettingsStore.get/set` | Per-user feature settings |
| `accountLinkService.authorizeOnlineMode` | Online gate |
| `sttService` | Voice input (v1.1) |
| `initDatabase()` (safe to call again; `App.tsx:437-440` already does on retry) | Storage readiness when Quick Chat opens before the main app |
| `CallNavigationTarget` | "View in LAFINA" |

## 10. Missing functionality (must be built)

1. Overlay permission handling, foreground service, orb view, orb gestures and persistence (all native, none exists).
2. A second activity and a second registered React root.
3. A native module exposing status and controls to JS.
4. A small controller that calls the orchestrator in temporary mode and keeps the in-memory transcript.
5. A shared Online Mode resolver (logic exists only inside `ChatScreen`).
6. A compact composer and panel layout.
7. Settings entry and permission explainer.
8. A `'quick'` review surface (two-line change).
9. A way for the main app to refresh when Quick Chat changed data, to open a requested item, and to leave reminder delivery to the native path while Quick Chat is the visible screen.

## 11. Compatibility concerns and integration risks found in code

| # | Concern | Evidence | Where handled |
| --- | --- | --- | --- |
| C-1 | **Shared `AppState`.** When `QuickChatActivity` resumes, the React host becomes "active". `App.tsx` then restarts the sync scheduler and the **reminder poller**, which can claim a due reminder for in-app presentation (`claimForegroundRing`, `EVENT_CALL_TRIGGER`) even though `MainActivity` is not visible. | `App.tsx:477-507`, `src/scheduler/reminderPoller.ts:20-58` | R-03, FLOAT-00 spike, FLOAT-03 |
| C-2 | `endReviewSession()` on first user set in the main app wipes a card prepared in Quick Chat if the main app is opened afterwards. | `App.tsx:237-259` | R-06, FLOAT-05 |
| C-3 | `ReactHostImpl.onHostPause(activity)` asserts the paused activity is the current one. Two resumed activities (split-screen) can violate it. | `node_modules/react-native/ReactAndroid/.../runtime/ReactHostImpl.kt:269-292` | R-02, FLOAT-00 |
| C-4 | `ReviewSurface` normalisation would silently turn `'quick'` into `'chat'` unless updated. | `commandReview.ts:2819` | FLOAT-01 |
| C-5 | `processMessage` writes into the user's current chat (possibly a USTP handbook chat) unless temporary mode is used. | `chatOrchestrator.ts:651`, `chatStore.ts:101-106` | D-05 |
| C-6 | Manifest permission allow-list and offline-boundary checks run in `npm run preflight`. | `scripts/check-architecture.mjs:170-220` | Q-01, every phase |
| C-7 | `DialogModule`, `PermissionsModule`, `ReactModalHostView` and the date-time picker need a current activity. | `node_modules/react-native/.../modules/dialog/DialogModule.kt:167`, `views/modal/ReactModalHostView.kt:275-276` | Satisfied by using an activity |
| C-8 | `LafinaVoiceConversationModule` and the reminder call take the microphone lease; Quick Chat voice must handle `MIC_IN_USE`. | `speechCapture.ts:36-58` | FLOAT-08 |
| C-9 | The main app refreshes its screens through a `refreshTrigger` counter that only `App.tsx` can bump. | `App.tsx:521-523, 996-1009` | FLOAT-01 (event), FLOAT-03 (listener) |

## 12. Areas requiring (small) changes to existing files

Kept deliberately minimal. Exact edits are listed per phase in `05-IMPLEMENTATION-ROADMAP.md`.

| File | Change |
| --- | --- |
| `src/ai/nlu/commandReview.ts` | Add `'quick'` to `ReviewSurface`; update normalisation at the one place it is narrowed |
| `index.js` | Register the second root component |
| `App.tsx` | Listen for a "data changed" event to bump `refreshTrigger`; do not start the reminder poller while Quick Chat is the visible screen; consume a "view item" request; apply the floating-assistant setting when the user changes |
| `src/ui/screens/ProfileScreen.tsx` | One `SettingItem` row and one modal mount |
| `CapstoneBuildPackage.kt` | Register the new module |
| `MainActivity.kt` | Report resume/pause to the floating service; start the service on resume when enabled |
| `AndroidManifest.xml`, `res/values/styles.xml`, `scripts/check-architecture.mjs`, `jest.setup.js` | Declarations, theme, allow-list, test stubs |

No refactor of `ChatScreen`, `ChatInput`, `chatOrchestrator.processMessage` or the stores is required for the MVP.
