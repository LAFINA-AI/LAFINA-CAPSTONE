# ADR-036 — Floating LAFINA: native overlay orb + Quick Chat activity on the shared React host

**Status:** proposed (accepted with measured facts in FLOAT-07)
**Date:** 2026-11-17
**Phase:** FLOAT-00
**Review owner:** human developer

## Context / problem

The owner asked for an optional floating LAFINA button that stays on screen over other apps and opens a compact "Quick Chat" for adding schedules, reminders and notes without leaving the current app (`docs/plans/lafina-floating-assistant/`). Constraints:

- Every assistant write must go through the existing review card and Confirm (AGY-PORT 04).
- Pending proposals live in JavaScript memory (`commandReview.ts` `reviews` map, per-runtime `sessionId`), so the UI that confirms them must run in the same JS runtime.
- No wake word, no always-on microphone, no reading of other apps, nothing on the lock screen, off by default.
- No new npm or Gradle dependency.
- Android rules for overlays, foreground services, background activity starts and microphone use (pack document `02`).

## Decision

1. **Orb:** a Kotlin `View` in a `TYPE_APPLICATION_OVERLAY` window (`FLAG_NOT_FOCUSABLE`, orb-sized, no pass-through window), owned by `LafinaFloatingAssistantService`, a foreground service of type **`specialUse`** with an ongoing notification (Open, Hide). No JavaScript, timers, polling or wake locks while idle.
2. **Panel:** `QuickChatActivity`, a second translucent `ReactActivity` (`singleTask`, own task affinity, `excludeFromRecents`, `exported="false"`, not `showWhenLocked`) rendering a second registered root `LafinaQuickChat` on the **existing** `ReactHost`.
3. **Logic:** Quick Chat calls `chatOrchestrator.processMessage` with `temporaryChat: true` and a new review surface `'quick'`; confirmation through `useCommandReview` and `CommandReviewCard`.
4. **Permissions:** `SYSTEM_ALERT_WINDOW` and `FOREGROUND_SERVICE_SPECIAL_USE` (owner approval Q-01, `OWNER-AUTHORIZATION.md`, 2026-11-17).
5. **Host lifecycle guard (from Spike B):**
   - The orb is hidden while `MainActivity` is resumed, so the normal path never resumes both React activities.
   - `MainActivity.onResume` asks an existing Quick Chat to finish.
   - `QuickChatActivity` uses a small guarded `ReactActivityDelegate`. It skips its own host pause when it is not the host's current activity, and skips host resume (then finishes) when `MainActivity` is already resumed. When Quick Chat is the current activity its behaviour is exactly the default delegate's.
   - The React Native feature flag `skipActivityIdentityAssertionOnHostPause` is **not** used. It only downgrades the assertion and would still move the host to paused while the other activity is visible, which freezes JS timers.
6. **Reminder delivery guard (from Spike D):** while Quick Chat is the visible screen, `App.tsx`'s `AppState` "active" handler does not start the foreground reminder poller and does not consume the pending native call. The native AlarmManager path and its full-screen notification stay the only delivery path, exactly as when LAFINA is in the background.
7. **Close:** the panel closes through an explicit native `finish()` (`closeQuickChat()`), not by relying on the default back behaviour.
8. **Quick Chat root startup:** `await initDatabase()` before mounting `ThemeProvider`.

## Alternatives considered

- Native-only or Compose panel: a second review card, theme and Markdown renderer to maintain; Compose is a new dependency.
- React surface inside the overlay window: JS timers pause when no activity is resumed; no `Alert`, `Modal` or permission dialogs; no microphone.
- Bubble API: meant for conversations between people; needs a conversation notification and a per-app user opt-in.
- No orb (notification, shortcut, tile only): does not meet the request. Kept as complements.
- Separate React host for Quick Chat: breaks the shared in-memory proposals.
- Detail: pack documents `02` §4 and `07` §2.

## Impact

- **Correctness:** no new write path; all writes stay behind Confirm. The `'quick'` surface keeps Quick Chat's card from replacing a Chat-tab or Voice card.
- **Security and privacy:** no Accessibility Service, capture, usage stats, clipboard or microphone in the MVP. New components are not exported.
- **Battery and memory:** the service keeps the app process alive while the orb is on (R-07). It must be measured in FLOAT-07; no numbers exist yet.
- **Permissions:** two new manifest permissions. The overlay permission is requested only after the user turns the feature on and reads an explainer.
- **Maintenance:** about five Kotlin files and eight JS files; small edits to `commandReview.ts`, `index.js`, `App.tsx`, `ProfileScreen.tsx`, `MainActivity.kt`, `CapstoneBuildPackage.kt`, the manifest, styles, `check-architecture.mjs` and `jest.setup.js`.
- **Google Play:** a `specialUse` declaration with a demo video would be needed before any Play submission. Approval is not guaranteed.

