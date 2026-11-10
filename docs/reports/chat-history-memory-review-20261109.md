# Chat history and memory — review, 2026-11-09

Review of Claude's pasted handoff against the current checkout. This is an audit, not a completed implementation phase. No application or backend source was changed during this review. Review-only tests and logs are in `.local/`.

## Decision

The main feature implementation exists, but it is not ready to call complete. Four additional regression checks reproduce defects, the full preflight command exits 1, and release/device verification remains unfinished.

## Implemented

- Schema 25 adds a device-local memory table and chat ownership indexes.
- Multiple chats per account, creation, opening, search, renaming, deletion and session-scoped history/replies.
- Online chat carries saved memories; successful, uninterrupted conversation replies trigger background extraction.
- Profile Memory controls, manual additions, deletion, forgetting all, a memory switch, and per-reply notices with Undo.
- Account reset and guest-link integration, plus storage, service and UI tests.
- Backend memory prompt integration and authenticated extraction route, committed as `0c914e9` on `codex/chat-memory`.

## Confirmed defects

1. **High: a pending extraction can recreate cleared memory.** `src/cloud/chatMemoryService.ts:80` only checks the enabled flag after awaiting the server. Clearing chat history and memories does not invalidate that work. The result is applied even when the associated reply was deleted; the false result from `setMemoryChanges` is ignored. The audit reproduces a memory reappearing after both stores were cleared. Forget Everything also needs protection against pending responses. Add a durable memory/reset revision and validate the reply/session before applying results.
2. **Medium: memory can be saved without the promised notice or Undo.** `src/cloud/chatMemoryService.ts:81` commits memory changes before separately persisting reply metadata at line 83. If that second write throws, the service returns null but the memory stays saved. The audit injects a metadata-write failure and confirms this. Save both changes in one transaction, and make Undo metadata updates atomic too.
3. **Medium: Undo loses an older memory at capacity.** `src/storage/chatMemoryStore.ts:74` silently evicts old rows beyond 100; `applyChanges` does not include those evictions in its change record. Starting with 100 memories, adding one and undoing leaves 99. Record complete eviction snapshots and restore them during Undo.
4. **Medium: the chat request to forget everything cannot address all stored memories.** The phone stores 100, but `forPrompt` sends only the newest 40 to extraction. The backend can only return removal IDs it received. With 60 saved memories, a simulated response removing every supplied ID leaves 20. The separate Profile Forget Everything button clears the entire table; this finding concerns the natural-language chat path. Provide a validated clear-all result or a local owner-scoped forget-all action rather than relying on the bounded prompt list.

## Verification

| Check | Result | Evidence |
| --- | --- | --- |
| `npm run preflight` | **FAIL, exit 1** | `.local/chat-memory-review-preflight.log` |
| TypeScript and ESLint within preflight | PASS | Same log |
| Existing Jest assertions | 74 suites passed; 1,112 tests passed, 1 skipped | Same log |
| Jest lifecycle | FAIL: background memory extraction runs after teardown; `ReferenceError` and `Cannot log after tests are done`, including `voiceModeStreaming.test.tsx` | Same log, first error near line 1249 |
| `npm run check:architecture` separately | PASS: 249 modules, 0 cycles, 0 forbidden dependencies | `.local/chat-memory-review-architecture.log` |
| Review-only regression tests | **4 failed / 4**, reproducing the four findings above | `.local/chat-memory-review.test.ts`, `.local/chat-memory-review-edge-cases.log` |
| Backend pytest rerun | Did not complete or produce output; interrupted. Claude's reported 214 backend passes are not independently certified here. | `.local/chat-memory-review-backend.log` |
| Android Gradle / new APK | NOT RUN in this review | No new build evidence |
| Device testing | NOT RUN; no device inspected | No device identifier recorded |
| Live production route | Unverified: local request for OpenAPI failed DNS resolution | This does not establish production downtime |

The full gate did not reach its architecture step because Jest exited 1 despite all its assertions passing. Existing tests that stub successful online replies must also isolate/await the newly introduced background extraction. The additional four review checks are outside the default test match and did not cause the full preflight failure.

Reproduce the supplemental checks from the repo root:

```powershell
npx jest --runInBand --testMatch '**/.local/chat-memory-review.test.ts' --runTestsByPath .local/chat-memory-review.test.ts
```

## Backend and release state

GitHub read-only checks confirmed `codex/chat-memory` exists and is one commit ahead of `main`, zero behind. The comparison contains only `app/api/v1/ai.py`, `app/services/chat_memory.py`, and `tests/test_chat_memory.py`. No pull request was found for that head branch. Comparison: https://github.com/LAFINA-AI/LAFINA-backend/compare/main...codex/chat-memory

The mobile feature is still in the working tree, including untracked new source and test files. Do not lose those files. There are other pre-existing changes, including LoginScreen work, so do not commit the entire working tree blindly.

Remaining work: fix the four defects and test teardown, rerun all gates, record Android verification, commit the reviewed mobile changes, arrange the authorized backend review/merge/deployment, and verify the deployed contract and signed-in flow. No merge, push, deployment, APK installation, or next phase was performed in this audit.

## Manual verification still required

After fixes and an updated APK/backend are available:

1. Install/open the updated Android build. Create two chats; rename, search, reopen and delete one. Restart the app and confirm the other chat remains intact.
2. Sign in and enable Online Mode. State a harmless lasting preference. Expect a memory notice, inspect it in Profile, start another chat and confirm the preference is used, then exercise Undo and the memory switch.
3. Clear memories while extraction is pending. Expect them to stay cleared after the response and an app restart. Test natural-language forget-all with more than 40 memories and Undo at 100 memories.
4. Switch accounts and test offline text chat; expect owner isolation and a working offline conversation.

All manual checks above remain NOT RUN.
