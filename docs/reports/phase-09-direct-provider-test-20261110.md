# Phase 09 — direct provider phone test

**Date:** 2026-11-10, Asia/Manila  
**Branch:** `Lem-branch`, uncommitted follow-up to `4371ca8`  
**Device:** Infinix X6880, Android 15, ADB `13195704C2004480`  
**Status:** AWAITING DEVICE VALIDATION  
**Owner authorization:** Test APK may contain provider credentials; direct online chat and conversation, with hosted account and sync retained.

## Scope and changes

- A private QA build uses DeepSeek directly for text and ElevenLabs for authenticated voice sessions. Its dedicated ElevenLabs agent uses a provider-hosted DeepSeek model and patient turn settings. This is separate from the existing agent; no backend deployment or production configuration was changed.
- The study-time preference continues to be saved locally and existing phone memories are sent with text chat. General AI memory extraction is disabled in direct mode; live voice does not receive saved phone memories. Handbook verification is unavailable in this mode; the app refuses identified handbook questions rather than presenting unverified answers as citations.
- Account sign-in and sync remain on the hosted backend. Existing direct reminder action handling and manual controls remain in the app. The default and release builds have empty direct credentials; the special build uses private process environment settings.
- The QA APK intentionally contains recoverable provider API keys. Do not distribute it or use it as a release. The provider keys can incur charges and should be rotated after testing. Only the explicitly authorized keys, not the whole `.env`, are embedded.

## Checks and evidence

| Check | Result |
|---|---|
| Direct DeepSeek synthetic chat | PASS: HTTP 200, reply received. |
| ElevenLabs signed URL | PASS: HTTP 200. |
| Real ElevenLabs agent exchange with synthetic prompt | PASS: text response and generated audio received. No device microphone used. |
| Direct provider unit tests | PASS: 4 tests; QA gating, direct routing, memory context and handbook refusal. |
| Full preflight | PASS: 80 suites, 1,181 passed, 1 skipped. `.local/direct-provider-preflight-final.log` |
| Android build | PASS: arm64 data QA. SHA-256 `8b08b153c6103750d7416eb6661f2dd5b1285685cbee4264a5db37772b8ddc31`. `.local/provider-testing/assemble-arm64-v8a.log` and `artifact-direct-private-arm64-v8a.json` |
| Phone installation | PASS: `adb -s 13195704C2004480 install -r .local/provider-testing/LAFINA-direct-private-arm64-v8a.apk`, data retained. |
| Device direct chat, microphone, audio and pause | Owner confirmed on 2026-11-10 that chat and voice replied without USB and that the agent waited through a mid-sentence pause. |
| Device reminder call, spoken actions and microphone shutdown | NOT YET CONFIRMED for this direct-provider build. |

## Manual device checks

1. Install the private ARM64 APK without clearing app data; open the signed-in app and keep Online Mode on. Disconnect USB and keep mobile data or Wi-Fi enabled.
2. Send a short chat message and check a reply. Ask about the saved study preference if it exists for the current account. General automatic extraction and handbook RAG are not provided by the direct route.
3. Start conversation, speak, pause for thought, and confirm the assistant waits, responds audibly and can be interrupted. End it and verify microphone capture stops.
4. Set an online reminder, answer, and test the announcement, interactive conversation, snooze/acknowledgement and underlying task state. Device results require owner confirmation.

## Risks and review

This testing profile shifts provider credentials and paid usage enforcement to the device. A person extracting the APK can misuse the keys. Do not publish the APK; rotate the provider keys after testing and replace this design before release. The direct agent has a five-minute limit, but backend quotas and backend audit controls do not apply. Voice and chat use internet; they are not offline AI. No production deployment, migration, or backend configuration is included.

STATUS: AWAITING DEVICE VALIDATION  
STOPPED — awaiting explicit human approval
