# 03 — UI/UX Specification

- **Status:** design proposal. Nothing here is built. All sizes, durations and copy are **proposed** values to be tuned on a device.
- **Naming:** the feature is "Floating LAFINA" in settings; the panel is "Quick Chat". Final names are an owner choice (Q-06).
- Theme tokens named here exist in `src/ui/theme/` (see `01-REPOSITORY-AUDIT.md` §7).

## 1. Principles

1. **Optional and honest.** Off by default. A notification is always visible while the orb is on. One gesture hides it.
2. **Capture, confirm, return.** The fastest path is: tap, type, review, Confirm, back to the previous app.
3. **Nothing is saved without Confirm.** The same review card as the Chat tab.
4. **Same LAFINA.** Same colors, type, wording and card as the main app.
5. **Never in the way.** Small, movable, fades when idle, hidden where it does not belong.
6. **No listening, no reading.** The microphone is used only while the user holds the mic button (v1.1). The orb never reads the screen.

## 2. Pattern research

| Pattern | What is borrowed | What is not |
| --- | --- | --- |
| Messenger chat heads | Draggable disc, snaps to left or right edge, drag to a bottom target to remove | Stacked heads, unread previews |
| Android system bubbles | Expanded content is a real activity anchored near the bubble; system-like dismiss target | System ownership of position and visibility |
| Assistant overlays (Google Assistant, Gemini) | Compact bottom panel over a dimmed app, input first, one answer at a time | Reading the current screen |
| Samsung edge panels, MIUI floating ball | Idle fade and edge docking | Multi-level radial menus |
| Screen recorders | Ongoing notification with Stop | — |

Sizing basis: Android accessibility guidance asks for touch targets of at least 48 × 48 dp; Material's standard floating action button is 56 dp. Both are from prior knowledge and were not re-opened this session.

## 3. State 1: collapsed orb

### 3.1 Three visual concepts

