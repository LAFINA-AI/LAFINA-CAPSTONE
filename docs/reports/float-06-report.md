# PHASE FLOAT-06 — Settings, permission onboarding and help / Completion Report

**Branch / commit SHA:** `feature/lafina-floating-assistant` (from `d331b97`). No commit made.
**Date/time UTC:** 2026-11-17
**Device(s) available:** None (see FLOAT-03 report).
**Status:** `READY FOR REVIEW` (automated gates PASS; settings walk-through PASS on the Infinix)
**Phase approval provenance:** As FLOAT-03.

## 1. Scope completed

| Task (`05` FLOAT-06) | Result |
| --- | --- |
| 1. Profile row with a value reflecting status | Done: `useFloatingAssistantSummary` reads the native status on mount, on return to LAFINA and after changes (fixes the FLOAT-02 row, which never showed "Permission needed") |
| 2. Sheet per `03` §10.2, refreshed on focus and resume, delayed second read after Android settings | Done (second read 700 ms after returning) |
| 3. Explainer before the system screen; "Not now" leaves everything off; no re-prompt | Done; copy from `03` §10.3 ("Allow LAFINA to appear on top", why / what it does not do / "Android opens a list…") |
| 4. Per-user `floatingAssistant.enabled`; native mirror; apply on user change | Done (FLOAT-02 + `applyFloatingAssistantForUser`, FLOAT-03) |
| 5. Help: notifications off, battery, device note when `launchBlockedSeen`, "Open app settings" | Done ("Trouble seeing the button?") |
| 6. Unsupported device state | Done ("Not available on this device") |
| 7. User-facing docs | Done: `docs/10-SECURITY-AND-PRIVACY.md` (the two permissions and their limits), `docs/11-UX-AND-ONBOARDING.md` (not part of onboarding; how it is turned on) |

Also: "Reset button position" row; one extra line when notifications are off (enabling is not blocked); returning without the grant leaves the switch off with "Permission not granted. Floating LAFINA stays off. You can turn it on again any time."

## 2. Change summary

| File/module | Change | Test evidence |
|---|---|---|
| `src/ui/components/profile/FloatingAssistantSettings.tsx` | Full sheet, summary values, summary hook | J-16 (11 tests) |
| `src/ui/screens/ProfileScreen.tsx` | Row value from the summary hook (replaces the FLOAT-02 local state) | 14 existing Profile suites PASS |
| `__tests__/ui/floatingAssistantSettings.test.tsx` | 6 more J-16 tests | PASS |
| `docs/10-SECURITY-AND-PRIVACY.md`, `docs/11-UX-AND-ONBOARDING.md` | Short Floating LAFINA paragraphs | — |

## 3. Tests and real outcomes

| Check | Result |
|---|---|
| J-16: default off; explainer before `openOverlaySettings`; granted → `setEnabled(true, userId)`; every status string (Off, On, Permission needed, Hidden until you open LAFINA, Not available on this device); return without grant → decided only after the second read, stays off, one line, no `setEnabled`; grant seen only on the second read → on; notifications-off line without blocking; Reset position; help with the blocked-launch note; Open app settings; switching to a student who has not turned it on → `setEnabled(false, …)`; signed out → off | PASS 11/11 |
| Profile suites (`grep -rl ProfileScreen __tests__`, 14 files) | PASS |
| Typecheck, lint, architecture | PASS (`docs/reports/evidence/float-03/`) |
| Full `npm run preflight` | PASS: 159 suites, 2137 passed, 1 skipped (`docs/reports/evidence/float-03/preflight.log`), run 2026-11-17 after the Codex session finished |

## 4. Device results

Infinix X6880 (`docs/reports/evidence/float-03/device-checks.md`): Profile row "Permission needed" after a revoke; explainer before the XOS overlay list; back without granting → "Off." + one line; granting → turns on by itself, orb after Home; Reset position; help; turn off → service, orb and notification gone at once. **Found and fixed on the device:** with the permission revoked while on, there was no direct way to fix it and returning without the grant left the switch on under a "stays off" message. Now an "Allow" button under "Permission needed" opens the explainer, and returning without the grant turns the setting off (J-16 test added; re-checked on the phone).

## 6. Human phone verification (short)

1. Profile → Floating LAFINA → turn on: the "Allow LAFINA to appear on top" explanation appears first.
2. Continue → Android's list → come back without allowing: the switch is off with one line saying so.
3. Do it again and allow LAFINA: the switch turns on by itself; leave LAFINA and the button appears.
4. Turn it off: the button and its notification disappear at once.
5. "Trouble seeing the button?" and "Reset button position" respond.

## 9. Review decision

- [x] All automated required checks passing (preflight and Gradle, see FLOAT-03 report)
- [x] Device checks complete
- [x] Copy reviewed against `03` §10; docs updated
- [x] Report accurate

STATUS: READY FOR REVIEW
