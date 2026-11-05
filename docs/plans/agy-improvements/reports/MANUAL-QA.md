# Manual acceptance — NOT RUN

Implementation run: NOT STARTED. Artifact: **NO ARTIFACT PRODUCED**. Do not install a nonexistent path or an unrelated donor APK.

At final handoff fill actual work branch/tested HEAD, QA variant/ABI/applicationId/version/hash, signature/update compatibility, asset/model hashes and non-sensitive authorized test-device model/API. Keep private data/credentials/audio/serials out of reports. Never uninstall or clear saved data to hide an update issue.

| ID | Later concrete check | Expected result | Current status |
|---|---|---|---|
| M01 | Install a verified compatible target QA artifact on an explicitly authorized test phone; open existing synthetic records | App opens without Metro where claimed; preserved accounts/preferences/records and no migration reset | NOT_RUN |
| M02 | In airplane mode manually create/edit a task; restart and reopen | Durable record persists; failed storage shows recovery instead of success | NOT_RUN |
| M03 | Type/dictate a planner change; edit draft, Prepare, Cancel, then Prepare/Confirm twice | Cancel saves nothing; draft stays; one durable change after double Confirm | NOT_RUN |
| M04 | Create same-title items, request deletion/reschedule, and switch account while a review is open | Ambiguity is clarified; stale/other-owner review cannot mutate | NOT_RUN |
| M05 | Set a synthetic reminder; lock screen, let it ring, ACK then inspect task | Correct call/notification arrives under allowed permissions; ACK does not complete task | NOT_RUN |
| M06 | Test main-process death, reboot/unlock, Doze, timezone/time changes, permission revoke/restore and old notification buttons | Recovery is truthful; no duplicate/stale/wrong-owner actions; force-stop limits documented | NOT_RUN |
| M07 | Select installed offline English voice, Preview/Stop/reset in airplane mode; simulate unavailable voice | Eligible speech audible with sane settings; owned cancellation; text/typing/recovery if unavailable | NOT_RUN |
| M08 | Start meeting recording; attempt dictation; stop/cancel, then reverse the contention order | Existing recording is not lost/stopped by contender; ownership releases only after native work returns | NOT_RUN |
| M09 | Import/record a synthetic lecture, pause/resume/stop/transcribe; exercise keepAudio and explicit online-summary consent | Chunk ordering/retention and meeting Notes/action items preserved; no silent upload | NOT_RUN |
| M10 | With controlled disposable accounts, guest-link then switch owners; inspect Chat/pages/attachments and edit conflicting Notes | Owned history preserved, no cross-owner access, rich content intact and conflict drafts retained | NOT_RUN |
| M11 | Test cross-midnight/timezone/recurring events and ICS; controlled sync push/pull through existing server | Correct local spans/reminders; existing payloads work; local-only metadata limitations explicit | NOT_RUN |
| M12 | With controlled live service access, exercise guest/student/student_pro/admin gates, online Chat/RAG toggles/citations, four document formats/share and entitled cloud speech fallback | Original role/mode/consent policies and routes remain working; failures don't fabricate answers/saves | NOT_RUN |

Live/disposable credentials and actual subscription transactions are not authorized by the unattended implementation prompt. M10–M12 live portions need a separately controlled later environment. Coding/testing with synthetic adapters can proceed now without claiming these passes.
