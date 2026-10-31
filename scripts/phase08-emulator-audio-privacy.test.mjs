// Host-only privacy-guard checks for the emulator audio client against a mock
// loopback gRPC server. No emulator, ADB, SDK, microphone or host audio is used;
// the source-path tests read only the pinned synthetic fixture under .local.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import {mkdir, mkdtemp, rm, rmdir, unlink, writeFile} from 'node:fs/promises';
import http2 from 'node:http2';
import os from 'node:os';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import test, {after, before} from 'node:test';
import {fileURLToPath} from 'node:url';

const CANDIDATE_PATH = fileURLToPath(
  new URL('./phase08-emulator-audio.mjs', import.meta.url),
);
const ROOT = path.resolve(path.dirname(CANDIDATE_PATH), '..');
const WAV = path.join(ROOT, '.local', 'phase08-corpus', 'acknowledge.wav');
const HAVE_CORPUS =
  existsSync(WAV) &&
  existsSync(path.join(path.dirname(WAV), 'corpus-manifest.json'));
const SOURCE_SKIP =
  !HAVE_CORPUS && 'pinned synthetic corpus is private/ignored on this host';
const TOKEN = 'mock-discovery-token-0123456789abcdef';
const ENABLED = Buffer.from([0x08, 0x01]);
const CALLS = []; // every request this file's mock server receives

// Only the lines the client's schema check requires; field numbers follow the SDK proto.
const PROTO = [
  'package android.emulation.control;',
  'rpc getMicrophoneState(google.protobuf.Empty) returns (MicrophoneState) {}',
  'rpc injectAudio(stream AudioPacket) returns (google.protobuf.Empty) {}',
  'message MicrophoneState { bool realAudioEnabled = 1; }',
  'uint64 samplingRate = 1;',
  'Channels channels = 2;',
  'SampleFormat format = 3;',
  'AUD_FMT_S16 = 1;',
  'Mono = 0;',
  'AudioFormat format = 1;',
  'uint64 timestamp = 2;',
  'bytes audio = 3;',
].join('\n');

