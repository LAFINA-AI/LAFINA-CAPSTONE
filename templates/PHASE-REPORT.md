# PHASE NN — <Phase title> / Completion Report

**Branch / commit SHA:** <sha>  
**Date/time UTC:** <ISO>  
**Device(s) available:** <model/API/tier or NONE>  
**Status:** `READY FOR REVIEW` | `AWAITING DEVICE VALIDATION` | `BLOCKED`  
**Phase approval provenance:** <user approval message>  

## 1. Scope completed

List completed requirements by ID (F-001 ...). Describe observable behavior and any approved deviations. Distinguish newly implemented, selectively ported from legacy (pin path/commit), refactored, and deferred.

## 2. Change summary

| File/module | Change | Reason | Test evidence |
|---|---|---|---|
| <path> | <what> | <why> | <test id/log> |

## 3. Tests and real outcomes

| Check | Exact command or manual procedure | PASS/FAIL/NOT RUN/HUMAN REQUIRED | Evidence path / error |
|---|---|---|---|
| Typecheck | ... | ... | ... |
| Lint | ... | ... | ... |
| Jest | ... | ... | ... |
| Android build | ... | ... | ... |
| Device manual | ... | ... | ... |

**Never label not-run checks as pass**. Tooling unavailable = NOT RUN + exact blocking prerequisite. No fictitious benchmark numbers.

## 4. Performance and device matrix

Baseline (old commit/device/build): ______ or NOT RUN. New build: ______. Record actual p50/p95/n, peak PSS, speech offline proof, alarm drift. Link raw CSV/JSON. If not applicable state N/A.

## 5. Reliability, privacy, permissions, licenses

List important failures, required app permissions, missing fallback, security/copyright/provenance concerns, and outstanding severity.

## 6. Human phone verification

Detailed steps, preconditions, expected on-screen result, expected audio/notification, how to collect privacy-safe log, and note what agent cannot certify.

## 7. Docs/ADRs changed

Links to readme, architecture, schema, diagrams and decisions. Graphify/import cycle result with actual command or NOT RUN.

## 8. Open blockers and recommended next steps

Priority-ranked defects and proposed fixes, but **DO NOT START NEXT PHASE**. If incomplete, say explicitly which gates remain unmet.

## 9. Review decision

- [ ] All automated required checks passing
- [ ] Manual device tests completed and human-confirmed (if required)
- [ ] No disallowed scope/code change
- [ ] Report accurate, links validated, docs updated

**End of Codex message:** `STATUS: ...` then `STOPPED — awaiting explicit human approval`.
