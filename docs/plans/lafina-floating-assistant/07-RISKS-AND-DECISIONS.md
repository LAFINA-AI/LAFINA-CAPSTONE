# 07 — Risks, Decisions and Owner Questions

- **Verified on:** 2026-11-17. Evidence for each item is in `01-REPOSITORY-AUDIT.md` and `02-ANDROID-TECHNICAL-RESEARCH.md`.
- Likelihood and impact are judgements, not measurements.

## 1. Risks

| ID | Risk | Likelihood | Impact | Mitigation | Verified in |
| --- | --- | --- | --- | --- | --- |
| R-01 | **Authorisation.** `AGENTS.md` does not list a floating assistant in scope, requires explicit per-phase approval, and the build guard rejects new manifest permissions. | Certain | Blocks work | Owner answers Q-00 and Q-01 before any code. Add a task-scoped notice to `AGENTS.md` as was done for earlier tasks. | FLOAT-00 |
| R-02 | **Two React activities on one host.** `ReactHostImpl.onHostPause` asserts the paused activity is the current one. If `MainActivity` and `QuickChatActivity` are resumed together (split-screen, unusual ordering) the app can crash. | Medium | High | Orb hidden while the main screen is visible; Quick Chat finishes itself when the main screen is in front; ordering rule on main resume; guarded delegate or React Native feature flag only if the spike shows it is needed. |FLOAT-00 spike B, FLOAT-03, M-25, M-26 |
| R-03 | **Reminder delivery while Quick Chat is in front.** `AppState` is shared, so the main root (if mounted) restarts the reminder poller and could claim a due reminder for an in-app call screen that is not visible. | Medium | High (missed or invisible reminder) | Do not start the poller or consume native calls while Quick Chat is the visible screen, so the native alarm path stays the only engine, exactly as when LAFINA is in the background. Read `reminderPoller.ts` and `deliveryReconciler.ts` before changing `App.tsx`. |FLOAT-00 spike D, FLOAT-03, M-23, J-17 |
| R-04 | **OEM blocks the orb tap.** Xiaomi and others gate background activity starts behind an extra, non-queryable permission. | High on affected OEMs | Medium | Blocked-launch detection with a hint; notification Open as the guaranteed path; help text; no attempt to bypass. |FLOAT-03, FLOAT-07, M-36 |
| R-05 | **Orb disappears.** OEM battery managers, the FGS Task Manager, force-stop, low memory and app updates all end the service. | High over time | Low to medium | Treat as normal: orb returns when LAFINA is opened; status line explains; help recommends unrestricted battery where the user wants persistence. No keep-alive tricks. |FLOAT-07, M-27 to M-29 |
| R-06 | **Open card lost.** Proposals are in memory. Process death loses them, and the main app's first user-set calls `endReviewSession()`. | Medium | Low (nothing saved wrongly) | Clear "no longer current" message; never auto-confirm; confirmed data is always durable. |FLOAT-05, M-20, J-12 |
| R-07 | **Memory.** The foreground service keeps the whole app process, including the React runtime and any loaded models, in memory. Android 17 adds per-app memory limits. | Medium | Medium | Measure in FLOAT-07. No runtime preloading by the service. Fallback: move the service and orb to a small separate process. |FLOAT-07, M-38 |
| R-08 | **Google Play.** `specialUse` services need a declaration and review; overlay use is scrutinised; the current release build is signed with a debug key. Approval is not guaranteed. | Only if publishing | High for a Play release | Honest subtype text, opt-in flow, visible notification, demo video prepared at submission time. Re-check policy then. | Before any Play submission |
| R-09 | **Overlay conflicts with other apps.** Some apps hide overlays or refuse input while one is visible. | Medium | Low | One-gesture Hide; documented as expected. |M-09 |
| R-10 | **New-activity platform rules.** Edge-to-edge, predictive back and large-screen rules apply to a translucent activity; React Native's back handling there is unverified. | Medium | Medium | Spike A; inset handling copied from the Chat screen's approach; no orientation lock. |FLOAT-00, FLOAT-03, M-12, M-31, M-32 |
| R-11 | **Sync delay.** Items confirmed in Quick Chat are pushed only when the sync scheduler runs, which lives in the main root. | Medium | Low | Outbox is written transactionally; sync runs when the main root is mounted and the host is active, otherwise on next app open. State this in the report. |M-15 |
| R-12 | **Temporary-chat limits.** In this mode the online tool-using agent, explicit memory and typed "yes" are not used; the transcript is not kept. | Certain | Low | Accepted for the MVP (D-05, D-07). A persistent mode would need a small additive orchestrator option; owner decides in Q-02. | — |
| R-13 | **Change in a critical file.** `commandReview.ts` guards every assistant write. | Low | High if done carelessly | Two-line type and normalisation change only, with dedicated tests and the full review suite. | FLOAT-01, J-01 |
| R-14 | **Underlying app pauses.** A translucent activity pauses the app below; video may pause. | Certain | Low | Accepted trade-off of the activity design; the panel is short-lived. |M-11 |
| R-15 | **Foreground-service start rules.** Starting from the background needs a visible overlay first (target 15+); sticky restarts are unverified. | Low in the normal path | Medium | Start only while LAFINA is visible; guarded restart path that fails quietly. | FLOAT-02, FLOAT-07 |
| R-16 | **Future target bump to API 37.** Launch hardening for `IntentSender`, stricter background audio, no large-screen opt-out. | Certain eventually | Low | Recorded here; direct `startActivity` and activity-targeted `PendingIntent`s are already the conservative choice. | At the target bump |
| R-17 | **Content duplicates.** Nothing in the app detects "the same event again". Quick capture makes repeats a little more likely. | Low | Low | Existing guards cover double taps. A content-level check is a separate product decision. | — |
| R-18 | **Dirty working tree.** The pack was written against about 135 uncommitted changes on a feature branch; line numbers and even behaviour may differ on the branch chosen for implementation. | Medium | Medium | FLOAT-00 re-validates; every citation names a symbol; Opus re-reads before editing. | FLOAT-00 |
| R-19 | **Orb glyph asset.** No native brand vector exists. | Certain | Low | Use the launcher icon until the owner supplies a mark (Q-05). | FLOAT-02 |
| R-20 | **Accessibility of a non-focusable overlay.** Screen-reader reachability of the orb window is unverified. | Medium | Medium | Notification actions are the guaranteed accessible path; custom actions on the orb; verify. |FLOAT-02, M-33 |