function grpcMessage(payload) {
  const frame = Buffer.alloc(5 + payload.length);
  frame.writeUInt32BE(payload.length, 1);
  payload.copy(frame, 5);
  return frame;
}
function respond(stream, state) {
  if (state.grpcStatus) {
    stream.respond(
      {
        ':status': 200,
        'content-type': 'application/grpc',
        'grpc-status': String(state.grpcStatus),
      },
      {endStream: true},
    );
    return;
  }
  stream.respond(
    {':status': 200, 'content-type': 'application/grpc'},
    {waitForTrailers: !state.noStatus},
  );
  stream.on('wantTrailers', () => stream.sendTrailers({'grpc-status': '0'}));
  stream.end(state.frame ?? grpcMessage(state.payload ?? Buffer.alloc(0)));
}
/** states: one entry per getMicrophoneState; inject: complete | stall | reject. */
async function startEmulator({states = [], inject = 'complete'} = {}) {
  const calls = [];
  const queue = [...states];
  // A small receive window lets a paused stream exert real HTTP/2 backpressure.
  const server = http2.createServer({settings: {initialWindowSize: 1024}});
  const sessions = new Set();
  server.on('session', session => {
    sessions.add(session);
    session.on('close', () => sessions.delete(session));
  });
  server.on('stream', (stream, headers) => {
    const call = {
      method: String(headers[':path']).split('/').pop(),
      path: headers[':path'],
      authorized: headers.authorization === `Bearer ${TOKEN}`,
      requestBytes: [],
    };
    calls.push(call);
    CALLS.push(call);
    stream.on('error', () => {});
    stream.on('close', () => {
      call.closeRstCode = stream.rstCode;
    });
    stream.on('data', chunk => call.requestBytes.push(chunk));
    if (call.method === 'getMicrophoneState') {
      const state = queue.shift() ?? {hang: true};
      if (!state.hang) stream.on('end', () => respond(stream, state));
    } else if (call.method === 'injectAudio') {
      if (inject === 'reject') respond(stream, {grpcStatus: 9});
      else {
        if (inject === 'stall') {
          stream.pause();
          setTimeout(() => stream.resume(), 1000);
        }
        stream.on('end', () => respond(stream, {}));
      }
    } else respond(stream, {grpcStatus: 12});
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    port: server.address().port,
    calls,
    async close() {
      for (const session of sessions) session.destroy();
      await new Promise(resolve => server.close(resolve));
    },
  };
}

let temp;
let proofDir;
before(async () => {
  temp = await mkdtemp(path.join(os.tmpdir(), 'phase08-privacy-'));
  await mkdir(path.join(temp, 'local', 'Temp', 'avd', 'running'), {
    recursive: true,
  });
  await mkdir(path.join(temp, 'sdk', 'emulator', 'lib'), {recursive: true});
  await writeFile(
    path.join(temp, 'sdk', 'emulator', 'lib', 'emulator_controller.proto'),
    PROTO,
  );
  if (HAVE_CORPUS)
    proofDir = await mkdtemp(
      path.join(ROOT, '.local', 'phase08-privacy-test-'),
    );
});
after(async () => {
  // Only this file's own temporary directories are removed.
  await rm(temp, {recursive: true, force: true});
  if (proofDir) {
    await unlink(path.join(proofDir, 'visible-proof.json')).catch(() => {});
    await rmdir(proofDir);
  }
});

async function runClient(emulator, args = []) {
  await writeFile(
    path.join(temp, 'local', 'Temp', 'avd', 'running', 'pid_4242.ini'),
    `port.serial=5554\ngrpc.port=${emulator.port}\ngrpc.token=${TOKEN}\n`,
  );
  const env = {
    LOCALAPPDATA: path.join(temp, 'local'),
    ANDROID_SDK_ROOT: path.join(temp, 'sdk'),
    SystemRoot: process.env.SystemRoot ?? 'C:\\Windows',
  };
  const started = performance.now();
  const child = spawn(
    process.execPath,
    [CANDIDATE_PATH, '--serial', 'emulator-5554', ...args],
    {env, windowsHide: true},
  );
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => (stdout += chunk));
  child.stderr.on('data', chunk => (stderr += chunk));
  const guard = setTimeout(() => child.kill(), 20000);
  const code = await new Promise(resolve => child.on('close', resolve));
  clearTimeout(guard);
  const lines = stdout.trim().split(/\r?\n/);
  assert.equal(lines.length, 1, 'one fixed result line');
  assert.ok(!stdout.includes(TOKEN) && !stderr.includes(TOKEN), 'no token');
  return {
    code,
    stderr,
    out: JSON.parse(lines[0]),
    elapsedMs: performance.now() - started,
  };
}
async function runSource(emulator) {
  const proof = path.join(proofDir, 'visible-proof.json');
  await writeFile(
    proof,
    JSON.stringify({
      kind: 'PHASE08_VISIBLE_RECORDING',
      package: 'com.lafina.capstone',
      serial: 'emulator-5554',
      recordingVisible: true,
      manualInteraction: true,
      observedAtUtc: new Date().toISOString(),
    }),
  );
  return runClient(emulator, [
    '--inject',
    '--wav',
    WAV,
    '--visible-proof',
    proof,
    '--delivery-mode',
    'realtime',
    '--gain-permille',
    '500',
  ]);
}
function assertNoEnableRequest(calls) {
  for (const call of calls) {
    assert.ok(
      ['getMicrophoneState', 'injectAudio'].includes(call.method),
      call.method,
    );
    assert.equal(
      call.path,
      '/android.emulation.control.EmulatorController/' + call.method,
    );
    assert.equal(call.authorized, true);
    if (call.method === 'getMicrophoneState')
      // A read carries exactly one empty google.protobuf.Empty message.
      assert.deepEqual(
        Buffer.concat(call.requestBytes),
        grpcMessage(Buffer.alloc(0)),
      );
  }
}
const methods = calls => calls.map(call => call.method);

test('local SDK protocols define realAudioEnabled as MicrophoneState field 1', t => {
  const local = process.env.LOCALAPPDATA ?? '';
  const candidates = [
    path.join(
      local,
      'Android',
      'Sdk',
      'emulator',
      'lib',
      'emulator_controller.proto',
    ),
    path.join(
      ROOT,
      '.local',
      'phase08-emulator-37.2.13',
      'emulator',
      'lib',
      'emulator_controller.proto',
    ),
  ].filter(existsSync);
  if (!candidates.length) return t.skip('no local SDK protocol on this host');
  for (const filename of candidates) {
    const text = readFileSync(filename, 'utf8');
    const message = text.match(/message\s+MicrophoneState\s*\{([^}]*)\}/);
    assert.ok(message, filename);
    assert.match(message[1], /bool\s+realAudioEnabled\s*=\s*1\s*;/);
    assert.match(
      text,
      /rpc\s+getMicrophoneState\(google\.protobuf\.Empty\)\s+returns\s*\(MicrophoneState\)/,
    );
  }
});

