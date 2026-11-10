# Independent audit: account-bound Clear All Data remediation

Date: 2026-11-07 (Asia/Manila). Checkout: `C:\L3mxr\Github Repositories\LAFINA-CAPSTONE-agy-development-cont`. Branch: `codex/agy-preservation-improvements`. Audited HEAD: `8823b11ac5b8c81cf504ad2cb85ad7c9a8446128`. Implementation commit: `c015719`.

## Verdict

**The two original reproductions are fixed in host verification. One related attachment-retry defect remains (P2 priority). REQUEST CHANGES for that defect before calling the whole reset flow complete.**

The stale-confirmation and failed-Notes-read tests from the preceding independent audit now both pass, unchanged. The session guard, strict reads and atomic planner reset address the corresponding root causes. However, an attachment unlink failure permanently loses its retry reference when the chat row is deleted. The offered retry then reports full success while the file still exists. A new independent synthetic regression reproduces this behavior.

AGY's protected features show no regression in the reviewed diff and independently rerun host contracts. This is scoped host verification, not proof of phone, emulator or live backend behavior. Overall acceptance remains PARTIAL / AWAITING DEVICE VALIDATION.

## Actionable finding

### C1 [P2]: A failed attachment cleanup cannot be retried, but the retry reports full success

Locations: `src/storage/accountDataReset.ts:144-146` and `src/ui/screens/ProfileScreen.tsx:275-310`.

The reset reads attachment URIs, deletes chat messages with `chatStore.clearHistory`, and returns URIs only in memory. Profile then attempts unlink asynchronously. On failure, it correctly reports the number of files not removed and tells the user to try Clear All Data again. But by then the owning chat row and its URI are gone. The next reset sees no attachment URIs, performs no further unlink, and displays `Data Cleared` even though the file remains in storage.

Independent reproduction, with synthetic data and an in-memory filesystem fake:

1. Create one owned chat attachment and make unlink reject once.
2. Run Clear All Data: first alert is `Data Partly Cleared`, file still exists, and the alert offers a retry.
3. Make unlink work again and repeat Clear All Data.
4. The second alert says `Data Cleared`; the file still exists, no URI remains in chat, and unlink has been called only once across both runs.

This does not invalidate the repaired SQL-read case. It does invalidate the broader claim that retries and full-success messages account for all previously failed attachment cleanup. It can also leave personal generated documents on disk after the user believes cleanup completed.

Fix direction: retain owner-bound cleanup obligations durably before deleting their only metadata references; retry them and remove obligations only after confirmed deletion or confirmed absence. A transactionally recorded pending-cleanup queue is one option. Preserve account isolation and existing document ownership rules; never compensate by wiping a shared attachment directory. Keep the truthful partial result until outstanding cleanup is confirmed. Include a two-attempt regression and a restart/recovery test if cleanup state becomes durable. Correct the remediation report/SUMMARY claims after the implementation, and rebuild QA APKs and issue fresh receipts.

## Source assessment of the original fixes

### P1 stale confirmation: PASS in scoped host verification

- Confirmation captures the owner and sign-in epoch at open.
- The process-local generation changes on `setCurrentUser`, logout and guest linking, so replacing a same-owner session also invalidates an old confirmation.
- Admission checks live session and caller liveness before writes, again within the planner transaction, and before later database steps.
- Refused entry changes no data. Existing session token refresh paths remain distinct from a fresh sign-in.
- The reviewed diff adds epoch bookkeeping without changing account credentials, tier gates or cloud wire behavior.
- UI and storage tests cover account switch, unmount, logout, same-owner sign-in, guest link, unreadable session and missing authority. The original independent stale-callback reproduction also passes.

### P2 swallowed planner read: PASS for the original database failure

- Strict getters use the same SQL as the unchanged display getters and propagate errors.
- Existing store delete APIs retain tombstones, outbox deletes and after-commit reminder cancellation.
- Planner deletion is one transaction with live-row verification; errors roll back that planner step.
- Chat/defaults outcomes remain independently reported, including the original F3 event-default error case.
- Tests exercise failure for every planner listing and a partial-write rollback. The original independent read-failure test now passes.
- Attachment cleanup has the remaining C1 exception described above.

Native alarm cancellation remains best-effort after commit; the older ADR-023 process-death window is unchanged and not fixed by this work.

## Independently executed verification

New evidence directory, relative to this report:
`evidence/codex-clear-data-audit-8823b11-20261107/`.

| Check | Independent result | Evidence |
| --- | --- | --- |
| Focused reset, Preview and protected AGY suites | 15 suites, **263 tests PASS**, 0 failed/skipped | `focused-and-preservation.json`, `.log`, `commands.json` |
| Previous independent reset regressions, unmodified | **2 tests PASS** | `original-independent.json`, `.log` |
| New attachment retry regression | **1 test FAIL**, at the assertion that the file must no longer exist | `attachment-retry.json`, `.log`, `independentAttachmentRetry.test.tsx`, separate `jest-audit.config.cjs` |
| TypeScript | PASS on retry with bounded 768 MB heap | `typecheck-retry.json`, `.log` |
| Full repository ESLint invocation | PASS, zero warnings | `lint.log`, `static-checks.json` |
| Architecture checker | PASS | `architecture.log`, `static-checks.json` |

