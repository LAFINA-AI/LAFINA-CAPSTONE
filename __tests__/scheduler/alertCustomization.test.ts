import {NativeModules, Platform} from 'react-native';
import {
  alertPreferencesStore,
  db,
  getDefaultUserPreferences,
  initDatabase,
  preferencesStore,
  remindersStore,
} from '../../src/storage';
import {reminderDeliveryStyleStore} from '../../src/storage/reminderDeliveryStyleStore';
import {
  answerCall,
  applyNotificationAction,
  buildAnnouncement,
  buildOnlineAnnouncement,
  disconnectCall,
  getNotifySnoozeMinutes,
  getReminderPreferences,
  isWithinQuietHours,
  manualAcknowledgeCall,
  NOTIFY_SNOOZE_MINUTES,
  resolveReminderDeliveryStyle,
  syncAlertPreferencesToNative,
} from '../../src/scheduler';
import type {CallSpeechProvider} from '../../src/scheduler';

describe('Alert, Notification & AI Call Customization Scheduler Logic', () => {
  const originalOs = Platform.OS;
  let seq = 0;
  let userId = '';

  const createTestReminder = (
    ownerId: string,
    task: string,
    triggerAt: string,
    status: 'pending' | 'triggered' = 'pending',
  ) => {
    const id = `rem-${++seq}`;
    remindersStore.insertReminder({
      id,
      userId: ownerId,
      task,
      description: null,
      scheduledAt: triggerAt,
      triggerAt,
      status,
      preCastAudioPath: null,
    });
    return remindersStore.getReminderById(id)!;
  };

  const seedUser = (id: string) => {
    const now = new Date().toISOString();
    db.executeSync(
      `INSERT INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, 'Test Student', `${id}@ustp.edu.ph`, 'student', 0, 0, 0, 0, now, now],
    );
    preferencesStore.save(id, {
      ...getDefaultUserPreferences(),
      wakeTime: '07:00',
      sleepTime: '23:00',
      snoozeTendency: 'snooze_once',
    });
  };

  beforeAll(async () => {
    await initDatabase();
    Platform.OS = 'android';
  });

  afterAll(() => {
    Platform.OS = originalOs;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    disconnectCall();
    db.executeSync('DELETE FROM local_settings');
    db.executeSync('DELETE FROM reminder_delivery_styles');
    db.executeSync('DELETE FROM reminder_delivery_jobs');
    db.executeSync('DELETE FROM reminders');
    db.executeSync('DELETE FROM user_preferences');
    db.executeSync('DELETE FROM users');
    userId = `alert-sched-${++seq}`;
    seedUser(userId);
  });

  afterEach(() => {
    disconnectCall();
  });

  it('resolves delivery style with per-reminder override, global default, and quiet hours', () => {
    const reminder = createTestReminder(
      userId,
      'Submit assignment',
      new Date(Date.now() + 3600_000).toISOString(),
    );

    // 1. Default is call
    expect(resolveReminderDeliveryStyle(reminder.id, userId)).toBe('call');

    // 2. Global default 'notify' applies when no explicit override exists
    alertPreferencesStore.save(userId, {
      defaultReminderDeliveryStyle: 'notify',
    });
    expect(resolveReminderDeliveryStyle(reminder.id, userId)).toBe('notify');

    // 3. Explicit per-reminder 'call' override wins over global 'notify'
    reminderDeliveryStyleStore.set(reminder.id, 'call', db, 'notify');
    expect(resolveReminderDeliveryStyle(reminder.id, userId)).toBe('call');

    // 4. Quiet hours overnight wraparound (23:00 .. 07:00)
    const reminder2 = createTestReminder(
      userId,
      'Late study check',
      new Date(Date.now() + 7200_000).toISOString(),
    );
    alertPreferencesStore.save(userId, {
      defaultReminderDeliveryStyle: 'call',
      quietHoursDowngradeToNotify: true,
    });
    const atMidnight = new Date(2026, 10, 21, 0, 30, 0).getTime();
    const at2315 = new Date(2026, 10, 21, 23, 15, 0).getTime();
    const at1400 = new Date(2026, 10, 21, 14, 0, 0).getTime();

    expect(isWithinQuietHours(atMidnight, '23:00', '07:00')).toBe(true);
    expect(isWithinQuietHours(at2315, '23:00', '07:00')).toBe(true);
    expect(isWithinQuietHours(at1400, '23:00', '07:00')).toBe(false);

    expect(resolveReminderDeliveryStyle(reminder2.id, userId, atMidnight)).toBe(
      'notify',
    );
    expect(resolveReminderDeliveryStyle(reminder2.id, userId, at1400)).toBe(
      'call',
    );
    // Explicit 'call' override still wins inside quiet hours
    reminderDeliveryStyleStore.set(reminder2.id, 'call', db, 'notify');
    expect(resolveReminderDeliveryStyle(reminder2.id, userId, atMidnight)).toBe(
      'call',
    );
  });

  it('uses custom notification snooze duration while keeping NOTIFY_SNOOZE_MINUTES constant', async () => {
    expect(NOTIFY_SNOOZE_MINUTES).toBe(10);
    alertPreferencesStore.save(userId, {notificationSnoozeMinutes: 30});
    expect(getNotifySnoozeMinutes(userId)).toBe(30);

    const reminder = createTestReminder(
      userId,
      'Take meds',
      new Date(Date.now() + 60_000).toISOString(),
      'triggered',
    );

    const before = Date.now();
    const result = await applyNotificationAction(
      reminder.id,
      userId,
      'snooze',
      null,
    );
    expect(result.ok).toBe(true);
    expect(result.outcome).toBe('snoozed');
    const diffMs = new Date(result.triggerAt!).getTime() - before;
    expect(diffMs).toBeGreaterThanOrEqual(29 * 60_000);
    expect(diffMs).toBeLessThanOrEqual(31 * 60_000);
  });

  it('applies call snooze and max auto-snooze overrides in getReminderPreferences', () => {
    // Baseline from snooze_once = {snoozeDuration: 5, maxSnoozes: 1}
    expect(getReminderPreferences(userId)).toMatchObject({
      snoozeDurationMinutes: 5,
      autoSnoozeDurationMinutes: 5,
      maxSnoozeCount: 1,
    });

    alertPreferencesStore.save(userId, {
      callSnoozeMinutesOverride: 15,
      callMaxAutoSnoozesOverride: 4,
    });
    expect(getReminderPreferences(userId)).toMatchObject({
      snoozeDurationMinutes: 15,
      autoSnoozeDurationMinutes: 15,
      maxSnoozeCount: 4,
    });

    // Clearing overrides reverts to snoozeTendency mapping
    alertPreferencesStore.save(userId, {
      callSnoozeMinutesOverride: null,
      callMaxAutoSnoozesOverride: null,
    });
    expect(getReminderPreferences(userId)).toMatchObject({
      snoozeDurationMinutes: 5,
      maxSnoozeCount: 1,
    });
  });

  it('builds friendly, concise, and urgent call announcements', () => {
    expect(buildAnnouncement('Math Quiz', 'friendly')).toContain(
      'Hey! This is lafina.',
    );
    expect(buildAnnouncement('Math Quiz', 'concise')).toBe(
      'Reminder: "Math Quiz". Say got it or snooze.',
    );
    expect(buildAnnouncement('Math Quiz', 'urgent')).toBe(
      'Attention! Time for "Math Quiz". Please acknowledge or snooze now.',
    );

    expect(buildOnlineAnnouncement('Math Quiz', 'friendly')).toContain(
      "Hi, it's lafina.",
    );
    expect(buildOnlineAnnouncement('Math Quiz', 'concise')).toContain(
      'Reminder: "Math Quiz".',
    );
    expect(buildOnlineAnnouncement('Math Quiz', 'urgent')).toContain(
      'Urgent reminder: "Math Quiz".',
    );
  });

  it('skips active-call mic service and TTS in buttonsOnly answer mode', async () => {
    const reminder = createTestReminder(
      userId,
      'Silent check',
      new Date(Date.now() + 60_000).toISOString(),
    );
    const speechProvider: CallSpeechProvider = {
      speakText: jest.fn().mockResolvedValue({source: 'native_tts'}),
      stopSpeech: jest.fn().mockResolvedValue(undefined),
    };

    const accepted = await answerCall(
      reminder.id,
      userId,
      false,
      speechProvider,
      null,
      false,
      {buttonsOnly: true},
    );
    expect(accepted).toBe(true);
    expect(NativeModules.LafinaReminder.startActiveCall).not.toHaveBeenCalled();
    expect(speechProvider.speakText).not.toHaveBeenCalled();

    const settled = await manualAcknowledgeCall(reminder.id, userId, null);
    expect(settled).toBe('done');
    expect(speechProvider.speakText).not.toHaveBeenCalled();
    expect(remindersStore.getReminderById(reminder.id)?.status).toBe(
      'acknowledged',
    );
  });

  it('syncs saved alert preferences to LafinaReminder and LafinaAlarm native modules', async () => {
    alertPreferencesStore.save(userId, {
      defaultAlarmSoundUri:
        'android.resource://com.lafina.capstone/raw/lafina_tone_urgent',
      alarmVibrationPattern: 'urgent',
      alarmVolumeRampSec: 0,
      notificationSoundUri: 'silent',
      notificationVibrate: false,
      notificationSnoozeMinutes: 15,
      lockScreenPrivacy: 'show',
      callRingtoneUri:
        'android.resource://com.lafina.capstone/raw/lafina_tone_classic_ring',
      callRingTimeoutSec: 60,
    });

    await syncAlertPreferencesToNative(userId);

    expect(
      NativeModules.LafinaReminder.setAlertPreferences,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultAlarmSoundUri:
          'android.resource://com.lafina.capstone/raw/lafina_tone_urgent',
        alarmVibrationPattern: 'urgent',
        alarmVolumeRampSec: 0,
        notificationSoundUri: 'silent',
        notificationVibrate: false,
        notificationSnoozeMinutes: 15,
        lockScreenPrivacy: 'show',
        callRingtoneUri:
          'android.resource://com.lafina.capstone/raw/lafina_tone_classic_ring',
        callRingTimeoutSec: 60,
      }),
    );

    expect(
      NativeModules.LafinaAlarm.setAlarmAudioPreferences,
    ).toHaveBeenCalledWith({
      defaultAlarmSoundUri:
        'android.resource://com.lafina.capstone/raw/lafina_tone_urgent',
      alarmVibrationPattern: 'urgent',
      alarmVolumeRampSec: 0,
    });
  });
});
