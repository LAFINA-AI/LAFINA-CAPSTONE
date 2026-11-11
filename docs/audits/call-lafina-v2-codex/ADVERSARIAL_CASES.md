# Minimum adversarial cases

Audit HEAD `fe489a6487884fa6667f1cc6e2e0bddbd24e386d`. Every physical/provider component below is NOT_RUN; passing host subcases never certify hardware. Exact original acceptance rows remain in ACCEPTANCE_AUDIT.csv.

| Case | Host/static result | Evidence / unresolved action |
|---:|---|---|
| 1 Guest cannot capture | Host gates pass | Controller/Phase03 suites; actual mic NOT_RUN |
| 2 Online Mode/consent missing | Host initial gates pass | Controller suites; mid-session revocation requires integration testing |
| 3 Account changes during tool | PARTIAL | CL2-014; real call session not carried into action state |
| 4 Mute recorder release | Code/JVM rules present | Native AudioRecord lifecycle; actual OS indicator/capture NOT_RUN |
| 5 Barge-in stops old output | Synthetic event passes | Native queue generation flush present; acoustics/new speech acceptance NOT_RUN |
| 6 Stop native PCM/local TTS | PARTIAL | Provider PCM Stop path exists; real mixed-output timing NOT_RUN |
| 7 End/Home/lock/network during start | Synthetic generation/system-stop coverage | Native/phone validation NOT_RUN; CL2-014 action cleanup gap |
| 8 Prepare/cancel reminder zero writes | PARTIAL | Existing on-screen review tests pass; spoken shadow cancel does not invalidate review, CL2-002 |
| 9 Duplicate confirm/callback | FAILED | CL2-001 fake durable confirm; CL2-009 targeted retry duplicates SQL |
| 10 Change to 4 PM / stale token | FAILED, reproduced | CL2-002: real original review still saves 3 PM |
| 11 Storage/scheduler failure no false Done | FAILED | CL2-001/008; no SQL writes on confirm tool despite saved response; grouped alarm result not awaited |
| 12 Timezone/overnight/recurrence/no guessing | FAILED | CL2-008 silent date/time defaults; CL2-011 interval/read error problem |
| 13 Dictate/save/read note correct owner | PARTIAL | Host stores pass; CL2-010 editable card/result navigation missing |
| 14 Memory off/read/save | Off gate host pass; overall PARTIAL | CL2-003/004 break enabled review; real provider memory context NOT_RUN |
| 15 Hostile stored-note instructions | PARTIAL | Bounded data/metadata and allowlist present; regex is not full provider injection proof, CL2-013 |
| 16 Unknown/malformed/replayed tools | PARTIAL | Unknown names rejected and same tool ID dedup in controller; CL2-007/013 schema defects; real provider NOT_RUN |
| 17 Multi-action item failure | Scoped host pass | Existing Phase11 SQL partial-failure test passes; CL2-007/008/009 still break full flow |
| 18 Review card keeps live call | PARTIAL | No forced end in Confirm; actual provider acknowledgment not wired outside direct test path; CL2-006/014 |
| 19 Offline PTT/typed tasks/alarms/Chat | Host suites pass | Airplane-mode native phone regression NOT_RUN |
| 20 Selected voice / waveform actual output | FAILED voice mapping; PCM code present | CL2-005; native PCM RMS tests pass; phone audibility NOT_RUN |
| 21 320dp/large text/keyboard/TalkBack | NOT_RUN | CL2-017; layout source insufficient for acceptance |
| 22 Missing agent/401/402/rate limit/timeout | Host failure fixtures pass | Real authenticated provider/server path NOT_RUN; CL2-015 |
