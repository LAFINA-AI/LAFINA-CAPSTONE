#!/usr/bin/env node
/** Loopback emulator gRPC probe. No dependency installation, host input, or audio capture. */
import {createHash} from 'node:crypto';
import {once} from 'node:events';
import {readFile, realpath, readdir, stat} from 'node:fs/promises';
import http2 from 'node:http2';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVICE = '/android.emulation.control.EmulatorController/';
const FIXTURES = Object.freeze({
  assignment: [
    99246,
    '5fea3c575e26e6473ea3b89d9e4e66944ad432c82ac316e9d7a0722094698527',
  ],
  biology: [
    111086,
    'e8d7c8df3c93b3313db5bf36feb85d24e4539e7743dcf458fc20400853706ba3',
  ],
  today: [
    75086,
    '6544ffdee9ca3076a9e4b37310d383b808eeaa1e277c96a948a79c649e776545',
  ],
  calculus: [
    101166,
    '8fdc03ac0b372776d182f871dddeb8849b2ea3de077ffe92b3975adde5b4d489',
  ],
  cancel: [
    82926,
    'd5b64bd67c9ada954fa56e08d28d9bd2ea76cd077504c5fcd3f1c996750dae34',
  ],
  complete: [
    81486,
    'e18fff815ef94d600e8a07c349eddcb9ec576d80350d78789d859f9b6428605c',
  ],
});
const RESPONSE_FIXTURES = Object.freeze({
  acknowledge: [
    72206,
    'e10b92f68d6a188bc19b44bd327aa91747d58d4a257510d786a14dc45a4e0a3c',
  ],
  snooze: [
    74286,
    'fd762146a51062b7d5deef1cda58b2607d8b3aa4694bde4c76d9820701e5f42a',
  ],
});
const NOISE_FIXTURES = Object.freeze({
  'acknowledge-noise20': [
    72206,
    '3235f10ec2b31e321c859ed70b451221f8ce4c9f6b03604b664057b9cd6ea8b9',
  ],
  'snooze-noise20': [
    74286,
    '69c5ce0bff4f67d6a20e7ead38d52287fb5751ec7f4fa14aaf3c71c6e26d8e50',
  ],
});
const result = {
  kind: 'PHASE08_LOOPBACK_EMULATOR_AUDIO_PROBE',
  status: 'ERROR',
  microphoneStateRead: false,
  injectionAttempted: false,
  inputInitializationAttempted: false,
  sourceStreamAttempted: false,
  sourceStreamCompleted: false,
  hostInputEnableRequested: false,
  audioCaptured: false,
  recordingsSaved: false,
  recognitionVerified: false,
  audibilityVerified: false,
};

