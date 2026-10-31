// Private, synthetic in-memory protocol and scheduling checks only.
// No SDK discovery, ADB, emulator, host audio, WAV files, or real-time pacing.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {
  audioFormatPacket,
  audioPackets,
  nextRealtimeDeadline,
  nominalRealtimeDeadline,
  parseAudioOptions,
  sourceSubmissionOutcome,
} from './phase08-emulator-audio.mjs';

const CANDIDATE_URL = new URL('./phase08-emulator-audio.mjs', import.meta.url);
const CANDIDATE_PATH = fileURLToPath(CANDIDATE_URL);
const WALL_MS = 1700000000000;
const START_MS = 1000;
const LEGACY_FORMAT = Buffer.from('0a0508807d1801', 'hex');
const REALTIME_FORMAT = Buffer.from('0a0708807d18012001', 'hex');

function sourceBytes(length) {
  return Buffer.from(
    Array.from({length}, (_, index) => (index * 73 + 19) % 256),
  );
}
function encodeUnsigned(value) {
  let remainder = BigInt(value);
  const encoded = [];
  do {
    const low = Number(remainder % 128n);
    remainder /= 128n;
    encoded.push(low + (remainder ? 128 : 0));
  } while (remainder);
  return Buffer.from(encoded);
}
function legacyPackets(pcm) {
  const packets = [];
  for (let offset = 0; offset < pcm.length; offset += 640) {
    const chunk = pcm.subarray(offset, offset + 640);
    packets.push(
      Buffer.concat([
        LEGACY_FORMAT,
        Buffer.from([0x10]),
        encodeUnsigned(BigInt(WALL_MS) * 1000n),
        Buffer.from([0x1a]),
        encodeUnsigned(chunk.length),
        chunk,
      ]),
    );
  }
  return packets;
}
// Independently decode the three expected protobuf fields to check payload identity.
function decodePacket(packet, expectedFormat) {
  assert.ok(Buffer.isBuffer(packet));
  assert.deepEqual(packet.subarray(0, expectedFormat.length), expectedFormat);
  let cursor = expectedFormat.length;
  const readUnsigned = () => {
    let number = 0n;
    let scale = 1n;
    for (let count = 0; count < 10; count += 1) {
      assert.ok(cursor < packet.length, 'truncated protobuf varint');
      const byte = packet[cursor++];
      number += BigInt(byte & 127) * scale;
      if (!(byte & 128)) return number;
      scale *= 128n;
    }
    assert.fail('overlong protobuf varint');
  };
  assert.equal(
    packet[cursor++],
    0x10,
    'timestamp field must be field 2 / varint',
  );
  const timestampUs = readUnsigned();
  assert.equal(packet[cursor++], 0x1a, 'PCM field must be field 3 / bytes');
  const length = Number(readUnsigned());
  assert.equal(
    cursor + length,
    packet.length,
    'one exact PCM field, no trailing bytes',
  );
  assert.ok(length > 0 && length <= 640);
  return {timestampUs, pcm: packet.subarray(cursor)};
}
function makeClock({oversleeps = [], slipEverySleep = 0} = {}) {
  let time = START_MS;
  let reads = 0;
  const sleeps = [];
  const remaining = [...oversleeps];
  return {
    nowMs() {
      reads += 1;
      return time;
    },
    async sleepMs(duration) {
      assert.ok(Number.isFinite(duration) && duration > 0);
      sleeps.push(duration);
      time +=
        duration + (remaining.length ? remaining.shift() : slipEverySleep);
    },
    advance(duration) {
      time += duration;
    },
    get time() {
      return time;
    },
    get reads() {
      return reads;
    },
    get sleeps() {
      return [...sleeps];
    },
  };
}
async function collect(pcm, settings) {
  const packets = [];
  for await (const packet of audioPackets(pcm, settings)) packets.push(packet);
  return packets;
}
function hasCode(code) {
  return error => error?.code === code && error?.message === code;
}
function assertCompleteMetrics(metrics, bytes, packetCount) {
  assert.equal(metrics.packetsOffered, packetCount);
  assert.equal(metrics.sourceBytesOffered, bytes);
  assert.equal(metrics.lateAbort, false);
  assert.equal(metrics.bytesOfferedAreNotDeliveryProof, true);
  assert.equal(
    metrics.counterBoundary,
    'GENERATOR_YIELDS_NOT_TRANSPORT_ACKNOWLEDGEMENTS',
  );
}

