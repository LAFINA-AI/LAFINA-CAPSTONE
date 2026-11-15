# ADR-035 — Five tabs: Home | Schedule | AI | Notes | Profile

**Status:** accepted (owner: "proceed fix all", 2026-11-15, after `docs/plans/tab-redesign-plan.md`)
**Date:** 2026-11-15
**Scope:** tab plan T1
**Review owner:** human developer

## Context / problem

The owner asked for a tab bar that reads like Home | Schedule | AI | Notes | Profile. They also asked where alarms should live, and whether Profile should leave the bar.

## Decision

1. **Five tabs in this order:** Home, Schedule, AI, Notes, Profile.
   - **AI** is the centred, raised tab (`CENTER_TAB = 'chat'`), since asking LAFINA is the main action.
   - Labels and order come from `TAB_ORDER` and `TAB_LABELS` in `CustomTabBar.tsx`.
2. **Internal keys are unchanged** (`dashboard`, `calendar`, `chat`, `notes`, `profile`). Navigation, deep links, the product tour and tests keep working; only labels, icons and order changed.
3. **Alarms live inside Schedule** as a `Calendar | Alarms` switch at the top of the tab (`scheduleSection`).
   - They are not a sixth tab: a bar with five or more entries crowds small Android phones, and alarms are part of planning the day.
   - Shortcuts: Home shows a "Next alarm" card only when an alarm is on, and Profile → Alarm & Reminder Health covers alarm reliability.
4. **Profile stays a tab.** It holds account, sync, preferences and reliability health, which students need to reach in one tap when something doesn't ring.
5. **The product tour** follows the new order: welcome, Home, Schedule, AI, Notes, account, done.

## Consequences

- **Deviation from the plan:** the Home "Next alarm" card is a fixed card above the widgets, not a customizable widget. It hides itself when no alarm is on.
- **Not yet checked on a device:** the raised AI tab and the Schedule switch at 320 dp widths, and with large fonts.
