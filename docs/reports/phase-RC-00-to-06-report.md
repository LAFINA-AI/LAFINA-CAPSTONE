# PHASE RC-00 to RC-06 — Call LAFINA reconnect and call memory / Completion Report

**Branch / commit SHA:** `main` at `c9e11d4`, plus uncommitted working-tree changes (nothing committed)
**Date/time UTC:** 2026-11-26T10:43Z
**Device(s) available:** NONE used. No phone or emulator was driven in this session.
**Status:** `AWAITING DEVICE VALIDATION`
**Phase approval provenance:** "proceed everything you recommend. make sure this integrates nicely" (2026-11-26). This approves D1, D2, D3 (a), D4 (a) and D5 in `docs/plans/call-reconnect/PLAN.md`; see `docs/plans/call-reconnect/OWNER-AUTHORIZATION.md`.

## 1. Scope completed

| Phase | What now happens | State |
|---|---|---|
| RC-00 Decision | ADR-046 (amends ADR-030 §5), owner authorization, AGENTS.md task notice, plan status. Read-only check: the agent prompt does not use `{{student_context}}` (the backend replaces it with `PLACEHOLDER_PROMPT` and reads `elevenlabs_extra_body`), so `student_context` is no longer sent as a dynamic variable. | Done |
| RC-01 Call memory | Every online call starts with the last 16 messages (≤ 3,000 chars) of the chat it writes into, sanitized, with a "last message was X ago" header. Ask USTP chats get none. Consent key v3, with one added sentence. **This alone fixes "LAFINA has no recollection when I call again in the same chat."** | Done |
| RC-02 JS reconnect | A call is made of segments. Network or server drops (1001, 1006, 1011–1014, "network", one LLM failure per call) go to `reconnecting`, then a new segment with the same transcript, timer, mute and review card. Bounds: 30 s window, backoff 1/2/4/8 s, at most 5 per call, flap guard, no reconnect with < 20 s left, 3 s network-loss grace. LAFINA says "Sorry, I lost you for a second. I'm back." (not saved to Chat). An unanswered last question is asked again once (≤ 90 s old, no tool ran). Background, lock, phone call, hang-up, goodbye, errors and auth/quota closes never reconnect; they offer **Continue call**. | Done |
| RC-03 Native soft reconnect | On a recoverable close the native module parks the session: mic lease, focus, route, recorder and player stay; captured audio is dropped, never sent or buffered; playback is flushed. New `reconnect`, `detach` and `startMuted`. Socket epochs ignore late callbacks. Parked sessions end themselves after 35 s. Ping 10 s → 5 s, connect timeout 15 s → 10 s. Older builds fall back to a new native session. | Done (JVM tests only) |
| RC-04 UI | "Reconnecting…" in the panel (with badge, halo pulse, 20 ms buzz if call haptics are on, screen-reader announcements), mini bar, waveform, avatar and the online reminder call view. Continue call / New call after a system stop. Review cards are not cancelled while reconnecting. | Done |
| RC-05 Backend | Patch + handoff: `resumeOf` links a reconnect to its call (not counted as a new call, shares time and turn budget, ≤ 8 links), `call_recap` as real prior turns, `call_mode` fixed note, `capabilities.resume`, migration 016. The app sends these only when the server reports `resume`. | Patch only, not deployed |
| RC-06 Validation | Automated gates below. Device matrix in §6. | **Human required** |

**Deviation from the plan.** Plan §4.10 said a linked session must have "ended in the last 2 minutes and not by `client`". The app itself ends the dropped session (`client`) before reconnecting, so the server instead allows a link while the call has time left (the call's first session's expiry minus the start grace), up to 8 links per call. Cost stays bounded by D3 (a).

**Removed from the plan.** The debug "Drop connection" hook was not built. Turning airplane mode on and off exercises the same native path (socket failure → park → reconnect) on a real device, and a hook would be dead code in release builds.

## 2. Change summary

