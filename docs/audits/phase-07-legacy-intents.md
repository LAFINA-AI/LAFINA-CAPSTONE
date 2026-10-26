# Phase 07 — pinned legacy intent and date review

Date: 2026-10-26, Asia/Manila. Scope: targeted **read-only source inspection** for
the explicitly approved Phase 07. No legacy build, test, dependency installation,
model load, code copy or write was performed. No runtime or performance result is
inferred from this review.

## Source and provenance boundary

All evidence was freshly fetched using the connected GitHub `fetch_file` tool,
`repository_full_name=LAFINA-AI/LAFINA`, and explicit immutable revision
`f7e70aec54e6d16e627f444f2a67114cbfb07b5e`. The recursive tree at that same ref
was read for path/blob and root-notice discovery. The local legacy directory was
not used as the pinned source: its revision is not established, and its parser
differs from the fetched revision. It remains read-only.

| Pinned file | Git blob SHA | Freshly inspected lines |
|---|---|---|
| [NLU parser][parser] | `fc740c20f0892c3a81521e448a07b7cf4aabebe6` | 1–615 |
| [JSON parser][json] | `8b9256cf7b6ad75b77db061f2915d6503c30f74f` | 1–127 |
| [Schedule applicator][scheduler] | `a85c10ea2a312648065b95ac4a1797e761854658` | 58–226 |
| [NLU examples/tests][tests] | `8270ae7166f598ad222187cb7f96ff6346e8f7d9` | 93–406 |
| [JSON boundary tests][json-tests] | `79aa4e28666c665570c40d3ef4c6757cde0c37ff` | 1–127 |
| [Native intent extractor][native] | `bc8113e229e8b5b7f9513e2ce2f5bc9a7484ffaa` | 1–190 |
| [Voice/text pipeline][pipeline] | `8e2ce8c5608f7b75dda91fc2e4c27f59239e7a1f` | 160–285 |
| [NLU prompt][prompt] | `17fe754948b74bf2d8a08993dc1747ac366a90aa` | 1–43 |
| [Reminder keyword dispatcher][dispatcher] | `846c4f408dc3d92baf5bf4378ba9ea0dda82a97d` | 300–510 |

The pinned root tree has no root LICENSE, COPYING or NOTICE. This is not a
finding that third-party licenses are absent elsewhere. The owner previously
confirmed source/brand authorization, with details to follow; see the
[Phase 00 provenance record](phase-00-reuse.md). Owner attribution details and
independent terms for any separately acquired model/runtime still apply. This
review supplies behavior/test ideas; it does not authorize wholesale source,
business-module, account, model or asset imports.

## Reuse decisions and concrete hazards

| Area and pinned evidence | Reuse decision | Required capstone behavior |
|---|---|---|
| Parser 46–69; tests 383–406: compact clock/meridiem normalization | Adapt narrowly scoped normalization/test ideas. | Preserve title numbers and unrelated words. Normalize only a recognized clock slot; validate 12-hour bounds rather than accepting hours above 12 with AM/PM. |
| Parser 313–385; tests 294–381: relative elapsed-time arithmetic | Adapt the distinction between elapsed offsets and wall-clock dates. | Inject clock and selected IANA timezone. Preserve a validated instant; do not round a sub-minute value to zero or substitute the host timezone. Test real DST gaps/folds and cross-midnight behavior explicitly. |
| Parser 117–229; tests 93–240: month/day, slash dates, weekday rollover and implicit today | Replace temporal policy. | Reject impossible dates through the existing capstone date validator. Clarify ambiguous slash dates, bare weekdays and missing schedule slots; do not silently move a past requested hour/date into another day, week or year. |
| Parser 387–443 and 493–528: aggressive global title cleaning, generic replacement title, broad scheduling trigger | Replace command boundary. | Parse an anchored supported command into a proposal. Missing title/time/date and unsupported syntax produce clarification. Incidental time/class/action words cannot themselves authorize a schedule. No assistant success text before durable commit. |
| Parser 468–490; native 78–113: greetings/help share the `acknowledge` intent label | Do not reuse that intent taxonomy. | Greetings/help are read-only responses. Reminder ACK requires an explicit supported command and a validated current source/occurrence. This label collision alone does not establish that the inspected legacy schedule applicator writes ACKs. |
| Parser 563–579: completion searches all tasks and takes first substring match | Reject implementation. | Require a concrete unique target and optimistic version. Empty, duplicate, partial or vague target names cannot complete the first available task. Completion remains separate from reminder ACK. |
| JSON parser 51–79, 81–127; JSON tests 27–48 | Retain malformed-type/unknown-intent test ideas; replace schema validation. | Exact allowlisted discriminants/keys, bounded integral durations, real dates, trusted source target/version and legal transitions. Fractional positives can round to zero in legacy; date-shaped impossible strings bypass its date parse check. Surrounding prose/unknown properties are not authorization. |
| Schedule applicator 58–88 and 91–226 | Reject storage coupling. | Existing capstone repository transactions own task/event plus reminder/job mutation and receipts. No generic recurrence collapse that loses requested weekdays; no invented due hour; durable save and Android delivery readiness reported separately. Legacy catches reminder/native failures while still returning a scheduling success. |
| Dispatcher 301–359: keyword-anywhere ACK, fuzzy near-keywords, mixed exact ACK/SNOOZE refusal | Preserve contradictory-command refusal as a test; reject fuzzy side effects. | A negated acknowledgement must stay a no-op; fuzzy text resembling ACK cannot dismiss an alert. Unknown/vague/mixed responses ask for clarification. Exact source identity and legal reminder state are rechecked at confirmation. |
| Dispatcher approximately 397–407 and 410–478: failed attempts retry and eventually auto-snooze | Reject automatic voice action/retry policy. | Parser failure, silence or uncertainty must never ACK or snooze. A new visible hold and explicit reviewed action remain required. Manual controls continue to work. |
| Prompt 23–32: UTC date anchor; native 22–190: deterministic extraction with null date | Reference only. | Resolve student calendar phrases in selected timezone. A bundled model filename or options named model/prompt/tokens do not prove inference or improve missing-date correctness. |

