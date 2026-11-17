# 02 — Android Technical Research

- **Verified on:** 2026-11-17.
- **App baseline:** `minSdk 30` (Android 11), `targetSdk 36` (Android 16), `compileSdk 36` (`android/build.gradle:4-6`). Rules for "apps targeting 12/13/14/15/16" therefore **all apply**. Android 17 (API 37) rules for "all apps" apply when running on Android 17; "targeting 17" rules apply only after a future target bump.
- **Evidence labels:** **[V]** read in an official page this session. **[S]** taken from a search-engine summary of an official page, page not opened. **[C]** community source only. **[P]** prior knowledge, not re-checked this session. **[U]** unverified, needs a device.
- Source numbers such as (S1) refer to section 10.

## 1. What the feature needs from the platform

| Need | Platform mechanism |
| --- | --- |
| Draw a small orb over other apps | `SYSTEM_ALERT_WINDOW` permission + a `TYPE_APPLICATION_OVERLAY` window |
| Keep the orb alive after the user leaves LAFINA | A foreground service with a visible notification |
| Open a chat panel when the orb is tapped | Start an activity from the background |
| Type text | A focusable window with normal IME support |
| Speak (later) | Microphone access while "in use" |
| Never read other apps | No Accessibility Service, no screen capture, no usage-stats access |

## 2. Platform rules

### 2.1 Overlay permission (`SYSTEM_ALERT_WINDOW`)

| Rule | Effect on the design | Label, source |
| --- | --- | --- |
| "Allows an app to create windows using the type `TYPE_APPLICATION_OVERLAY`, shown on top of all other apps." | This is the only permission that makes the orb possible. | [V] S11 |
| It is a special permission. The user grants it on a system Settings screen, not in a runtime dialog. Check with `Settings.canDrawOverlays(context)`. | Needs an in-app explainer before sending the user to Settings, and a re-check when they return. | [P], [S] S17 |
| Android 11+: `ACTION_MANAGE_OVERLAY_PERMISSION` "always bring[s] the user to the top-level Settings screen… Any `package:` data in the intent is ignored." The user must find the app in the list. | The explainer must say "find LAFINA in the list and turn it on". On `minSdk 30` this applies to every device. | [V] S10 |
| Android 10+ (Go edition): the permission cannot be granted, the settings intent is auto-denied and `canDrawOverlays()` always returns false. | Detect and show "Not available on this device". Quick Chat still works through other entry points. | [S] S12, S18 |
| Only call-screening apps and apps that are capturing the screen get it automatically. | Not relevant. LAFINA must ask. | [V] S10 |
| `canDrawOverlays()` can briefly return a stale `false` right after returning from Settings. | Re-check on activity resume and once more after a short delay. | [C] S24 |
| The user can revoke it at any time. | Check before every `addView`; treat `WindowManager.BadTokenException` / `SecurityException` as "revoked", stop the service, update status. | [P] |

### 2.2 Overlay window behaviour

| Rule | Effect on the design | Label, source |
| --- | --- | --- |
| `TYPE_APPLICATION_OVERLAY` windows sit above activity windows but below critical system windows such as the status bar and the IME. The system may move, resize or hide them. | The orb can be covered by the keyboard. It cannot appear above system UI. | [P] S19 |
| Android 12+: touches that pass **through** an untrusted overlay are blocked unless combined opacity ≤ 0.8. Applies to `FLAG_NOT_TOUCHABLE` windows. | The orb window is sized to the orb and consumes its own touches, so nothing passes through it. Never add a full-screen pass-through window. | [V] S6 |
| Android 12+: an app can call `Window.setHideOverlayWindows(true)` (permission `HIDE_OVERLAY_WINDOWS`) to hide all app overlays while it is in front. System permission dialogs and some banking apps do this. | The orb will vanish on those screens and return afterwards. This is expected and cannot be bypassed. Document it for users. | [V] S11, [S] S20 |
| Apps may set `filterTouchesWhenObscured` and reject input while any overlay is visible. | Users may need to hide the orb for such apps. Provide a fast "Hide". | [P] |
| Application overlays are not shown above the lock screen. | The orb is unavailable while locked. Also hide it explicitly on screen-off. | [U] |
| `FLAG_NOT_FOCUSABLE` keeps key and IME focus with the app underneath. | Mandatory for the orb window. | [P] S19 |
| A window that cannot take focus cannot host a usable text field (no IME, no selection toolbar). A focusable overlay steals back-key and IME handling from the app below and needs manual management. | The chat panel should not be a raw overlay window. | [P] |

