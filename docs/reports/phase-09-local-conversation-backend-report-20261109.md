# PHASE 09 follow-up — Local conversation backend

**Branch / base:** `Lem-branch`, `f8f8101edd8439e9db998811e955e40144de6450`; existing dirty work retained.  
**Date:** 2026-11-09, Asia/Manila; machine evidence uses UTC.  
**Device:** Infinix HOT 50 Pro+ / X6880, Android 15 / API 35, ARM64. Provider package `com.lafina.capstone.providers`.  
**Status:** `AWAITING DEVICE VALIDATION`.  
**Approval:** Owner requested the local conversation backend, explicitly kept memory on its branch, enabled ElevenAgents permissions, approved the temporary callback-only HTTPS tunnel, and previously approved microphone/transcript streaming. Owner confirmed clear phone voice playback in this session.

## 1. Scope completed

The prior local runner selected the memory checkout, which did not include `/v1/ai/voice/*`. It now uses a read-only, pinned export of the existing conversation implementation at backend commit `a3d1671ff6ac6d4c3df1cf7e36a7ec795e7233f8`. Its manifest verifies source hashes on restart. There was no backend checkout, merge, commit, push or production deployment.

The memory checkout remains clean on `codex/chat-memory`, HEAD `45f65a7713398d4430de41b475a592e620e415dd`. Only reviewed runtime/test source was exported; no history, `.env`, database or secret files were copied from it. Runtime dependencies are reused from its pre-existing Python environment. Online memory was not deployed or activated by this work.

Real local authentication, conversation capabilities, signed ElevenLabs URLs, session grants, streamed DeepSeek callbacks and ElevenLabs audio generation were verified. The phone also retained a saved Vercel server selection; this overrode its local build default. The normal Profile server switch moved it to Local, ended that app's prior server session and preserved planner data. A synthetic local account is signed in for testing.

A dedicated **LAFINA local phone testing** ElevenLabs agent is configured with custom DeepSeek callback, a separate local-test callback secret, signed-URL access, Camille, PCM 16 kHz input/output, patient turn-taking, a 15-second turn timeout and a 300-second maximum session. Existing quotas remain enabled (6 sessions/day, 30 turns/session). No production agent was modified.

Only the loopback gateway on port 8001 is tunneled. The full backend stays on loopback port 8000, reached by the phone over USB reverse. The gateway requires the shared secret before forwarding; the backend also validates a short-lived session grant. Public account/admin/chat/docs routes are absent.

During the first phone attempt the free tunnel changed its hostname while SSH remained connected. ElevenLabs retained the old callback URL, producing `custom_llm generation failed`. A managed tunnel helper now validates announced HTTPS hosts and updates only the dedicated test agent. Existing conversations may still need restarting when the hostname changes. A subsequent phone session transcribed a short greeting and received a real reply; the owner confirmed clear audio.

The managed helper later handled a second live hostname announcement, updated the dedicated agent again, and its new public health check passed. See `tunnel-lifecycle.json`; the continuing limitation is conversations opened before a rotation.

The device check also exposed keyboard clipping after a multi-turn transcript. Conversation mode now uses the sheet's bounded scrolling container and existing keyboard-to-input scrolling behavior, keeping the typed recovery path reachable. APK verification is recorded in the evidence handoff below.

## 2. Change summary

| File | Change / purpose |
|---|---|
| `scripts/provider_test_backend.py` | Read-only pinned export, archive path checks, hash manifest, memory before/after checks |
| `scripts/run-provider-test-server.py` | Run isolated conversation source; preserve local DB/JWT; read only provider keys from root `.env`; use private local agent state |
| `scripts/local_voice_callback.py` | Callback-only loopback gateway; secret check, bounded body, selected headers, SSE streaming and cleanup; credential-free status/size diagnostics |
| `scripts/provision-local-voice-agent.py` | Redacted dry run; create/update only the recorded local test agent; reuse its dedicated secret and persist IDs before verification |
| `scripts/run-local-voice-tunnel.py` | SSH gateway-only tunnel, no personal SSH identity, host verification, agent update on hostname rotation, private lifecycle status |
| `scripts/tests/test_local_voice_callback.py` | Authentication, route exclusion, size limit, grant forwarding, SSE/status preservation and failure cleanup |
| `scripts/tests/test_local_voice_tunnel.py` | Address rotation, duplicate/untrusted event handling, failed-public-health refusal, child cleanup and banner suppression |
| `src/ui/components/VoiceModal.tsx` | Bound conversation content with scrolling so keyboard/transcripts do not clip typing controls |
| `docs/qa-provider-testing.md` | Current local source, permissions, server selection, gateway/tunnel lifecycle, provisioning and remaining manual checks |

