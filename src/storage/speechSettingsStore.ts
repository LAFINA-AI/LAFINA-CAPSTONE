import {db} from './database';
import type {DatabaseTransaction} from './database';
import {GUEST_USER_ID} from '../constants';

/**
 * AGY-PORT 10: explicit offline voice choices for react-native-tts, per
 * account, in `local_settings` on this device only (never synced).
 *
 * With no saved choice, AGY keeps its current behavior exactly: automatic
 * installed English voice, and the engine's own rate and pitch (the app never
 * calls setDefaultRate/setDefaultPitch). Cloud speech is unaffected.
 *
 * `rate` and `pitch` are factors where 1.0 is normal. The rate is passed to
 * Android `TextToSpeech.setSpeechRate` unchanged through react-native-tts'
 * `skipTransform` (see ADR-022); the wrapper's own 0..1 scale is not used.
 */

export const SPEECH_SETTINGS_KEY = 'speech_tts_v1';
export const SPEECH_FACTOR_MIN = 0.5;
export const SPEECH_FACTOR_MAX = 2;
export const SPEECH_FACTOR_STEP = 0.25;
export const NEUTRAL_FACTOR = 1;
const MAX_VOICE_ID = 256;

export interface SpeechSettings {
  version: 1;
  revision: number;
  /** False until the student makes a choice, and again after Reset. */
  explicit: boolean;
  /** An installed offline English voice id; null means automatic. */
  voiceId: string | null;
  rate: number;
  pitch: number;
  updatedAt: string;
}

export interface SpeechChoice {
  voiceId: string | null;
  rate: number;
  pitch: number;
}

export type SpeechSettingsProblem = 'owner_changed' | 'stale' | 'invalid' | 'unreadable';

export class SpeechSettingsError extends Error {
  constructor(public readonly problem: SpeechSettingsProblem, message: string) {
    super(message);
    this.name = 'SpeechSettingsError';
  }
}

export const DEFAULT_SPEECH_SETTINGS: SpeechSettings = {
  version: 1,
  revision: 0,
  explicit: false,
  voiceId: null,
  rate: NEUTRAL_FACTOR,
  pitch: NEUTRAL_FACTOR,
  updatedAt: new Date(0).toISOString(),
};

const validFactor = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= SPEECH_FACTOR_MIN &&
  value <= SPEECH_FACTOR_MAX;

const validVoice = (value: unknown): value is string | null =>
  value === null || (typeof value === 'string' && value.length > 0 && value.length <= MAX_VOICE_ID);

/** Clamps to 0.5–2.0 and rounds to two decimals; non-numbers become neutral. */
export const clampSpeechFactor = (value: number): number => {
  if (!Number.isFinite(value)) return NEUTRAL_FACTOR;
  const clamped = Math.min(SPEECH_FACTOR_MAX, Math.max(SPEECH_FACTOR_MIN, value));
  return Math.round(clamped * 100) / 100;
};

const parse = (raw: unknown): SpeechSettings => {
  let value: SpeechSettings;
  try {
    value = JSON.parse(String(raw)) as SpeechSettings;
  } catch {
    throw new SpeechSettingsError('unreadable', 'Saved voice settings unavailable.');
  }
  if (
    !value ||
    value.version !== 1 ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 1 ||
    typeof value.explicit !== 'boolean' ||
    !validVoice(value.voiceId) ||
    !validFactor(value.rate) ||
    !validFactor(value.pitch) ||
    !Number.isFinite(Date.parse(value.updatedAt))
  ) {
    throw new SpeechSettingsError('unreadable', 'Saved voice settings unavailable.');
  }
  return value;
};

const read = (userId: string, tx: DatabaseTransaction = db): SpeechSettings => {
  if (!userId || userId.length > 256) {
    throw new SpeechSettingsError('owner_changed', 'Voice settings owner required.');
  }
  const raw = tx.executeSync('SELECT value FROM local_settings WHERE user_id = ? AND key = ?', [
    userId,
    SPEECH_SETTINGS_KEY,
  ]).rows?.[0]?.value;
  return raw == null ? {...DEFAULT_SPEECH_SETTINGS} : parse(raw);
};

