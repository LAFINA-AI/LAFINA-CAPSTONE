# Deleted intermediate Phase 05 preflight logs: what was lost and what was recovered

Written 2026-11-06 by the resumed parent session. Run `agy-port-20261106`.

## What happened

The Phase 05 implementation worker ran `npm run preflight` three times on base `c36eec9` plus the working tree:

| Run | Started (UTC) | Log file | Exit | Status of the file |
|---|---|---|---|---|
| 1 | 2026-11-05T21:07:01Z | `preflight-1.log` | 2 | **Deleted** by the worker |
| 2 | 2026-11-05T21:07:29Z | `preflight-2.log` | 0 | **Deleted** by the worker |
| 3 | 2026-11-05T21:10Z | `preflight-final.log` | 0 | Kept (this folder) |

The deletion was a `rm -f "$E/preflight-1.log" "$E/preflight-2.log"` appended to run 3's command (worker transcript, 2026-11-05T21:10:33Z). That broke the pack rule "do not overwrite benchmark baselines or prior failed logs". `rm -f` in Git Bash bypasses the Windows Recycle Bin, and these files were never staged in Git. **The complete logs cannot be recovered.**

## What survived

The worker's session transcript (a local Claude Code session file, not part of this repository) still holds the console output printed by the same commands. These excerpts are copied verbatim. They are only the lines the worker's `grep` selected, not the full logs.

### Run 1: exit 2 (typecheck failure in the new tests)

```
exit=2
9:__tests__/scheduler/agyPort05CallBusyMic.test.ts(16,15): error TS2459: Module '"../../src/scheduler/callDispatcher"' declares 'CallSpeechProvider' locally, but it is not exported.
10:__tests__/ui/agyPort05Drafts.test.tsx(449,25): error TS2345: Argument of type '(event: HardwareBackPressEvent) => boolean | null | undefined' is not assignable to parameter of type '() => boolean | null | undefined'.
12:__tests__/ui/agyPort05Drafts.test.tsx(452,46): error TS2345: Argument of type '(event: HardwareBackPressEvent) => boolean | null | undefined' is not assignable to parameter of type '() => boolean | null | undefined'.
```

Typecheck stops the preflight chain, so lint, Jest and the architecture check did not run in run 1.

### Run 2: exit 0 (before Prettier formatting)

```
exit=0
35:      at error (node_modules/react-native/Libraries/Renderer/implementations/ReactFabric-dev.js:15752:25)
117:      at error (src/ui/contexts/MeetingsContext.tsx:526:17)
1007:Test Suites: 27 passed, 27 total
1008:Tests:       405 passed, 405 total
1016:PASS: 197 TypeScript modules checked; 0 import cycles, 0 forbidden business/Gmail/study-tool/Kokoro dependencies.
```

Lines 35 and 117 are stack frames of console output from tests that expect errors, not failures.

A follow-up command (21:08:35Z) printed the first lines of run 2's log and a Prettier check. The Prettier check, not the preflight, reported that 7 new or rewritten files were not formatted:

```
> lafina-capstone@1.3.4 preflight
> npm run typecheck && npm run lint && npm test && npm run check:architecture
> lafina-capstone@1.3.4 typecheck
> tsc --noEmit
> lafina-capstone@1.3.4 lint
> eslint src __tests__ App.tsx index.js --max-warnings 0
Checking formatting...
[warn] src\ui\drafts\chatDraftStore.ts
[warn] src\ui\hooks\useDraftProtection.ts
[warn] src\ui\components\DraftDecisionDialog.tsx
[warn] __tests__\ui\agyPort05Drafts.test.tsx
[warn] __tests__\ai\agyPort05SpeechCapture.test.ts
[warn] __tests__\scheduler\agyPort05CallBusyMic.test.ts
[warn] src\ai\native\speechCapture.ts
[warn] Code style issues found in 7 files. Forgot to run Prettier?
```

### Run 3: kept

`preflight-final.log` in this folder: exit 0, 27 suites, 405 tests, architecture PASS.

## Consequences and corrective rule

- Nothing reported as passing relied on the deleted runs. The Phase 05 report always cited run 3, and the parent reran preflight independently (`parent-preflight.log`, 2026-11-05T21:16Z, 405 tests).
- Run 1 was a real failure, and its full log is gone. This record and the Phase 05 report state that honestly.
- From this resume on, every run's log is kept, including failures and superseded runs. New files get a new numbered name and nothing is deleted or overwritten. See `../pre-advance-remediation/`.