### 2.3 Foreground services (FGS)

| Rule | Effect on the design | Label, source |
| --- | --- | --- |
| Android 14+: every FGS must declare a type and hold the matching permission. | A new service needs a type. | [V] S2 |
| `specialUse`: "Covers any valid foreground service use cases that aren't covered by the other foreground service types." Needs `FOREGROUND_SERVICE_SPECIAL_USE` and a `<property android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE" …>` describing the use. No runtime prerequisite. | **Chosen type.** No other type describes "keep a user-enabled floating shortcut on screen". | [V] S2 |
| `microphone`, `mediaPlayback`, `dataSync`, `shortService`, `systemExempted` | Not valid for an idle orb: no recording, no playback, no data transfer; `shortService` is time-limited; `systemExempted` is "reserved for system applications and specific system integrations". Using the wrong type is a policy violation. | [V] S2 |
| Android 12+: a background app cannot start an FGS, with exemptions. Exemptions include starting from a user-visible state and holding `SYSTEM_ALERT_WINDOW`. | Start the service while LAFINA is visible (settings toggle, or `MainActivity` resume). No exemption needed in the normal path. | [V] S1 |
| Android 15+ (target 35+): the `SYSTEM_ALERT_WINDOW` exemption needs "the `SYSTEM_ALERT_WINDOW` permission *and*… a visible overlay window". Test flag: `FGS_SAW_RESTRICTIONS`. | For a restart from the background (sticky restart, optional boot restore): add the orb window first, wait until it is attached and visible, then call `startForeground` inside `try/catch`. | [V] S1, S3 |
| Android 15+: `BOOT_COMPLETED` receivers may not start `dataSync`, `camera`, `mediaPlayback`, `phoneCall`, `mediaProjection` or `microphone` services. `specialUse` is not on that list. | Restore after reboot is technically allowed. It stays an owner decision (Q-03) and is not in the MVP. | [V] S3 |
| Android 15+: only `dataSync` and `mediaProcessing` have a 6-hour limit. | No time limit applies to `specialUse`. | [V] S3 |
| Android 12+: the FGS notification may be delayed up to 10 seconds. | Use `FOREGROUND_SERVICE_IMMEDIATE` behaviour so the user sees it at once. | [V] S6, [P] |
| Android 13+: users can dismiss FGS notifications and can stop the app from the system "active apps" Task Manager. Notifications need `POST_NOTIFICATIONS`. | The orb may be stopped from outside the app at any time. If notifications are denied, the service still runs but the notification entry point is missing. | [P] S21 |
| Whether a `START_STICKY` restart after a low-memory kill is allowed to call `startForeground` on every OEM | Design for failure: on exception, stop quietly and show the orb again next time LAFINA opens. | [U] |

### 2.4 Starting the Quick Chat activity from the background

