import {db, type DatabaseTransaction} from './database';
import {localSettingsStore} from './localSettingsStore';
import {DEVICE_SETTINGS_SCOPE} from './deviceScope';

/**
 * Where the student is in first-use setup and the answers given so far, so
 * Back, app restarts and interruptions never lose them. Local only.
 */
export const ONBOARDING_PROGRESS_KEY = 'onboarding.progress.v1';
/** Device-wide: the introduction is shown before anyone signs in. */
export const INTRO_SEEN_KEY = 'onboarding.intro_seen.v1';
/**
 * Device-wide: set when "Clear all data & reset onboarding" runs so the next
 * sign-in (even restoring an existing cloud account) still runs user setup
 * and offers the walkthrough.
 */
export const ONBOARDING_RESET_PENDING_KEY = 'onboarding.reset_pending.v1';

export type OnboardingStage = 'intro' | 'details' | 'ready';

export interface OnboardingAnswers {
  name: string;
  tone: 'casual' | 'professional' | null;
  goal: 'deadlines' | 'schedule' | 'handbook' | null;
  wake: string | null;
  sleep: string | null;
  study: string[] | null;
  response: 'short' | 'balanced' | 'detailed' | null;
  lead: number | null;
}

export interface OnboardingProgress {
  version: 1;
  stage: OnboardingStage;
  page: number;
  answers: OnboardingAnswers;
  updatedAt: string;
}

export const emptyAnswers = (): OnboardingAnswers => ({
  name: '',
  tone: null,
  goal: null,
  wake: null,
  sleep: null,
  study: null,
  response: null,
  lead: null,
});

export const onboardingProgressStore = {
  get: (userId: string): OnboardingProgress | null => {
    try {
      const raw = localSettingsStore.get(userId, ONBOARDING_PROGRESS_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as OnboardingProgress;
      if (!parsed || parsed.version !== 1) return null;
      return {
        ...parsed,
        stage: ['intro', 'details', 'ready'].includes(parsed.stage)
          ? parsed.stage
          : 'details',
        page:
          Number.isInteger(parsed.page) && parsed.page >= 0 ? parsed.page : 0,
        answers: {...emptyAnswers(), ...(parsed.answers ?? {})},
      };
    } catch {
      return null;
    }
  },

  save: (
    userId: string,
    progress: Omit<OnboardingProgress, 'version' | 'updatedAt'>,
  ): boolean =>
    localSettingsStore.set(
      userId,
      ONBOARDING_PROGRESS_KEY,
      JSON.stringify({
        ...progress,
        version: 1,
        updatedAt: new Date().toISOString(),
      }),
    ),

  clear: (userId: string): void => {
    localSettingsStore.set(userId, ONBOARDING_PROGRESS_KEY, '');
  },

  introSeen: (): boolean =>
    Boolean(localSettingsStore.get(DEVICE_SETTINGS_SCOPE, INTRO_SEEN_KEY)),

  markIntroSeen: (): void => {
    localSettingsStore.set(
      DEVICE_SETTINGS_SCOPE,
      INTRO_SEEN_KEY,
      new Date().toISOString(),
    );
  },

  isResetPending: (): boolean =>
    localSettingsStore.get(
      DEVICE_SETTINGS_SCOPE,
      ONBOARDING_RESET_PENDING_KEY,
    ) === 'true',

  markResetPending: (
    executor: Pick<DatabaseTransaction, 'executeSync'> = db,
  ): void => {
    executor.executeSync(
      `INSERT INTO local_settings (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [
        DEVICE_SETTINGS_SCOPE,
        ONBOARDING_RESET_PENDING_KEY,
        'true',
        new Date().toISOString(),
      ],
    );
  },

  consumeResetPending: (): boolean => {
    const pending =
      localSettingsStore.get(
        DEVICE_SETTINGS_SCOPE,
        ONBOARDING_RESET_PENDING_KEY,
      ) === 'true';
    if (pending) {
      db.executeSync(
        'DELETE FROM local_settings WHERE user_id = ? AND key = ?',
        [DEVICE_SETTINGS_SCOPE, ONBOARDING_RESET_PENDING_KEY],
      );
    }
    return pending;
  },
};