/** The AGY-PORT 07 owner rule: a session naming someone else refuses. */
const assertActive = (userId: string, tx: DatabaseTransaction = db): void => {
  const owner = tx.executeSync('SELECT user_id FROM active_session LIMIT 1').rows?.[0]?.user_id;
  if (!userId || (owner != null && String(owner) !== userId)) {
    throw new SpeechSettingsError('owner_changed', 'Account changed. Reopen voice settings.');
  }
};

const write = (
  userId: string,
  expected: number,
  next: Pick<SpeechSettings, 'explicit' | 'voiceId' | 'rate' | 'pitch'>,
): SpeechSettings =>
  db.transactionSync(tx => {
    assertActive(userId, tx);
    const before = read(userId, tx);
    if (before.revision !== expected) {
      throw new SpeechSettingsError('stale', 'Voice settings changed. Review them again.');
    }
    const saved: SpeechSettings = {
      version: 1,
      revision: before.revision + 1,
      ...next,
      updatedAt: new Date().toISOString(),
    };
    tx.executeSync(
      `INSERT INTO local_settings (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [userId, SPEECH_SETTINGS_KEY, JSON.stringify(saved), saved.updatedAt],
    );
    return saved;
  });

export const speechSettingsStore = {
  read,

  isActive: (userId: string): boolean => {
    try {
      assertActive(userId);
      return true;
    } catch {
      return false;
    }
  },

  /** Saves one explicit choice. The voice must be a non-empty id or null (automatic). */
  save: (userId: string, choice: SpeechChoice, expected: number): SpeechSettings => {
    if (!validVoice(choice.voiceId) || !validFactor(choice.rate) || !validFactor(choice.pitch)) {
      throw new SpeechSettingsError(
        'invalid',
        `Choose an installed voice and a speed and pitch from ${SPEECH_FACTOR_MIN} to ${SPEECH_FACTOR_MAX}.`,
      );
    }
    return write(userId, expected, {
      explicit: true,
      voiceId: choice.voiceId,
      rate: clampSpeechFactor(choice.rate),
      pitch: clampSpeechFactor(choice.pitch),
    });
  },

  /** Back to AGY's default: automatic voice, engine rate and pitch. */
  reset: (userId: string, expected: number): SpeechSettings =>
    write(userId, expected, {
      explicit: false,
      voiceId: null,
      rate: NEUTRAL_FACTOR,
      pitch: NEUTRAL_FACTOR,
    }),

  /**
   * Guest link (inside the link transaction): an account that already has a
   * choice on this device keeps it; otherwise the guest's moves to it. The
   * guest keeps a non-explicit revision fence.
   */
  transferFromGuest: (tx: DatabaseTransaction, cloudUserId: string, now: string): void => {
    if (cloudUserId === GUEST_USER_ID) return;
    const raw = tx.executeSync('SELECT value FROM local_settings WHERE user_id = ? AND key = ?', [
      GUEST_USER_ID,
      SPEECH_SETTINGS_KEY,
    ]).rows?.[0]?.value;
    if (raw == null) return;
    tx.executeSync(
      'INSERT OR IGNORE INTO local_settings (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)',
      [cloudUserId, SPEECH_SETTINGS_KEY, String(raw), now],
    );
    let revision = 0;
    try {
      const parsed = JSON.parse(String(raw)) as {revision?: unknown};
      if (Number.isSafeInteger(parsed?.revision)) revision = Number(parsed.revision);
    } catch {
      // A malformed original moved only to an account that had none.
    }
    const fence: SpeechSettings = {
      ...DEFAULT_SPEECH_SETTINGS,
      revision: revision + 1,
      updatedAt: now,
    };
    tx.executeSync('UPDATE local_settings SET value = ?, updated_at = ? WHERE user_id = ? AND key = ?', [
      JSON.stringify(fence),
      now,
      GUEST_USER_ID,
      SPEECH_SETTINGS_KEY,
    ]);
  },
};