test('source abort and final guard failure cannot count as recognition trials', () => {
  assert.equal(sourceSubmissionOutcome({}), 'NOT_SUBMITTED');
  assert.equal(
    sourceSubmissionOutcome({sourceStreamAttempted: true}),
    'SOURCE_RPC_ABORTED',
  );
  const completed = {
    sourceStreamAttempted: true,
    sourceStreamCompleted: true,
    injectionGrpcStatus: 0,
    status: 'SYNTHETIC_STREAM_COMPLETED',
    hostMicrophoneEnabledBefore: false,
    hostMicrophoneEnabledAfter: false,
  };
  assert.equal(
    sourceSubmissionOutcome(completed),
    'SOURCE_RPC_COMPLETED_HOST_OFF',
  );
  for (const changed of [
    {hostMicrophoneEnabledAfter: true},
    {hostMicrophoneEnabledAfter: undefined},
    {hostMicrophoneEnabledBefore: true},
    {status: 'BLOCKED'},
  ])
    assert.equal(
      sourceSubmissionOutcome({...completed, ...changed}),
      'SOURCE_RPC_COMPLETED_GUARD_UNVERIFIED',
    );
  for (const changed of [
    {sourceStreamCompleted: false},
    {injectionGrpcStatus: 4},
    {injectionGrpcStatus: undefined},
  ])
    assert.equal(
      sourceSubmissionOutcome({...completed, ...changed}),
      'SOURCE_RPC_ABORTED',
    );
  // Even a completed source with host input OFF never certifies app recognition.
  assert.equal(completed.recognitionVerified, undefined);
});
function runIsolatedNode(args) {
  const result = spawnSync(process.execPath, args, {
    env: {},
    encoding: 'utf8',
    timeout: 5000,
    windowsHide: true,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  assert.equal(result.stderr, '');
  return result;
}
function assertCliRejected(args, reason) {
  const result = runIsolatedNode([CANDIDATE_PATH, ...args]);
  assert.equal(result.status, 2);
  const lines = result.stdout.trim().split(/\r?\n/);
  assert.equal(lines.length, 1, 'fixed redacted result only');
  const outcome = JSON.parse(lines[0]);
  assert.equal(outcome.status, 'BLOCKED');
  assert.equal(outcome.reason, reason);
  for (const key of [
    'microphoneStateRead',
    'injectionAttempted',
    'inputInitializationAttempted',
    'sourceStreamAttempted',
    'sourceStreamCompleted',
    'hostInputEnableRequested',
    'audioCaptured',
    'recordingsSaved',
    'recognitionVerified',
    'audibilityVerified',
  ])
    assert.equal(outcome[key], false, key);
}

const injectionOnlyArguments = [
  ['--wav', 'synthetic-does-not-exist.wav'],
  ['--visible-proof', 'synthetic-does-not-exist.json'],
  ['--padding-ms', '0'],
  ['--gain-permille', '1000'],
  ['--initialize-input'],
  ['--delivery-mode', 'blocking'],
  ['--delivery-mode', 'realtime'],
];

test('pure options default to blocking and retain explicit injection flags', () => {
  assert.deepEqual(parseAudioOptions([]), {deliveryMode: 'blocking'});
  assert.deepEqual(parseAudioOptions(['--serial', 'emulator-5554']), {
    '--serial': 'emulator-5554',
    deliveryMode: 'blocking',
  });
  for (const mode of ['blocking', 'realtime']) {
    const args = parseAudioOptions(['--inject', '--delivery-mode', mode]);
    assert.equal(args.deliveryMode, mode);
    assert.equal(args['--inject'], true);
  }
  assert.equal(
    parseAudioOptions(['--inject', '--initialize-input']).deliveryMode,
    'blocking',
  );
});

test('invalid delivery modes are rejected by pure parsing and format generation', () => {
  for (const mode of ['', 'REALTIME', 'real-time', '0', 'other']) {
    assert.throws(
      () => parseAudioOptions(['--inject', '--delivery-mode', mode]),
      hasCode('DELIVERY_MODE_MUST_BE_BLOCKING_OR_REALTIME'),
    );
    assert.throws(
      () => audioFormatPacket(mode),
      hasCode('DELIVERY_MODE_MUST_BE_BLOCKING_OR_REALTIME'),
    );
  }
});

test('every injection-only argument requires --inject, even with --help', () => {
  for (const args of injectionOnlyArguments) {
    assert.throws(
      () => parseAudioOptions(args),
      hasCode('INJECTION_FLAG_REQUIRED'),
    );
    assert.throws(
      () => parseAudioOptions(['--help', ...args]),
      hasCode('INJECTION_FLAG_REQUIRED'),
    );
  }
});

test('realtime initialization is rejected before any live environment access', () => {
  assert.throws(
    () =>
      parseAudioOptions([
        '--inject',
        '--delivery-mode',
        'realtime',
        '--initialize-input',
      ]),
    hasCode('REALTIME_INITIALIZATION_NOT_SUPPORTED'),
  );
  assert.equal(
    parseAudioOptions([
      '--inject',
      '--delivery-mode',
      'blocking',
      '--initialize-input',
    ])['--initialize-input'],
    true,
  );
});

test('protobuf format bytes preserve default blocking and add only realtime mode=1', () => {
  assert.deepEqual(audioFormatPacket(), LEGACY_FORMAT);
  assert.deepEqual(audioFormatPacket('blocking'), LEGACY_FORMAT);
  assert.deepEqual(audioFormatPacket('realtime'), REALTIME_FORMAT);
});

test('anchored deadlines cap prefill and enforce a five-ms recovery floor', () => {
  for (let index = 0; index < 10; index += 1) {
    assert.equal(nextRealtimeDeadline(index, START_MS, undefined), START_MS);
    assert.equal(nominalRealtimeDeadline(index, START_MS), START_MS);
  }
  assert.equal(nominalRealtimeDeadline(10, START_MS), START_MS + 20);
  assert.equal(nominalRealtimeDeadline(11, START_MS), START_MS + 40);
  assert.equal(nextRealtimeDeadline(10, START_MS, START_MS), START_MS + 20);
  assert.equal(
    nextRealtimeDeadline(11, START_MS, START_MS + 100),
    START_MS + 105,
  );
  assert.equal(nextRealtimeDeadline(0, START_MS, undefined, 1), START_MS);
  assert.equal(
    nextRealtimeDeadline(1, START_MS, START_MS + 50, 1),
    START_MS + 55,
  );
  assert.equal(nominalRealtimeDeadline(1, START_MS, 1), START_MS + 20);
});

test('default blocking packets are byte-identical to legacy and never touch pacing clocks', async () => {
  const pcm = sourceBytes(640 * 12 + 74);
  const metrics = {};
  let wallReads = 0;
  const packets = await collect(pcm, {
    clock: {
      nowMs() {
        assert.fail('blocking used monotonic clock');
      },
      sleepMs() {
        assert.fail('blocking slept');
      },
    },
    wallNowMs() {
      wallReads += 1;
      return WALL_MS;
    },
    metrics,
  });
  assert.deepEqual(packets, legacyPackets(pcm));
  assert.equal(wallReads, 13);
  assertCompleteMetrics(metrics, pcm.length, 13);
  assert.equal(metrics.mode, 'blocking');
  assert.equal(metrics.initialPrefillAudioMs, 0);
});

test('realtime offers at most 200 ms immediately, then spaces packets by 20 ms', async () => {
  const pcm = sourceBytes(640 * 12 + 74);
  const clock = makeClock();
  const metrics = {};
  const offeredAt = [];
  const packets = [];
  let wallReads = 0;
  for await (const packet of audioPackets(pcm, {
    deliveryMode: 'realtime',
    clock,
    wallNowMs() {
      wallReads += 1;
      return WALL_MS;
    },
    metrics,
  })) {
    offeredAt.push(clock.time);
    packets.push(packet);
  }
  assert.deepEqual(offeredAt, [...Array(10).fill(START_MS), 1020, 1040, 1060]);
  assert.deepEqual(clock.sleeps, [20, 20, 20]);
  assert.equal(wallReads, 1, 'realtime timestamps are anchored once');
  assert.ok(clock.reads > 0);
  assert.equal(metrics.initialPrefillAudioMs, 200); // Planned capped prefill.
  assert.equal(metrics.initialPrefillBytes, 6400);
  assert.equal(metrics.actualPrefillBytesOffered, 6400);
  assert.equal(metrics.actualPrefillAudioMsOffered, 200);
  assert.equal(metrics.maxLatenessMs, 0);
  assert.equal(metrics.maxCumulativeLagMs, 0);
  assert.equal(metrics.maxAllowedCumulativeLagMs, 100);
  assert.deepEqual(metrics.jitterMs, {samples: 13, min: 0, max: 0, mean: 0});
  assertCompleteMetrics(metrics, pcm.length, 13);
  packets.forEach((packet, index) => {
    const decoded = decodePacket(packet, REALTIME_FORMAT);
    assert.equal(
      decoded.timestampUs,
      BigInt(WALL_MS) * 1000n + BigInt(offeredAt[index] - START_MS) * 1000n,
    );
  });
});

test('shorter approved prefill and partial input report bounded actual prefill', async () => {
  for (const prefillMs of [20, 40, 200]) {
    const pcm = sourceBytes(640 * 10 + 74);
    const clock = makeClock();
    const metrics = {};
    const times = [];
    for await (const _ of audioPackets(pcm, {
      deliveryMode: 'realtime',
      clock,
      wallNowMs: () => WALL_MS,
      prefillMs,
      metrics,
    }))
      times.push(clock.time);
    const initialPackets = prefillMs / 20;
    assert.equal(
      times.filter(value => value === START_MS).length,
      initialPackets,
    );
    assert.equal(metrics.initialPrefillBytes, prefillMs * 32);
    assert.equal(metrics.actualPrefillBytesOffered, prefillMs * 32);
    assert.equal(metrics.actualPrefillAudioMsOffered, prefillMs);
    for (let index = initialPackets; index < times.length; index += 1)
      assert.equal(times[index] - times[index - 1], 20);
  }
  const metrics = {};
  await collect(sourceBytes(74), {
    deliveryMode: 'realtime',
    clock: makeClock(),
    wallNowMs: () => WALL_MS,
    metrics,
  });
  assert.equal(metrics.initialPrefillBytes, 74);
  assert.equal(metrics.initialPrefillAudioMs, 74 / 32);
  assert.equal(metrics.actualPrefillBytesOffered, 74);
  assert.equal(metrics.actualPrefillAudioMsOffered, 74 / 32);
});

test('every source byte is offered exactly once, including empty and final partial packets', async () => {
  for (const mode of ['blocking', 'realtime']) {
    for (const length of [0, 1, 74, 639, 640, 641, 6400, 6401, 6474]) {
      const pcm = sourceBytes(length);
      const before = Buffer.from(pcm);
      const metrics = {};
      const packets = await collect(pcm, {
        deliveryMode: mode,
        clock: makeClock(),
        wallNowMs: () => WALL_MS,
        metrics,
      });
      const payloads = packets.map(
        packet =>
          decodePacket(
            packet,
            mode === 'blocking' ? LEGACY_FORMAT : REALTIME_FORMAT,
          ).pcm,
      );
      assert.deepEqual(
        Buffer.concat(payloads),
        pcm,
        `${mode}, ${length} bytes`,
      );
      assert.deepEqual(pcm, before, 'source memory remains unchanged');
      assertCompleteMetrics(metrics, length, Math.ceil(length / 640));
    }
  }
});

test('80 ms oversleep recovers to anchored timing without an immediate backlog flush', async () => {
  const clock = makeClock({oversleeps: [80]});
  const metrics = {};
  const offeredAt = [];
  const pcm = sourceBytes(640 * 18);
  const packets = [];
  for await (const packet of audioPackets(pcm, {
    deliveryMode: 'realtime',
    clock,
    wallNowMs: () => WALL_MS,
    metrics,
  })) {
    offeredAt.push(clock.time);
    packets.push(packet);
  }
  assert.deepEqual(offeredAt, [
    ...Array(10).fill(START_MS),
    1100,
    1105,
    1110,
    1115,
    1120,
    1125,
    1140,
    1160,
  ]);
  assert.deepEqual(clock.sleeps, [20, 5, 5, 5, 5, 5, 15, 20]);
  assert.equal(metrics.maxLatenessMs, 80);
  assert.equal(metrics.maxCumulativeLagMs, 80);
  assert.equal(
    metrics.cumulativeLagMs,
    0,
    'recovers instead of retaining the stall',
  );
  assert.equal(metrics.minimumPostPrefillSpacingMs, 5);
  assert.equal(metrics.pacingSchedule, 'ANCHORED_20MS_MIN_SPACING_5MS');
  for (let index = 10; index < offeredAt.length; index += 1) {
    assert.ok(offeredAt[index] >= nominalRealtimeDeadline(index, START_MS));
    assert.ok(offeredAt[index] - offeredAt[index - 1] >= 5);
  }
  assert.deepEqual(metrics.jitterMs, {
    samples: 18,
    min: 0,
    max: 80,
    mean: 80 / 18,
  });
  assert.deepEqual(
    Buffer.concat(
      packets.map(packet => decodePacket(packet, REALTIME_FORMAT).pcm),
    ),
    pcm,
  );
  assertCompleteMetrics(metrics, pcm.length, 18);
});

test('exactly 100 ms lateness and cumulative lag are permitted', async () => {
  const clock = makeClock({oversleeps: [100]});
  const metrics = {};
  const packets = await collect(sourceBytes(640 * 12), {
    deliveryMode: 'realtime',
    clock,
    wallNowMs: () => WALL_MS,
    metrics,
  });
  assert.equal(packets.length, 12);
  assert.equal(metrics.maxLatenessMs, 100);
  assert.equal(metrics.maxCumulativeLagMs, 100);
  assert.equal(metrics.lateAbort, false);
});

test('101 ms lateness aborts before the next packet or any of its source bytes', async () => {
  const clock = makeClock({oversleeps: [101]});
  const metrics = {};
  const packets = [];
  await assert.rejects(async () => {
    for await (const packet of audioPackets(sourceBytes(640 * 13), {
      deliveryMode: 'realtime',
      clock,
      wallNowMs: () => WALL_MS,
      metrics,
    }))
      packets.push(packet);
  }, hasCode('SYNTHETIC_REALTIME_LATE'));
  assert.equal(packets.length, 10);
  assert.equal(metrics.packetsOffered, 10);
  assert.equal(metrics.sourceBytesOffered, 6400);
  assert.equal(metrics.maxLatenessMs, 101);
  assert.equal(metrics.lateAbort, true);
  assert.deepEqual(clock.sleeps, [20]);
  assert.equal(
    Buffer.concat(
      packets.map(packet => decodePacket(packet, REALTIME_FORMAT).pcm),
    ).length,
    6400,
  );
});

test('recurring one-ms oversleep stays anchored instead of accumulating drift', async () => {
  const pcm = sourceBytes(640 * 200);
  const clock = makeClock({slipEverySleep: 1});
  const metrics = {};
  const packets = await collect(pcm, {
    deliveryMode: 'realtime',
    clock,
    wallNowMs: () => WALL_MS,
    metrics,
  });
  assertCompleteMetrics(metrics, pcm.length, 200);
  assert.equal(metrics.maxLatenessMs, 1);
  assert.equal(metrics.maxCumulativeLagMs, 1);
  assert.equal(metrics.cumulativeLagMs, 1);
  assert.deepEqual(
    Buffer.concat(
      packets.map(packet => decodePacket(packet, REALTIME_FORMAT).pcm),
    ),
    pcm,
  );
});

test('sustained six and twelve-ms oversleep preserve all PCM with bounded lag and spacing', async () => {
  for (const slipEverySleep of [6, 12]) {
    const pcm = sourceBytes(640 * 200 + 74);
    const clock = makeClock({slipEverySleep});
    const metrics = {};
    const offeredAt = [];
    const packets = [];
    for await (const packet of audioPackets(pcm, {
      deliveryMode: 'realtime',
      clock,
      wallNowMs: () => WALL_MS,
      metrics,
    })) {
      offeredAt.push(clock.time);
      packets.push(packet);
    }
    assertCompleteMetrics(metrics, pcm.length, 201);
    assert.equal(metrics.maxLatenessMs, slipEverySleep);
    assert.equal(metrics.maxCumulativeLagMs, slipEverySleep);
    assert.equal(metrics.cumulativeLagMs, slipEverySleep);
    assert.equal(offeredAt.filter(time => time === START_MS).length, 10);
    for (let index = 10; index < offeredAt.length; index += 1) {
      assert.ok(
        offeredAt[index] >= nominalRealtimeDeadline(index, START_MS),
        'never offers ahead of original PCM timeline',
      );
      assert.ok(
        offeredAt[index] - offeredAt[index - 1] >= 5,
        'never flushes post-prefill packets immediately',
      );
    }
    assert.deepEqual(
      Buffer.concat(
        packets.map(packet => decodePacket(packet, REALTIME_FORMAT).pcm),
      ),
      pcm,
    );
  }
});

test('recurring six-through-twelve-ms oversleep remains bounded across a full capture', async () => {
  const pcm = sourceBytes(640 * 600);
  const clock = makeClock({
    oversleeps: Array.from({length: 600}, (_, index) => 6 + (index % 7)),
  });
  const metrics = {};
  const packets = await collect(pcm, {
    deliveryMode: 'realtime',
    clock,
    wallNowMs: () => WALL_MS,
    metrics,
  });
  assertCompleteMetrics(metrics, pcm.length, 600);
  assert.equal(metrics.maxLatenessMs, 12);
  assert.equal(metrics.maxCumulativeLagMs, 12);
  assert.deepEqual(
    Buffer.concat(
      packets.map(packet => decodePacket(packet, REALTIME_FORMAT).pcm),
    ),
    pcm,
  );
});

test('consumer delays still trip cumulative guard above100ms before extra source bytes', async () => {
  const clock = makeClock({oversleeps: [80]});
  const metrics = {};
  const packets = [];
  const stream = audioPackets(sourceBytes(640 * 20), {
    deliveryMode: 'realtime',
    clock,
    wallNowMs: () => WALL_MS,
    metrics,
  });
  for (let index = 0; index < 11; index += 1)
    packets.push((await stream.next()).value);
  assert.equal(metrics.cumulativeLagMs, 80);
  clock.advance(40);
  packets.push((await stream.next()).value);
  assert.equal(metrics.cumulativeLagMs, 100, 'exactly100ms is still allowed');
  clock.advance(25);
  await assert.rejects(
    () => stream.next(),
    hasCode('SYNTHETIC_REALTIME_DRIFT'),
  );
  assert.equal(
    metrics.maxLatenessMs,
    80,
    'individual stalls alone do not exceed100',
  );
  assert.equal(metrics.cumulativeLagMs, 105);
  assert.equal(metrics.maxCumulativeLagMs, 105);
  assert.equal(metrics.maxAllowedCumulativeLagMs, 100);
  assert.equal(metrics.abortKind, 'CUMULATIVE_DRIFT');
  assert.equal(metrics.abortedBeforePacketIndex, 12);
  assert.equal(metrics.packetsOffered, 12);
  assert.equal(metrics.sourceBytesOffered, 7680);
  assert.equal(metrics.lateAbort, true);
  assert.deepEqual(
    Buffer.concat(
      packets.map(packet => decodePacket(packet, REALTIME_FORMAT).pcm),
    ),
    sourceBytes(640 * 20).subarray(0, 7680),
  );
});

test('prefill interrupted by consumer delay distinguishes planned from actual offered bytes', async () => {
  const clock = makeClock();
  const metrics = {};
  const stream = audioPackets(sourceBytes(640 * 20), {
    deliveryMode: 'realtime',
    clock,
    wallNowMs: () => WALL_MS,
    metrics,
  });
  assert.equal((await stream.next()).done, false);
  clock.advance(101);
  await assert.rejects(() => stream.next(), hasCode('SYNTHETIC_REALTIME_LATE'));
  assert.equal(metrics.initialPrefillBytes, 6400); // Planned capacity, not proof of offer.
  assert.equal(metrics.actualPrefillBytesOffered, 640);
  assert.equal(metrics.actualPrefillAudioMsOffered, 20);
  assert.equal(metrics.packetsOffered, 1);
  assert.equal(metrics.sourceBytesOffered, 640);
  assert.equal(metrics.lateAbort, true);
});

test('invalid realtime prefill is rejected before any clock or wall-time call', async () => {
  for (const prefillMs of [0, 19, 21, 201, 220, Number.NaN, Infinity]) {
    await assert.rejects(
      () =>
        collect(sourceBytes(640), {
          deliveryMode: 'realtime',
          prefillMs,
          clock: {
            nowMs() {
              assert.fail('invalid schedule read clock');
            },
            sleepMs() {
              assert.fail('invalid schedule slept');
            },
          },
          wallNowMs() {
            assert.fail('invalid schedule read wall clock');
          },
        }),
      hasCode('INVALID_REALTIME_SCHEDULE'),
    );
  }
});

test('invalid generator mode is rejected before packet, clock or wall-time activity', async () => {
  await assert.rejects(
    () =>
      collect(sourceBytes(640), {
        deliveryMode: 'unsupported',
        clock: {
          nowMs() {
            assert.fail('invalid mode read clock');
          },
          sleepMs() {
            assert.fail('invalid mode slept');
          },
        },
        wallNowMs() {
          assert.fail('invalid mode read wall clock');
        },
      }),
    hasCode('DELIVERY_MODE_MUST_BE_BLOCKING_OR_REALTIME'),
  );
});

test('import is inert in a child process with no configured environment', () => {
  const code = `await import(${JSON.stringify(
    CANDIDATE_URL.href,
  )}); process.stdout.write('INERT_IMPORT_ONLY\\n');`;
  const child = runIsolatedNode(['--input-type=module', '--eval', code]);
  assert.equal(child.status, 0);
  assert.equal(child.stdout, 'INERT_IMPORT_ONLY\n');
});

test('CLI rejects invalid options without SDK discovery or environment configuration', () => {
  assertCliRejected(
    ['--inject', '--delivery-mode', 'unsupported'],
    'DELIVERY_MODE_MUST_BE_BLOCKING_OR_REALTIME',
  );
  for (const args of injectionOnlyArguments)
    assertCliRejected(
      ['--serial', 'emulator-5554', ...args],
      'INJECTION_FLAG_REQUIRED',
    );
  assertCliRejected(
    ['--inject', '--delivery-mode', 'realtime', '--initialize-input'],
    'REALTIME_INITIALIZATION_NOT_SUPPORTED',
  );
});