class ProbeError extends Error {
  constructor(code, grpcStatus) {
    super(code);
    this.code = code;
    this.grpcStatus = grpcStatus;
  }
}
/** RPC completion and privacy guards are separate from app capture/recognition. */
export function sourceSubmissionOutcome(evidence) {
  if (evidence.sourceStreamAttempted !== true) return 'NOT_SUBMITTED';
  if (
    evidence.sourceStreamCompleted !== true ||
    evidence.injectionGrpcStatus !== 0
  )
    return 'SOURCE_RPC_ABORTED';
  if (
    evidence.status !== 'SYNTHETIC_STREAM_COMPLETED' ||
    evidence.hostMicrophoneEnabledBefore !== false ||
    evidence.hostMicrophoneEnabledAfter !== false
  )
    return 'SOURCE_RPC_COMPLETED_GUARD_UNVERIFIED';
  return 'SOURCE_RPC_COMPLETED_HOST_OFF';
}
function requireProbe(condition, code) {
  if (!condition) throw new ProbeError(code);
}
function options(argv) {
  const parsed = {};
  const valued = new Set([
    '--serial',
    '--discovery',
    '--wav',
    '--visible-proof',
    '--padding-ms',
    '--gain-permille',
    '--delivery-mode',
  ]);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    requireProbe(!(arg in parsed), 'DUPLICATE_ARGUMENT');
    if (arg === '--inject' || arg === '--help' || arg === '--initialize-input')
      parsed[arg] = true;
    else {
      requireProbe(
        valued.has(arg) && i + 1 < argv.length && !argv[i + 1].startsWith('--'),
        'INVALID_ARGUMENT',
      );
      parsed[arg] = argv[++i];
    }
  }
  return parsed;
}
// Pure validation before any discovery, environment or fixture inspection.
export function parseAudioOptions(argv) {
  const args = options(argv);
  const deliveryMode = args['--delivery-mode'] ?? 'blocking';
  requireProbe(
    deliveryMode === 'blocking' || deliveryMode === 'realtime',
    'DELIVERY_MODE_MUST_BE_BLOCKING_OR_REALTIME',
  );
  requireProbe(
    args['--inject'] ||
      [
        '--wav',
        '--visible-proof',
        '--padding-ms',
        '--gain-permille',
        '--initialize-input',
        '--delivery-mode',
      ].every(key => args[key] === undefined),
    'INJECTION_FLAG_REQUIRED',
  );
  requireProbe(
    deliveryMode !== 'realtime' || !args['--initialize-input'],
    'REALTIME_INITIALIZATION_NOT_SUPPORTED',
  );
  return {...args, deliveryMode};
}
function contained(child, parent) {
  const relative = path.relative(parent, child);
  return (
    relative !== '' &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== '..' &&
    !path.isAbsolute(relative)
  );
}
async function smallFile(filename, maximum = 65536) {
  requireProbe((await stat(filename)).size <= maximum, 'FILE_TOO_LARGE');
  return readFile(filename);
}
async function jsonFile(filename, maximum) {
  return JSON.parse(
    (await smallFile(filename, maximum))
      .toString('utf8')
      .replace(/^\uFEFF/, ''),
  );
}
async function discover(args) {
  const local = process.env.LOCALAPPDATA;
  requireProbe(Boolean(local), 'LOCALAPPDATA_UNAVAILABLE');
  const directory = await realpath(path.join(local, 'Temp', 'avd', 'running'));
  let filename;
  if (args['--discovery']) filename = await realpath(args['--discovery']);
  else {
    const candidates = (await readdir(directory)).filter(name =>
      /^pid_[0-9]+\.ini$/.test(name),
    );
    requireProbe(
      candidates.length === 1,
      'DISCOVERY_MUST_IDENTIFY_ONE_EMULATOR',
    );
    filename = await realpath(path.join(directory, candidates[0]));
  }
  requireProbe(
    contained(filename, directory) &&
      /^pid_[0-9]+\.ini$/.test(path.basename(filename)),
    'INVALID_DISCOVERY_PATH',
  );
  const values = new Map();
  for (const line of (await smallFile(filename))
    .toString('utf8')
    .split(/\r?\n/)) {
    const separator = line.indexOf('=');
    if (separator > 0)
      values.set(
        line.slice(0, separator).trim(),
        line.slice(separator + 1).trim(),
      );
  }
  const port = Number(values.get('grpc.port'));
  const serialPort = Number(values.get('port.serial'));
  requireProbe(
    Number.isInteger(port) && port > 1024 && port <= 65535,
    'INVALID_GRPC_PORT',
  );
  requireProbe(
    Number.isInteger(serialPort) &&
      args['--serial'] === `emulator-${serialPort}`,
    'DISCOVERY_SERIAL_MISMATCH',
  );
  const token = values.get('grpc.token');
  requireProbe(
    typeof token === 'string' &&
      token.length >= 16 &&
      token.length <= 4096 &&
      !/[\r\n\x00]/.test(token),
    'DISCOVERY_TOKEN_UNAVAILABLE',
  );
  // No JWT generation, key-file writes, unprotected-server fallback, or credential output.
  return {port, token};
}
async function verifyInstalledSchema() {
  const sdk =
    process.env.ANDROID_SDK_ROOT ||
    process.env.ANDROID_HOME ||
    path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk');
  const proto = (
    await smallFile(
      path.join(sdk, 'emulator', 'lib', 'emulator_controller.proto'),
      300000,
    )
  ).toString('utf8');
  for (const pattern of [
    /package\s+android\.emulation\.control\s*;/,
    /rpc\s+getMicrophoneState\(google\.protobuf\.Empty\)\s+returns\s*\(MicrophoneState\)/,
    /rpc\s+injectAudio\(stream\s+AudioPacket\)\s+returns\s*\(google\.protobuf\.Empty\)/,
    /bool\s+realAudioEnabled\s*=\s*1\s*;/,
    /uint64\s+samplingRate\s*=\s*1\s*;/,
    /Channels\s+channels\s*=\s*2\s*;/,
    /SampleFormat\s+format\s*=\s*3\s*;/,
    /AUD_FMT_S16\s*=\s*1\s*;/,
    /Mono\s*=\s*0\s*;/,
    /AudioFormat\s+format\s*=\s*1\s*;/,
    /uint64\s+timestamp\s*=\s*2\s*;/,
    /bytes\s+audio\s*=\s*3\s*;/,
  ])
    requireProbe(pattern.test(proto), 'INSTALLED_PROTO_SCHEMA_UNSUPPORTED');
  result.injectAudioInterfaceDeclared = true;
}
function varint(input) {
  let value = BigInt(input);
  const bytes = [];
  do {
    let byte = Number(value & 127n);
    value >>= 7n;
    if (value) byte |= 128;
    bytes.push(byte);
  } while (value);
  return Buffer.from(bytes);
}
function readVarint(buffer, start) {
  let value = 0n;
  let shift = 0n;
  let offset = start;
  while (offset < buffer.length && shift < 70n) {
    const byte = buffer[offset++];
    value |= BigInt(byte & 127) << shift;
    if (!(byte & 128)) return {value, offset};
    shift += 7n;
  }
  throw new ProbeError('INVALID_PROTOBUF_RESPONSE');
}
function hostEnabled(buffer) {
  let offset = 0;
  let enabled = false; // proto3 absent bool is false; the enclosing response frame is still required.
  while (offset < buffer.length) {
    const tag = readVarint(buffer, offset);
    offset = tag.offset;
    const field = Number(tag.value >> 3n);
    const wire = Number(tag.value & 7n);
    requireProbe(field > 0, 'INVALID_PROTOBUF_RESPONSE');
    requireProbe(field !== 1 || wire === 0, 'INVALID_MICROPHONE_STATE');
    if (wire === 0) {
      const parsed = readVarint(buffer, offset);
      offset = parsed.offset;
      if (field === 1) {
        requireProbe(
          parsed.value === 0n || parsed.value === 1n,
          'INVALID_MICROPHONE_STATE',
        );
        enabled = parsed.value === 1n;
      }
    } else if (wire === 1) offset += 8;
    else if (wire === 5) offset += 4;
    else if (wire === 2) {
      const parsed = readVarint(buffer, offset);
      requireProbe(
        parsed.value <= BigInt(buffer.length),
        'INVALID_PROTOBUF_RESPONSE',
      );
      offset = parsed.offset + Number(parsed.value);
    } else throw new ProbeError('INVALID_PROTOBUF_RESPONSE');
    requireProbe(offset <= buffer.length, 'INVALID_PROTOBUF_RESPONSE');
  }
  return enabled;
}
function grpcFrame(payload) {
  const frame = Buffer.alloc(5 + payload.length);
  frame.writeUInt32BE(payload.length, 1);
  payload.copy(frame, 5);
  return frame;
}
function unaryPayload(buffer) {
  requireProbe(buffer.length >= 5 && buffer[0] === 0, 'INVALID_GRPC_FRAME');
  const length = buffer.readUInt32BE(1);
  requireProbe(length === buffer.length - 5, 'INVALID_GRPC_FRAME');
  return buffer.subarray(5);
}
function rpc(session, token, method, payloads, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let code;
    let httpStatus;
    let bytes = 0;
    const data = [];
    const request = session.request({
      ':method': 'POST',
      ':path': SERVICE + method,
      'content-type': 'application/grpc',
      te: 'trailers',
      authorization: `Bearer ${token}`,
      'grpc-timeout': `${timeoutMs}m`,
    });
    const complete = (error, payload) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) {
        request.close(http2.constants.NGHTTP2_CANCEL);
        reject(error);
      } else resolve(payload);
    };
    const timer = setTimeout(
      () => complete(new ProbeError('RPC_DEADLINE_EXCEEDED')),
      timeoutMs,
    );
    const readStatus = headers => {
      if (headers[':status'] !== undefined)
        httpStatus = Number(headers[':status']);
      if (headers['grpc-status'] !== undefined)
        code = Number(headers['grpc-status']);
    };
    request.on('response', readStatus);
    request.on('trailers', readStatus);
    request.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > 16384) complete(new ProbeError('RPC_RESPONSE_TOO_LARGE'));
      else data.push(chunk);
    });
    request.on('error', () => complete(new ProbeError('RPC_TRANSPORT_ERROR')));
    request.on('aborted', () => complete(new ProbeError('RPC_ABORTED')));
    request.on('end', () => {
      if (settled) return;
      if (httpStatus !== 200)
        return complete(new ProbeError('RPC_HTTP_FAILURE'));
      if (!Number.isInteger(code) || code < 0 || code > 16)
        return complete(new ProbeError('RPC_STATUS_MISSING'));
      if (code !== 0) return complete(new ProbeError('RPC_REJECTED', code));
      try {
        complete(null, unaryPayload(Buffer.concat(data)));
      } catch (error) {
        complete(error);
      }
    });
    void (async () => {
      try {
        for await (const payload of payloads) {
          if (settled) return;
          // Honor HTTP/2 backpressure. The SDK's blocking audio delivery mode
          // paces consumption; adding a client timer can starve its input queue.
          if (!request.write(grpcFrame(payload))) await once(request, 'drain');
        }
        if (!settled) request.end();
      } catch (error) {
        complete(
          error instanceof ProbeError
            ? error
            : new ProbeError('RPC_REQUEST_FAILED'),
        );
      }
    })();
  });
}
async function microphoneState(session, token, timeoutMs = 2500) {
  const payload = await rpc(
    session,
    token,
    'getMicrophoneState',
    [Buffer.alloc(0)],
    timeoutMs,
  );
  result.microphoneStateRead = true;
  return hostEnabled(payload);
}
/** Match the native QA hold gate; reserve teardown, final privacy check and release time. */
export function captureWindowBudget(observedAtUtc, nowMs, durationMs) {
  const ageMs = nowMs - Date.parse(observedAtUtc);
  requireProbe(
    Number.isFinite(ageMs) &&
      ageMs >= -1000 &&
      ageMs <= 10000 &&
      Number.isFinite(durationMs) &&
      durationMs > 0 &&
      durationMs <= 15000,
    'INVALID_CAPTURE_WINDOW',
  );
  const sourceDeadlineMs = Math.min(
    Math.ceil(durationMs) + 4000,
    Math.floor(12000 - Math.max(0, ageMs) - 2000),
  );
  requireProbe(
    sourceDeadlineMs >= Math.ceil(durationMs) + 300,
    'RECORDING_WINDOW_TOO_SHORT_FOR_SOURCE',
  );
  return {
    ageMs,
    sourceDeadlineMs,
    finalCheckDeadlineMs: 500,
    nativeGateMs: 12000,
  };
}
async function visibleProof(args) {
  requireProbe(
    Boolean(args['--visible-proof']),
    'VISIBLE_RECORDING_PROOF_REQUIRED',
  );
  const local = await realpath(path.join(ROOT, '.local'));
  const filename = await realpath(args['--visible-proof']);
  requireProbe(
    contained(filename, local) && path.extname(filename) === '.json',
    'INVALID_VISIBLE_PROOF_PATH',
  );
  const proof = await jsonFile(filename, 4096);
  const age = Date.now() - Date.parse(proof.observedAtUtc);
  requireProbe(
    proof.kind === 'PHASE08_VISIBLE_RECORDING' &&
      proof.package === 'com.lafina.capstone' &&
      proof.serial === args['--serial'] &&
      proof.recordingVisible === true &&
      proof.manualInteraction === true &&
      Number.isFinite(age) &&
      age >= -1000 &&
      age <= 10000,
    'VISIBLE_RECORDING_PROOF_STALE_OR_INVALID',
  );
  result.visibleRecordingProofChecked = true;
  return proof;
}
async function fixture(args) {
  requireProbe(Boolean(args['--wav']), 'EXPLICIT_SYNTHETIC_WAV_REQUIRED');
  const filename = await realpath(args['--wav']);
  const legacyDirectory = await realpath(
    path.join(ROOT, '.local', 'phase06-corpus'),
  );
  const directory = path.dirname(filename);
  // Resolve only the selected corpus; absent optional corpora cannot break existing clips.
  const isNoise = path.basename(directory) === 'phase08-noise-corpus';
  const selectedDirectory =
    directory === legacyDirectory
      ? legacyDirectory
      : await realpath(
          path.join(
            ROOT,
            '.local',
            isNoise ? 'phase08-noise-corpus' : 'phase08-corpus',
          ),
        );
  requireProbe(
    directory === selectedDirectory && path.extname(filename) === '.wav',
    'INVALID_SYNTHETIC_WAV_PATH',
  );
  const id = path.basename(filename, '.wav');
  const pins =
    directory === legacyDirectory
      ? FIXTURES
      : isNoise
      ? NOISE_FIXTURES
      : RESPONSE_FIXTURES;
  requireProbe(Object.hasOwn(pins, id), 'UNREVIEWED_SYNTHETIC_FIXTURE');
  const manifest = await jsonFile(path.join(directory, 'corpus-manifest.json'));
  requireProbe(
    manifest.kind ===
      (isNoise
        ? 'SYNTHETIC_DERIVED_NOISE_NO_MICROPHONE'
        : 'SYNTHETIC_WINDOWS_SAPI_AUDIO_NO_MICROPHONE') &&
      Array.isArray(manifest.samples),
    'INVALID_SYNTHETIC_MANIFEST',
  );
  const rows = manifest.samples.filter(
    row => row.id === id && row.file === `${id}.wav`,
  );
  requireProbe(rows.length === 1, 'SYNTHETIC_MANIFEST_ENTRY_REQUIRED');
  const [size, checksum] = pins[id];
  const wav = await smallFile(filename, 500000);
  requireProbe(
    rows[0].bytes === size &&
      rows[0].sha256 === checksum &&
      wav.length === size &&
      createHash('sha256').update(wav).digest('hex') === checksum,
    'SYNTHETIC_CHECKSUM_MISMATCH',
  );
  requireProbe(
    wav.toString('ascii', 0, 4) === 'RIFF' &&
      wav.toString('ascii', 8, 12) === 'WAVE' &&
      wav.readUInt32LE(4) + 8 === wav.length,
    'INVALID_WAV',
  );
  let pcm;
  let formatVerified = false;
  for (let offset = 12; offset + 8 <= wav.length; ) {
    const name = wav.toString('ascii', offset, offset + 4);
    const length = wav.readUInt32LE(offset + 4);
    const start = offset + 8;
    requireProbe(start + length <= wav.length, 'INVALID_WAV');
    if (name === 'fmt ') {
      requireProbe(
        length >= 16 &&
          wav.readUInt16LE(start) === 1 &&
          wav.readUInt16LE(start + 2) === 1 &&
          wav.readUInt32LE(start + 4) === 16000 &&
          wav.readUInt32LE(start + 8) === 32000 &&
          wav.readUInt16LE(start + 12) === 2 &&
          wav.readUInt16LE(start + 14) === 16,
        'WAV_MUST_BE_MONO_16K_PCM16',
      );
      formatVerified = true;
    }
    if (name === 'data') {
      requireProbe(!pcm, 'MULTIPLE_WAV_DATA_CHUNKS');
      pcm = wav.subarray(start, start + length);
    }
    offset = start + length + (length % 2);
  }
  requireProbe(
    formatVerified &&
      pcm &&
      pcm.length >= 3200 &&
      pcm.length <= 480000 &&
      pcm.length % 2 === 0,
    'INVALID_PCM_DURATION',
  );
  result.fixtureId = id;
  result.fixtureSha256 = checksum;
  result.syntheticDurationMs = pcm.length / 32;
  return pcm;
}
/** Experimental test transport only; offered packets are not capture proof.
 * Installed emulator_controller.proto SHA256
 * 1d62c6bcad5f06621f90ec2bf26c661ba769ccd0f1416b5314d25a68e04eee5f:
 * MODE_REAL_TIME=1 is experimental and requires controlled client timing to
 * avoid queue overwrites. Its documented queue is approximately300ms; this
 * candidate offers no more than200ms initial PCM, then uses a monotonic clock.
 * This is a producer experiment, not evidence of a vendor fix or recognition.
 */