## 3. Tests and actual outcomes

| Check | Command / procedure | Outcome |
|---|---|---|
| Final mobile gate | `npm run preflight` | PASS: typecheck, lint, 76 Jest suites / 1,151 tests, 1 optional skipped; 251 modules / 0 cycles / 0 forbidden dependencies; 79 offline leaves reach no network module |
| Native gate | JDK 17, `android/gradlew.bat :app:compileDebugKotlin :app:testDebugUnitTest --offline --no-daemon --console=plain -PreactNativeArchitectures=x86_64` | PASS: build successful; 7 suites / 51 tests, no failures/errors |
| Isolated backend | From exported source: existing venv Python `-m pytest -q --junitxml=.../backend-tests.xml` | PASS: 238 tests; 8 deprecation warnings |
| Callback gateway | Existing venv Python `-m unittest discover -s scripts/tests -p test_local_voice_callback.py -v` | PASS: 7 tests |
| Tunnel rotation | Existing venv Python `-m unittest discover -s scripts/tests -p test_local_voice_tunnel.py -v` | PASS: 2 tests; fake SSH/provider, no network mutation |
| Script verification | Python `-m py_compile` on the five helpers; pinned export/manifest recheck | PASS; memory checkout unchanged |
| Local/public contract | Synthetic local sign-in and callback probes | Login 200; unauthenticated capabilities 401; configured capabilities enabled; session 200 with signed ElevenLabs URL; public auth/docs 404; unauthorized callback 401; ended grant 409 |
| Real callback SSE | One synthetic prompt through HTTPS gateway → local DeepSeek | HTTP 200, nonempty answer, DONE, no error event; session ended 200 |
| Actual agent | Signed ElevenLabs WebSocket with synthetic text, same initiation/grant as app | DeepSeek turn recorded, reply received, 105,976 PCM bytes observed after prompt; ended 200; no backend error |
| Physical phone | Normal app sign-in, Start, real mic recognition, reply, Mute, End | Connected; short greeting transcribed; answer shown; audio clear per owner; Mute and End observed |
| Updated ARM64 APK | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-provider-test-apk.ps1 -Architecture arm64-v8a`; explicit phone `adb install -r` | PASS: bundle identity/key audit, Gradle assembly, installation; no app data cleared |
| Keyboard layout | Type instead, focus keyboard, inspect input/send visibility | PASS for input/control reachability after scrolling fix; speech remains on explicit Start |
| Muted typed reply | Send a synthetic turn while muted | **UNRESOLVED:** user turn appears, but no assistant reply was observed on the phone before closure. This is not a successful recovery-flow check. PC text/SSE tests passed; device behavior needs follow-up. |
| Natural pauses / barge-in | Speak mid-sentence pauses, interrupt spoken reply | HUMAN REQUIRED / NOT RUN as a controlled check |
| Locked/background/reboot alarms | Dedicated reminder/call checklist | NOT RUN in this follow-up |

Raw sanitized logs and structured results: [evidence directory](evidence/phase-09-local-conversation-20261109/). No microphone audio, provider key, signed WebSocket URL, grant, password or JWT signing key belongs in that directory.

Final phone audio cleanup: Android's active recording section and audio-focus stack were both empty. The local server, gateway and managed tunnel were left running for owner testing; no phone conversation was left recording.

## 4. Performance and device matrix

One real HTTPS callback delivered first answer text in 1,544 ms and completed in 1,862 ms. One actual ElevenLabs synthetic-text conversation delivered final response text at 3,466 ms and completed the probe at 3,738 ms, with audio frames received. These are single samples with different prompts and paths, not p50/p95, natural speech latency or a promise of instant answers. No PSS, alarm drift or acoustic benchmark was run.

Installed updated ARM64 APK: `.local/provider-testing/LAFINA-providers-arm64-v8a.apk`, SHA-256 `927290ac25ee7e5a7525edd212c89a98dae0327f18614cc6fb5d00c457eba9f5`. Packaged JS bundle SHA-256 `06b6afbef57b69eefd3aaa4b3f87bda45c6cdafaef57a8f38dced2717f73c0a9` matched fresh source; configured provider keys were absent from every APK entry. This supersedes the earlier provider-profile APK receipt.

## 5. Reliability, privacy and deviations

- The current server, gateway and managed SSH tunnel must remain running; phone needs USB reverse and internet. No provider key is embedded in the APK.
- The temporary tunnel terminates HTTPS and carries callback content; use synthetic test material. Free URLs rotate and have speed/availability limits. The helper updates new agent sessions; it cannot repair an already-open session's cached old URL.
- Handbook retrieval is deliberately unconfigured in this minimal local runner. Verified university-policy RAG and online memory are not part of this local test result.
- A UI diagnostic accidentally printed the initial synthetic QA password. It was immediately rotated on the isolated server, its other sessions revoked, its private screenshot removed and editable-field output redacted. No personal password or provider key was involved. A fresh synthetic conversation account avoids changing an existing offline account's password verifier. Existing phone account/planner data were retained.
- The first WebSocket probe assumed final text preceded audio and timed out after receiving the reply. Event-order-aware accounting passed on the next run. That was a probe assumption, not a fabricated phone-audio pass.
- A later phone probe initially matched its own user prompt as an assistant reply. That assertion was rejected on inspection; the private probe was corrected and its result is not counted as a pass. The real phone muted-typing flow remains unresolved. No speculative microphone/transport change was made without a demonstrated cause.
- Required human checks remain unmet; this report does not approve another phase.

## 6. Human phone verification

1. Keep this PC online, the three local processes running, phone connected by USB, and Profile → Developer → Server set to **Local**. Open the installed provider-test LAFINA app. Do not sign into production with this local test flow.
2. Voice Action → Voice conversation (Online) → Start. Expect the greeting, live listening state and audible selected voice. Clear audio has already been owner-confirmed for one run.
3. Say “Help me plan…” then pause for 1–2 seconds and finish “…my study time tomorrow.” Expect one coherent answer after finishing. Repeat in English/Filipino and with a longer thinking pause; report premature answers or missed words. NOT RUN as controlled tests.
4. Speak while LAFINA is answering. Expect it to stop its reply and listen. Test Stop, Mute/Unmute and Type instead with the keyboard and a longer transcript. Speech-triggered barge-in/echo/routing remain unconfirmed.
5. End, background and lock the app. Expect microphone indicator/capture to stop. Test network/USB loss and return: text/manual planner UI should remain usable; reopening live voice requires an explicit Start. Full device matrix NOT RUN.
6. Run reminder Answer/Snooze/Acknowledge, locked-screen/background and reboot checks separately. Acknowledging must not complete its task. These are not certified by this conversation test.

## 7. Docs and artifacts

Updated [provider testing guide](../qa-provider-testing.md). Existing full manual matrix: [Phase 09 voice conversation checks](../../qa/PHASE-09-VOICE-CONVERSATION-MANUAL.md). No new ADR or backend migration was needed; local SQLite tables are created by the existing dev startup. Graphify was NOT RUN; the architecture gate passed.

## 8. Open work

The muted typed-turn recovery flow needs diagnosis: the controlled phone attempt showed the user message but no assistant answer before closure. Natural pause timing, spoken interruptions, echo, background/locked-screen behavior and reminder alarms still need device/human validation. Use a stable approved HTTPS callback domain if free-host rotation interrupts longer testing. Do not merge/deploy memory to solve this local routing task.

## 9. Review decision

- [x] Mobile, native, backend and helper automated checks pass.
- [x] Actual provider connection and physical-phone short speech/reply observed.
- [x] Owner confirmed clear phone audio.
- [x] Memory branch and production deployment untouched.
- [ ] Full human device matrix complete.

**STATUS: AWAITING DEVICE VALIDATION**  
**STOPPED — awaiting explicit human approval**
