# Phase 07.1 Nol UI — host-only notes measurements

This cohort measures the new local notes repository using real, isolated,
file-backed **host** SQLite. It is implementation evidence for the authorized
Notes/UI change, not Phase 08 acceptance or an Android performance claim.

[Raw initial cohort](phase-07-1-nol-ui-notes-host-initial.json) was actually run
2026-10-26 at 20:18 UTC (2026-10-27 at 04:18 Asia/Manila). The JSON preserves exact
start/end times, all 600 measured samples, failures, SQL result sizes, source
SHA-256 values and host conditions. Its result is PASS: zero measured or warmup
failures, zero source changes during the run, integrity `ok`, no foreign-key
violations and successful cleanup. No earlier measurement was overwritten.

## Workload and method

- Fresh temporary `.local/notes-benchmark-*` database, schema 3, `DELETE` journal
  and `synchronous=FULL`. The actual pragma values are recorded. No app database,
  student record, microphone input or backend was opened.
- Seed 500 small synthetic academic notes: half Personal, half Coursework, 50
  pinned. Seed 200 synthetic tasks, 40 completed, so profile counts exercise real
  saved data rather than a hardcoded/empty count. Fixture writes, schema creation
  and TypeScript compilation are outside measured calls.
- Five warmups followed by 100 measured calls per metric. Create adds 105 notes
  including warmups. Edit changes one seeded note 105 times. Subsequent page,
  search and count calls therefore see 605 live notes and 210 operation receipts.
- The script adapts the existing restricted TypeScript-loader approach from
  `benchmark-planner-queries.cjs`. It invokes production notes code with
  `node:sqlite`; validation, prepared SQL, result decoding, transaction/receipt
  writes and file commits are included where those operations occur.
- `performance.now()` times each call. Verification is outside the timer.
  Percentiles use nearest rank, `ceil(p*n)`, over successful samples. Individual
  durations are retained to six decimal places; this is reporting precision, not
  a guarantee of clock accuracy.
- SQL rows crossing the adapter are counted. Page queries returned at most 21
  rows to detect `hasMore`, then exposed at most 20 notes to the UI. Profile counts
  return one row from each of two exact `COUNT(*)` queries.

## Actual results

All times are milliseconds. Each row has 100 successful measured samples.

| Production operation | p50 | p95 | Maximum | Failures |
|---|---:|---:|---:|---:|
| Note create transaction + receipt | 5.3679 | 6.3229 | 26.5516 | 0 |
| Note edit transaction + receipt | 4.7885 | 5.9581 | 27.4369 | 0 |
| First page, 20 notes | 0.6167 | 0.9038 | 2.9305 | 0 |
| Body search, matching page of 20 | 0.6256 | 0.9890 | 1.1435 | 0 |
| Body search, no matching note | 0.6275 | 0.8397 | 0.9832 | 0 |
| Exact completed-task/note counts | 0.5051 | 0.7144 | 0.9835 | 0 |

Final verified counts were 605 live notes, 200 tasks, 40 completed tasks and 210
receipts. The script closed and removed only its explicitly created synthetic
database/journal files and its empty temporary directory; it uses no recursive
deletion.

## Environment and limits

Windows 10.0.26300 x64; AMD Ryzen 5 6600H, 12 logical CPUs; Node v24.19.0,
SQLite 3.53.3 and TypeScript 5.9.3. Host total/free memory snapshots are in the
JSON. Concurrent development/native-build activity was not stopped, and free
memory changed during the run. There was no forced garbage collection, cache
eviction, repeated cohort or controlled process isolation. The mutation maxima
are retained rather than discarded as outliers.

These observations do not establish peak memory, battery use, UI startup,
physical-device storage durability, Android JSI latency, low-RAM acceptance,
alarm reliability or speech quality. `FULL` is the host SQLite configuration;
it does not prove power-loss behavior of a phone or the host storage firmware.
There is no matched legacy baseline and no speedup claim. No new model was
introduced or measured.

The 20-note page bounds returned JavaScript records, **not** database scan work.
Substring `LIKE` searches of note bodies can scan history, especially when no
record matches; the no-match metric is included for that reason. This 500-note
fixture does not establish behavior for a much larger history or 10,000-character
note bodies. Use a separately named cohort before making those claims.

## Reproduction

From the repository root, with the pinned project Node/TypeScript dependencies
installed:

```powershell
node scripts/benchmark-notes.cjs --output docs/benchmarks/phase-07-1-nol-ui-notes-host-new.json
```

Choose an unused output filename. The script refuses to overwrite evidence or
write it outside the repository. It records raw disk hashes for itself,
`package-lock.json` and the domain/storage TypeScript modules actually loaded,
then checks those hashes again after measurement. Its loader accepts only local
domain/storage source. No credential file, Android emulator, model asset or cloud
connection is required.

Physical-phone PSS/startup/battery and other device gates remain **NOT RUN** in
this cohort; use the phase manual checklist under matched device conditions.
