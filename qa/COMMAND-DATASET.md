# Offline Intent/STT Benchmark Starter Cases

The following are **synthetic prompts**, not evidence of accuracy. Build a versioned 200–300 case dataset including positive, negative, ambiguous and multilingual/accent examples, split train/dev/test. Include actual recordings only with permission.

| ID | Spoken/typed phrase | Expected canonical behavior |
|---|---|---|
| CMD-001 | Remind me to review IT415 tomorrow at 7 PM | Schedule reminder with tomorrow local 19:00 |
| CMD-002 | I have an exam on Friday at 8 in the morning | Create event or ask task/event distinction per context |
| CMD-003 | Set an alarm ten minutes from now | Reminder after +10min |
| CMD-004 | Snooze for ten minutes | Snooze current ringing reminder +10min |
| CMD-005 | Okay | ACK current ringing reminder only |
| CMD-006 | Okay, remind me later | Clarify later time; **not simple ACK** |
| CMD-007 | Repeat that | Repeat reminder prompt, no database changes |
| CMD-008 | Cancel the last reminder | Request target confirmation if ambiguous |
| CMD-009 | What's scheduled today? | Read-only local list |
| CMD-010 | Move that to tomorrow | Clarify target item if no antecedent |
| CMD-011 | Schedule class every Monday at 9 AM | Weekly recurrence if enabled; confirm time/date |
| CMD-012 | Remind me yesterday at 6 PM | Reject past reminder/ask correction |
| CMD-013 | Delete all tasks | Confirm destructive bulk action or out-of-scope rejection |
| CMD-014 | I won't be able to make it | NO_ACK/UNKNOWN without assumed completion |
| CMD-015 | I'll do that after dinner | Clarify exact snooze time |
| CMD-016 | [silence] | No action, recoverable error |
| CMD-017 | [noise-only] | No action, recoverable error |
| CMD-018 | What are USTP Dean's List requirements? | Online handbook route ONLY Phase 10 |
| CMD-019 | Tell me a joke | Offline unsupported/help or benign non-scheduling response per approved policy |
| CMD-020 | Acknowledge and snooze it for 10 minutes | Contradictory -> clarification |

Add date anchor, timezone, expected exact UTC, source task/reminder context, interaction state, permission state and expected critical safety label to each fixture. Store JSON/CSV in benchmarks after Phase 07. WER benchmark corpus must use actual audio with lawful provenance and separate recognition ground truth from intent results.