| File/module | Change | Test evidence |
|---|---|---|
| `src/cloud/voiceConversation/callRecap.ts` (new) | Chat recap builder; call recap turns | `__tests__/cloud/callRecap.test.ts` (8) |
| `src/cloud/voiceConversation/controller.ts` | Call/segment model, `classifyDrop`, reconnect state machine, replay, `resume`, `networkChanged`, soft/hard reconnect, `resumeOf` / `call_recap` / `call_mode` | `__tests__/cloud/voiceConversationReconnect.test.ts` (41), `voiceConversationController.test.ts` |
| `src/cloud/voiceConversation/types.ts`, `index.ts` | `reconnecting` phase, snapshot fields, transport `reconnect` / `detach` / `startMuted`, consent v3, recap in the default context, `autoReconnect: true` in app deps, `resumeVoiceConversation` | same |
| `src/cloud/voiceConversation/nativeTransport.ts` | Bridges `reconnect` / `detach` (only when the build has them), parses `recoverable` | typecheck |
| `src/ui/hooks/useVoiceConversation.ts`, `useOfflineCall.ts` | NetInfo goes to the controller when it handles network loss; `resume`; `getCallState` | UI tests |
| `src/ui/components/voice/VoiceConversationPanel.tsx` | Reconnecting status, badge, pulse, haptic, a11y; Continue call; consent text; on-screen card state for the reconnect note | `__tests__/ui/callReconnectPanel.test.tsx` (3) |
| `src/ui/components/callLafina/{MiniCallBar,CallWaveform,SynthWaveAvatar}.tsx`, `src/ui/components/call/OnlineReminderCallView.tsx` | "Reconnecting…" labels and motion | preflight UI suites |
| `android/.../LafinaVoiceConversationModule.kt` | Park, epochs, `reconnect`, `detach`, hold timer, `startMuted`, capture loop drops frames while parked, no sends while parked, ping 5 s | `gradlew :app:compileDebugKotlin` |
| `android/.../VoiceConversationRules.kt` (+ test) | `isRecoverableClose`, `RECOVERABLE_CLOSE_CODES`, `RECONNECT_HOLD_MS` | `VoiceConversationRulesTest` 16/16 |
| Existing tests updated for deliberate changes | `voiceConversationController.test.ts`, `callLafinaStudentContext.test.ts` (no `student_context` dynamic variable), `onlineReminderCall.test.tsx` (consent v3), `callLafinaPhase03.test.tsx` (title says automatic reconnect is off in that harness) | preflight |
| `backend_integration/call-reconnect/*` | Backend patch (6 files, +434/−6) and owner handoff | backend pytest (below) |
| Docs | ADR-046, ADR-030 amendment note, OWNER-AUTHORIZATION, AGENTS.md notice, PLAN status | — |

The working tree also has other changes that were already there before this task and are **not part of it**: `__tests__/skills/skillsUi.test.tsx`, `src/ai/meeting/meetingTranscriber.ts`, `src/skills/meetingNotesSkill.ts`, `src/ui/screens/skills/{SkillsScreen,AllSkillsView}.tsx`, `backend_integration/*COMPLETE-AUDIT*`, and `graphify-out/`.

## 3. Tests and real outcomes

| Check | Command | Result | Evidence |
|---|---|---|---|
| Typecheck | `npx tsc --noEmit -p .` | PASS (no output) | this session |
| Lint | `npx eslint` on all changed source and test files | PASS | this session |
| Format | `npx prettier --check` on changed files | PASS | this session |
| Jest, reconnect | `npx jest __tests__/cloud/voiceConversationReconnect.test.ts` | PASS 41/41 | this session |
| Jest, recap | `npx jest __tests__/cloud/callRecap.test.ts` | PASS 8/8 | this session |
| Jest, panel | `npx jest __tests__/ui/callReconnectPanel.test.tsx` | PASS 3/3 | this session |
| Jest, voice controller + context suites | reconnect, controller, student context, extra context | PASS 147/147 | this session |
| Full preflight | `npm run preflight` | PASS after one test-text fix (§3.1) | `scratchpad/preflight-rc.log` |
| Kotlin compile + JVM rules | `JAVA_HOME=<JDK 17> ./gradlew :app:compileDebugKotlin :app:testDebugUnitTest --tests com.lafina.capstone.VoiceConversationRulesTest` | PASS, BUILD SUCCESSFUL, 16 tests / 0 failures | `android/app/build/test-results/testDebugUnitTest/TEST-com.lafina.capstone.VoiceConversationRulesTest.xml` |
| Release APK build | `assembleRelease` | NOT RUN | — |
| Backend, new tests | `python -m pytest tests/test_voice_call_reconnect.py` (scratch clone, Python 3.14, SQLite) | PASS 11/11 | — |
| Backend, voice + migrations | voice, opening line, tool bridge, migration chain, reconnect | PASS 95/95 | — |
| Backend, full suite | `python -m pytest` before and after the patch | 303 → 314 passed; **the same 29 failures before and after** (`test_documents` 17, `test_flashcards` 9, `test_audit_remediation` 2, `test_study_notes` 1; at least some fail because `reportlab` is not installed on this machine) | — |
| Patch applies | `git apply --check` on `9f0b844` | PASS | — |
| Device manual | §6 | HUMAN REQUIRED | — |

### 3.1 Full preflight

`npm run preflight` (typecheck → lint → Jest → architecture), log `scratchpad/preflight-rc.log`:

- typecheck and lint: PASS.
- Jest: 240 of 241 suites, 3,273 tests passed, 1 skipped, 2 failed. Both failures were in `__tests__/ui/voiceConversationUi.test.tsx`, which expected the old consent wording ("notes and saved memories"). This task changed that text on purpose (consent v3). The test now checks the new sentence, and the suite reruns at **28/28 PASS**.
- Architecture: preflight stopped at the Jest step, so `npm run check:architecture` was run on its own: **PASS**. 538 modules, 0 import cycles, 0 forbidden dependencies, and 124 offline leaves reach no network or online module.
- A full preflight rerun after that one-line test fix: NOT RUN (Jest alone takes about 7 minutes here). Only that suite and the architecture step were rerun.