test('status probe: OFF then OFF succeeds with two read-only calls', async () => {
  const emulator = await startEmulator({states: [{}, {}]});
  try {
    const {code, out} = await runClient(emulator);
    assert.equal(code, 0);
    assert.equal(out.status, 'HOST_MICROPHONE_DISABLED');
    assert.equal(out.hostMicrophoneEnabledBefore, false);
    assert.equal(out.hostMicrophoneEnabledAfter, false);
    assert.equal(out.hostInputEnableRequested, false);
    assert.equal(out.sourceSubmissionOutcome, 'NOT_SUBMITTED');
    assert.deepEqual(methods(emulator.calls), [
      'getMicrophoneState',
      'getMicrophoneState',
    ]);
    assertNoEnableRequest(emulator.calls);
  } finally {
    await emulator.close();
  }
});

test('valid proto3 encodings of false are accepted; explicit true blocks', async () => {
  const falses = [
    Buffer.alloc(0), // absent field: legitimate default false
    Buffer.from([0x08, 0x00]),
    Buffer.from([0x10, 0x01]), // unknown field only
    Buffer.from([0x08, 0x01, 0x08, 0x00]), // last scalar wins
  ];
  for (const payload of falses) {
    const emulator = await startEmulator({states: [{payload}, {payload}]});
    try {
      const {code, out} = await runClient(emulator);
      assert.equal(code, 0, payload.toString('hex'));
      assert.equal(out.hostMicrophoneEnabledBefore, false);
      assert.equal(out.hostMicrophoneEnabledAfter, false);
    } finally {
      await emulator.close();
    }
  }
  const emulator = await startEmulator({states: [{payload: ENABLED}]});
  try {
    const {code, out} = await runClient(emulator);
    assert.equal(code, 2);
    assert.equal(out.status, 'BLOCKED');
    assert.equal(out.reason, 'HOST_MICROPHONE_ENABLED_ABORT');
    assert.equal(out.hostMicrophoneEnabledBefore, true);
    assert.deepEqual(methods(emulator.calls), ['getMicrophoneState']);
  } finally {
    await emulator.close();
  }
});

test('failed, malformed or timed-out state reads fail closed with fixed codes', async () => {
  const cases = [
    [{payload: Buffer.from([0x0a, 0x01, 0x01])}, 'INVALID_MICROPHONE_STATE'],
    [{payload: Buffer.from([0x08, 0x02])}, 'INVALID_MICROPHONE_STATE'],
    [{payload: Buffer.from([0x08])}, 'INVALID_PROTOBUF_RESPONSE'],
    [{payload: Buffer.from([0x0b])}, 'INVALID_MICROPHONE_STATE'], // field 1, group wire type
    [{payload: Buffer.from([0x13])}, 'INVALID_PROTOBUF_RESPONSE'], // field 2, group wire type
    [{frame: Buffer.from([0, 0, 0, 0, 9, 0x08, 0x00])}, 'INVALID_GRPC_FRAME'],
    [{grpcStatus: 14}, 'RPC_REJECTED'],
    [{noStatus: true}, 'RPC_STATUS_MISSING'],
    [{hang: true}, 'RPC_DEADLINE_EXCEEDED'],
  ];
  for (const [state, reason] of cases) {
    const emulator = await startEmulator({states: [state]});
    try {
      const {code, out, elapsedMs} = await runClient(emulator);
      assert.equal(code, 2, reason);
      assert.equal(out.status, 'BLOCKED');
      assert.equal(out.reason, reason);
      assert.equal(out.hostMicrophoneEnabledBefore, undefined);
      assert.equal(out.sourceStreamAttempted, false);
      assert.ok(elapsedMs < 8000, 'bounded by the 2.5 s read deadline');
    } finally {
      await emulator.close();
    }
  }
});

test(
  'source: OFF, completed stream, OFF counts as host-OFF submission',
  {skip: SOURCE_SKIP},
  async () => {
    const emulator = await startEmulator({states: [{}, {}]});
    try {
      const {code, out} = await runSource(emulator);
      assert.equal(code, 0);
      assert.equal(out.status, 'SYNTHETIC_STREAM_COMPLETED');
      assert.equal(
        out.sourceSubmissionOutcome,
        'SOURCE_RPC_COMPLETED_HOST_OFF',
      );
      assert.equal(out.sourceTransport.lateAbort, false);
      assert.deepEqual(methods(emulator.calls), [
        'getMicrophoneState',
        'injectAudio',
        'getMicrophoneState',
      ]);
      assertNoEnableRequest(emulator.calls);
    } finally {
      await emulator.close();
    }
  },
);

