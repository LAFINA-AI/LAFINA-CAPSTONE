import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {captureWindowBudget} from './phase08-emulator-audio.mjs';
const stamp = '2026-10-30T00:00:00.000Z';
const now = Date.parse(stamp);
test('source deadline and final checks fit the native twelve-second gate', () => {
  const w = captureWindowBudget(stamp, now + 650, 4254);
  assert.equal(w.sourceDeadlineMs, 8254);
  assert.ok(650 + w.sourceDeadlineMs + 2000 <= w.nativeGateMs);
  assert.equal(w.finalCheckDeadlineMs, 500);
});
test('last admissible ACK window includes the documented 300ms drain', () => {
  assert.equal(
    captureWindowBudget(stamp, now + 5446, 4254).sourceDeadlineMs,
    4554,
  );
  assert.throws(() => captureWindowBudget(stamp, now + 5447, 4254), {
    code: 'RECORDING_WINDOW_TOO_SHORT_FOR_SOURCE',
  });
});
test('late native READY cannot be made fresh by waiting longer', () => {
  for (const age of [6000, 8000, 10000])
    assert.throws(() => captureWindowBudget(stamp, now + age, 4254));
});
test('limited clock skew consumes reserve without extending the gate', () => {
  assert.equal(
    captureWindowBudget(stamp, now - 1000, 4254).sourceDeadlineMs,
    8254,
  );
  assert.throws(() => captureWindowBudget(stamp, now - 1001, 4254), {
    code: 'INVALID_CAPTURE_WINDOW',
  });
});
test('invalid time and sample durations fail before a source can be submitted', () => {
  for (const duration of [0, -1, NaN, Infinity, 15001])
    assert.throws(() => captureWindowBudget(stamp, now, duration));
  assert.throws(() => captureWindowBudget('invalid', now, 1000));
});
test('import is inert and does not start discovery or microphone RPCs', () => {
  const p = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      "await import('./scripts/phase08-emulator-audio.mjs')",
    ],
    {encoding: 'utf8'},
  );
  assert.equal(p.status, 0);
  assert.equal(p.stdout, '');
  assert.equal(p.stderr, '');
});

test('producer gate matches native coordination without extending production capture', () => {
  const source = readFileSync(
    new URL(
      '../android/app/src/androidTest/java/com/lafina/capstone/reminders/ReminderMicrophoneUiTest.kt',
      import.meta.url,
    ),
    'utf8',
  );
  const match = source.match(
    /val deadline = SystemClock\.elapsedRealtime\(\) \+ ([\d_]+)/,
  );
  assert.ok(match);
  const nativeGate = Number(match[1].replaceAll('_', ''));
  assert.equal(captureWindowBudget(stamp, now, 4254).nativeGateMs, nativeGate);
  assert.ok(nativeGate < 15000);
});