## 2. Decisions

Each records what was chosen, what else was considered, and what would change it.

| ID | Decision | Alternatives considered | Reason | Revisit if |
| --- | --- | --- | --- | --- |
| D-01 | Hybrid: native orb in an overlay window, React Native panel in a translucent activity | Native-only, Compose, React surface in overlay, Bubble API, no orb | Only option with a persistent orb, full reuse, normal typing and a voice path, with no new dependency | FLOAT-00 spikes fail |
| D-02 | One process, the existing `ReactHost` | Separate React host; separate process for the service | Proposals are in JS memory, so the UI must share the runtime; simplest | Memory measurements are poor (then: separate service process only) |
| D-03 | Foreground-service type `specialUse` | `microphone`, `mediaPlayback`, `dataSync`, `shortService`, `systemExempted`; no service | No other type matches the purpose; a wrong type is a policy violation; without a service the orb dies with the cached process | Platform adds a fitting type |
| D-04 | No third-party overlay library | Several community packages | Unverified on RN 0.86 / New Architecture; Expo-based or low adoption; small amount of code to own | — |
| D-05 | Quick Chat transcript is temporary (Temporary Chat mode, in memory) | Write into the current chat; dedicated persistent session | No schema or store change; no clutter; current chat might be a handbook chat | Owner wants history (Q-02) |
| D-06 | New review surface `'quick'` | Reuse `'chat'` | Prevents Quick Chat and the Chat tab replacing each other's cards | — |
| D-07 | Confirmation by button only | Also accept typed "yes" | Safer in a small window; already how Temporary Chat behaves | — |
| D-08 | Quick Chat follows the Chat tab's Online Mode setting; no separate switch | Own toggle; always offline; always online | One mental model; respects sign-in and entitlement rules already enforced | User feedback |
| D-09 | Voice is 1.1 and is hold-to-speak inside the visible activity; Call LAFINA is not embedded | Voice in MVP; live call in overlay | Platform microphone rules; ADR-031 defers background calls; smaller MVP | — |
| D-10 | Orb hidden while any LAFINA screen is in front | Always visible | Redundant inside the app; also keeps two React activities apart | — |
| D-11 | No restore after reboot in the MVP | Boot receiver | Extra background start path; owner decision | Q-03 |
| D-12 | Bubble API not used | Use as primary or secondary | Intended for conversations between people; user-controlled opt-in; would need a fake conversation | Platform guidance changes |
| D-13 | Settings live in the Profile screen as one row and a sheet | New Assistant settings screen | No such screen exists; matches Offline Voice / Online Voice | A settings redesign |
| D-14 | Off by default; explainer before the system screen; no automatic re-prompt | On by default; prompt at first run | Brief's requirement; policy and trust | — |
| D-15 | "Hide" stops the service until LAFINA is next opened; the toggle is the permanent switch | Hide keeps the service; Hide disables the feature | Honest notification state; easy recovery | User feedback |
| D-16 | Service starts only while a LAFINA activity is visible | Start from the background using exemptions | Avoids relying on background-start exemptions | Boot restore is approved |
| D-17 | In-runtime JS stores and events for refresh and navigation; no intent extras from outside | Intent extras, broadcasts | Same runtime makes it simpler and removes an external input | Service moves to another process |
| D-18 | Not shown on the lock screen; panel not `showWhenLocked` | Allow on lock screen | Privacy | — |

