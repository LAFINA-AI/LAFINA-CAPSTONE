# Phase 07.1 presentation provenance

Incoming reference: LAFINA-AI/LAFINA-CAPSTONE commit
`9c183a20eca2377b5e54f219c5f83460b18af81b`, fetched/pulled 2026-10-26.
Owner previously confirmed authorization to reuse original code/brand, with
details to follow; see [Phase04 provenance](phase-04-provenance.md). No new
assumption about public licensing or third-party redistribution is made.

| Incoming path | Integrated adaptation |
|---|---|
| `src/ui/screens/calendar/components/MonthView.tsx` | `features/calendar/CalendarMonth.tsx`: month layout and date selection; replace account/store scans, tiny text, device-local conversion and gesture logic with typed date-only model, 48dp targets and current day-page queries. |
| `src/ui/components/CustomTabBar.tsx` | Rounded navigation styling in existing `app/App.tsx`; preserve Today/Calendar/Chat/Settings and dirty-navigation guards. No profile/notes/mic action or tour dependency. |
| `src/ui/contexts/ThemeContext.tsx` | Warm light canvas/dark neutral surface values folded into existing `core/theme/theme.ts`; accessible existing accent pairs retained. No second provider or native screenshot reveal. |
| `src/assets/lafina_app_logo.png` | One reviewed 361×341 transparent local brand image, copied byte-for-byte to `src/assets/lafina_app_logo.png`; display48dp, decorative. 118,291 bytes, SHA256 `9bf96c77876d283982af6df36b4fcf4e422fa05627bca93f55b5fc4658072ae0`. |

No new package, engine, model or remote service is added. Incoming model binaries,
cloud/account/sync/update code, alternative stores, native speech/reminder engines
and entire legacy dependency graph are excluded from the integrated tree. They
remain in fetched upstream Git history. Existing pinned Whisper source/model
license/checksum ledgers and bundled notices remain authoritative. The legacy
repository itself is not modified.

Publication/attribution details for owner-provided brand/code remain pending;
this local integration is not publication or approval to redistribute unknown
assets/models. Pasted secrets were not written to configuration or source.
