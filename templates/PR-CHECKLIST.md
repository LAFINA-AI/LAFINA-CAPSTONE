# Pull Request Checklist

**Phase:** NN  
**Requirement IDs:** F-___  
**Legacy source ports:** <source pinned path/SHA or NONE>  

- [ ] Only the currently approved phase is modified; no business/accounts/cloud added before relevant phase.
- [ ] New components use semantic theme tokens and accessible states.
- [ ] Domain logic remains UI/backend-independent.
- [ ] Offline core paths do not access network/require login.
- [ ] Typecheck/lint/tests run and actual outputs recorded.
- [ ] Native Android device test plan attached; results or `HUMAN REQUIRED`.
- [ ] Performance/battery/memory changes measured or explicitly pending.
- [ ] New dependency and model license/provenance evaluated.
- [ ] Security/privacy: no secrets, raw student audio, private data in logs.
- [ ] Docs/ADRs/reports updated; Graphify/import graph checked where appropriate.
- [ ] No unapproved future phase changes.
- [ ] Rollback/migration policy documented.
