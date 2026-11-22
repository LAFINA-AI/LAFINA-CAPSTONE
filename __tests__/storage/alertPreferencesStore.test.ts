import {
  alertPreferencesStore,
  db,
  DEFAULT_ALERT_PREFERENCES,
  DEFAULT_CALLER_SUBTITLE,
  initDatabase,
  onAlertPreferencesChanged,
  userStore,
} from '../../src/storage';
import {
  authorizeDataReset,
  resetPersonalData,
} from '../../src/storage/accountDataReset';
import {GUEST_USER_ID} from '../../src/constants';

describe('alertPreferencesStore', () => {
  let seq = 0;
  const makeUser = () => `alert-pref-user-${++seq}`;

  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    db.executeSync('DELETE FROM local_settings');
    db.executeSync('DELETE FROM active_session');
    db.executeSync('DELETE FROM users');
    userStore.createGuestUser();
  });

  it('returns default alert preferences when nothing is saved', () => {
    const userId = makeUser();
    expect(alertPreferencesStore.read(userId)).toEqual(
      DEFAULT_ALERT_PREFERENCES,
    );
    expect(alertPreferencesStore.read('')).toEqual(DEFAULT_ALERT_PREFERENCES);
  });

  it('saves partial patches, bumps revision, notifies listeners, and sanitizes inputs', () => {
    const userId = makeUser();
    const events: number[] = [];
    const unsubscribe = onAlertPreferencesChanged((owner, prefs) => {
      if (owner === userId) events.push(prefs.revision);
    });

    try {
      const saved = alertPreferencesStore.save(userId, {
        defaultAlarmSoundUri:
          'android.resource://com.lafina.capstone/raw/lafina_tone_chime',
        defaultAlarmSoundTitle: 'Academic Bell',
        alarmVibrationPattern: 'urgent',
        alarmVolumeRampSec: 15,
        defaultReminderDeliveryStyle: 'notify',
        notificationSoundUri: 'silent',
        notificationSnoozeMinutes: 15,
        lockScreenPrivacy: 'show',
        quietHoursDowngradeToNotify: true,
        callRingtoneUri: 'content://media/internal/audio/media/99',
        callRingtoneTitle: 'Phone Ring',
        callRingTimeoutSec: 30,
        callAnswerMode: 'buttons_only',
        callGreetingStyle: 'concise',
        callCallerSubtitle: `   ${'X'.repeat(60)}   `,
        callSnoozeMinutesOverride: 99,
        callMaxAutoSnoozesOverride: -3,
      });

      expect(saved.revision).toBe(1);
      expect(saved.defaultAlarmSoundUri).toBe(
        'android.resource://com.lafina.capstone/raw/lafina_tone_chime',
      );
      expect(saved.defaultAlarmSoundTitle).toBe('Academic Bell');
      expect(saved.alarmVibrationPattern).toBe('urgent');
      expect(saved.alarmVolumeRampSec).toBe(15);
      expect(saved.defaultReminderDeliveryStyle).toBe('notify');
      expect(saved.notificationSoundUri).toBe('silent');
      expect(saved.notificationSoundTitle).toBe('Silent');
      expect(saved.notificationSnoozeMinutes).toBe(15);
      expect(saved.lockScreenPrivacy).toBe('show');
      expect(saved.quietHoursDowngradeToNotify).toBe(true);
      expect(saved.callRingtoneUri).toBe(
        'content://media/internal/audio/media/99',
      );
      expect(saved.callRingTimeoutSec).toBe(30);
      expect(saved.callAnswerMode).toBe('buttons_only');
      expect(saved.callGreetingStyle).toBe('concise');
      expect(saved.callCallerSubtitle).toBe('X'.repeat(48));
      expect(saved.callSnoozeMinutesOverride).toBe(60);
      expect(saved.callMaxAutoSnoozesOverride).toBe(0);

      // Disallowed alarm 'silent' and unsafe file:// URIs normalize to null
      const sanitized = alertPreferencesStore.save(userId, {
        defaultAlarmSoundUri: 'silent',
        notificationSoundUri: 'file:///sdcard/evil.wav',
        callRingtoneUri: 'https://example.com/ring.mp3',
        callCallerSubtitle: '   ',
      });
      expect(sanitized.revision).toBe(2);
      expect(sanitized.defaultAlarmSoundUri).toBeNull();
      expect(sanitized.defaultAlarmSoundTitle).toBeNull();
      expect(sanitized.notificationSoundUri).toBeNull();
      expect(sanitized.callRingtoneUri).toBeNull();
      expect(sanitized.callCallerSubtitle).toBe(DEFAULT_CALLER_SUBTITLE);
      expect(events).toEqual([1, 2]);
    } finally {
      unsubscribe();
    }
  });

  it('reset restores defaults while incrementing revision', () => {
    const userId = makeUser();
    alertPreferencesStore.save(userId, {
      defaultReminderDeliveryStyle: 'notify',
      callAnswerMode: 'buttons_only',
    });
    const reset = alertPreferencesStore.reset(userId);
    expect(reset).toMatchObject({
      ...DEFAULT_ALERT_PREFERENCES,
      revision: 2,
      updatedAt: reset.updatedAt,
    });
    expect(alertPreferencesStore.read(userId).defaultReminderDeliveryStyle).toBe(
      'call',
    );
  });

  it('transfers guest preferences on link without overwriting existing cloud account choices', () => {
    const now = new Date().toISOString();
    alertPreferencesStore.save(GUEST_USER_ID, {
      defaultReminderDeliveryStyle: 'notify',
      callRingTimeoutSec: 60,
    });

    const freshCloud = makeUser();
    db.transactionSync(tx => {
      alertPreferencesStore.transferFromGuest(tx, freshCloud, now);
    });
    expect(
      alertPreferencesStore.read(freshCloud).defaultReminderDeliveryStyle,
    ).toBe('notify');
    expect(alertPreferencesStore.read(freshCloud).callRingTimeoutSec).toBe(60);
    // Guest is reset back to defaults after transfer
    expect(
      alertPreferencesStore.read(GUEST_USER_ID).defaultReminderDeliveryStyle,
    ).toBe('call');

    // Existing cloud account keeps its own choices when guest transfers again
    const existingCloud = makeUser();
    alertPreferencesStore.save(existingCloud, {
      callAnswerMode: 'offline_voice',
    });
    alertPreferencesStore.save(GUEST_USER_ID, {
      callAnswerMode: 'buttons_only',
    });
    db.transactionSync(tx => {
      alertPreferencesStore.transferFromGuest(tx, existingCloud, now);
    });
    expect(alertPreferencesStore.read(existingCloud).callAnswerMode).toBe(
      'offline_voice',
    );
  });

  it('survives Clear All Data (ADR-025 device-local preference preservation)', () => {
    const userId = makeUser();
    const now = new Date().toISOString();
    db.executeSync(
      `INSERT INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        'Student',
        `${userId}@ustp.edu.ph`,
        'student',
        0,
        0,
        0,
        0,
        now,
        now,
      ],
    );
    userStore.setCurrentUser(userId);
    alertPreferencesStore.save(userId, {
      defaultAlarmSoundUri:
        'android.resource://com.lafina.capstone/raw/lafina_tone_gentle',
      callAnswerMode: 'buttons_only',
    });

    const authority = authorizeDataReset(userId);
    const outcome = resetPersonalData(authority);
    expect(outcome).toMatchObject({admitted: true, planner: 'cleared'});
    expect(alertPreferencesStore.read(userId)).toMatchObject({
      defaultAlarmSoundUri:
        'android.resource://com.lafina.capstone/raw/lafina_tone_gentle',
      callAnswerMode: 'buttons_only',
    });
  });
});
