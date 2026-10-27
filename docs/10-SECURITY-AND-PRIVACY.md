# 10 — Security, Permissions, Privacy and Ethics

## Local-first privacy posture

No account or online sync in MVP, no username/password, no device identity registration, no auto-upload of schedule/voice/transcript, no permanent mic activity, no collection of sensitive behavior analytics by default. Any research sample transcripts/audio must be public, synthetic or collected with informed permission and safely retained with consent/retention rules.

## Microphone

Runtime `RECORD_AUDIO` only at interaction; visible recording state, cancellation, and clear one-owner capture. Stop on button release/permission revoke/interrupt. On Android, background microphone access has foreground-service and OS restrictions. Don't work around policy via invisible services. Prefer push-to-talk after answered call; hands-free is an explicit later feasibility study only.

## Alarm/notification/full-screen

Document requested permissions and why. In Android 14+, full-screen intent privilege may not be enabled; no guarantee of full-screen. Verify actual use-case eligibility and Play policies for `USE_EXACT_ALARM`, `SCHEDULE_EXACT_ALARM`, `USE_FULL_SCREEN_INTENT`. Fallback to legal heads-up/normal notifications with clear user advice. Do not assert a simulated app call qualifies for all telephony privileges. Avoid 'guaranteed deliver after force stop' claims. Provide quiet-hours and volume/vibration controls.

## Local database and storage

Use app-private storage; minimize content retention. Avoid writing transcripts or raw voice files permanently unless explicitly necessary/consented. Secure deletion limitations explained. Don't include local SQLite DB in debug bug reports unless sanitized and consented. Upgrade migrations preserve data when within capstone versions; don't import legacy user identities/business schemas. Threat model theft/lost phone, debug exports, unauthorized app file access and backup.

### Implemented Notes retention — Phase07.1 audit hardening

Notes removal hides the item from Notes/search/Profile counts and records a
tombstone; it is **not permanent erasure**. Saved title/body remain in the notes
row. Create/edit receipts retain saved revisions in `operation_receipts.result`
and in the complete canonical JSON `fingerprint` payload. The fingerprint is
not a one-way content hash. Later edits/removal do not clean up these older
copies. No automatic expiry, purge control or receipt-retention deadline exists
in this phase. The user-facing confirmation/privacy wording must say this before
removal; tests must distinguish hidden content from removed content. This is an
honest limitation, not a claim that private content has been purged.

These records remain app-private and are not uploaded. App-private storage is
an access boundary, not a promise of encrypted storage, resistance to an unlocked
or debug-authorized device, or forensic secure deletion. Do not collect real
student notes/databases in public evidence. Chat history and speech drafts remain
transient; this Notes retention policy does not authorize storing microphone
audio or transcripts. See [the actual data semantics](05-DATA-SCHEDULING.md#notes-retention-and-removal-semantics).

### Upgrade and installation custody

Incoming Nol at `9c183a20eca2377b5e54f219c5f83460b18af81b` and our bundled
QA/release-preview use the same `com.lafina.capstone` package. Their development
signing settings do not prove matching or differing certificates; actual signing
compatibility is UNKNOWN until both are verified. Nol's `lafina.db` schema17 is
not automatically imported into our schema3 `lafina-capstone.sqlite`. A matching
signature can permit code replacement without making the old data visible to
the new app. An unknown lineage or signature/schema failure requires retaining
the original install and a deliberate preservation plan. Never recommend
uninstall, clear-data, forced downgrade or raw database replacement as a fix.

## Optional online mode security

No Gemini API key in APK, repo or frontend env. Use server env/secrets, request body limits, timeouts, rate limiting, cost ceilings and suspicious usage controls. With no login, public proxy abuse is serious: keep service demo-limited, use token/budget/session protection, or supervised deployment; ask user for approval of design. Explicit toggle and consent for sending transcribed text to backend. RAG uses official public docs only; no prompt injection execution.

## Licenses and provenance

Review open-source code licensing, Whisper/SmolLM2/Kokoro/ONNX model licenses and distribution rights for app assets; no top-level license visibly identified in legacy root when audited. Verify original authorship/organizational permission for code reuse; document attribution. Do not place unauthorized copyrighted USTP handbook PDF in public repo; prefer official link/authorized ingestion. Do not copy demo shared passwords.

Source/npm redistribution and APK runtime inclusion need separate attribution
review. The audited `a186bfc` release-mode JS graph excludes the CSS-parser/
`boolbase` dependency group, while the retained notices also cover packages in
the installed source/tooling dependency tree. Preserve those notices and qualify
their scope; absence from one graph does not waive other distribution duties or
authorize publication. See the [provenance clarification](third-party/phase-07-1-nol-ui-provenance.md#aud-07--notice-scope-and-actual-bundle-evidence).

## Research ethics and accuracy

Student testers need clear purpose and informed consent, anonymized measurements, retention/deletion plan. Clarify that handbook answer is a helpful explanation, not an official ruling; cite source edition/revision and suggest institutional confirmation for conflict. Declare limitations about offline voice model/OS support, battery restrictions, and simulated versus actual calls.
