# AGY-PORT 09 — reminder health, explicit preferences and statistics

Prerequisites: 03, 04, 06. Inventory: 15, 16, 20. Protect PF01–PF04, PF09–PF12.

## Navigate

Target Profile/preferences/pro/subscription/account-link sections, reminder permission state, store aggregates, AppState return handling and manual/assistant event drafts. Donor reminderHealthStore/scheduler health/Profile component, personalMemoryStore/PersonalMemory, profileStatisticsStore/ProfileStats and related tests.

## Execute

1. Add owner-scoped health that separates notification/exact/full-screen permission state from queued/blocked/inexact/ringing/registered delivery evidence. Refresh after returning from settings and offer bounded recovery. Registration requested is not 'reminder rang'. Reject stale-account results.
2. Add opt-in local event start/duration preferences with reviewed save, explicit Apply, correction, expiry, disable and Forget. Keep existing profile preferences and subscription/account controls. Do not infer from history, apply automatically to saved events or upload to unverified server fields. Guest link preserves established destination choices.
3. Replace inferred voice totals with actual aggregate task/Note counts and a clearly labeled reminder outcome metric if available. Suggested on-time rate: acknowledged without snooze divided by acknowledged+missed, with No data before outcomes exist. Treat read failure as unavailable; do not count words/flags as spoken commands or ACK as task completed.
4. Preserve UI hierarchy/theme and existing pro banners/role-gated speech/online settings. New cards/controls must not crowd out or hide account/subscription/cloud/document/meeting access.
5. Test permission return, blocked/recovery states, stale owners, memory revision/draft conflicts/expiry/Forget/rekey, empty/failing aggregate reads and metric denominators. Run entitlement/Profile/guest/speech/call suites plus full gates.

## Acceptance

Health explains delivery constraints honestly; preferences apply only on explicit action; statistics derive from actual records. Existing account/tier/cloud/voice settings remain reachable with unchanged access rules.

Deliver `reports/phase-09-health-preferences-stats.md`, metric definition/local-only preference notes and manual permission/defaults/statistics checklist.
