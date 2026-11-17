# 00 — Research Summary: LAFINA Floating Assistant ("Floating LAFINA" / Quick Chat)

- **Status:** research and planning only. No application code, manifest, Gradle or `package.json` change was made.
- **Verified on:** 2026-11-17 (repository state and official Android documentation).
- **Repository state inspected:** branch `feature/uniguide-inspired-ui-overhaul`, HEAD `1757a0a`, with about 135 uncommitted working-tree changes. Line numbers in this pack refer to that working tree and may drift; every citation also names the symbol.
- **Evidence labels used in this pack:** **[V]** verified this session (repo file or official doc), **[A]** assumption, **[U]** unverified.

## 1. Feature objective

Give students a small floating LAFINA orb that stays available over other apps. Tapping it opens a compact Quick Chat where they type (later: dictate) a request such as "add my networking exam this Friday at 9 AM", review a confirmation card, confirm, and return to what they were doing. It reuses LAFINA's existing assistant pipeline. It is optional, off by default, and never listens or reads the screen on its own.

## 2. Main findings

### Repository

1. **The assistant pipeline is reusable as-is.** `chatOrchestrator.processMessage(userId, text, options)` (`src/ai/chatOrchestrator.ts:621`) takes text and returns a reply plus an optional review proposal. It has no dependency on `ChatScreen`. Confirmation goes through `useCommandReview` (`src/ui/hooks/useCommandReview.ts:54`) and `CommandReviewCard` (`src/ui/components/chat/CommandReviewCard.tsx:112`). **[V]**
2. **Confirm-before-write already exists and is strict.** Every planner change is a proposal until Confirm. Confirm re-checks owner, session, expiry and row revisions, then writes the item, its reminder, the sync outbox entry and a receipt in one SQLite transaction (`confirmReviewedCommand`, `src/ai/nlu/commandReview.ts:3844`). A repeated Confirm returns the first receipt. **[V]**
3. **Proposals live in JS memory, not SQLite.** `const reviews = new Map(...)` and a per-runtime `sessionId` (`commandReview.ts:359-360`). So the Quick Chat UI must run in the **same JavaScript runtime** as the rest of the app, and a pending card is lost if the process dies. **[V]**
4. **The example request works offline today.** "add math exam on friday at 9am" parses on the device to a calendar event proposal with a 15-minute reminder (`__tests__/ai/agentAuditFixes.test.ts:353-365`). DeepSeek is used only when Online Mode is on. **[V]**
5. **A "Temporary chat" mode exists** (`ProcessMessageOptions.temporaryChat`, `chatOrchestrator.ts:127`). It runs the full pipeline without writing transcript rows, which fits a quick-capture window. **[V]**
6. **Bare React Native 0.86, New Architecture, no Expo.** `minSdk 30`, `targetSdk 36`, `compileSdk 36`, Kotlin 2.1.20 (`android/build.gradle:3-8`, `android/gradle.properties`). The app already ships 30 Kotlin files, three foreground services and one native non-RN activity, so native work follows existing patterns. **[V]**
7. **Permissions are allow-listed by a build check.** `scripts/check-architecture.mjs:174-198` fails the build on any manifest permission not in its list. The two new permissions need owner approval and a list update. **[V]**

### Android platform (official documentation)

8. **Microphone cannot be used from a bare overlay window in the background.** A microphone foreground service cannot be created while the app is in the background, and `SYSTEM_ALERT_WINDOW` is not among the exemptions. Voice input needs a visible activity. **[V]**
9. **An app with granted overlay permission may start an activity from the background**, and so may an app with a visible window. Tapping the orb can therefore open an activity. **[V]**
10. **Foreground service from the background (target 15+):** allowed for overlay apps only if an overlay window is already visible before `startForeground`. **[V]**
11. **`specialUse` is the correct foreground-service type** for keeping an overlay alive, and it needs a Play Console declaration with a demo video if the app is ever published on Google Play. **[V]**
12. **React Native pauses JS timers when its host activity is paused** unless a headless task runs (`JavaTimerManager.kt:72-76, 140-148, 291-293` in `node_modules/react-native`). A React surface in a raw overlay window would have stalled timers, no `Alert`, no `Modal`, no permission prompts and no text-selection toolbar. **[V]**
13. **Android Bubbles are for conversations between people**, need a conversation notification and a per-app user opt-in. Not suitable as the primary mechanism. **[V]**

## 3. Feasibility

**Feasible, with the architecture below.** Nothing in the repository or the platform blocks an MVP. The important limits are:

- The orb can disappear when the system or an OEM battery manager kills the process, after a force-stop, and on screens that hide overlays (permission dialogs, some banking apps). It cannot be made permanent.
- A pending confirmation card does not survive process death.
- Xiaomi/HyperOS and some other OEMs may block the orb tap from opening the panel until the user grants an extra OEM permission. A notification action is the guaranteed fallback.
- Google Play approval is not guaranteed. The app is currently a sideloaded preview (`android/app/build.gradle:61-64`).

## 4. Recommended solution