## 3. Owner questions

Recommendations are given so work can proceed as soon as the owner answers.

| ID | Question | Recommendation | Blocks |
| --- | --- | --- | --- |
| Q-00 | Do you authorise the Floating LAFINA feature and add a task-scoped notice to `AGENTS.md` (scope, phase list `FLOAT-00` to `FLOAT-08`, per-phase approval as usual)? | Yes | Everything |
| Q-01 | Do you approve two new manifest permissions, `SYSTEM_ALERT_WINDOW` and `FOREGROUND_SERVICE_SPECIAL_USE`, and the matching change to the allow-list in `scripts/check-architecture.mjs`? | Yes; they are the minimum for an orb | FLOAT-02 onward |
| Q-02 | Should Quick Chat messages be temporary, or saved to chat history? | Temporary for the MVP | Nothing (default applies) |
| Q-03 | Should the orb come back by itself after a phone restart? | Not in the MVP; optional setting in 1.1, default off | 1.1 |
| Q-04 | Is a Google Play release planned? | If yes, plan the FGS declaration, demo video, release signing and a policy re-check before submission | Play submission only |
| Q-05 | Which orb concept, and can you supply a vector LAFINA mark for the native side? | Concept A (brand disc); launcher icon as a stand-in | Polish only |
| Q-06 | Product names: "Floating LAFINA" for the feature and "Quick Chat" for the panel? | Yes | Copy only |
| Q-07 | Which branch should implementation start from, given the uncommitted changes on `feature/uniguide-inspired-ui-overhaul`? | Commit or stash the current work first, then a new branch from the agreed base | FLOAT-00 |
| Q-08 | Which physical devices are available for validation (brand, model, Android version)? | At least one Pixel-class device or emulator per Android version, plus any Samsung, Xiaomi, OPPO or realme phone available | FLOAT-00, FLOAT-07 |

### 3.1 Owner answers (2026-11-17)

The owner accepted the recommended answer to every question above. The record, with the exact wording and its limits, is in `OWNER-AUTHORIZATION.md`.

| ID | Status |
| --- | --- |
| Q-00 | Answered yes. Notice added to `AGENTS.md`. `FLOAT-00` may start; later phases need explicit approval. |
| Q-01 | Answered yes, for these two permissions only. |
| Q-02 | Temporary. |
| Q-03 | Not in the MVP. |
| Q-04 | Not decided; MVP targets the sideloaded preview. |
| Q-05 | Concept A; launcher icon as the glyph for now. |
| Q-06 | "Floating LAFINA" and "Quick Chat". |
| Q-07 | New branch from `feature/uniguide-inspired-ui-overhaul` after the owner commits the existing work. |
| Q-08 | **Still open.** Ask at the start of `FLOAT-00`. |

## 4. Items that remain unverified

| Item | Why | Resolved by |
| --- | --- | --- |
| Every device behaviour in this pack | No device was used in the research session | FLOAT-00, FLOAT-02, FLOAT-07 |
| Baseline `npm run preflight` and Gradle results | Not run during research | FLOAT-00 |
| React Native back handling and host lifecycle in a second activity | Read in source, not executed | FLOAT-00 |
| OEM-specific permissions and battery behaviour | Community sources only | FLOAT-07 |
| Play Console treatment of the overlay permission; target-API deadlines | No dedicated official page found | Before a Play submission |
| Exact parser phrases for the note and reminder chips | Not traced | FLOAT-05 |
| Whether `scripts/offline-boundary.cjs` constrains where `onlineModeGate.ts` may live | Not read in detail | FLOAT-01 |
| How `ChatScreen` handles multi-action batches, and whether the panel can reuse it | Not traced in detail | FLOAT-05 |
| Full text of the `SYSTEM_ALERT_WINDOW` reference entry | Page was truncated when fetched | Optional re-read |
| Performance and battery figures | Targets only | FLOAT-07 |