## 4. Performance and device matrix

N/A for numbers: no device runs. The design cost is one `createSession` and one socket per reconnect (≤ 5 per call), and about 3,000 more characters in the initiation context per call.

## 5. Reliability, privacy, permissions, licenses

- **No new permissions.** The mic is held without a socket for at most 35 s, only after a drop in a call the student started. Captured audio is dropped while parked.
- **Privacy.**
  - The recap is the student's own chat, sanitized, and never taken from Ask USTP chats.
  - Consent v3 is shown once.
  - `student_context` no longer goes into the ElevenLabs dynamic variables, so the voice provider keeps less of it.
  - Grants and signed URLs are never logged.
- **Cost.** Reconnects are bounded (window, cap, flap guard, D3 a). Without the backend patch, each reconnect counts as a session if `VOICE_CONVERSATION_SESSIONS_PER_DAY` is set.
- **Risks.**
  - A replayed turn could repeat an action. Mitigations: no replay if any tool ran, confirm-before-write, at most once per turn.
  - Vendor battery managers (Infinix XOS Hiber) may still kill sockets with the screen off. Not tested.
- **Backend deploy hazard.** The new model columns need migration 016. Deploying without running it breaks voice session endpoints. The handoff says to migrate first.

## 6. Human phone verification

Install a debug or release build of this working tree on the phone (signed in, Online Mode on, Call LAFINA working). For each step: action → expected.

1. **Memory (no drop).** In a chat, talk to LAFINA by text, then start Call LAFINA and ask "what were we just talking about?" → She answers from the chat. Consent shows once with the new sentence.
2. **Airplane 5 s.** Mid-call, turn airplane mode on for about 5 s, then off → "Reconnecting…" with a pulsing halo, then "Reconnected." and "Sorry, I lost you for a second. I'm back." The timer did not reset, and Chat has no duplicate messages.
3. **Drop mid-answer.** Ask a long question, then turn airplane mode on while she speaks, and off → The cut-off answer appears once in Chat, labelled interrupted. After the reconnect she picks it up instead of starting over.
4. **Airplane 60 s.** → She gives up after about 30–40 s: "The connection dropped and could not be restored. Tap Continue call when you are ready." with **Continue call** and **New call**. Continue call carries on with memory ("I'm back. Where were we?").
5. **Wi-Fi → mobile data.** Walk out of Wi-Fi range, or switch Wi-Fi off → No stop, or one quick reconnect.
6. **Review card.** Ask her to add a task so the card shows, then drop → The card stays, and after the reconnect she knows it is on screen.
7. **Home button.** Press Home mid-call, then return → No automatic reconnect. Continue call works.
8. **Phone call.** Take a real phone call mid-call → The call stops. Afterwards Continue call works.
9. **Mute.** Mute, drop, reconnect → Still muted.
10. **Online reminder call.** Drop during the call → "Reconnecting…" on the reminder screen, a quiet reconnect, and no second announcement of the reminder. If it cannot reconnect, it falls back to the offline call as before.
11. **Goodbye.** Say "bye", and drop during the goodbye → The call ends with no reconnect.
12. **Infinix, screen on.** Repeat step 2 → Note any vendor socket kills.

Logs (privacy-safe): `adb logcat -s LafinaVoiceConversation ReactNativeJS | findstr /i "reconnect connected closed"` shows "Conversation socket reconnected" and "reconnected in Xms (… audio kept)". It shows no URLs or grants.

What I cannot certify: anything on a real device or network, ElevenLabs behaviour on a second conversation, audio route stability across a reconnect, and the backend patch in production.

## 7. Docs/ADRs changed

- `docs/decisions/ADR-046-call-reconnect.md` (new)
- `docs/decisions/ADR-030-live-voice-conversation.md` (amendment note on §5)
- `docs/plans/call-reconnect/PLAN.md` (status), `OWNER-AUTHORIZATION.md` (new)
- `AGENTS.md` (task-scoped notice)
- `backend_integration/call-reconnect/OWNER-HANDOFF.md` (new)
- Architecture / import check: `npm run check:architecture` is the last step of `npm run preflight` (§3.1). Graphify: NOT RUN.

## 8. Open blockers and recommended next steps

1. Device matrix §6 (owner).
2. Backend: merge the audit work (015) first, then this patch, then **migration 016 before or with the deploy** (handoff).
3. Optional: a release build for the phone (`assembleRelease`, JDK 17), and the `call_history_check` script after real calls.

## 9. Review decision

- [x] All automated required checks passing (§3.1; release APK not built)
- [ ] Manual device tests completed and human-confirmed
- [x] No disallowed scope/code change (no backend checkout touched; no background mic; no new permission)
- [x] Report accurate, docs updated