**Hybrid: native orb in an overlay window + React Native Quick Chat in its own translucent activity, on the app's existing React host.**

| Part | Technology | Why |
| --- | --- | --- |
| Collapsed orb | Kotlin `View` in a `TYPE_APPLICATION_OVERLAY` window, owned by a `specialUse` foreground service | No JavaScript runs while idle. Smallest battery and memory cost. Survives the main activity being closed. |
| Expanded Quick Chat | `QuickChatActivity` (a second `ReactActivity`, translucent, separate task, excluded from recents) rendering a new `LafinaQuickChat` root component | Same JS runtime, so the whole pipeline, SQLite connection, theme and review card are reused. Keyboard, back, accessibility, `Alert`, permission prompts and the microphone all work because it is a real, visible activity. |
| Assistant logic | Existing `chatOrchestrator` + `useCommandReview`, called through a thin new `quickChatController` | No second AI system. |
| Storage of the transcript | Existing Temporary Chat mode, transcript kept in memory | No schema change, no clutter in chat history. Created items are saved normally. |

Full reasoning and the rejected alternatives are in `02-ANDROID-TECHNICAL-RESEARCH.md` and `07-RISKS-AND-DECISIONS.md`.

## 5. Key trade-offs

| Choice | Gain | Cost |
| --- | --- | --- |
| Panel is an activity, not an overlay window | Everything in React Native works; mic allowed; far less native UI code | The app underneath is paused (video may pause) while the panel is open. OEM background-launch restrictions apply. |
| Orb is native, not React Native | Zero idle JS, instant drag response | Orb styling is written twice-over in Kotlin and receives its color from JS. |
| Temporary transcript | No schema or chat-store change; nothing accidental in history | Quick Chat messages are gone after process death. The online tool-using agent is not used in this mode. |
| One process (MVP) | Simple | The foreground service keeps the whole app process in memory while the orb is shown. |
| New `'quick'` review surface | Quick Chat cards never replace or mix with Chat tab or Voice cards | A two-line change in `commandReview.ts`, a critical file. |

## 6. Major risks

1. Reminder-call presentation while Quick Chat is the visible activity (shared runtime treats the app as "active"). See R-03.
2. React host lifecycle with two activities in split-screen (assertion in `ReactHostImpl.onHostPause`). See R-02.
3. OEM blocking of background activity launch and aggressive process killing. See R-04, R-05.
4. Two new manifest permissions and a new feature scope need explicit owner authorization. See Q-00, Q-01.
5. Memory retained by the foreground service. See R-07.

All are detailed, with mitigations and tests, in `07-RISKS-AND-DECISIONS.md`.

## 7. Expected user benefits

- Capture a schedule, reminder or note without leaving the current app.
- The same review card and the same saved data as the main app, so nothing behaves differently.
- Works offline for the common "add …" requests.
- Fully optional, with a visible notification and one-tap hide.

## 8. Definition-of-done status for this research

| Item | Status |
| --- | --- |
| Existing architecture inspected; assistant and scheduling logic traced | Done |
| RN and Android integration points identified | Done |
| Native overlays, Bubble API, alternative access methods researched | Done |
| Current Android restrictions verified (11 through 17) | Done, with items marked **[U]** where only community sources exist |
| Google Play considerations documented | Done; no overlay-specific Play declaration form was found, recorded as **[U]** |
| Architecture selected | Done |
| Orb UX, Quick Chat UX, confirmation flow, permission onboarding specified | Done |
| Background lifecycle, performance and battery, failure states and edge cases | Done; performance numbers are proposed targets, none measured |
| Phases, dependencies, test strategy | Done |
| Task pack and standalone Opus prompt | Done (`08-OPUS-IMPLEMENTATION-HANDOFF.md`) |
| No application implementation changes | Confirmed; only files in this directory were created |
| Baseline `npm run preflight` result | **NOT RUN** in this session (read-only research). Opus records it in Phase 00. |
| Behaviour on real devices | **NOT RUN**. Every device claim in this pack is a design expectation until validated in FLOAT-00, FLOAT-02 and FLOAT-07. |

## 9. Document map

| File | Purpose |
| --- | --- |
| `01-REPOSITORY-AUDIT.md` | What exists, with file and symbol citations |
| `02-ANDROID-TECHNICAL-RESEARCH.md` | Platform rules, approach comparison, sources |
| `03-UI-UX-SPECIFICATION.md` | Orb, panel, states, wireframes, accessibility |
| `04-ARCHITECTURE-DESIGN.md` | Components, data flow, lifecycle, security |
| `05-IMPLEMENTATION-ROADMAP.md` | Phases FLOAT-00 to FLOAT-08 |
| `06-TEST-PLAN.md` | Automated and device tests, acceptance criteria |
| `07-RISKS-AND-DECISIONS.md` | Risks, decisions, owner questions |
| `08-OPUS-IMPLEMENTATION-HANDOFF.md` | Handoff and copy-paste prompt |
| `OWNER-AUTHORIZATION.md` | The owner's answers to the questions in `07`, recorded 2026-11-17 |