| | A. Brand disc (recommended) | B. Glass ring | C. Edge tab |
| --- | --- | --- | --- |
| Shape | Solid circle | Circle, surface-colored, with a colored ring | Half pill attached to the screen edge |
| Fill | Theme primary (classic: LAFINA red; modern: the user's palette primary) | `cardBg` with a 3 dp primary ring | Theme primary |
| Glyph | White LAFINA mark, 28 dp | Primary-colored mark, 28 dp | White mark, 20 dp |
| Size | 56 dp | 56 dp | 28 × 56 dp visible |
| Strength | Most recognisable; strong contrast on any background; easiest to draw natively | Calmer; follows light and dark | Smallest obstruction |
| Weakness | Most noticeable | Low contrast over light apps in light theme | Small target; easy to miss; harder to drag |

**Recommendation: Concept A for the MVP**, with the idle fade below. Concept C's edge tuck can be added in 1.1 as an idle state of A. Owner confirms in Q-05.

**Asset gap (verified):** the native side has only a placeholder "L" launcher vector (`res/drawable/ic_launcher.xml`). The real logo exists as PNG files in `src/assets/` for the JS side. The orb needs a native drawable. Until the owner supplies a vector mark, use the existing launcher icon resource as the glyph.

### 3.2 Orb specification (Concept A)

| Property | Value |
| --- | --- |
| Visual diameter | 56 dp |
| Touch target (window size) | 64 × 64 dp (4 dp transparent padding on each side for the shadow and easier grabbing) |
| Ring | 2 dp white at 90% opacity, so the orb stays visible over backgrounds of the same color |
| Shadow | Soft, equivalent to 6 dp elevation |
| Default position | Right edge, 35% down from the top of the usable area |
| Edge margin | 8 dp from the screen edge after snapping |
| Vertical limits | 8 dp below the status bar or cutout; 8 dp above the navigation bar |
| Idle | After 5 s without touch: opacity 0.55 |
| Touch down | Opacity 1.0, scale 0.94 |
| Dragging | Scale 1.06, follows the finger exactly |
| Tap vs drag | Movement under the system touch slop is a tap |
| Release | Animates to the nearest left or right edge, 200 ms decelerate |
| Reduced motion | When system animations are off, the orb jumps to the edge with no animation and no scale effects |
| Rotation, fold, display change | Position is stored as edge + vertical fraction and re-applied to the new bounds |
| Position memory | Saved on every release; restored on next show |

### 3.3 Gestures

| Gesture | Result |
| --- | --- |
| Tap | Open Quick Chat |
| Drag | Move; snaps to an edge on release |
| Drag to the "Hide" target | A 64 dp circular target with an X appears at the bottom center while dragging. Dropping the orb on it hides the orb. A short toast says: "Floating LAFINA hidden. It returns when you open LAFINA." |
| Long press | No action in the MVP (reserved; avoids hidden behaviour) |

"Hide" stops the service and removes the notification. The setting stays on, so the orb returns the next time the user opens LAFINA. Turning the feature off is done in settings.

### 3.4 When the orb is not shown

| Situation | Behaviour | Release |
| --- | --- | --- |
| LAFINA's main screen is in front | Hidden (the app is already open) | MVP |
| Quick Chat is open | Hidden (the panel replaces it) | MVP |
| Screen off or locked | Hidden | MVP |
| A system or app screen hides overlays (permission dialogs, some banking apps) | Hidden by the system; returns afterwards | Platform behaviour |
| Overlay permission revoked | Service stops; settings show "Permission needed" | MVP |
| Full-screen video or game | Stays visible but faded in the MVP; user can drag to Hide. Automatic fade-out in full screen is a 1.1 item because detection must not use other apps' data. | 1.1 |
| Keyboard open in another app | May be covered by the keyboard. No special handling in the MVP. | 1.1 |
| Incoming reminder call or alarm screen | Those screens take over; the orb stays out of the way (hidden while LAFINA screens are in front) | MVP |

### 3.5 Orb accessibility

- Content description: "LAFINA Quick Chat. Double tap to open."
- Custom accessibility actions, because dragging is not possible with a screen reader: "Move to left edge", "Move to right edge", "Hide".
- The service notification offers the same Open and Hide actions as a guaranteed accessible route.
- Glyph against fill must reach at least 3:1 contrast for every palette. Check each modern palette's primary; fall back to brand red if one fails.

## 4. State 2: expanded Quick Chat

### 4.1 Layout

A bottom-anchored sheet inside a translucent activity. The app underneath stays visible, dimmed.

| Property | Value |
| --- | --- |
| Scrim | `colors.overlay` at about 35% effective opacity. Tap closes the panel (unless a card is open; see 7.3). |
| Width | Screen width minus 2 × `Spacing.lg` (16 dp); maximum 420 dp; centered |
| Height | Wraps content. Minimum 220 dp. Maximum 62% of the window height, or the space above the keyboard minus 24 dp, whichever is smaller. Content scrolls inside. |
| Bottom gap | `Spacing.md` (12 dp) above the navigation bar or the keyboard |
| Corners | 24 dp sheet; inner cards use `Layout.borderRadiusCard` (16) |
| Surface | `colors.surface`; divider `colors.divider`; modern variant uses `modernPalette` and `modernShadows` like other modern cards |
| Open animation | Fade + 16 dp rise, 180 ms. Reduced motion: fade only, 80 ms. |
| Landscape | Same sheet, maximum height = window height minus insets and 16 dp; transcript area shrinks first |
| Tablets and foldables (≥ 600 dp) | Same sheet, 420 dp wide, bottom center. Works in multi-window. |

### 4.2 Wireframe: first open

```
 (previous app, dimmed)

 ┌──────────────────────────────────────────┐
 │ (L) Quick Chat      ● Offline    ↗    ✕  │  header 48dp
 ├──────────────────────────────────────────┤
 │  What do you need to add?                │  hint, textSecondary
 │                                          │
 │  [ + Schedule ] [ ⏰ Reminder ] [ ✎ Note ]│  quick actions (State 3)
 ├──────────────────────────────────────────┤
 │ ┌──────────────────────────────┐  ┌───┐  │
 │ │ Message LAFINA               │  │ ➤ │  │  composer, send 48dp
 │ └──────────────────────────────┘  └───┘  │
 └──────────────────────────────────────────┘
 ══════════════ keyboard ════════════════════
```

### 4.3 Elements

| Element | Behaviour |
| --- | --- |
| Header mark + title | "Quick Chat". `Fonts.heading`, `FontSize.bodyLarge`. |
| Status chip | "Online" when Online Mode is active for this user; "Offline" otherwise. Tapping shows one line of explanation. It mirrors the Chat tab's Online Mode setting and does not change it. |
| Open LAFINA (↗) | Opens the main app on the Chat tab and closes the panel. Label: "Open LAFINA". |
| Close (✕) | Closes the panel. The draft text and any open card are kept while the app process lives. |
| Composer | Multiline, grows to 4 lines. Placeholder "Message LAFINA". Auto-focused on open. Send is disabled when empty or while a request runs. |
| Mic (v1.1) | Hold to speak, to the left of Send. Not shown in the MVP. |
| Transcript | Only the current session's turns, newest at the bottom. Reuses the main app's reply rendering. Kept in memory only. |
| Back gesture | Closes the keyboard first, then the panel. |

Typing must feel immediate: the composer is focused as soon as the panel appears.

## 5. State 3: quick actions

Chips shown when the transcript is empty and no card is open.

| Chip | Action |
| --- | --- |
| Schedule | Puts a starter in the composer (for example "Add ") and focuses it |
| Reminder | Starter "Remind me to " |
| Note | Starter "Note: " |

- Chips **never send anything**. They only prefill.
- Starter phrases must be ones the existing parser understands. The exact strings are confirmed against `src/ai/nlu/fastPathParser.ts` in FLOAT-05, and may change.
- "Ask LAFINA" needs no chip: the composer is already focused.
- "Call LAFINA" is not offered here. Live calls stop when the app is backgrounded (ADR-031). The ↗ button is the way into the full app.
- Chip style: `Layout.borderRadiusPill`, 40 dp tall with 48 dp touch height, icon from `lucide-react-native` + label.

## 6. State 4: AI processing

```
 │                         Add my networking │
 │                     exam this Friday 9 AM │  user bubble
 │  ● ● ●  Working on it…                    │  TypingBubble + label
 ├──────────────────────────────────────────┤
 │ [ Message LAFINA           ]   [ ■ Stop ] │
```

| Rule | Detail |
| --- | --- |
| Feedback within 100 ms | The user's message appears immediately; the typing indicator follows |
| Honest labels only | "Working on it…" for every request. After 8 s: "Still working…". No invented stage names. |
| Streaming | When the online reply streams, text appears as it arrives (the pipeline already supports this) |
| Stop | Send turns into Stop while a request runs. Stop discards the pending reply; nothing is saved. |
| One request at a time | Send is disabled until the request ends |
| Closing the panel mid-request | The request may finish in the background. If it produced a card, the card is shown when the panel is reopened. |

## 7. State 5: confirmation

### 7.1 Card

The existing `CommandReviewCard` is used unchanged, so users see exactly the card they know from the Chat tab: heading, title, details, "Assumed" list, warnings, free-time alternatives, reminder delivery choice, Edit, Cancel and Confirm.

```
 │ ┌──────────────────────────────────────┐ │
 │ │ Create event                         │ │
 │ │ Networking Exam                      │ │
 │ │ Fri, Nov 20 · 9:00 AM – 10:00 AM     │ │
 │ │ Reminder: rings 15 minutes before    │ │
 │ │ Assumed: 1 hour long                 │ │
 │ │ ⚠ Overlaps "Data Structures" 9–10:30 │ │
 │ │ Free instead: [10:30 AM] [1:00 PM]   │ │
 │ │                                      │ │
 │ │ [ Edit ]      [ Cancel ]  [ Confirm ]│ │
 │ └──────────────────────────────────────┘ │
```

The example values are illustrative. Real text comes from the proposal.

### 7.2 Rules

| Rule | Detail |
| --- | --- |
| Confirm by button only | Typing "yes" does not confirm in Quick Chat. This is how Temporary Chat mode already behaves, and it is the safer choice for a small window. |
| Edit | Uses the card's inline edit form. The panel grows to its maximum height and scrolls. |
| Missing information | When the pipeline asks a question instead of proposing (for example no time given), the question is shown as a normal reply and the user answers in the composer. |
| Ambiguous dates | The card's "Assumed" lines state what was assumed. The user edits or cancels. |
| Conflicts | Shown as a warning with one-tap alternatives. Confirm stays available; the user decides. |
| Expiry | After 30 minutes the card shows as expired with Dismiss only (existing behaviour). |
| Double tap | The Confirm button is disabled while saving (existing `busy` state). |
| One card at a time | A new request replaces the open card in Quick Chat only. It never touches a card open in the Chat tab or in Voice. |

### 7.3 Protecting an open card

While a card is open, tapping the scrim does **not** close the panel; it only dismisses the keyboard. Close (✕) and Back still close it. This prevents losing a card to a stray tap. A card is kept if the panel is closed and reopened while the app process lives.

## 8. State 6: completed

```
 │ ┌──────────────────────────────────────┐ │
 │ │ ✓ Added to your calendar             │ │
 │ │ Networking Exam                      │ │
 │ │ Fri, Nov 20 · 9:00 AM                │ │
 │ │                                      │ │
 │ │ [ View in LAFINA ]         [ Done ]  │ │
 │ └──────────────────────────────────────┘ │
```

| Element | Behaviour |
| --- | --- |
| Message | The confirmation text returned by the existing confirm call. Success color `colors.success`. |
| Done | Closes the panel and returns to the previous app. Primary button. |
| View in LAFINA | Opens the main app at the item (or at its date if the item cannot be addressed) and closes the panel. |
| Add another | Typing in the composer starts a new request; the success card scrolls up. |
| Undo | Only for the quick low-risk actions that already offer Undo (for example marking a task done). Shown with the existing Undo pattern for its 2-minute window. |
| Screen reader | The success message is announced. |
| No auto-close | The panel does not close by itself; the user chooses Done. |

## 9. State 7: offline and error states

| Situation | What the user sees | Action offered |
| --- | --- | --- |
| No internet, request is a schedule, reminder or note | Works normally. Chip shows "Offline". | — |
| No internet, request needs online AI | The pipeline's own offline reply, plus its note that online answers need a connection | Try again later |
| Guest or signed out, Online Mode wanted | "Sign in to use Online Mode. Offline chat, scheduling and voice keep working." (existing text) | Open LAFINA |
| Online request failed or timed out | The pipeline's failure message; the user's text is put back in the composer | Send again |
| Request not understood | LAFINA's normal clarifying reply | Rephrase |
| Confirm failed while saving | Card stays open with "Could not save. Try again." | Confirm again, Cancel |
| Card no longer valid (expired, changed elsewhere, session ended) | "This request is no longer current. Please ask again." Card is removed. | Ask again |
| No user set up or signed out | "Open LAFINA to finish setting up." No composer. | Open LAFINA |
| Storage problem | "LAFINA's storage needs attention." No composer. | Open LAFINA |
| Overlay permission revoked | Orb disappears. Settings row shows "Permission needed". | Fix in settings |
| Orb tap could not open the panel (OEM restriction) | Small label next to the orb for 4 s: "Can't open here. Use the LAFINA notification." Settings show device-specific help. | Notification action |
| Microphone denied or busy (v1.1) | "Microphone not available." Typing keeps working. | Open app settings |

Wording rule: say what happened and what the user can do. No blame, no technical codes.

## 10. Settings and permission flow

### 10.1 Location

There is no "Settings → Assistant" screen in the app. The setting goes in the existing Profile screen, next to the other assistant rows ("Offline Voice", "Online Voice · ElevenLabs"), as one `SettingItem` row **"Floating LAFINA"** that opens a settings sheet, the same pattern as those rows.

### 10.2 Settings sheet

```
 Floating LAFINA
 A small LAFINA button that stays on screen so you can
 add schedules, reminders and notes from any app.

 Show floating button                       [  OFF ]
 Status: Off

 ── When on ─────────────────────────────────────────
 • LAFINA shows a notification while the button is on.
 • The button never listens and never reads your screen.
 • Drag it to the X to hide it.

 Reset button position                          [ › ]
 Trouble seeing the button?                     [ › ]
```

| Control | MVP | Later |
| --- | --- | --- |
| Show floating button (default **off**) | Yes | |
| Status line: Off / On / Permission needed / Hidden until you open LAFINA / Not available on this device | Yes | |
| Reset button position | Yes | |
| "Trouble seeing the button?" help (battery and OEM guidance, notification permission) | Yes | |
| Idle fade strength, auto-hide in full screen | | 1.1 |
| Show after phone restart (default off) | | 1.1, owner decision Q-03 |
| Voice input in Quick Chat | | 1.1 |

### 10.3 Turning it on

```
Toggle on
  └─ Explainer sheet
       "Allow LAFINA to appear on top"
       Why: to keep the LAFINA button visible over other apps.
       What it does not do: read your screen, listen, or track other apps.
       Next: Android opens a list. Find LAFINA and turn it on.
       [ Not now ]   [ Continue ]
            └─ Continue → system "Display over other apps" list
                  └─ user returns to LAFINA
                        ├─ granted → orb appears when you leave LAFINA; toggle stays on
                        └─ not granted → toggle returns to off; one line: "Permission not granted. Quick Chat is still available from the notification…" (only if another entry point exists)
```

- The explainer is shown **before** the system screen, every time the permission is missing.
- If notifications are blocked, show one extra line recommending notifications so the Open and Hide actions are available. Do not block enabling.
- No nagging: LAFINA never asks again by itself after "Not now".
- Turning off needs no confirmation and takes effect immediately.

## 11. Voice input (v1.1 design)

| Item | Decision |
| --- | --- |
| Interaction | Hold the mic button to speak, release to transcribe, slide away to cancel. Same as the Chat tab. |
| Result | The transcript is placed in the composer and sent, exactly as typed text would be. Confirmation still needs the button. |
| Indicator | Recording state on the button plus the system microphone indicator |
| Permission | Asked on first use, inside Quick Chat |
| Never | No wake word, no listening when the button is not held, no recording while the panel is closed |

## 12. Visual identity rules

- Use `useTheme()` and `useThemedStyles()`; no hard-coded colors in the panel.
- Follow the user's dark mode, UI variant (classic or modern) and modern palette.
- Type: `Fonts.heading` for titles, `Fonts.body` for text; sizes from `FontSize`.
- Spacing from `Spacing`; radii from `Layout`.
- Icons from `lucide-react-native`, 20 dp in buttons.
- The native orb receives its fill color from the JS theme when the service starts and whenever the theme changes. It defaults to brand red.

## 13. Accessibility checklist

- Every control has a label and a role; touch targets are at least 48 dp.
- Focus order: header, transcript, card, composer, send.
- New replies and the success message are announced.
- Works at 200% font scale: the panel scrolls; nothing is clipped.
- Reduced motion is respected in the panel (`useReducedMotion`) and in the orb.
- Color is never the only signal (icons and text accompany status colors).
- The feature is fully usable without dragging (accessibility actions and notification actions).