The first independent TypeScript attempt exhausted the intentionally small 384 MB heap (exit 134). Its log is retained as `typecheck.log`; it was not a type-error result. A single 768 MB retry passed. No app build was performed during this audit.

The 263-test run includes the new storage/UI suites (27 tests), all 29 F1-F3 remediation regressions, and Claude's 207-test protected subset. The protected subset includes PF01-PF13 contracts, frozen evaluation contracts, account-owned chat, profile/health/preferences, calendar/notes and speech. Native/cloud/filesystem adapters in host tests are stand-ins.

The new independent test lives outside normal application test discovery and uses a separate config. It uses synthetic owner/document data only and no actual filesystem deletion. Application code, existing tests, historical evidence and user data were not modified.

The saved full preflight log reports **52 suites, 740 passed, one existing opt-in benchmark skipped**. The saved forced Gradle run records executed `testDebugUnitTest` and `BUILD SUCCESSFUL`. Independently aggregating current saved Kotlin XML gives **6 suites / 43 tests / zero failures, errors or skips** (`saved-native-results.json`). The full 740-test run, Kotlin execution and Gradle builds were inspected, not rerun by this audit.

## QA APK verification

Both APKs on disk match the new receipts exactly:

| APK | SHA-256 |
| --- | --- |
| `android/app/build/outputs/apk/dataQa/app-arm64-v8a-dataQa.apk` | `94c5d9ad7c67feb7698c61bdcc2941a9f5dcd9617299b88a5df8b56d703a9a04` |
| `android/app/build/outputs/apk/dataQa/app-x86_64-dataQa.apk` | `9f04fb3832962ec5a843f20d27785a306a77c974a5486a8de7f2e72880cd1183` |

Independently checked:

- Each contains only its intended native ABI.
- Both packaged JavaScript bundles hash to `09e25695a0833f661749b1da78b8782ae547783ccc2ab5c1b5b36711420ea199`, matching the reported bundle built from `c015719`.
- All seven reported new-fix markers and the existing `Starting Preview` control are present in both bundles (ASCII or UTF-16LE).
- Both contain Whisper `ggml-base.en-q5_1.bin` and Silero VAD `silero_vad.onnx`; their full hashes are saved. No Kokoro filenames were found.
- Each has **16/16 native ELF libraries** satisfying the checked 16 KiB PT_LOAD alignment and congruence requirements. No stored-entry ZIP alignment failures were found.
- Installed SDK `zipalign -c -P 16 4` independently exits 0 for both APKs.
- Installed SDK apksigner independently verifies both APKs with v2 signatures and one signer. Certificate SHA-256 is unchanged: `acf890c33d9f7252cca541e5c60166fdf49d47b28313bf678bebb8fb0f62dd5e`.
- Installed SDK aapt2 confirms `com.lafina.capstone`, versionCode 6, `0.6.0-data-qa`, target SDK 36. Its permission lists match the prior saved receipt. This does not compare any real phone's installed signer.

Evidence: `artifact-verification.json`, `sdk-checks.json` and per-ABI signer/zipalign/identity logs.

These are genuine updated artifacts containing the reset changes. They also contain the C1 behavior found above; successful artifact audits are not functional acceptance. The current hashes must not be reused after further fixes.

## AGY preservation and documentation

- Git comparison from `7b3b183` shows no changes to `android`, package manifests/lock, `src/cloud`, `src/sync`, `src/ai`, `src/skills`, evaluation fixtures or existing test files. Only two new normal test files were added. Runtime/test/build-script diff from build commit `c015719` to current HEAD is empty.
- Changes are concentrated in reset orchestration, strict read helpers, attachment cleanup reporting and session epoch bookkeeping. Account/guest paths were reviewed because the new epoch bookkeeping touches them.
- No regression was observed in protected host contracts for accounts/subscriptions, cloud/sync, online AI/Handbook RAG, documents/meetings, or speech. This audit does not claim an exhaustive new review of all earlier AGY port commits.
- ADR-025 explains the reset design. SUMMARY, remediation report, preservation tracking and M19 document the new behavior and keep overall acceptance PARTIAL. Their broad attachment-confirmation/retry claims need qualification for C1.
- All M01-M19 phone, emulator and live-service procedures remain NOT_RUN. There was no installation, live login/sync/subscription/RAG/document request, actual recording, native audio or alarm-delivery test.
- Existing claims that `c015719` has only self-review are historical as of this independent audit; link this report when updating tracking.
- Git had no tracked working-tree changes before or after executable verification. Audit evidence and this report are new, uncommitted files. No commits, pushes, merges or deployments were performed.

## Recommended handoff

Fix C1, keep both original regressions and the 263 passing tests, add durable attachment-retry coverage, update the docs and regenerate both QA APKs/receipts. Keep accounts and document ownership intact. Real-device acceptance remains a separate unperformed step.

**Audit disposition: original P1 and database P2 accepted within host scope; REQUEST CHANGES for C1. Overall PARTIAL / AWAITING DEVICE VALIDATION.**