## Measurements/verification

FLOAT-00 spikes on the Infinix X6880 (XOS, Android 15 / API 35, build `X6880-15.1.2.200(OPPJ001PF001PJ)`), debug build, 2026-11-17. Evidence: `docs/reports/float-00-report.md`, `docs/reports/evidence/float-00/`.

| Spike | Result |
| --- | --- |
| A — second React activity, cold and warm | Renders over another app; JS timers run; keyboard opens with auto-focus; `keyboardDidShow` reports 254.9 dp (excludes the navigation bar; window not resized); Back hides the keyboard, then `BackHandler` fires and the activity finishes |
| B — lifecycle orders | No assertion in: Quick Chat → open LAFINA → home; reopen Quick Chat → close → open LAFINA; cold Quick Chat → LAFINA. A true co-resumed split screen could not be produced on XOS (Quick Chat opens as its own full-screen task above the split, pausing `MainActivity`). Guard chosen from source analysis (Decision 5); re-check on an AOSP emulator in FLOAT-03 (M-26) |
| C — `specialUse` service + orb + launch | `startForeground` with type `specialUse` succeeded from the visible app; orb tap over Calculator started the activity with `BAL_ALLOW_NON_APP_VISIBLE_WINDOW`; root mounted ~145 ms after the tap (warm runtime, single sample). Over Settings the orb was hidden by the system (`mForceHideNonSystemOverlayWindow=true`) |
| D — reminder due while Quick Chat is in front | Native path fired and posted the call notification on time. On the next Quick Chat resume the hidden main root restarted the poller and **admitted the pending call into the invisible main screen** (`call_admitted`, origin `js`). Guard required (Decision 6) |

Performance, battery and memory: **NOT YET MEASURED** (FLOAT-07).

### FLOAT-02 implementation notes (device-driven)

1. **Screen state from `DisplayManager.DisplayListener`, not broadcasts.** On the Infinix X6880, XOS skipped SCREEN_ON (reason "Hiber/broadcast restricted queue") and USER_PRESENT for this app while its foreground service ran, so a receiver-based orb never came back after unlock. The service now removes the orb when the default display is not on and re-adds it when it is. While locked, the keyguard itself hides the overlay (`isVisible=false` measured), so no unlock event is needed. Return after unlock on the final build is still to be checked on the device.
2. **Permission loss is re-checked on every visibility event.** The `AppOpsManager` watcher did not fire on revoke on the same phone. Every display or LAFINA-activity change now re-checks `canDrawOverlays` and stops the service if it is gone; the watcher stays as an extra path.
3. The orb is hidden while **any** LAFINA activity is resumed (main screen, alarm screen, later Quick Chat), tracked with `Application.ActivityLifecycleCallbacks` (`FloatingAssistantVisibility`, in the service file). It sees only LAFINA's own activities.

### FLOAT-03 to FLOAT-06 implementation notes (code only; device checks pending)

1. **How JS knows Quick Chat is in front.** `QuickChatActivity` sends `LAFINA_QUICK_CHAT_VISIBILITY` from `onResume` *before* its host resume, and from `onPause`. Both events and the AppState change go through the same JS event queue in that order, so `App.tsx`'s AppState handler reads the right `quickChatPresence.isOpen()` (R-03 gate). The Quick Chat root also marks itself open on mount (cold start, before any event can reach JS) and closed on unmount. The listener is installed when the bundle loads (`QuickChatRoot.tsx`, imported by `index.js`). Not yet observed on a device.
2. **Guarded delegate** as in Decision 5: `onResume` skips the host resume and finishes when `MainActivity` is resumed; `onPause` skips the host pause when `reactHost.currentReactContext.currentActivity` is another activity. `MainActivity.onResume` calls `QuickChatActivity.finishIfOpen()` before its own resume.
3. **Blocked launch:** one delayed check 1.5 s after an orb tap; if no LAFINA activity resumed, `launchBlockedSeen` is saved and a non-touchable label shows next to the orb for 4 s.
4. **Account switch:** `applyFloatingAssistantForUser` (called in `App.tsx` after startup) applies the active student's own setting to the native mirror, keeps only that student's Quick Chat transcript and drops another owner's pending navigation.
5. **Multi-step requests** (`multiBatch`) are not reviewed in the panel: it says so and offers Open LAFINA. The batch is not carried over; the student asks again in the Chat tab.

