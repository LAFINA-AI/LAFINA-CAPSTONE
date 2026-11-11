# Backend, provider and phone gates

Audit HEAD: `fe489a6487884fa6667f1cc6e2e0bddbd24e386d`, November 10, 2026, Asia/Manila.

| Layer | Independently observed | Not verified |
|---|---|---|
| Mobile software | Typecheck/lint, host suites, native Kotlin compile and 54 JVM tests pass | Full live action/card acceptance; see FAIL findings |
| Backend source | GitHub main `5866aa241922b710d32d6d56277a8ef24a6aa178`; voice session/custom-LLM source present | Deployment revision and actual server settings |
| Agent configuration source | Patient turns, pcm_16000, signed URL/grant configuration in provisioning script | Existing live agent's tools, events, voice, permissions and behavior |
| Client tools | Release callback/allowlist code present | Real server → DeepSeek tool decision → ElevenAgents client_tool_call → app → client_tool_result round trip |
| Production endpoints | Mobile contract inspected locally | No production probe or authenticated request executed by this audit |
| Paid providers | No provider session or billable synthesis invoked | Balance, account rights, quota, latency, actual voice, language quality |
| Physical phone | None used | Every hardware/visual/device acceptance scenario |

Backend read-only provenance:

- [Backend main](https://github.com/LAFINA-AI/LAFINA-backend/tree/5866aa241922b710d32d6d56277a8ef24a6aa178).
- [Provisioning script](https://github.com/LAFINA-AI/LAFINA-backend/blob/5866aa241922b710d32d6d56277a8ef24a6aa178/scripts/provision_voice_agent.py), blob `25a38b5183105c8e4a9bc43ae14530a67f844b33`.
- [Voice route](https://github.com/LAFINA-AI/LAFINA-backend/blob/5866aa241922b710d32d6d56277a8ef24a6aa178/app/api/v1/voice.py), blob `34851f0700baf7fe0b7c2c4ffcabe3859967eb29`.
- [Voice service](https://github.com/LAFINA-AI/LAFINA-backend/blob/5866aa241922b710d32d6d56277a8ef24a6aa178/app/services/voice_conversation.py), blob `61e87a2f7247c5da7d37ced208e48a9bb9695b01`.

Copies contain repository source, not environment credentials. The provisioning file was first fetched at main; the branch snapshot and recursive tree identify the same revision. Route/service were fetched at the exact commit. Live configuration may differ from source; no such configuration was read or changed.

The inspected provisioning script does not declare the new client tools or `client_tool_call` in its event list. The custom-LLM route builds plain user/assistant text messages and invokes DeepSeek without a structured tools argument. Agent setup outside the repository could change behavior, but is unverified. This is CL2-015, not proof that a particular live server request failed.

The final implementation handoff gives `POST /v1/voice/session`; actual mobile code uses **`POST /v1/ai/voice/sessions`**. It references `docs/decisions/agent_tools_contract.md`, which does not exist; the proposal is **`backend_integration/call_lafina_v2_proposals/agent_tools_contract.md`**. Its example grant is not an authoritative schema. Use `src/cloud/voiceConversation/voiceConversationApi.ts` and actual backend route types as the contract.

## Backend owner actions after mobile fixes

1. Inspect the exact deployed source revision and migration 013 state on the existing backend project. Do not infer either from a route returning 401.
2. Review a proposed tool-contract patch covering schema declarations, tool event selection, DeepSeek request/result serialization, authenticated owner binding, allowlist, bounded local context and quotas. The present markdown proposal alone is insufficient.
3. Separately authorize any required backend edits/deploy/provision operation; this audit authorizes none. Never expose keys, grants or signed URLs to the mobile app/logs.
4. Inspect live agent config read-only with the backend's supported `python -m scripts.provision_voice_agent --check` workflow using owner-held credentials; record redacted config/version evidence. Do not run `--apply` as a check.
5. With an authorized synthetic student session, verify voice capabilities, session creation, chosen voice override, tool result round trip and session end. Record status and bounded usage without token values. These authenticated checks are currently **NOT_RUN**.
6. Check missing-agent, expired-grant, 401/402/429 and network failures using safe test fixtures or an owner-approved environment. Do not exhaust quotas or spend unbounded minutes to induce errors.

## Build/install gate

This audit compiled debug Kotlin and ran JVM tests; it did not assemble or install an APK. No APK from this commit is certified. Older APKs elsewhere in the repository do not prove this revision.

After remediation, build a normal QA variant using current repository instructions, for example:

```powershell
.\android\gradlew.bat -p android :app:assembleDataQa '-PreactNativeArchitectures=arm64-v8a' --no-daemon --console=plain --max-workers=2
Get-FileHash -Algorithm SHA256 android/app/build/outputs/apk/dataQa/app-arm64-v8a-dataQa.apk
adb install -r android/app/build/outputs/apk/dataQa/app-arm64-v8a-dataQa.apk
```

Build/install commands above are instructions, **NOT_RUN by this audit**. Verify actual variant/package ID and ABI before installation. Do not uninstall/clear data. A debug build may require Metro; the handoff's universal `app-debug.apk` path is not a verified split-APK path in this repository.

## Reproducible phone matrix — all NOT_RUN

Record phone model, Android/API, ABI, app variant/version/commit, APK SHA256, tester, date/time/timezone, network, selected nonsecret voice ID and peripherals. Use only synthetic records and an authorized account.

| Original scenarios | Actions | Expected / required evidence |
|---|---|---|
| T001–T005 | Open Call Lafina as guest, signed-in offline and consent missing; then explicit authorized Start | Full-screen entry; no capture before all gates; clear failure/manual route |
| T006–T010 | Speak, listen, Stop/End, toggle Reduce Motion | Separate real input/output signals; zero stale output; reduced-motion fallback and measured frame/CPU cost |
| T011,T035 | 320dp/short viewport, landscape, large fonts, keyboard and TalkBack | Review/Confirm/Cancel/End visible and reachable; predictable focus |
| T012–T018 | Select voice B, test loudspeaker barge-in, mute/unmute, wired and Bluetooth connect/disconnect | Audible voice B, no doubled TTS/echo, immediate Stop, mic indicator off on mute/End |
| T019–T022 | Scheduled reminder, cellular call, Home, lock and network loss during start and playback | Priority/focus and mic release, no ghost reconnect, explicit Start again |
| T023–T027 | Pause 1–2 seconds, request wait, detail, slow answer, induce bounded slow tool | Patient timing, enforced wait/resume, one honest status, supported preference only |
| T028–T031 | Provisional/final transcript, interrupted answer, typed turn, scroll older/Jump latest | Stable once-only turns persisted to correct owner's Chat; no double reply |
| T032–T037,T044–T049 | Draft reminder 3 PM → 4 PM, cancel; repeat and Confirm twice; conflict/overnight/timezone | No writes before approval; correct revised durable record/outbox/alarm; no cancel/stale/duplicate writes |
| T038–T040 | Dictate/edit/save/read back note; find hostile sample note; open original | Correct owner, content, revision/outbox, real navigation, no execution of stored instructions |
| T041–T043 | Memory off, Save, Undo, Forget, revoke, switch account | Explicit review, correct ID, truthful store result, no stale retrieval or wrong-owner content |
| T050–T056 | Three actions, edit one, fail one safely, retry duplicate, malformed/stale tool | Correct schemas, per-item outcomes, stable receipts, actual release tools and zero replay |
| T057–T059 | Native-speaker English/Filipino/Taglish/Cebuano samples, voice changes, haptics/captions | Record measured recognition/output; untested locales labeled unevaluated; preferences actually apply |
| T060 | Minimize, Calendar/Notes navigation, restore | Same controller/session/transcript/cards, continuous authorized capture and usable bar controls |
| T061,T062 | Background mic and image attachment | Deferred; no testing as success without separately approved compliant capability |
| T063–T068 | Provider unavailable/quota error, airplane-mode offline PTT/NLU/TTS, sign-out, log review, ordinary Chat/sync | Honest fallback, existing offline workflow/alarm reliability, no sensitive logs or old-account callbacks |
| T069,T070 | Compare all F/P/T evidence; install final exact APK | Correct statuses, hashes, actual dated phone observations; no mocks labeled phone-verified |

Also measure first text/audio and Stop/interruption-to-silence with monotonic timestamps, sample count/conditions and median/p95, plus PSS/CPU/FPS/battery and authorized provider usage. No numerical performance achievement is established by this audit.
