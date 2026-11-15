# Tab bar redesign plan (draft for owner approval)

**Status:** proposal only, not implemented. It needs explicit approval (`APPROVE TAB PHASE T1`).
**Date:** 2026-11-15
**Related:** `docs/plans/alarm-feature-plan.md` and `docs/reports/agent-audit-2-2026-11-15.md`

## 1. Today

`src/ui/components/CustomTabBar.tsx` renders **Chat | Calendar | Dashboard (raised, centre) | Notes | Profile**.

- `TabType` keys: `chat`, `calendar`, `dashboard`, `notes`, `profile`.
- Home is `dashboard` (`App.tsx:110`).
- To-Dos live in Notes (`TodoListView`).
- Alarms exist only as reminders titled "Alarm", plus a debug "alarms" tab in `DeveloperModal`.

## 2. Proposal

**Home | Schedule | AI (raised, centre) | Notes | Profile**

| Tab | Was | Contains |
|---|---|---|
| Home | Dashboard | Today at a glance: the existing widgets (Up Next, Today's Schedule, Tasks Due, Reminders, Free Study Blocks, Pinned Notes) plus a new **Next alarm** widget |
| Schedule | Calendar | Top switch **Calendar / Alarms**. Calendar keeps its Month / Week toggle. Alarms is the list and editor from the alarm plan. |
| AI | Chat | Chat, Call Lafina and handbook mode. Moved to the centre as LAFINA's main feature. |
| Notes | Notes | Notes and To-Dos (unchanged) |
| Profile | Profile | Account, sync, preferences, plus a new **Alarm and reminder health** row (exact-alarm, full-screen and notification permissions; battery guidance; "test alarm in 1 minute") |

### Where alarms go: inside Schedule, not a tab of their own

- **One home for everything with a time.** Students already go to Schedule for classes, events, time blocks and reminders. An alarm is one more thing with a time, so a separate tab would split that.
- **It is used little.** An alarm is set once and then rings by itself, so it doesn't earn one of five slots. The ringing screen works without opening the app.
- **Faster ways in:**
  - the **Next alarm** widget on Home (shows the next alarm and its toggle; tap opens Schedule → Alarms);
  - the AI tab ("wake me up at 6 on weekdays");
  - Android's own status-bar alarm icon, which comes free with `setAlarmClock`.
- **Rejected options:**
  - an Alarms tab that replaces Profile (it loses settings, see §2.2);
  - alarms inside Profile (students don't look for time-based things in settings);
  - a third Month / Week / Alarms toggle (it mixes calendar views with a list).

### Keep Profile as a tab

- **Symmetry:** five tabs keep AI exactly in the centre. With four, the raised AI button would sit off centre, or Home would have to become the centre.
- **It matters more with alarms:** alarm reliability depends on permissions and battery settings. A visible Profile tab is where a warning badge ("Alarms may not ring: allow exact alarms") can show up and be found.
- **Guest to account:** guest students upgrade to a cloud account from Profile, and hiding it behind an avatar lowers that discoverability.
- **Fallback if you still want Profile out:** move it to an avatar at the top right of Home, and make the bar **Home | Schedule | AI | Notes**, with AI as a normal (non-raised) tab. That's a valid, common pattern, but I'd only pick it if the bar feels crowded on small phones.

## 3. Implementation notes

1. **Keep the internal keys** (`dashboard`, `calendar`, `chat`, `notes`, `profile`) and change only the labels, icons and order.
   - Renaming the keys would touch call navigation (`setCallNavigation({screen: 'calendar'})`), the tour anchors (`tab-dashboard`, …), the deep links from Dashboard widgets and the tests, all for no user-visible gain.
   - Add a mapping such as `TAB_LABELS` in `CustomTabBar.tsx`.
2. **Order:** `renderTab('dashboard', 'Home', Home)`, `('calendar', 'Schedule', CalendarDays)`, `('chat', 'AI', Sparkles, raised)`, `('notes', 'Notes', FileText)`, `('profile', 'Profile', User)`.
   - The icons come from `lucide-react-native`, which is already a dependency.
3. **The raised centre style moves from Dashboard to AI.** Check that the Call Lafina mini-bar and the chat composer don't overlap the raised button (`BAR_BOTTOM_OFFSET`, safe-area insets).
4. **Schedule screen:** add a `Calendar | Alarms` segmented control above the existing Month / Week toggle, using the same `toggleRow` style. Alarms is an empty placeholder until alarm phase A2. Hide the switch until then, so no empty feature ships.
5. **Home widget:** add a "Next alarm" widget to `CustomizeDashboardModal`, hidden until alarms exist.
6. **Product tour** (`tourSteps.ts`): new copy and order for Home, Schedule, AI, Notes and Profile, with the same anchors.
7. **Accessibility:** labels are "Home tab", "Schedule tab", "AI tab", "Notes tab" and "Profile tab". Keep the 48 dp touch targets, and check font scaling at 1.3×, where the labels must not wrap.

## 4. Gates

- **Automated:** `npm run preflight`; update the tab-bar and tour snapshot tests; a Jest test that every `TabType` has a label and an anchor; `gradlew assembleDebug`.
- **Device (human):**
  - small phone (≈ 360 dp wide) and a large phone;
  - light and dark theme;
  - font scale 1.3;
  - Call Lafina minimised over each tab;
  - the product tour from start to finish.

## 5. Order of work (all plans)

| Step | Work | Source |
|---|---|---|
| 1 | **B1**: recurring reminders continue after a miss (alarm A0) | audit 2 |
| 2 | **B2 + B3**: Chat and Call Lafina follow-ups that point back at the conversation | audit 2 |
| 3 | **T1**: tab bar redesign (labels, order, AI in the centre, Profile health row) | this plan |
| 4 | **A1**: native alarm core | alarm plan |
| 5 | **A2**: alarm data and UI, which fills the Schedule → Alarms switch and the Home widget | alarm plan |
| 6 | **A3**: alarm language and agent; **B6/B7** with it, since they touch the same tool fields | alarm plan, audit 2 |
| 7 | **A4**: "Alarm" reminder migration and morning briefing; **B4/B5/B8** when convenient | alarm plan, audit 2 |

T1 comes before A2, so the alarm UI lands in its final place and is laid out only once.