### FLOAT-07 measured facts (Infinix X6880, Android 15, debug build — upper bounds)

- Tap to panel (first frame), warm: median 152 ms over 5 runs. Orb after leaving LAFINA: median 301 ms, of which 200 ms is the deliberate show delay.
- Service + orb add about 3.6–3.9 MB of graphics memory; other differences are within noise. The service keeps the whole process (about 398 MB PSS in this debug build) resident — R-07. Whether the separate-process fallback is needed is not decided: it needs a release-build measurement.
- Idle with the orb shown: no repeating alarm, no wake lock, no thread or timer from this feature; the remaining idle CPU is the debug build's Metro connection and network/connectivity threads.
- Lifecycle: critical trim-memory, forced Doze, force-stop and process kill behave as designed; no crash.
- Not measured: release-build timings and memory, 8-hour battery, TalkBack, Android 17 emulator. Status stays **proposed** until those are done and the owner accepts.

### Customizable button (owner request 2026-11-18)

The owner found the 56 dp orb too big and asked for a smaller button that stays out of the way and can be customized, along the lines of the Infinix Smart Panel handle.
- **Default changes to an edge bar:** a 4–8 dp rounded bar flush against the screen edge, in a 24 dp-wide touch strip that is 64, 88 or 112 dp tall. A tap or a swipe inward opens Quick Chat. It moves only after a long press, so a brush of the edge never drags it. A drag the system takes over, for example the Back swipe, puts it back where it was. This follows the Samsung Edge panel handle options: side, size, transparency and a position lock.
- **Bubble stays as an option** in 40, 48 or 56 dp. It can tuck half off the screen while idle, and a tap on the tucked bubble opens Quick Chat directly. The "L" mark and outline turn dark on light colours.
- **Settings:** style, size, side, how visible it is when idle (30–100 %, from 20 %), colour (app theme or seven swatches), tuck (bubble), hide in full-screen apps and lock position, all with a live preview. These are device-local in `FloatingAssistantPrefs`, like the position, and are not synced.
- **Hide in full-screen apps (default on):** the button's own window reads only whether the status bar is visible (`WindowInsets.isVisible(statusBars())`). It learns nothing about which app is open or what it shows. While hidden, the window is fully transparent and not touchable, so touches reach the app underneath (Android 12+ touch rules).
- No new permission, dependency, timer or wake lock. The only one-shot timers are the idle fade (3 s) and the long press.

### Open speed (owner report 2026-11-18)

The owner found opening from the edge bar slow. Measured with timing logs on the Infinix (debug build, Metro), the Quick Chat window was up about 0.13 s after the tap, but its content waited for the shared JS thread. Opening Quick Chat resumes the shared React host, so the hidden main screen ran its full "back in front" refresh at the same moment: data reload, reminder re-arm, permission read, sync and a Home re-render, about 0.5–0.6 s of JS work.
- **Decision:** that refresh (in `App.tsx` and the Home hook) now waits until the panel's open animation has finished (`quickChatPresence.deferWhileOpening`), or 1.5 s at the latest. It is dropped if Quick Chat closes first, because the main screen's own return to the front, or the background handler, does the same work. Outside Quick Chat it still runs at once. The R-03 rule is unchanged: the deferred work still checks whether Quick Chat is in front when it runs.
- A reopen skips Quick Chat's repeat of the storage schema pass, though the storage health check still runs every time. The panel reads the reduce-motion setting once and then follows Android's change event.
- **Result (same method, warm opens):** the open animation started 0.92–1.31 s after the tap before the fix, and 0.32–0.38 s after it. The first open after LAFINA starts now starts its animation at 0.66 s, because the panel's first render is still the cost there. These are debug-build numbers; release timings are not measured.

## Rollback

Turn the feature off (default). To remove it: delete the new Kotlin and JS files, revert the listed edits, and remove the two permissions and their allow-list entries. No schema change and no stored data depend on the feature, so local schedules, reminders and notes are unaffected.

## Human approval

Feature and permissions: owner, 2026-11-17, recorded in `docs/plans/lafina-floating-assistant/OWNER-AUTHORIZATION.md` (Q-00, Q-01). Unattended phase run: same file, follow-up answers. This ADR moves to "accepted" in FLOAT-07 with measured facts.
