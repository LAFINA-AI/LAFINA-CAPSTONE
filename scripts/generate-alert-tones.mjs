#!/usr/bin/env node
/**
 * Generates license-free synthesized alert tones into android/app/src/main/res/raw/
 * as 16-bit PCM mono 22050 Hz WAV files (~1.5s–2.5s each, smooth envelopes).
 */
import fs from 'node:fs';
import path from 'node:path';

const SAMPLE_RATE = 22050;
const RAW_DIR = path.resolve('android/app/src/main/res/raw');

function createBuffer(durationSec) {
  return new Float64Array(Math.floor(durationSec * SAMPLE_RATE));
}

function addTone(buf, startSec, durSec, freqHz, amp, harmonics = [1, 0.25, 0.08]) {
  const startIdx = Math.max(0, Math.floor(startSec * SAMPLE_RATE));
  const len = Math.floor(durSec * SAMPLE_RATE);
  const attackSamples = Math.max(1, Math.floor(0.018 * SAMPLE_RATE));
  const releaseSamples = Math.max(1, Math.floor(0.18 * SAMPLE_RATE));

  for (let i = 0; i < len; i++) {
    const idx = startIdx + i;
    if (idx >= buf.length) break;
    const t = i / SAMPLE_RATE;

    let env = 1.0;
    if (i < attackSamples) {
      env = 0.5 * (1 - Math.cos((Math.PI * i) / attackSamples));
    } else if (i > len - releaseSamples) {
      const r = (len - i) / releaseSamples;
      env = 0.5 * (1 - Math.cos(Math.PI * Math.max(0, r)));
    }
    const decay = Math.exp(-2.2 * t);

    let wave = 0;
    for (let h = 0; h < harmonics.length; h++) {
      wave += harmonics[h] * Math.sin(2 * Math.PI * freqHz * (h + 1) * t);
    }
    buf[idx] += amp * env * decay * wave;
  }
}

function writeWav(filePath, floatSamples) {
  const numSamples = floatSamples.length;
  const dataBytes = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataBytes);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write('WAVE', 8);

  // fmt chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // PCM chunk size
  buffer.writeUInt16LE(1, 20); // PCM format
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate
  buffer.writeUInt16LE(2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample

  // data chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataBytes, 40);

  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-0.95, Math.min(0.95, floatSamples[i]));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }

  fs.writeFileSync(filePath, buffer);
  return buffer.length;
}

function buildGentleChime() {
  // Warm soft C5 - E5 - G5 - C6 arpeggio
  const buf = createBuffer(2.0);
  addTone(buf, 0.0, 0.65, 523.25, 0.42, [1, 0.2, 0.04]);
  addTone(buf, 0.22, 0.65, 659.25, 0.4, [1, 0.2, 0.04]);
  addTone(buf, 0.44, 0.75, 783.99, 0.4, [1, 0.2, 0.04]);
  addTone(buf, 0.68, 1.15, 1046.5, 0.44, [1, 0.16, 0.03]);
  return buf;
}

function buildAcademicBell() {
  // Bright academic dual-bell chime (E5 + B5 harmonic shimmer)
  const buf = createBuffer(1.9);
  addTone(buf, 0.0, 0.8, 659.25, 0.45, [1, 0.35, 0.12]);
  addTone(buf, 0.0, 0.7, 1318.51, 0.16, [1, 0.15]);
  addTone(buf, 0.48, 1.25, 987.77, 0.48, [1, 0.3, 0.1]);
  addTone(buf, 0.48, 1.0, 1975.53, 0.14, [1, 0.12]);
  return buf;
}

function buildClassicRing() {
  // Classic melodic twin-burst ring cadence
  const buf = createBuffer(2.4);
  const burstStarts = [0.0, 0.18, 0.36, 1.05, 1.23, 1.41];
  for (const s of burstStarts) {
    addTone(buf, s, 0.15, 783.99, 0.38, [1, 0.3, 0.08]);
    addTone(buf, s, 0.15, 1046.5, 0.32, [1, 0.2]);
  }
  return buf;
}

function buildUrgentPulse() {
  // Crisp rhythmic triad alert pulse
  const buf = createBuffer(1.8);
  const pulses = [
    [0.0, 880.0],
    [0.18, 1046.5],
    [0.36, 1318.51],
    [0.82, 880.0],
    [1.0, 1046.5],
    [1.18, 1318.51],
  ];
  for (const [s, freq] of pulses) {
    addTone(buf, s, 0.16, freq, 0.52, [1, 0.35, 0.15]);
  }
  return buf;
}

fs.mkdirSync(RAW_DIR, {recursive: true});

const tones = [
  ['lafina_tone_gentle.wav', buildGentleChime()],
  ['lafina_tone_chime.wav', buildAcademicBell()],
  ['lafina_tone_classic_ring.wav', buildClassicRing()],
  ['lafina_tone_urgent.wav', buildUrgentPulse()],
];

let totalBytes = 0;
for (const [filename, samples] of tones) {
  const bytes = writeWav(path.join(RAW_DIR, filename), samples);
  totalBytes += bytes;
  console.log(`Generated ${filename} (${bytes} bytes)`);
}
console.log(`Total bundled tone size: ${totalBytes} bytes`);
