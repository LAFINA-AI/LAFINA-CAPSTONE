# ADR-001 — Independent capstone and conditional source reuse

**Status:** accepted scope direction; individual source ports pending human review  
**Date:** 2026-10-21  
**Phase:** 00  
**Review owner:** human developer

## Context / problem

F-001–F-015 require a student-only offline app. The new repo has no runtime code;
the local legacy checkout is dirty and lacks the requested pin. Public pinned
source has no root license; business/auth/cloud coupling prevents wholesale reuse.

## Decision

Audit GitHub source at `f7e70aec54e6d16e627f444f2a67114cbfb07b5e` read-only.
Maintain an independent repository. Install only the supplied planning kit now.
Later ports must be narrow, separately reviewed, tested and provenance-cleared.
No model/credential/database/business/history/dependency-tree copy. No old AGENTS.

## Alternatives considered

Whole-app copy rejected for scope/coupling/provenance. Dirty local HEAD rejected
as reproducible control. Full rewrite of every component is unnecessary; use the
[file-specific candidates](../audits/phase-00-reuse.md) after review.

## Impact

Smaller runtime/privacy surface and explicit ownership; source/brand clearance
can delay ports. No performance improvement is claimed.

## Measurements/verification

Pinned tree resolved; all 56 listed kit hashes matched (57 files with manifest).
Runtime/native measurements NOT RUN.
See [inventory](../audits/phase-00-inventory.md) and Phase 00 report.

User confirmed legacy source/brand authorization on 2026-10-21: “I have
authorization; details to follow.” Record attribution/publication details when
supplied; separately verify third-party source/model/voice terms.

## Rollback

Revert planning branch changes. No legacy files or runtime data changed.

## Human approval

User authorized Phase 00 and confirmed source/brand reuse permission. Phase 01
approval remains pending; this ADR does not authorize implementation.