| Rule | Effect on the design | Label, source |
| --- | --- | --- |
| Since Android 10, background apps cannot start activities, with exceptions. Exceptions include "The app has a visible window" and "The app has the `SYSTEM_ALERT_WINDOW` permission granted by the user". | Tapping the orb may call `startActivity` directly from the service. | [V] S4 |
| A `PendingIntent` sent by the system after a notification tap may start an activity. | The service notification is a guaranteed second entry point. | [V] S4 |
| Android 14 (sender) and Android 15 (creator): an app must opt in before its own background-launch privilege is passed through a `PendingIntent`. `MODE_BACKGROUND_ACTIVITY_START_ALLOW_IF_VISIBLE` exists from SDK 36. | Prefer a direct `startActivity` for the orb tap. For notification actions, target the activity with `PendingIntent.getActivity` so the system performs the launch. | [V] S4 |
| Android 15: non-visible windows no longer count for background launch. | Do not rely on a hidden window as the launch justification. The permission itself is the basis. | [V] S3 |
| Android 16: `StrictMode.detectBlockedBackgroundActivityLaunch()`. | Enable in debug builds to catch blocked launches during validation. | [V] S4 |
| Android 17, targeting API 37: launch hardening extends to `IntentSender`; migrate off `MODE_BACKGROUND_ACTIVITY_START_ALLOWED`. | Not active at `targetSdk 36`. Record for the next target bump (R-16). | [V] S8 |

### 2.5 Microphone and audio

| Rule | Effect on the design | Label, source |
| --- | --- | --- |
| A `microphone` FGS cannot be created while the app is in the background. The exemption list does **not** include `SYSTEM_ALERT_WINDOW`. | A microphone inside a bare overlay is not possible. | [V] S1 |
| Recording needs the app to be "in use": a visible activity, or an FGS started while visible. | With Quick Chat as a visible activity, the existing push-to-talk STT works without any new service. | [V] S1 |
| Android 15+: audio focus needs the top app or an audio FGS. Android 17: background audio is restricted for all apps. | Spoken replies from Quick Chat only while its activity is visible. Text is always shown. | [V] S3, S9 |
| `RECORD_AUDIO` is a runtime permission whose dialog needs an activity. | Another reason for an activity host. | [P] |

### 2.6 Activity behaviour that affects `QuickChatActivity`

| Rule | Effect on the design | Label, source |
| --- | --- | --- |
| Android 15+ enforces edge-to-edge; Android 16 removes the opt-out. | The panel handles status, navigation and IME insets itself, as `ChatScreen` already does. `adjustResize` alone is not enough. | [V] S3, S7 |
| Android 16 (target 36): predictive back is on. `onBackPressed` is not called and `KEYCODE_BACK` is not dispatched. | Back must go through `OnBackInvokedCallback`. Verify React Native's `BackHandler` in the new activity during FLOAT-00. | [V] S7, [U] for RN behaviour |
| Android 16 (target 36): orientation, resizability and aspect-ratio limits are ignored on displays ≥ 600 dp. Android 17 removes the opt-out. | The panel must lay out correctly at any size and in multi-window. Do not lock orientation. | [V] S7, S8 |
| Android 17 (all apps): IME visibility is not restored after an unhandled configuration change. | `QuickChatActivity` handles `configChanges` itself like `MainActivity`, and re-focuses the input when needed. | [V] S9 |
| Android 17 (all apps): per-app memory limits by device RAM. | Adds weight to the memory risk (R-07). | [V] S9 |

### 2.7 By version

| Version | What matters here |
| --- | --- |
| Android 11 (min) | Overlay settings screen is the app list; one-time permissions; auto-reset of unused apps' runtime permissions (overlay is not a runtime permission) |
| Android 12 | Untrusted-touch blocking; `HIDE_OVERLAY_WINDOWS`; background FGS start limits; notification delay |
| Android 13 | `POST_NOTIFICATIONS`; FGS Task Manager; dismissible FGS notifications |
| Android 14 | FGS types mandatory; `specialUse`; `PendingIntent` sender opt-in |
| Android 15 | Overlay exemption needs a visible overlay; boot-start limits per type; edge-to-edge; creator opt-in |
| Android 16 (target) | Predictive back; no edge-to-edge opt-out; large-screen rules. **No overlay- or FGS-specific change found** on the target-36 page. |
| Android 17 | No mention of `SYSTEM_ALERT_WINDOW` or `TYPE_APPLICATION_OVERLAY` on either behaviour-change page. Background audio hardening, memory limits, IME restore, launch hardening for target 37. Bubbles became a windowing mode. |

