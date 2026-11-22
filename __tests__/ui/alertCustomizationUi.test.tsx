import React from 'react';
import {
  NativeModules,
  PermissionsAndroid,
  Platform,
  Vibration,
} from 'react-native';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {TonePickerModal} from '../../src/ui/components/alerts/TonePickerModal';
import {AlarmEditorModal} from '../../src/ui/screens/calendar/components/AlarmEditorModal';
import {AlertAndNotificationSettings} from '../../src/ui/components/profile/AlertAndNotificationSettings';
import {ReminderCallSettings} from '../../src/ui/components/profile/ReminderCallSettings';
import {IncomingCallScreen} from '../../src/ui/screens/IncomingCallScreen';
import {
  alertPreferencesStore,
  db,
  getDefaultUserPreferences,
  initDatabase,
  localSettingsStore,
  preferencesStore,
  remindersStore,
} from '../../src/storage';
import {disconnectCall} from '../../src/scheduler';

const wrap = (node: React.ReactElement, ownerId: string | null = null) => (
  <ThemeProvider userId={ownerId}>{node}</ThemeProvider>
);

describe('Alert, Notification & AI Call Customization UI', () => {
  const originalOs = Platform.OS;
  let seq = 0;
  let userId = '';

  beforeAll(async () => {
    await initDatabase();
    Platform.OS = 'android';
  });

  afterAll(() => {
    Platform.OS = originalOs;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    disconnectCall();
    db.executeSync('DELETE FROM local_settings');
    db.executeSync('DELETE FROM reminders');
    db.executeSync('DELETE FROM user_preferences');
    db.executeSync('DELETE FROM users');

    userId = `alert-ui-${++seq}`;
    const now = new Date().toISOString();
    db.executeSync(
      `INSERT INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, 'UI Student', `${userId}@ustp.edu.ph`, 'student', 0, 0, 0, 0, now, now],
    );
    preferencesStore.save(userId, {
      ...getDefaultUserPreferences(),
      wakeTime: '07:00',
      sleepTime: '23:00',
    });
  });

  afterEach(() => {
    disconnectCall();
  });

  it('TonePickerModal previews, enforces allowSilent, and picks bundled or system tones', async () => {
    const onSelect = jest.fn();
    const onClose = jest.fn();

    const alarmPicker = render(
      wrap(
        <TonePickerModal
          visible
          kind="alarm"
          selectedUri={null}
          allowSilent={false}
          onSelect={onSelect}
          onClose={onClose}
        />,
      ),
    );

    await waitFor(() =>
      expect(alarmPicker.getByTestId('tone-option-chime')).toBeTruthy(),
    );
    expect(alarmPicker.queryByTestId('tone-option-silent')).toBeNull();

    await act(async () => {
      fireEvent.press(alarmPicker.getByTestId('tone-preview-chime'));
    });
    expect(NativeModules.LafinaSoundPicker.previewTone).toHaveBeenCalledWith(
      'android.resource://com.lafina.capstone/raw/lafina_tone_chime',
      'alarm',
    );

    fireEvent.press(alarmPicker.getByTestId('tone-option-gentle'));
    expect(onSelect).toHaveBeenCalledWith(
      'android.resource://com.lafina.capstone/raw/lafina_tone_gentle',
      'Gentle Chime',
    );
    expect(onClose).toHaveBeenCalled();

    alarmPicker.unmount();

    (
      NativeModules.LafinaSoundPicker.pickSystemTone as jest.Mock
    ).mockResolvedValueOnce({
      cancelled: false,
      uri: 'content://settings/system/notification_sound',
      title: 'Crystal Drop',
    });
    const notifyPicker = render(
      wrap(
        <TonePickerModal
          visible
          kind="notification"
          selectedUri={null}
          allowSilent
          onSelect={onSelect}
          onClose={onClose}
        />,
      ),
    );
    await waitFor(() =>
      expect(notifyPicker.getByTestId('tone-option-silent')).toBeTruthy(),
    );

    await act(async () => {
      fireEvent.press(notifyPicker.getByTestId('tone-picker-system'));
    });
    expect(
      NativeModules.LafinaSoundPicker.pickSystemTone,
    ).toHaveBeenCalledWith('notification', null);
    expect(onSelect).toHaveBeenCalledWith(
      'content://settings/system/notification_sound',
      'Crystal Drop',
    );
  });

  it('AlarmEditorModal opens TonePickerModal and saves selected soundUri', async () => {
    const onSave = jest.fn(() => null);
    const editor = render(
      wrap(
        <AlarmEditorModal
          visible
          alarm={null}
          use24h={false}
          onSave={onSave}
          onClose={jest.fn()}
        />,
      ),
    );

    expect(editor.getByTestId('alarm-sound-title').props.children).toBe(
      'Default alarm tone',
    );
    fireEvent.press(editor.getByTestId('alarm-sound-row'));

    await waitFor(() =>
      expect(editor.getByTestId('tone-option-chime')).toBeTruthy(),
    );
    fireEvent.press(editor.getByTestId('tone-option-chime'));

    expect(editor.getByTestId('alarm-sound-title').props.children).toBe(
      'Academic Bell',
    );
    fireEvent.press(editor.getByTestId('alarm-save-button'));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        soundUri:
          'android.resource://com.lafina.capstone/raw/lafina_tone_chime',
      }),
    );
  });

  it('AlertAndNotificationSettings persists choices and opens Android channel settings', async () => {
    const onChanged = jest.fn();
    const screen = render(
      wrap(
        <AlertAndNotificationSettings
          userId={userId}
          visible
          onClose={jest.fn()}
          onChanged={onChanged}
        />,
      ),
    );

    fireEvent.press(screen.getByTestId('alert-settings-delivery-notify'));
    fireEvent.press(screen.getByTestId('alert-settings-alarm-ramp-0'));
    fireEvent.press(screen.getByTestId('alert-settings-notify-snooze-15'));
    fireEvent.press(screen.getByTestId('alert-settings-privacy-show'));
    fireEvent(screen.getByTestId('alert-settings-quiet-hours'), 'valueChange', true);

    const saved = alertPreferencesStore.read(userId);
    expect(saved.defaultReminderDeliveryStyle).toBe('notify');
    expect(saved.alarmVolumeRampSec).toBe(0);
    expect(saved.notificationSnoozeMinutes).toBe(15);
    expect(saved.lockScreenPrivacy).toBe('show');
    expect(saved.quietHoursDowngradeToNotify).toBe(true);
    expect(onChanged).toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(screen.getByTestId('alert-settings-channel-btn'));
    });
    expect(
      NativeModules.LafinaReminder.getActiveNotificationChannelId,
    ).toHaveBeenCalledWith('notify');
    expect(
      NativeModules.LafinaSoundPicker.openChannelNotificationSettings,
    ).toHaveBeenCalledWith('lafina_reminder_notifications_v1');
  });

  it('ReminderCallSettings updates answer mode, greeting preview, timeout, subtitle, and preview callback', () => {
    const onPreviewCall = jest.fn();
    const screen = render(
      wrap(
        <ReminderCallSettings
          userId={userId}
          visible
          onClose={jest.fn()}
          onPreviewCall={onPreviewCall}
        />,
      ),
    );

    fireEvent.press(screen.getByTestId('call-settings-mode-buttons'));
    fireEvent.press(screen.getByTestId('call-settings-greet-urgent'));
    fireEvent.press(screen.getByTestId('call-settings-timeout-30'));
    fireEvent.changeText(
      screen.getByTestId('call-settings-subtitle-input'),
      'Urgent deadline call',
    );
    fireEvent(screen.getByTestId('call-settings-subtitle-input'), 'blur');

    expect(
      screen.getByTestId('call-settings-greeting-preview').props.children.join(''),
    ).toContain('Attention! Time for "Review Capstone Notes".');

    const saved = alertPreferencesStore.read(userId);
    expect(saved.callAnswerMode).toBe('buttons_only');
    expect(saved.callGreetingStyle).toBe('urgent');
    expect(saved.callRingTimeoutSec).toBe(30);
    expect(saved.callCallerSubtitle).toBe('Urgent deadline call');

    fireEvent.press(screen.getByTestId('call-settings-preview-btn'));
    expect(onPreviewCall).toHaveBeenCalledTimes(1);
  });

  it('IncomingCallScreen respects buttons_only, custom subtitle, vibration off, and offline_voice override', async () => {
    const reminderId = `rem-ui-${++seq}`;
    const triggerAt = new Date(Date.now() + 60_000).toISOString();
    remindersStore.insertReminder({
      id: reminderId,
      userId,
      task: 'Submit Final Report',
      description: null,
      scheduledAt: triggerAt,
      triggerAt,
      status: 'pending',
      preCastAudioPath: null,
    });
    const reminder = remindersStore.getReminderById(reminderId)!;
    const vibSpy = jest.spyOn(Vibration, 'vibrate').mockImplementation(() => {});
    const permSpy = jest
      .spyOn(PermissionsAndroid, 'request')
      .mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);

    alertPreferencesStore.save(userId, {
      callAnswerMode: 'buttons_only',
      callVibrate: false,
      callCallerSubtitle: 'Exam check-in',
      callRingTimeoutSec: 30,
    });

    const screen = render(
      wrap(
        <IncomingCallScreen
          visible
          reminderId={reminder.id}
          task="Submit Final Report"
          userId={userId}
          onClose={jest.fn()}
        />,
      ),
    );

    expect(screen.getByTestId('incoming-call-subtitle').props.children).toBe(
      'Exam check-in',
    );
    expect(
      screen.getByTestId('incoming-call-answer-sublabel').props.children,
    ).toBe('Buttons only (silent)');
    expect(vibSpy).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Answer reminder call'));
    });
    expect(permSpy).not.toHaveBeenCalled();
    expect(NativeModules.LafinaReminder.startActiveCall).not.toHaveBeenCalled();

    screen.unmount();

    // Now test offline_voice override even when chat.onlineMode is 'true'
    localSettingsStore.set(userId, 'chat.onlineMode', 'true');
    alertPreferencesStore.save(userId, {
      callAnswerMode: 'offline_voice',
      callVibrate: true,
    });

    const offlineOverride = render(
      wrap(
        <IncomingCallScreen
          visible
          reminderId={reminder.id}
          task="Submit Final Report"
          userId={userId}
          onClose={jest.fn()}
        />,
      ),
    );
    expect(
      offlineOverride.getByTestId('incoming-call-answer-sublabel').props
        .children,
    ).toBe('Hear the reminder');
    expect(vibSpy).toHaveBeenCalled();
  });
});