export function audioFormatPacket(deliveryMode = 'blocking') {
  requireProbe(
    deliveryMode === 'blocking' || deliveryMode === 'realtime',
    'DELIVERY_MODE_MUST_BE_BLOCKING_OR_REALTIME',
  );
  // Default mode=0 remains omitted: byte-identical to the reviewed client.
  const format = Buffer.concat([
    Buffer.from([8]),
    varint(16000),
    Buffer.from([24, 1]),
    ...(deliveryMode === 'realtime' ? [Buffer.from([32, 1])] : []),
  ]);
  return Buffer.concat([Buffer.from([10]), varint(format.length), format]);
}
export function nextRealtimeDeadline(
  packetIndex,
  startMs,
  lastOfferedMs,
  prefillPackets = 10,
) {
  requireProbe(
    Number.isInteger(packetIndex) &&
      packetIndex >= 0 &&
      Number.isFinite(startMs) &&
      Number.isInteger(prefillPackets) &&
      prefillPackets >= 1 &&
      prefillPackets <= 10,
    'INVALID_REALTIME_SCHEDULE',
  );
  if (packetIndex < prefillPackets) return startMs;
  requireProbe(Number.isFinite(lastOfferedMs), 'INVALID_REALTIME_SCHEDULE');
  // Anchor to the original PCM timeline so timer oversleep does not accumulate.
  // A five-ms floor bounds recovery to one packet per wait instead of flushing
  // a delayed backlog immediately. The nominal deadline prevents offering ahead
  // of the capped prefill timeline; unchanged lag guards still reject stalls.
  return Math.max(
    nominalRealtimeDeadline(packetIndex, startMs, prefillPackets),
    lastOfferedMs + 5,
  );
}
export function nominalRealtimeDeadline(
  packetIndex,
  startMs,
  prefillPackets = 10,
) {
  requireProbe(
    Number.isInteger(packetIndex) &&
      packetIndex >= 0 &&
      Number.isFinite(startMs) &&
      Number.isInteger(prefillPackets) &&
      prefillPackets >= 1 &&
      prefillPackets <= 10,
    'INVALID_REALTIME_SCHEDULE',
  );
  return startMs + Math.max(0, packetIndex - prefillPackets + 1) * 20;
}
export async function* audioPackets(
  pcm,
  {
    deliveryMode = 'blocking',
    clock,
    wallNowMs = Date.now,
    metrics = {},
    prefillMs = 200,
    maxLatenessMs = 100,
  } = {},
) {
  const formatField = audioFormatPacket(deliveryMode);
  Object.assign(metrics, {
    mode: deliveryMode,
    bytesOfferedAreNotDeliveryProof: true,
    counterBoundary: 'GENERATOR_YIELDS_NOT_TRANSPORT_ACKNOWLEDGEMENTS',
    packetsOffered: 0,
    sourceBytesOffered: 0,
    initialPrefillAudioMs: 0,
    initialPrefillBytes: 0,
    actualPrefillBytesOffered: 0,
    actualPrefillAudioMsOffered: 0,
    maxLatenessMs: 0,
    cumulativeLagMs: 0,
    maxCumulativeLagMs: 0,
    lateAbort: false,
    jitterMs: {samples: 0, min: null, max: null, mean: null},
  });
  let pacingClock, startMs, lastOfferedMs, wallEpochMs;
  let lastClockMs = -Infinity;
  let jitterTotal = 0;
  if (deliveryMode === 'realtime') {
    requireProbe(
      Number.isInteger(prefillMs) &&
        prefillMs >= 20 &&
        prefillMs <= 200 &&
        prefillMs % 20 === 0 &&
        maxLatenessMs === 100,
      'INVALID_REALTIME_SCHEDULE',
    );
    pacingClock = clock ?? {
      nowMs: () => performance.now(),
      sleepMs: ms => new Promise(resolve => setTimeout(resolve, Math.ceil(ms))),
    };
    requireProbe(
      typeof pacingClock.nowMs === 'function' &&
        typeof pacingClock.sleepMs === 'function',
      'INVALID_REALTIME_CLOCK',
    );
    startMs = pacingClock.nowMs();
    wallEpochMs = wallNowMs();
    requireProbe(
      Number.isFinite(startMs) && Number.isFinite(wallEpochMs),
      'INVALID_REALTIME_CLOCK',
    );
    lastClockMs = startMs;
    metrics.pacingClock = 'MONOTONIC';
    metrics.packetIntervalMs = 20;
    metrics.minimumPostPrefillSpacingMs = 5;
    metrics.pacingSchedule = 'ANCHORED_20MS_MIN_SPACING_5MS';
    metrics.maxAllowedLatenessMs = maxLatenessMs;
    metrics.maxAllowedCumulativeLagMs = 100;
    metrics.initialPrefillBytes = Math.min(pcm.length, prefillMs * 32);
    metrics.initialPrefillAudioMs = metrics.initialPrefillBytes / 32;
  }
  const readClock = () => {
    const now = pacingClock.nowMs();
    requireProbe(
      Number.isFinite(now) && now >= lastClockMs,
      'REALTIME_CLOCK_REGRESSED',
    );
    lastClockMs = now;
    return now;
  };
  for (let offset = 0; offset < pcm.length; offset += 640) {
    const chunk = pcm.subarray(offset, Math.min(offset + 640, pcm.length));
    const packetIndex = offset / 640;
    let timestampUs;
    if (deliveryMode === 'realtime') {
      const deadline = nextRealtimeDeadline(
        packetIndex,
        startMs,
        lastOfferedMs,
        prefillMs / 20,
      );
      let now = readClock();
      let waits = 0;
      while (now < deadline) {
        requireProbe(waits++ < 4, 'REALTIME_CLOCK_DID_NOT_ADVANCE');
        await pacingClock.sleepMs(deadline - now);
        now = readClock();
      }
      const lateness = now - deadline;
      const nominalDeadline = nominalRealtimeDeadline(
        packetIndex,
        startMs,
        prefillMs / 20,
      );
      const cumulativeLag = now - nominalDeadline;
      metrics.cumulativeLagMs = cumulativeLag;
      metrics.maxCumulativeLagMs = Math.max(
        metrics.maxCumulativeLagMs,
        cumulativeLag,
      );
      metrics.maxLatenessMs = Math.max(metrics.maxLatenessMs, lateness);
      const jitter = metrics.jitterMs;
      jitter.samples += 1;
      jitter.min =
        jitter.min === null ? lateness : Math.min(jitter.min, lateness);
      jitter.max =
        jitter.max === null ? lateness : Math.max(jitter.max, lateness);
      jitterTotal += lateness;
      jitter.mean = jitterTotal / jitter.samples;
      if (lateness > maxLatenessMs) {
        metrics.lateAbort = true;
        metrics.abortedBeforePacketIndex = packetIndex;
        metrics.abortKind = 'PACKET_LATENESS';
        throw new ProbeError('SYNTHETIC_REALTIME_LATE');
      }
      // Bounded recovery must not silently stretch the original PCM timeline.
      if (cumulativeLag > 100) {
        metrics.lateAbort = true;
        metrics.abortedBeforePacketIndex = packetIndex;
        metrics.abortKind = 'CUMULATIVE_DRIFT';
        throw new ProbeError('SYNTHETIC_REALTIME_DRIFT');
      }
      lastOfferedMs = now;
      metrics.lastPacketOfferedAtMonotonicMs = now;
      metrics.sourceScheduleElapsedMs = now - startMs;
      timestampUs = BigInt(
        Math.trunc(wallEpochMs * 1000 + (now - startMs) * 1000),
      );
    } else {
      // Default timestamps and packet bytes remain exactly the original form.
      timestampUs = BigInt(wallNowMs()) * 1000n;
    }
    metrics.packetsOffered += 1;
    metrics.sourceBytesOffered += chunk.length;
    if (deliveryMode === 'realtime' && packetIndex < prefillMs / 20) {
      metrics.actualPrefillBytesOffered += chunk.length;
      metrics.actualPrefillAudioMsOffered =
        metrics.actualPrefillBytesOffered / 32;
    }
    // Offered to the writer once, not evidence of SDK delivery or capture.
    yield Buffer.concat([
      formatField,
      Buffer.from([16]),
      varint(timestampUs),
      Buffer.from([26]),
      varint(chunk.length),
      chunk,
    ]);
  }
}
async function main() {
  const args = parseAudioOptions(process.argv.slice(2));
  if (args['--help']) {
    process.stdout.write(
      'Status: node scripts/phase08-emulator-audio.mjs --serial emulator-5554\n' +
        'Injection: add --inject --wav .local/phase06-corpus/today.wav --visible-proof .local/<fresh-proof>.json\n' +
        'Optional injection-only: --padding-ms <0..1000> zero PCM per edge (default 0).\n' +
        'Optional injection-only: --gain-permille 500 or 1000 (default 1000), synthetic attenuation only.\n' +
        'Experimental injection-only: --delivery-mode blocking|realtime (default blocking).\n' +
        'Experimental injection-only: --initialize-input sends a format-only stream after visible Recording; no stimulus bytes or microphone start.\n' +
        'Optional: --discovery <current pid_N.ini>. No keys/tokens are accepted as arguments.\n',
    );
    return;
  }
  requireProbe(
    /^emulator-[0-9]{4,5}$/.test(args['--serial'] || ''),
    'EXPLICIT_EMULATOR_SERIAL_REQUIRED',
  );
  requireProbe(
    args['--inject'] ||
      (!args['--wav'] &&
        !args['--visible-proof'] &&
        args['--padding-ms'] === undefined &&
        args['--gain-permille'] === undefined &&
        !args['--initialize-input']),
    'INJECTION_FLAG_REQUIRED',
  );
  const paddingText = args['--padding-ms'] ?? '0';
  requireProbe(
    /^(0|[1-9][0-9]{0,3})$/.test(paddingText) && Number(paddingText) <= 1000,
    'PADDING_MUST_BE_INTEGER_ZERO_TO_1000_MS',
  );
  const paddingMs = Number(paddingText);
  const gainText = args['--gain-permille'] ?? '1000';
  requireProbe(
    /^(500|1000)$/.test(gainText),
    'SYNTHETIC_GAIN_MUST_BE_500_OR_1000_PERMILLE',
  );
  const gainPermille = Number(gainText);
  await verifyInstalledSchema();
  const discovery = await discover(args);
  let pcm;
  if (args['--inject']) {
    // Validate the original, pinned WAV before deriving any optional in-memory transport padding.
    pcm = await fixture(args);
    result.transportGainPermille = gainPermille;
    if (gainPermille !== 1000) {
      const attenuated = Buffer.alloc(pcm.length);
      for (let offset = 0; offset < pcm.length; offset += 2) {
        const value = pcm.readInt16LE(offset);
        const magnitude = Math.round((Math.abs(value) * gainPermille) / 1000);
        attenuated.writeInt16LE(value < 0 ? -magnitude : magnitude, offset);
      }
      pcm = attenuated;
    }
    result.leadingPaddingMs = paddingMs;
    result.trailingPaddingMs = paddingMs;
    requireProbe(
      pcm.length + paddingMs * 64 <= 480000,
      'PADDED_PCM_EXCEEDS_15_SECONDS',
    );
    if (paddingMs > 0) {
      const zeros = Buffer.alloc(paddingMs * 32);
      pcm = Buffer.concat([zeros, pcm, zeros]);
    }
    result.injectedDurationMs = pcm.length / 32;
    // Retain the old field for existing readers, but never call planned PCM
    // duration proof that an aborted source was submitted, delivered or captured.
    result.plannedPcmDurationMs = pcm.length / 32;
    result.injectedDurationMsDescribesPlannedPcm = true;
    result.derivedPcmSha256 = createHash('sha256').update(pcm).digest('hex');
    result.audioDeliveryMode =
      args.deliveryMode === 'realtime'
        ? 'REAL_TIME_CLIENT_PACED'
        : 'BLOCKING_SERVER_PACED';
    result.clientWallclockThrottling = false;
    result.clientMonotonicPacing = args.deliveryMode === 'realtime';
    await visibleProof(args);
  }
  const session = http2.connect(`http://127.0.0.1:${discovery.port}`);
  // Transport messages can contain local configuration; only fixed redacted codes are emitted.
  session.on('error', () => {});
  try {
    result.hostMicrophoneEnabledBefore = await microphoneState(
      session,
      discovery.token,
    );
    requireProbe(
      result.hostMicrophoneEnabledBefore === false,
      'HOST_MICROPHONE_ENABLED_ABORT',
    );
    let injectionError;
    if (args['--inject']) {
      const firstProof = await visibleProof(args);
      captureWindowBudget(
        firstProof.observedAtUtc,
        Date.now(),
        pcm.length / 32,
      );
      result.injectionAttempted = true;
      try {
        if (args['--initialize-input']) {
          // Experimental producer initialization after the existing visible hold.
          // This contains no stimulus bytes and never opens/restarts a recorder.
          result.inputInitializationAttempted = true;
          result.inputInitializationStimulusBytes = 0;
          await rpc(
            session,
            discovery.token,
            'injectAudio',
            [audioFormatPacket(args.deliveryMode)],
            2000,
          );
          result.inputInitializationGrpcStatus = 0;
          result.hostMicrophoneEnabledAfterInitialization =
            await microphoneState(session, discovery.token);
          requireProbe(
            result.hostMicrophoneEnabledAfterInitialization === false,
            'HOST_MICROPHONE_ENABLED_AFTER_INITIALIZATION_ABORT',
          );
          await visibleProof(args);
        }
        const sourceProof = await visibleProof(args);
        const window = captureWindowBudget(
          sourceProof.observedAtUtc,
          Date.now(),
          pcm.length / 32,
        );
        result.captureWindow = window;
        // An attempted setup RPC is distinct from entering the source stream.
        result.sourceStreamAttempted = true;
        const sourceTransport = {};
        result.sourceTransport = sourceTransport;
        await rpc(
          session,
          discovery.token,
          'injectAudio',
          audioPackets(pcm, {
            deliveryMode: args.deliveryMode,
            metrics: sourceTransport,
          }),
          window.sourceDeadlineMs,
        );
        result.injectionGrpcStatus = 0;
        result.sourceStreamCompleted = true;
      } catch (error) {
        injectionError = error;
        // Keep the original failure if the final privacy check also fails.
        // Only fixed codes are recorded; transport messages can contain secrets.
        result.injectionFailureReason =
          error instanceof ProbeError
            ? error.code
            : 'LOCAL_RUNTIME_OR_INPUT_FAILURE';
        if (error instanceof ProbeError && Number.isInteger(error.grpcStatus))
          result.injectionFailureGrpcStatus = error.grpcStatus;
      }
    }
    result.hostMicrophoneEnabledAfter = await microphoneState(
      session,
      discovery.token,
      args['--inject'] ? 500 : 2500,
    );
    requireProbe(
      result.hostMicrophoneEnabledAfter === false,
      'HOST_MICROPHONE_ENABLED_AFTER_ABORT',
    );
    if (injectionError) throw injectionError;
    result.status = args['--inject']
      ? 'SYNTHETIC_STREAM_COMPLETED'
      : 'HOST_MICROPHONE_DISABLED';
    result.injectionAttempted = Boolean(args['--inject']);
  } finally {
    session.destroy();
  }
  result.sourceSubmissionOutcome = sourceSubmissionOutcome(result);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await main();
  } catch (error) {
    result.status = 'BLOCKED';
    result.reason =
      error instanceof ProbeError
        ? error.code
        : 'LOCAL_RUNTIME_OR_INPUT_FAILURE';
    if (error instanceof ProbeError && Number.isInteger(error.grpcStatus))
      result.grpcStatus = error.grpcStatus;
    result.sourceSubmissionOutcome = sourceSubmissionOutcome(result);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exitCode = 2;
  }
}