## 3. React Native constraints (read in `node_modules/react-native`, version 0.86.0)

| # | Finding | Evidence | Consequence |
| --- | --- | --- | --- |
| 3.1 | One `ReactHost` can create several surfaces by component name. | `ReactAndroid/.../runtime/ReactHostImpl.kt:339-350` (`createSurface(context, moduleName, initialProps)`) | A second root component can share the runtime. |
| 3.2 | A second `ReactActivity` uses the same host through `ReactActivityDelegate` / `ReactDelegate`. | `ReactDelegate.kt:322-327` | `QuickChatActivity` needs no custom host code. |
| 3.3 | JS timers (`setTimeout`, `setInterval`, animation frames) are paused when the host is paused, unless a headless task is active. | `modules/core/JavaTimerManager.kt:72-76, 140-148, 291-293` | A React surface in a service-owned overlay would have frozen timers whenever no activity is resumed. The app's network client and streaming repaint use timers. |
| 3.4 | `onHostPause(activity)` asserts the activity is the current one ("Pausing an activity that is not the current activity…"), unless feature flag `skipActivityIdentityAssertionOnHostPause` is set. | `runtime/ReactHostImpl.kt:269-292` | Two simultaneously resumed React activities can crash. See R-02. |
| 3.5 | `onHostDestroy(activity)` does nothing if the activity is not the current one. | `ReactHostImpl.kt:314-322` | Destroying a stale Quick Chat does not tear down the main app's state. |
| 3.6 | `Alert`, `Modal`, permission requests and pickers need a current activity. | `modules/dialog/DialogModule.kt:167`, `views/modal/ReactModalHostView.kt:232, 275` | None work in a raw overlay. `CommandReviewCard`'s host screen and `sttService.ensureMicrophonePermission` depend on these. |
| 3.7 | `AppState` is per host, not per activity. | Follows from 3.2 | The main app's `AppState` listeners fire when Quick Chat resumes. See R-03. |

## 4. Approaches compared

### 4.1 Options

- **A1 Native Views only.** Orb and chat panel are Kotlin Views in overlay windows.
- **A2 Jetpack Compose.** Same, with Compose UI in a `ComposeView` attached to an overlay window.
- **A3 React Native surface in the overlay window.** A React surface hosted by the service, panel and orb in JS.
- **A4 Hybrid (recommended).** Native orb in an overlay window. Panel is a translucent second `ReactActivity`.
- **B Bubble API.** Conversation notification with `BubbleMetadata`; the system draws the bubble and hosts an activity.
- **C Lightweight entry points.** Notification action, app shortcut, Quick Settings tile, home-screen widget, Share-to-LAFINA. No overlay.

### 4.2 Comparison

| Criterion | A1 native | A2 Compose | A3 RN in overlay | **A4 hybrid** | B Bubbles | C entry points |
| --- | --- | --- | --- | --- | --- | --- |
| Always-visible orb | Yes | Yes | Yes | **Yes** | Only if the user allows bubbles for LAFINA; system-controlled | No |
| Extra permission | Overlay | Overlay | Overlay | **Overlay** | Notifications | None (notifications for the action) |
| Reuses `chatOrchestrator` and review flow | Only through a hidden JS bridge | Same as A1 | Yes | **Yes, directly** | Yes (it hosts an activity) | Yes |
| Reuses `CommandReviewCard`, theme | No, rewritten natively | No, rewritten | Partly; `Alert`, `Modal`, pickers break | **Yes** | Yes | Yes |
| Text input quality | Poor without focus tricks | Poor | Poor | **Normal activity IME** | Normal | Normal |
| Voice input possible | No (2.5) | No | No | **Yes** | Yes | Yes |
| Idle cost | Low | Low, plus Compose runtime | JS runtime must stay active | **Low: no JS while idle** | Lowest (system draws) | None |
| New dependencies | None | Compose compiler and libraries (Gradle change, APK size) | None | **None** | None | None |
| OEM launch restrictions | Not affected (no activity) | Not affected | Not affected | Affected (orb tap starts an activity) | System-managed | Not affected |
| Fits platform intent and Play policy | Allowed | Allowed | Allowed | **Allowed** | Weak: "use bubbles for messages by humans" | Strong |
| Native code to write and maintain | Very high | High | Medium | **Medium** | Low | Low each |
| Works on Android Go | No | No | No | Panel yes, orb no | Yes | Yes |

