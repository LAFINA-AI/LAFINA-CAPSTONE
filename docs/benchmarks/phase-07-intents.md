# Phase 07 — frozen command evaluation and host parser timing

This is synthetic English **text parsing**, not executed scheduling, speech
recognition, Android latency or human language-quality acceptance. Storage,
native alarm and emulator checks belong to the separate Phase 07 report.
No matched legacy baseline was run and no speedup is claimed.

## Frozen independent corpus

[The 64-case corpus](phase-07-command-corpus.json) was authored from the declared
public grammar/types before reading the capstone parser's rules or sharing cases
with its implementer. It was frozen at `2026-10-26T01:08:07.878Z`, before the first
evaluation at `2026-10-26T01:11:16.528Z`:

```text
SHA256 41ff335b5c20c054ba98b626cc21058fc8d1208f1c9e6a1b6e0196021c16e6ef
```

There are 32 ready labels and 32 refusal labels. Ready cases cover explicit task,
event, query, move, completion, deletion, ACK, snooze and repeat grammar with
selected title/target/date/time/duration slots. Refusal cases cover missing or
ambiguous slots, bare weekdays/hours, past/impossible dates, negation, compound
commands, bulk/vague deletion, SQL/JSON/prompt-like input and greetings that must
not become ACKs. A refusal may be either clarification or unsupported; an
exception is a failure. The fixed clock is `2026-10-26T00:00:00.000Z`, timezone
`Asia/Manila` (local 08:00 on October 26).

The corpus is small, intentionally scoped and synthetic. It is not representative
of spontaneous student language, Filipino/Tagalog, speech errors, accents or noise.
Selected-slot accuracy is limited to the frozen fields; later-added output fields
are retained in raw results but not retroactively added to the labels. A ready
ACK/snooze with a null target is only a parser proposal: without a valid reminder
source the executor must ask for clarification and perform no action.
The public deterministic confidence value is a grammar-acceptance flag, not an
empirically calibrated probability that the user's intention was understood.

Only the **first** evaluation is held out. Once its failures are disclosed, any
subsequent run on changed implementation is a regression evaluation on the same
immutable labels, not a new unseen-data accuracy estimate. Do not rewrite labels
or erase failures to improve a reported score.

## First executed result

[First raw results](phase-07-intents-host-first.json), completed
`2026-10-26T01:11:17.213Z`, record actual parser outputs, metadata/slot scores,
every distinct repeated output/error variant and every raw latency sample.

| Metric | First result | Denominator / limit |
|---|---:|---|
| Exact intent/refusal + selected slots + metadata | 62/64, 96.875% | Includes both valid and refusal labels. |
| Intent or acceptable refusal matches | 64/64, 100% | Does not establish general semantic accuracy. |
| Selected leaf slots | 86/88, 97.727% | Null versus missing is checked; wrong intent gets no matching-slot credit. |
| Valid public proposal metadata | 64/64 | Timezone, confidence, confirmation and missing-slot structure; not execution authorization. |
| False ACK proposals on refusal labels | 0/32 | Parser proposals only, not observed false database ACKs. |
| False scheduling proposals on refusal labels | 0/32 | Create task/event or move proposals; separate from executor side effects. |
| Any unsafe ready mutation proposal on refusal labels | 0/32 | Includes complete/delete/snooze as well as ACK/scheduling. |
| Exceptions / nondeterministic repeated cases | 0/64 / 0/64 | Fixed input/clock/context; no model sampling. |
| Repeated slot/metadata/intent mismatches | 200/6,400 | Two deterministic title mismatches repeated 100 times each. |
| Parse-call p50 / p95 | 0.0284 / 0.2767 ms | 6,400 host calls; first calls separately retained. |
| Minimum / maximum observed parse-call duration | 0.0032 / 7.1633 ms | Host scheduling/JIT/caches uncontrolled; not a phone bound. |

The two initial failures are `task-03` and `task-08`: an explicit undated suffix
remained in the task title. Due-date/time/reminder fields were correct, but the
title did not match the declared grammar. These first failures remain recorded
even if implementation is later corrected. No parser code or fixture label was
changed by the evaluation author.

## Regression after the explicit undated fix

The parser now treats an unquoted trailing `undated` as a slot modifier; quoted
literal titles retain that word. The [regression run](phase-07-intents-host-reviewed.json)
uses the same frozen labels after this implementation fix:64/64 exact,
64/64 intent/refusal,88/88 selected slots, no exceptions or nondeterminism, and
zero unsafe ready proposals on32 refusal cases. All6,400 repeated calls matched.
Observed host parse-call p50/p95 was0.0178/0.1620ms (min0.0031,max1.1258ms).
This is regression evidence after seeing the first errors, not another held-out
accuracy claim or a controlled speed comparison between implementations.

## Reproduce without overwriting evidence

The [benchmark script](../../scripts/benchmark-intents.cjs) uses installed
TypeScript to load only source in `core/ai` and `core/domain`, records hashes of
the exact bytes compiled, and checks them again after measurement. It opens no
database, runs no command executor, captures no audio and invokes no model or
network service. Corpus SHA256 is pinned in the script.

```powershell
# First unseen evaluation only; refuses an existing result or another first path.
node scripts/benchmark-intents.cjs

# After any implementation has seen the first results, use a new regression path.
node scripts/benchmark-intents.cjs --evaluation regression --output docs/benchmarks/phase-07-intents-host-reviewed.json
```

A mismatch sets a nonzero exit code **after** preserving raw results. Output must
be a new JSON file inside the repository. Choose a new cohort filename for every
later run; never overwrite the first or previously reviewed results. Retain its
source, corpus, harness and package-lock hashes with the APK/source cohort used
for review. Source drift during measurement invalidates that run.

One initial result per case is followed by 100 repeated timed calls per case,
with no explicit warmups or forced GC. `performance.now()` measures only the
`parseIntent` call. Corpus loading, TypeScript compilation, output serialization,
verification and writing are excluded. Rejected and thrown calls remain in
timing denominators. p50 is the arithmetic median and p95 uses nearest rank
`ceil(.95*n)`. Module/filesystem caches, JIT, thermals and unrelated host work are
not controlled. Timing order and all raw values remain visible.

Raw output also records two host process memory checkpoints. Those are neither
continuous peak memory nor Android PSS, whole-app RAM or energy measurements.
No cold phone startup, STT/release-to-result latency or battery result is inferred
from this harness. Accuracy is evaluated on text classification and selected
slots; validated durable actions require independent repository/executor tests.

## Model and remaining evidence

No additional intent language model is included. The
[pinned legacy review](../audits/phase-07-legacy-intents.md) found deterministic
native extraction despite SmolLM2 naming; that is not an actual model-inference
baseline. [ADR-007](../decisions/ADR-007-validated-intents.md) requires measurable
benefit before optional bounded model use. Mocked or absent model interfaces are
not model integration or performance results.

Matched legacy/new measurements, physical API30/ARM64/low-RAM phones, human speech,
Filipino-accent/Tagalog/noise accuracy, Android parser latency/PSS/startup/energy,
real call/secure-lock interruption and end-to-end spoken scheduling remain
**NOT RUN / HUMAN REQUIRED** until separately recorded. The six direct-PCM
Whisper samples from Phase 06 are a distinct STT cohort and are not command
parser or executor accuracy evidence.
