# ADR-021: Overnight events on the existing wire, timezone metadata on this device only

**Status:** accepted (owner pre-authorized AGY-PORT 00–13 in `docs/plans/agy-improvements/OWNER-AUTHORIZATION.md`)
**Date:** 2026-11-06
**Phase:** AGY-PORT 08 (inventory 14, client side of 29)
**Review owner:** human developer

## Context / problem

An AGY event is `date`, `start_time` and `end_time`. These are floating wall times: they mean whatever the device's timezone is. Before this phase:

- **Overnight events.**
  - Calendar layout already drew an end at or before the start as ending the next day, and the fast-path parser created such events ("9 pm to 1 am").
  - The Calendar form refused them, except for a `00:00` end.
  - The chat conflict check ignored them entirely.
  - ICS export wrote `DTEND` on the start date, which put the end before the start.
- **Timezones and clock changes.**
  - A reminder stores an absolute UTC instant, but the event it belongs to does not. After a timezone change, the Calendar showed the wall time while the alarm kept the old instant, and nothing said why.
  - The form saved times the clocks skip (a DST gap). JavaScript `Date` silently moved the reminder an hour.
  - A repeated time (a DST fold) was resolved arbitrarily.
- **ICS import.**
  - An invalid date became today.
  - A UTC (`Z`) time was read as a wall time, eight hours off in Manila.
  - A multi-day span was cut to its start date.

The donor (LAFINA, ADR-004, `eventTime.ts` blob `bf62db10`) adds six columns to `events`: `end_date`, `time_zone`, `start_at`, `end_at`, `start_fold` and `end_fold`. It syncs them, which needs a backend change: the donor's `EventPayload` with `extra="forbid"`.

AGY's mobile app talks to the deployed `LAFINA-backend`. Nothing here shows that server accepts more than the seven current event fields, and the backend is out of scope (inventory 29: `DEFERRED_EXTERNAL`).

## Decision

### 1. The wire stays frozen

The event payload is still exactly these seven fields:

`title`, `date`, `start_time`, `end_time`, `location`, `linked_calendar_block`, `recurrence_rule`

This holds for creates, updates, guest re-creates and imports. Nothing in this phase reads or writes the sync worker's event code. The other six entity payloads are untouched, and the existing preservation test freezes all seven payload shapes.

### 2. Overnight uses the convention AGY already has

- **Rule:** an end at or before the start ends on the next day (`eventEndDate`, `endsNextDay`). Spans are at most 24 hours. The same rule is now applied in:
  - the form
  - the conflict check
  - ICS
  - review summaries
  - Calendar labels
- **Cross-device:** every AGY device already draws an end before the start as overnight, so overnight events sync with no new field.
- **New saves:** an equal start and end is refused. Legacy rows keep their meaning (Calendar still draws them as 24 hours), and an edit that leaves the time untouched is not re-checked.

### 3. Timezone metadata is local to this device

Schema 22 adds `event_time_local`, a side table the sync worker never touches. Each row holds:

- the IANA timezone
- the exact UTC `start_at` and `end_at`
- the earlier/later choice, kept only where the time really happens twice
- the base wall time the row was computed from

Rules:

- **Writes.**
  - Every local write that sets an event's wall time records the device timezone in the same transaction (`tasksStore.insertEvent` / `updateEvent`). This covers the form, reviewed commands, the legacy executor and imports.
  - A title-only edit does not record it again.
  - Sync pulls write `events` directly and never record.
- **Exact or nothing.** If the engine cannot say the timezone, the time falls in a gap, or the time is repeated with no choice made, no row is kept and the event stays floating, exactly as before. Metadata never blocks an event write.
- **Engine self-check.** `deviceTimeZone()` first checks, on known instants, that the engine formats 24-hour wall time. If it does not, metadata is off. An engine quirk on a device can therefore never make the form refuse a valid time.
- **Validity.** A row counts only while its owner and base wall time equal the event's (`VALID_EVENT_TIME_JOIN`). Triggers also delete it when the event's date, start or end changes, whoever wrote it, and on soft or hard delete.
- **Ownership.** When an event changes owner (guest linking), its row follows. Reads are always scoped to the event's owner.
- **Revisions and outbox.** Metadata adds no outbox row and no revision bump. The event write itself bumps as before.