### 4.3 Why each alternative was not chosen

- **A1 / A2:** would require a second implementation of the review card (edit form, alternatives, delivery choice), Markdown replies and theming, and a custom bridge to reach the JS pipeline. That is a second assistant UI to keep in sync, which the brief forbids in spirit. A2 also adds Compose to a project that has none. A focusable overlay panel has known IME and back-key problems and cannot use the microphone.
- **A3:** blocked by 3.3 and 3.6, and by 2.5 for voice. It would also force the JS runtime to stay busy while the orb is merely idle if the orb itself were React.
- **B:** the Bubbles guide requires a conversation notification (`MessagingStyle`, `Person`, long-lived sharing shortcut), says to bubble only for ongoing communication or explicit user request, and says "use bubbles for messages by humans" (S5). The user can turn bubbles off per app. An always-available assistant shortcut is not what the API is for, and LAFINA would have to post a fake conversation notification to get one. Android 17 lets users bubble any multi-window app by long-pressing its launcher icon (S13, [S]); that gives LAFINA a system bubble of the **whole app** with no work, and is worth mentioning in help text, but it is not Quick Chat.
- **C:** cannot provide an always-visible orb, which is the requested experience. These are valuable **complements**: they open the same `QuickChatActivity` with no overlay permission, so they serve users who decline the permission and devices where it is unavailable.

### 4.4 Approach C details

| Entry point | Mechanism | Notes | Release |
| --- | --- | --- | --- |
| Service notification action "Open Quick Chat" | `PendingIntent.getActivity` on the FGS notification | Exists whenever the orb exists. Guaranteed launch path on OEMs that block orb taps. | MVP |
| App shortcut | Static shortcut in `res/xml/shortcuts.xml`, shown on launcher long-press | No permission. Whether a non-exported target activity is accepted must be verified. [U] (S22 [P]) | 1.1 |
| Quick Settings tile | `TileService`; on Android 14+ `startActivityAndCollapse(PendingIntent)` is required, the `Intent` overload throws | User must add the tile. (S14 [S]) | 1.1 or later |
| Home-screen widget | `AppWidgetProvider` with a launch `PendingIntent` | Android 17 enforces a bitmap memory limit for target 37 (S8 [V]). | Future |
| Share-to-LAFINA | `ACTION_SEND` `text/plain` filter on a small exported activity that forwards to Quick Chat | **Only on explicit user share.** Shared text is placed in the composer as a draft and never sent automatically. Treat it as untrusted text. (S23 [P]) | Future |

## 5. Community libraries

Search on 2026-11-17 found several small packages (`react-native-floating-bubble` by hybriteq and forks, `react-native-overlay-sdk`, `expo-draw-over-apps`, `expo-floating-bubble`). **[C]**

- None was verified against React Native 0.86 with the New Architecture. Forks report support only up to 0.72 or 0.76, some with no adoption. Two are Expo modules; this project does not use Expo.
- They draw a bubble and emit a tap event. They do not provide the panel, the service policy, or the launch handling this design needs.
- The project already registers its own Kotlin modules by hand and has a patch step for third-party Android libraries (`scripts/patch-android-libs.mjs`).

**Recommendation: add no dependency.** The orb is a few hundred lines of Kotlin that the team can own and test. `package.json` stays unchanged.

## 6. OEM behaviour

Only Pixel/AOSP behaviour is backed by official documentation. Everything else below is **[C]** or **[U]** and must be confirmed on real devices in FLOAT-07. No device was available in this research session.

