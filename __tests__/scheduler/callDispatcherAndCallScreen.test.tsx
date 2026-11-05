import React from 'react';
import { NativeModules, DeviceEventEmitter } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import {
  db,
  initDatabase,
  remindersStore,
  tasksStore,
  preferencesStore,
  getDefaultUserPreferences,
} from '../../src/storage';
import {
  detectCallKeyword,
  answerCall,
  declineCall,
  manualAcknowledgeCall,
  manualSnoozeCall,
  disconnectCall,
  openNotificationSettings,
} from '../../src/scheduler';
import { IncomingCallScreen } from '../../src/ui/screens/IncomingCallScreen';
import { ReminderPermissionModal } from '../../src/ui/components/call/ReminderPermissionModal';
import { ThemeProvider } from '../../src/ui/contexts/ThemeContext';

describe('Call Dispatcher, Simulated Incoming Call & Permission Subsystem', () => {
  const userId = 'student-call-test';

  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    jest.clearAllMocks();

    db.executeSync('DELETE FROM active_session');
    db.executeSync('DELETE FROM sync_outbox');
    db.executeSync('DELETE FROM reminders');
    db.executeSync('DELETE FROM tasks');
    db.executeSync('DELETE FROM user_preferences');
    db.executeSync('DELETE FROM users');

    const now = new Date().toISOString();
    db.executeSync(
      `INSERT INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, 'Call Student', 'student@ustp.edu.ph', 'student', 0, 0, 0, 0, now, now],
    );

    preferencesStore.save(userId, {
      ...getDefaultUserPreferences(),
      reminderLeadMinutes: 15,
      snoozeTendency: 'snooze_once',
    });
  });

  afterEach(() => {
    disconnectCall();
  });

  describe('detectCallKeyword', () => {
    it('detects exact acknowledge variations', () => {
      expect(detectCallKeyword('acknowledge')).toEqual({ intent: 'acknowledge', minutes: null });
      expect(detectCallKeyword('Acknowledged please')).toEqual({ intent: 'acknowledge', minutes: null });
      expect(detectCallKeyword('I acknowledge this reminder')).toEqual({ intent: 'acknowledge', minutes: null });
    });

    it('detects exact snooze variations and parsed minutes', () => {
      expect(detectCallKeyword('snooze')).toEqual({ intent: 'snooze', minutes: null });
      expect(detectCallKeyword('snooze this reminder')).toEqual({ intent: 'snooze', minutes: null });
      expect(detectCallKeyword('snooze for 15 minutes')).toEqual({ intent: 'snooze', minutes: 15 });
      expect(detectCallKeyword('snooze 10 mins')).toEqual({ intent: 'snooze', minutes: 10 });
    });

    it('detects fuzzy close matches via edit distance', () => {
      expect(detectCallKeyword('acknowlege')).toEqual({ intent: 'acknowledge', minutes: null });
      expect(detectCallKeyword('knowledged')).toEqual({ intent: 'acknowledge', minutes: null });
    });

    it('returns null for unrelated phrases', () => {
      expect(detectCallKeyword('hello world')).toBeNull();
      expect(detectCallKeyword('cancel everything')).toBeNull();
      expect(detectCallKeyword('')).toBeNull();
    });
  });

  describe('callDispatcher Lifecycle', () => {
    it('answers call and allows manual acknowledge', async () => {
      const now = new Date().toISOString();
      tasksStore.insertTask({
        id: 'task-1',
        userId,
        title: 'Submit Thesis Chapter 1',
        priority: 'High',
        category: 'Academics',
        isCompleted: false,
        dueDate: '2026-10-25',
        dueTime: '17:00',
      });

      remindersStore.insertReminder({
        id: 'rem-test-ack',
        userId,
        task: 'Submit Thesis Chapter 1',
        description: null,
        scheduledAt: now,
        triggerAt: now,
        status: 'pending',
        preCastAudioPath: null,
      });
      const reminder = remindersStore.getAllReminders(userId)[0];

      await answerCall(reminder.id, userId, false);

      const stateSub = jest.fn();
      const sub = DeviceEventEmitter.addListener('LAFINA_CALL_STATE_CHANGE', stateSub);

      await manualAcknowledgeCall(reminder.id, userId);

      const updated = remindersStore.getReminderById(reminder.id);
      expect(updated?.status).toBe('acknowledged');

      sub.remove();
    });

    it('acknowledging a reminder also clears duplicate/other pending reminders for the same task', async () => {
      const now = new Date().toISOString();
      remindersStore.insertReminder({
        id: 'rem-dup-1',
        userId,
        task: 'Study Algorithms',
        description: null,
        scheduledAt: now,
        triggerAt: now,
        status: 'pending',
        preCastAudioPath: null,
      });
      remindersStore.insertReminder({
        id: 'rem-dup-2',
        userId,
        task: 'Study Algorithms',
        description: null,
        scheduledAt: now,
        triggerAt: now,
        status: 'pending',
        preCastAudioPath: null,
      });

      await answerCall('rem-dup-1', userId, false);
      await manualAcknowledgeCall('rem-dup-1', userId);

      expect(remindersStore.getReminderById('rem-dup-1')?.status).toBe('acknowledged');
      expect(remindersStore.getReminderById('rem-dup-2')?.status).toBe('acknowledged');
      expect(remindersStore.getPendingReminders(userId)).toHaveLength(0);
    });

    it('completing a task cancels and acknowledges all pending reminders for it', async () => {
      const now = new Date().toISOString();
      tasksStore.insertTask({
        id: 'task-complete-test',
        userId,
        title: 'Review Discrete Math',
        priority: 'High',
        category: 'Academics',
        isCompleted: false,
        dueDate: '2026-10-25',
        dueTime: '18:00',
      });
      remindersStore.insertReminder({
        id: 'rem-task-complete',
        userId,
        task: 'Review Discrete Math',
        description: null,
        scheduledAt: now,
        triggerAt: now,
        status: 'pending',
        preCastAudioPath: null,
      });

      expect(remindersStore.getPendingReminders(userId)).toHaveLength(1);

      tasksStore.updateTask({ id: 'task-complete-test', isCompleted: true });

      const updatedRem = remindersStore.getReminderById('rem-task-complete');
      expect(updatedRem?.status).toBe('acknowledged');
      expect(remindersStore.getPendingReminders(userId)).toHaveLength(0);
    });

    it('answerCall immediately suppresses call if task is already completed', async () => {
      const now = new Date().toISOString();
      tasksStore.insertTask({
        id: 'task-already-done',
        userId,
        title: 'Submit Project Proposal',
        priority: 'High',
        category: 'Academics',
        isCompleted: true,
        dueDate: '2026-10-25',
        dueTime: '14:00',
      });
      remindersStore.insertReminder({
        id: 'rem-already-done',
        userId,
        task: 'Submit Project Proposal',
        description: null,
        scheduledAt: now,
        triggerAt: now,
        status: 'pending',
        preCastAudioPath: null,
      });

      await answerCall('rem-already-done', userId, false);

      expect(remindersStore.getReminderById('rem-already-done')?.status).toBe('acknowledged');
    });

    it('snoozes reminder and updates triggerAt accordingly', async () => {
      const now = new Date().toISOString();
      tasksStore.insertTask({
        id: 'task-2',
        userId,
        title: 'Physics Lab Report',
        priority: 'High',
        category: 'Academics',
        isCompleted: false,
        dueDate: '2026-10-25',
        dueTime: '17:00',
      });

      remindersStore.insertReminder({
        id: 'rem-test-snooze',
        userId,
        task: 'Physics Lab Report',
        description: null,
        scheduledAt: now,
        triggerAt: now,
        status: 'pending',
        preCastAudioPath: null,
      });
      const reminder = remindersStore.getAllReminders(userId)[0];

      await answerCall(reminder.id, userId, false);
      await manualSnoozeCall(reminder.id, userId, 10);

      const updated = remindersStore.getReminderById(reminder.id);
      expect(updated?.status).toBe('snoozed');
      expect(new Date(updated!.triggerAt).getTime()).toBeGreaterThan(Date.now() + 8 * 60 * 1000);
    });

    it('declines call and applies auto-snooze policy', async () => {
      const now = new Date().toISOString();
      tasksStore.insertTask({
        id: 'task-3',
        userId,
        title: 'Calculus Assignment',
        priority: 'Medium',
        category: 'Academics',
        isCompleted: false,
        dueDate: '2026-10-25',
        dueTime: '17:00',
      });

      remindersStore.insertReminder({
        id: 'rem-test-decline',
        userId,
        task: 'Calculus Assignment',
        description: null,
        scheduledAt: now,
        triggerAt: now,
        status: 'pending',
        preCastAudioPath: null,
      });
      const reminder = remindersStore.getAllReminders(userId)[0];

      await declineCall(reminder.id, userId);

      const updated = remindersStore.getReminderById(reminder.id);
      expect(updated?.status).toBe('snoozed');
    });
  });

  describe('IncomingCallScreen UI', () => {
    it('renders incoming call ringing UI with task description and actions', () => {
      const onClose = jest.fn();
      const { getByText, getByLabelText } = render(
        <ThemeProvider userId={userId}>
          <IncomingCallScreen
            visible={true}
            reminderId="rem-test-1"
            task="Submit Thesis Outline"
            userId={userId}
            onClose={onClose}
          />
        </ThemeProvider>,
      );

      expect(getByText('INCOMING SCHEDULED CALL')).toBeTruthy();
      expect(getByText('Submit Thesis Outline')).toBeTruthy();
      expect(getByText('Answer')).toBeTruthy();
      expect(getByText('Decline')).toBeTruthy();
      expect(getByLabelText('Answer reminder call')).toBeTruthy();
      expect(getByLabelText('Decline reminder call')).toBeTruthy();
    });

    it('answers call when Answer button is tapped and displays CallAnsweredView', async () => {
      const now = new Date().toISOString();
      tasksStore.insertTask({
        id: 'task-4',
        userId,
        title: 'Database Midterm',
        priority: 'High',
        category: 'Academics',
        isCompleted: false,
        dueDate: '2026-10-25',
        dueTime: '17:00',
      });

      remindersStore.insertReminder({
        id: 'rem-test-ui',
        userId,
        task: 'Database Midterm',
        description: null,
        scheduledAt: now,
        triggerAt: now,
        status: 'pending',
        preCastAudioPath: null,
      });
      const reminder = remindersStore.getAllReminders(userId)[0];

      const onClose = jest.fn();
      const { getByLabelText, getByText } = render(
        <ThemeProvider userId={userId}>
          <IncomingCallScreen
            visible={true}
            reminderId={reminder.id}
            task="Database Midterm"
            userId={userId}
            onClose={onClose}
          />
        </ThemeProvider>,
      );

      const answerBtn = getByLabelText('Answer reminder call');
      await act(async () => {
        fireEvent.press(answerBtn);
      });

      expect(getByText('ACTIVE SCHEDULED CALL')).toBeTruthy();
      expect(getByText('Acknowledge')).toBeTruthy();
      expect(getByLabelText('End reminder call')).toBeTruthy();
    });
  });

  describe('ReminderPermissionModal & Native Bridge', () => {
    it('renders permission modal with missing permissions and triggers setting openers', async () => {
      const onClose = jest.fn();
      const onRefreshStatus = jest.fn();

      const { getByText } = render(
        <ThemeProvider userId={userId}>
          <ReminderPermissionModal
            visible={true}
            status={{
              canScheduleExactAlarms: false,
              canUseFullScreenIntent: false,
              notificationsEnabled: false,
            }}
            onClose={onClose}
            onRefreshStatus={onRefreshStatus}
          />
        </ThemeProvider>,
      );

      expect(getByText('Reminder Permissions')).toBeTruthy();
      expect(getByText('Notifications')).toBeTruthy();
      expect(getByText('Alarms & Reminders')).toBeTruthy();
      expect(getByText('Full-Screen Calls')).toBeTruthy();

      // Trigger exact alarm opener
      const enableButtons = render(
        <ThemeProvider userId={userId}>
          <ReminderPermissionModal
            visible={true}
            status={{
              canScheduleExactAlarms: false,
              canUseFullScreenIntent: false,
              notificationsEnabled: false,
            }}
            onClose={onClose}
            onRefreshStatus={onRefreshStatus}
          />
        </ThemeProvider>,
      ).getAllByText('Enable');

      expect(enableButtons.length).toBeGreaterThanOrEqual(1);

      await act(async () => {
        fireEvent.press(enableButtons[0]);
      });

      expect(NativeModules.LafinaReminder.openExactAlarmSettings).toHaveBeenCalled();

      // Test openNotificationSettings
      await openNotificationSettings();
      expect(NativeModules.LafinaReminder.openNotificationSettings).toHaveBeenCalled();
    });
  });
});
