# 10 — Security, Permissions, Privacy and Ethics

## Local-first privacy posture

No account or online sync in MVP, no username/password, no device identity registration, no auto-upload of schedule/voice/transcript, no permanent mic activity, no collection of sensitive behavior analytics by default. Any research sample transcripts/audio must be public, synthetic or collected with informed permission and safely retained with consent/retention rules.

## Microphone

Runtime `RECORD_AUDIO` only at interaction; visible recording state, cancellation, and clear one-owner capture. Stop on button release/permission revoke/interrupt. On Android, background microphone access has foreground-service and OS restrictions. Don't work around policy via invisible services. Prefer push-to-talk after answered call; hands-free is an explicit later feasibility study only.

## Alarm/notification/full-screen

Document requested permissions and why. In Android 14+, full-screen intent privilege may not be enabled; no guarantee of full-screen. Verify actual use-case eligibility and Play policies for `USE_EXACT_ALARM`, `SCHEDULE_EXACT_ALARM`, `USE_FULL_SCREEN_INTENT`. Fallback to legal heads-up/normal notifications with clear user advice. Do not assert a simulated app call qualifies for all telephony privileges. Avoid 'guaranteed deliver after force stop' claims. Provide quiet-hours and volume/vibration controls.

**Floating LAFINA (ADR-036, owner-approved 2026-11-17):** `SYSTEM_ALERT_WINDOW` ("Display over other apps") and `FOREGROUND_SERVICE_SPECIAL_USE`. Both are used only after the student turns on Profile → Floating LAFINA (off by default) and reads an explainer shown before Android's settings page. The overlay draws only LAFINA's own button; it never reads the screen, other apps, the clipboard or usage data, and never uses the microphone. The `specialUse` foreground service keeps that button available and always shows a notification with Open and Hide. Turning the setting off stops both at once. The optional "Hide in full-screen apps" reads only whether the status bar is visible, never which app is in front. No Google Play approval is assumed; a `specialUse` declaration would be needed before any Play submission.

## Local database and storage

Use app-private storage; minimize content retention. Avoid writing transcripts or raw voice files permanently unless explicitly necessary/consented. Secure deletion limitations explained. Don't include local SQLite DB in debug bug reports unless sanitized and consented. Upgrade migrations preserve data when within capstone versions; don't import legacy user identities/business schemas. Threat model theft/lost phone, debug exports, unauthorized app file access and backup.

## Optional online mode security

No Gemini API key in APK, repo or frontend env. Use server env/secrets, request body limits, timeouts, rate limiting, cost ceilings and suspicious usage controls. With no login, public proxy abuse is serious: keep service demo-limited, use token/budget/session protection, or supervised deployment; ask user for approval of design. Explicit toggle and consent for sending transcribed text to backend. RAG uses official public docs only; no prompt injection execution.

## Licenses and provenance

Review open-source code licensing, Whisper/SmolLM2/Kokoro/ONNX model licenses and distribution rights for app assets; no top-level license visibly identified in legacy root when audited. Verify original authorship/organizational permission for code reuse; document attribution. Do not place unauthorized copyrighted USTP handbook PDF in public repo; prefer official link/authorized ingestion. Do not copy demo shared passwords.

## Research ethics and accuracy

Student testers need clear purpose and informed consent, anonymized measurements, retention/deletion plan. Clarify that handbook answer is a helpful explanation, not an official ruling; cite source edition/revision and suggest institutional confirmation for conflict. Declare limitations about offline voice model/OS support, battery restrictions, and simulated versus actual calls.