| OEM | Reported behaviour | Planned handling |
| --- | --- | --- |
| Pixel / AOSP (Android 13–17) | Follows section 2. | Baseline for acceptance. |
| Samsung One UI | Overlay setting is named "Appear on top". Battery features ("Sleeping apps", "Deep sleeping apps") can stop background apps; older reports (2021) say foreground services were affected. | Help text: set LAFINA battery usage to Unrestricted if the orb disappears. |
| Xiaomi MIUI / HyperOS | A separate permission, "Display pop-up windows while running in the background", gates activity starts from the background even when overlay is granted. No public API to read it. Autostart and battery-saver settings also affect survival. Reports say HyperOS may reset the permission after updates. | Detect a failed launch (activity does not report in within a short window), show a hint on the orb and in settings, deep-link to app details as a best effort, keep the notification action as the fallback. |
| OPPO ColorOS / realme UI | Overlay is called "Floating windows" or similar; aggressive background cleanup; auto-launch setting. Realme specifics were not found. | Same help pattern. Treat as unverified. |
| Android Go devices | Overlay permission unavailable (2.1). | Hide the orb option, keep other entry points. |

References: S15, S16.

## 7. Google Play considerations

The app is currently distributed as a sideloaded preview signed with the debug key (`android/app/build.gradle:61-64`), so none of this blocks the MVP. It matters if the owner publishes on Google Play (Q-04). **Approval is never guaranteed.**

| Topic | Finding | Label |
| --- | --- | --- |
| FGS declaration | Apps targeting Android 14+ must declare each FGS type in Play Console (App content), with a description of the functionality, the user impact if the task is deferred or interrupted, and a link to a demo video. "All foreground service types are subject to review." `specialUse` is allowed "in limited scenarios". | [V] S25 |
| FGS expectations | The use must be user-initiated or user-perceptible, with a clear and accurate notification. | [V] S25 |
| Overlay permission | No dedicated Play Console declaration form for `SYSTEM_ALERT_WINDOW` was found. The permissions policy expects special permissions to be requested through the system settings page and only for features the user understands. | [S] S26, [U] |
| Deceptive behaviour | Apps must not "mimic functionality or warnings from the operating system or other apps", and must not interfere with other apps or their ads. | [S] S27, S28 |
| Data | The feature reads nothing from other apps. No new data type is collected. | Design fact |

How the design answers these: the orb is off by default and enabled by an explicit toggle after an explanation; it shows LAFINA's own branding; it is small, movable and dismissible; it shows a truthful ongoing notification with a Hide action; it never covers the screen with a pass-through layer; it has no Accessibility Service and no capture.

## 8. Recommendation

**A4 hybrid**, plus the notification action in the MVP, plus an app shortcut and a Quick Settings tile later as permission-free ways to open the same Quick Chat.

- **Why it fits:** it is the only option that gives a persistent orb, full reuse of LAFINA's assistant and confirmation UI, normal typing, and a path to voice, without new dependencies.
- **Alternatives evaluated:** section 4.
- **Trade-offs:** the app underneath is paused while the panel is open; OEM launch restrictions apply; the service keeps the app process in memory.
- **Integration:** `04-ARCHITECTURE-DESIGN.md`.
- **What could make it fail:** R-02 (React host with two activities), R-03 (reminder delivery while Quick Chat is in front), R-04 (OEM launch blocking), R-07 (memory). FLOAT-00 tests the first three before any feature work.

## 9. Unverified items carried into implementation

| Item | Where it is resolved |
| --- | --- |
| React Native `BackHandler` with predictive back in a second activity | FLOAT-00 |
| Host lifecycle with two React activities, including split-screen | FLOAT-00 |
| Overlay visibility on the lock screen and above the IME | FLOAT-02 |
| Sticky restart calling `startForeground` after a low-memory kill | FLOAT-07 |
| TalkBack access to a non-focusable overlay window | FLOAT-02, FLOAT-07 |
| All OEM rows in section 6 | FLOAT-07 |
| Play Console handling of the overlay permission | Before any Play submission |
| Play target-API deadlines | Before any Play submission |

