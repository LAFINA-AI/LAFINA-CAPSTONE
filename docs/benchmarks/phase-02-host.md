# Phase 02 host benchmark

This benchmark measures synchronous capstone repository operations against a fresh
in-memory SQLite database on the development computer. It does not measure Android
storage, native bridge overhead, UI responsiveness, reminder delivery or phone
memory. It establishes a reproducible synthetic host workload rather than a
physical-device performance result.

The current recorded samples, environment, ten source SHA256 values, timing method,
errors and memory checkpoints are in
[phase-02-host-current.json](phase-02-host-current.json).
Earlier runs remain unchanged in [phase-02-host.json](phase-02-host.json) and
[phase-02-host-final.json](phase-02-host-final.json), together with
[phase-02-host-verified.json](phase-02-host-verified.json). These earlier captures
predate the failed-rollback connection quarantine fix. The file named `final` also
predates the last formatting change to `plannerValidation.ts`; the first run's
hash set omitted the newly split modules. The current run includes
`openLocalDatabase.ts` in its ten-file hash set. Differences between these repeated
host runs do not establish a code performance improvement or a before/after
modularization comparison.

## Current recorded run

Measured at `2026-10-21T17:35:08.455Z` on Windows `10.0.26300` x64, AMD Ryzen 5
6600H (12 logical CPUs), Node `v24.19.0`, SQLite `3.53.3` and TypeScript `5.9.3`.
Each transaction workload has 100 successful measured samples after ten warmups;
the weekly workload has ten successful measured samples after ten warmups.
All six workloads recorded **zero errors**.

| Host-only workload | n | Min ms | p50 ms | p95 ms | Max ms |
|---|---:|---:|---:|---:|---:|
| Create task + reminder + job transaction | 100 | 0.4793 | 0.7339 | 2.2738 | 7.4987 |
| Edit task metadata transaction | 100 | 0.4559 | 0.7649 | 3.8026 | 13.3148 |
| RING state transaction | 100 | 0.3949 | 0.6281 | 1.9566 | 45.8131 |
| ACK state transaction | 100 | 0.1850 | 0.3661 | 1.7608 | 6.3895 |
| SNOOZE state transaction | 100 | 0.2185 | 0.4596 | 4.1607 | 126.7030 |
| Weekly expansion across 366 calendar dates | 10 | 58.4277 | 75.3578 | 117.7429 | 117.7429 |

The largest discrete **HOST process RSS** checkpoint was `145,690,624` bytes.
This is neither Android PSS nor a continuous sampled memory peak. Raw timing and
memory samples remain in the current JSON; the table rounds display values only.

## Reproduce without overwriting evidence

From the repository root after `npm ci`, run:

```powershell
node scripts/benchmark-planner.cjs --output .local/phase-02-host-rerun-01.json
```

Use a new filename for each run. The script refuses to overwrite an existing file
and rejects output paths outside this repository. With no arguments it writes
`docs/benchmarks/phase-02-host.json`, provided that file does not already exist.
No additional packages, Android device or network connection are required once
the repository's dependencies are installed. Node may print its `node:sqlite`
experimental-feature warning on runtimes where that API remains experimental.

The installed TypeScript compiler transpiles only local source modules to
CommonJS in this benchmark process. It does not emit or modify production files.
The source hashes must match before and after the workload; concurrent source
edits abort evidence generation. Run the normal typecheck and tests separately;
`transpileModule` performs no semantic type checking.

## Workload and interpretation

One synchronous `node:sqlite` `DatabaseSync(':memory:')` connection runs the real
planner migration and repository. Each execute prepares its SQL statement. The
workload uses only synthetic task titles and notes, `Asia/Manila`, a deterministic
clock and explicit UTC instants. No student information is collected.

Each create, metadata edit, RING, ACK and SNOOZE workload runs ten warmup calls
followed by 100 measured calls. Creation includes one task and its paired
reminder/job transaction. RING and ACK exercise persisted simulator state changes;
they do not invoke `AlarmManager` or display an Android alert. Snooze uses a
separate set of already-ringing synthetic reminders and a ten-minute interval.
A separate weekly expansion uses all seven weekdays across the 366 dates of
2024, with ten warmups and ten measured expansions. The final integrity checks
require 220 tasks, reminders and jobs, 110 ACK reminders and 110 snoozed reminders;
all tasks must remain TODO and native delivery must remain UNAVAILABLE.

Latency uses `performance.now()` around successful synchronous repository calls.
Result assertions run outside the timed region. Percentiles use nearest rank,
`ceil(p*n)`, over successful calls; failures are counted and retained separately.
Migration, module loading, transpilation, fixture setup and final integrity
checks are outside the timed regions. There is no filesystem persistence or
fsync cost in this workload. Garbage collection, JIT and host scheduling are not
controlled, so repeat runs can vary.

Memory checkpoints report **HOST process RSS**, heap and external allocation.
They include Node, TypeScript, loaded modules, fixtures and the in-memory
database. The largest checkpoint is not a continuous memory peak and cannot be
interpreted as Android PSS or as a phone RAM requirement.

## Measurements still NOT RUN

Comparable legacy-versus-capstone phone measurements, Android startup, peak PSS,
battery use, reminder delivery reliability, STT accuracy/latency, Android system
TTS latency/voice quality, Kokoro comparison and physical low-RAM device validation
are **NOT RUN** by this script. Use the shared device protocol in
[phase-00-baseline.md](phase-00-baseline.md) before making device performance
claims. Host timings cannot establish an Android speed improvement or a minimum
supported RAM capacity.