### 4. Omission is not a clear

An old server sends the seven fields only. A pulled change with the same wall time (for example a rename on the laptop) keeps the local metadata.

A pulled change to the date, start or end drops it. The other device sent a floating time with no zone, so the event becomes floating again: it means what every other device already shows, and no false UTC instant is kept. A remote delete drops it too.

This phase adds no explicit-null semantics, because no server here is evidenced to send them.

### 5. The form validates against the device timezone

For a new or changed event time, the form:

- refuses an equal start and end;
- refuses a time the clocks skip, saying so;
- for a repeated time, asks **Earlier** or **Later** and records the choice.

The new reminder uses the resolved instant, so a chosen repeated time rings at the chosen instant. The form shows "Ends the next day (date)". When it edits an event saved here in another timezone, it says the saved timezone is local to this device and that a changed time is saved in the current one.

### 6. Calendar and conflicts

- **Calendar.** An overnight event's label says "next day". When the device is now in another timezone, the label names the saved timezone. Its position stays its saved wall time; nothing is converted silently. Recurring occurrences keep the timezone but not the base date's instants.
- **Conflict check.** It reads one window from the day before to the day after. Overnight items from the day before, and overnight proposals into the next day, are now checked. Same-day results are unchanged, and an equal start and end is still not checked.

### 7. ICS

- **Export.**
  - A floating overnight event or block writes `DTEND` on the next date.
  - A non-recurring event with valid local metadata exports its exact UTC instants (`…Z`).
  - Recurring events stay floating, because a UTC `DTSTART` with an `RRULE` would drift across DST.
- **Import, non-recurring.**
  - UTC values and known `TZID` values are converted exactly into the device timezone. A repeated time keeps the file's instant as an earlier/later choice.
  - Floating values stay as written.
  - Whether a value is UTC is read from the file text, because `ical-js-parser` appends `Z` to floating times.
- **Import, refused.** These are skipped and counted, and the import prompt says how many:
  - an invalid date or time anywhere in a VEVENT/VTODO (it used to become today);
  - a `TZID` time the clocks skip;
  - an end before its start;
  - a span over 24 hours.

  LAFINA's own older exports, which wrote an overnight end on the start date, still import as overnight.
- **Unchanged.** Recurring imports, `RECURRENCE-ID` overrides, date-only items, VTODO due times and the foreign-VEVENT-to-time-block rule.

## What is local-only (exact list)

| Field | Where | Synced? |
|---|---|---|
| Overnight (end ≤ start means next day) | the existing `start_time`/`end_time` | **Yes.** It is the existing wire convention. |
| End date | derived from the wall times, not stored | Implied by the wire |
| IANA timezone | `event_time_local.time_zone` | **No.** This device only. |
| UTC start/end instants | `event_time_local.start_at`/`end_at` | **No.** |
| Earlier/later choice | `event_time_local.start_fold`/`end_fold` | **No.** |

**Cross-device limitation:** another device, or this device after reinstalling and syncing, sees the event as floating wall time. It has no timezone label, and its alarm is computed in its own timezone.

## Deferred

- **DEFERRED_EXTERNAL (inventory 29):**
  - a backend contract that stores and returns timezone metadata, with omission/null semantics and old-client merge;
  - any cross-device timezone guarantee.

  These need a backend change and a controlled server. Nothing here was deployed or edited.
- **Events longer than 24 hours.** The wire cannot express them, so the form cannot create them and imports skip them.
- **Recurring and override imports.** These keep their legacy floating expansion, in which a UTC recurring source is still read as wall time.
- **Native.** No native change: alarms already use absolute instants.

## Consequences

- **Floating, as before:** legacy events, events pulled from other devices, events whose time another device changed, and every event on an engine without usable `Intl` time zones.
- **Form refusals:** gap times and equal start/end times on new or changed events. A repeated time asks one question.
- **Import:** some files now import fewer items, always with a count saying so, where they used to import wrong ones.
- **Conflict check:** it reads three days instead of one. It is still one bounded, indexed query.