## 10. Sources

Official pages opened and read on 2026-11-17:

- S1 Restrictions on starting a foreground service from the background — https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start
- S2 Foreground service types — https://developer.android.com/develop/background-work/services/fgs/service-types
- S3 Behavior changes: apps targeting Android 15 — https://developer.android.com/about/versions/15/behavior-changes-15
- S4 Restrictions on starting activities from the background — https://developer.android.com/guide/components/activities/background-starts
- S5 Use notification bubbles for conversations — https://developer.android.com/develop/ui/views/notifications/bubbles
- S6 Behavior changes: all apps (Android 12) — https://developer.android.com/about/versions/12/behavior-changes-all
- S7 Behavior changes: apps targeting Android 16 — https://developer.android.com/about/versions/16/behavior-changes-16
- S8 Behavior changes: apps targeting Android 17 — https://developer.android.com/about/versions/17/behavior-changes-17
- S9 Behavior changes: all apps (Android 17) — https://developer.android.com/about/versions/17/behavior-changes-all
- S10 Permissions updates in Android 11 — https://developer.android.com/about/versions/11/privacy/permissions
- S11 `Manifest.permission` reference (summary lines only; the page was truncated) — https://developer.android.com/reference/android/Manifest.permission
- S25 Understanding foreground service and full-screen intent requirements (Play Console Help) — https://support.google.com/googleplay/android-developer/answer/13392821

Official pages seen only through search summaries:

- S12 Behavior changes: all apps (Android 10), Go edition overlay restriction — https://developer.android.com/about/versions/10/behavior-changes-all
- S13 Bubbles (adaptive apps) — https://developer.android.com/develop/adaptive-apps/guides/support-bubbles
- S14 Custom Quick Settings tiles — https://developer.android.com/develop/ui/views/quicksettings-tiles ; Android 14 changes — https://developer.android.com/about/versions/14/behavior-changes-14
- S17 `Settings` reference — https://developer.android.com/reference/kotlin/android/provider/Settings
- S18 Device capability (Build for Billions) — https://developer.android.com/docs/quality-guidelines/build-for-billions/device-capacity
- S20 Secure sensitive activities — https://developer.android.com/security/fraud-prevention/activities
- S26 Permissions and APIs that Access Sensitive Information — https://support.google.com/googleplay/android-developer/answer/16558241
- S27 Deceptive Behavior — https://support.google.com/googleplay/android-developer/answer/9888077
- S28 Unauthorized Use or Imitation of System Functionality — https://support.google.com/googleplay/android-developer/answer/9969861
- Background audio hardening (Android 17) — https://developer.android.com/about/versions/17/changes/bg-audio

Official pages cited from prior knowledge, not re-opened this session:

- S19 `WindowManager.LayoutParams` — https://developer.android.com/reference/android/view/WindowManager.LayoutParams
- S21 Behavior changes: all apps (Android 13), FGS Task Manager — https://developer.android.com/about/versions/13/behavior-changes-all
- S22 App shortcuts — https://developer.android.com/develop/ui/views/launch/shortcuts
- S23 Receive simple data from other apps — https://developer.android.com/training/sharing/receive

Community sources:

- S15 Don't kill my app — https://dontkillmyapp.com ; coverage at https://9to5google.com/2021/02/18/samsung-background-apps-android-11/
- S16 Xiaomi pop-up permission — https://www.techbone.net/xiaomi/smartphone/display-pop-up-windows ; Stack Overflow question 59418504 (mirror: https://kiwix.lema.org/stackoverflow.com_en_all_2023-11/questions/59645936/displaying-popup-windows-while-running-in-the-background)
- S24 `canDrawOverlays` timing — https://issuetracker.google.com/issues/62047810
- Libraries — https://github.com/hybriteq/react-native-floating-bubble ; https://www.pkgstats.com/pkg:react-native-overlay-sdk ; https://www.pkgstats.com/pkg:expo-draw-over-apps