These are static findings and proposed capstone safeguards. For example, the
dispatcher has no negation check before its exact ACK match, so a negated ACK
phrase is a false-action risk by inspection. This is not a claimed executed
legacy phone failure.

## Tests worth adapting, with changed expectations

- Keep meaningful chapter/course numbers, compact meridiem clocks, midnight
  offset crossing and unknown JSON type/intent cases from the pinned tests.
- Replace implicit-today, automatic future-week/year rollover and generic-title
  success assertions with explicit slot handling or clarification appropriate to
  the published grammar. A date-only task must not gain a fabricated alarm hour.
- Add negation, contradictory ACK/SNOOZE, vague pronouns, duplicate titles,
  missing source IDs, stale versions/generations, unknown keys, impossible dates,
  fractional/oversized durations and repeated confirmations.
- Keep the old greeting-with-zero-records scenario; give greetings a read-only
  type instead of a reminder outcome label.
- The legacy DST example uses a host-local constructor and does not force a US
  timezone. When executed in Manila it does not exercise a US DST transition.
  Use explicit timezone fixtures and valid/invalid wall times, not comments as
  evidence that DST was tested.
- Freeze a separate labeled evaluation set and retain rejected/unsupported
  outcomes in accuracy and false-action denominators. The pinned suite is
  inspiration, not a held-out capstone result.

## Model and measurement decision

The inspected native extractor reads transcript text and performs Kotlin rules.
It does not load the supplied model, prompt or token options. The pipeline's
SmolLM2 naming therefore does not establish a model inference baseline. Importing
the old approximately 145 MB model would add an unmeasured dependency without
evidence that it resolves ambiguity safely. Keep optional NLU inference disabled
unless a separate bounded, licensed, device-measured experiment establishes a
benefit. No Laya, Gemini, RAG or general chatbot behavior is justified here.

**Legacy parser/model latency, accuracy, memory and matched old/new phone
comparison: NOT RUN.** Capstone parser/executor tests, held-out scoring and actual
emulator/phone validation belong to the Phase 07 execution report. Do not turn
this source inspection into a speedup or successful speech claim.

[parser]: https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/src/ai/nlu/parser.ts
[json]: https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/src/ai/nlu/jsonParser.ts
[scheduler]: https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/src/ai/nlu/scheduler.ts
[tests]: https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/__tests__/ai/nlu.test.ts
[json-tests]: https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/__tests__/ai/nluJsonParser.test.ts
[native]: https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/android/app/src/main/java/com/lafina/LafinaVoiceModules.kt
[pipeline]: https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/src/ai/native/voicePipeline.ts
[prompt]: https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/src/ai/nlu/prompt.ts
[dispatcher]: https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/src/scheduler/callDispatcher.ts