test(
  'source: lateness abort then enabled state keeps both errors and blocks',
  {skip: SOURCE_SKIP},
  async () => {
    const emulator = await startEmulator({
      states: [{}, {payload: ENABLED}],
      inject: 'stall',
    });
    try {
      const {code, out} = await runSource(emulator);
      assert.equal(code, 2);
      assert.equal(out.status, 'BLOCKED');
      assert.equal(out.reason, 'HOST_MICROPHONE_ENABLED_AFTER_ABORT');
      assert.equal(out.injectionFailureReason, 'SYNTHETIC_REALTIME_LATE');
      assert.equal(out.sourceTransport.lateAbort, true);
      assert.equal(out.sourceTransport.abortKind, 'PACKET_LATENESS');
      assert.equal(out.sourceSubmissionOutcome, 'SOURCE_RPC_ABORTED');
      assert.equal(out.sourceStreamCompleted, false);
      assert.equal(out.hostMicrophoneEnabledBefore, false);
      assert.equal(out.hostMicrophoneEnabledAfter, true);
      assert.equal(out.hostInputEnableRequested, false);
      assert.deepEqual(methods(emulator.calls), [
        'getMicrophoneState',
        'injectAudio',
        'getMicrophoneState',
      ]);
      // The client cancels its own source stream (RST_STREAM CANCEL) before the privacy read.
      assert.equal(
        emulator.calls[1].closeRstCode,
        http2.constants.NGHTTP2_CANCEL,
      );
      assertNoEnableRequest(emulator.calls);
    } finally {
      await emulator.close();
    }
  },
);

test(
  'source: lateness abort then OFF reports the original pacing failure',
  {skip: SOURCE_SKIP},
  async () => {
    const emulator = await startEmulator({states: [{}, {}], inject: 'stall'});
    try {
      const {code, out} = await runSource(emulator);
      assert.equal(code, 2);
      assert.equal(out.reason, 'SYNTHETIC_REALTIME_LATE');
      assert.equal(out.injectionFailureReason, 'SYNTHETIC_REALTIME_LATE');
      assert.equal(out.hostMicrophoneEnabledAfter, false);
      assert.equal(out.sourceSubmissionOutcome, 'SOURCE_RPC_ABORTED');
    } finally {
      await emulator.close();
    }
  },
);

test(
  'source: lateness abort then unanswered state read stays unknown and bounded',
  {skip: SOURCE_SKIP},
  async () => {
    const emulator = await startEmulator({
      states: [{}, {hang: true}],
      inject: 'stall',
    });
    try {
      const {code, out, elapsedMs} = await runSource(emulator);
      assert.equal(code, 2);
      assert.equal(out.reason, 'RPC_DEADLINE_EXCEEDED');
      assert.equal(out.injectionFailureReason, 'SYNTHETIC_REALTIME_LATE');
      assert.equal(
        Object.hasOwn(out, 'hostMicrophoneEnabledAfter'),
        false,
        'unknown, never coerced to OFF',
      );
      assert.equal(out.sourceSubmissionOutcome, 'SOURCE_RPC_ABORTED');
      assert.ok(elapsedMs < 10000);
    } finally {
      await emulator.close();
    }
  },
);

test(
  'source: completed stream cannot count when the later state is enabled or unreadable',
  {skip: SOURCE_SKIP},
  async () => {
    for (const [state, reason] of [
      [{payload: ENABLED}, 'HOST_MICROPHONE_ENABLED_AFTER_ABORT'],
      [{payload: Buffer.from([0x08, 0x02])}, 'INVALID_MICROPHONE_STATE'],
    ]) {
      const emulator = await startEmulator({states: [{}, state]});
      try {
        const {code, out} = await runSource(emulator);
        assert.equal(code, 2);
        assert.equal(out.reason, reason);
        assert.equal(out.sourceStreamCompleted, true);
        assert.equal(out.injectionGrpcStatus, 0);
        assert.equal(
          out.sourceSubmissionOutcome,
          'SOURCE_RPC_COMPLETED_GUARD_UNVERIFIED',
        );
      } finally {
        await emulator.close();
      }
    }
  },
);

test(
  'source: rejected stream keeps its gRPC status with a later OFF read',
  {skip: SOURCE_SKIP},
  async () => {
    const emulator = await startEmulator({states: [{}, {}], inject: 'reject'});
    try {
      const {code, out} = await runSource(emulator);
      assert.equal(code, 2);
      assert.equal(out.reason, 'RPC_REJECTED');
      assert.equal(out.injectionFailureReason, 'RPC_REJECTED');
      assert.equal(out.injectionFailureGrpcStatus, 9);
      assert.equal(out.hostMicrophoneEnabledAfter, false);
      assert.equal(out.sourceSubmissionOutcome, 'SOURCE_RPC_ABORTED');
    } finally {
      await emulator.close();
    }
  },
);

test('no request in this file ever asked to enable host input', () => {
  assert.ok(CALLS.length > 0);
  assertNoEnableRequest(CALLS);
  assert.ok(!CALLS.some(call => call.method === 'setMicrophoneState'));
});
