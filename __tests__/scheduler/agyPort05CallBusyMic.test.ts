/**
 * AGY-PORT 05: a reminder call answered while a meeting recording owns the
 * microphone falls back to its buttons. "Microphone busy" is not a failed answer, so
 * it never counts toward auto-snooze. Jest mocks; not a device result.
 */
import {DeviceEventEmitter, NativeModules} from 'react-native';
import {
  db,
  initDatabase,
  remindersStore,
  tasksStore,
  preferencesStore,
  getDefaultUserPreferences,
} from '../../src/storage';
import {answerCall, disconnectCall} from '../../src/scheduler';
import type {CallSpeechProvider} from '../../src/scheduler';

const speech = NativeModules.LafinaSpeechToText;
const originalStart = speech.startListening;

describe('AGY-PORT 05 reminder call with a busy microphone', () => {
  const userId = 'student-call-busy';

  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    db.executeSync('DELETE FROM reminders');
    db.executeSync('DELETE FROM tasks');
    db.executeSync('DELETE FROM users');
    const now = new Date().toISOString();
    db.executeSync(
      `INSERT INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        'Busy Student',
        'busy@ustp.edu.ph',
        'student',
        0,
        0,
        0,
        0,
        now,
        now,
      ],
    );
    preferencesStore.save(userId, {
      ...getDefaultUserPreferences(),
      snoozeTendency: 'snooze_once',
    });
  });

  afterEach(() => {
    disconnectCall();
    speech.startListening = originalStart;
  });

  test('busy microphone shows the buttons and never auto-snoozes the reminder', async () => {
    const now = new Date().toISOString();
    tasksStore.insertTask({
      id: 'task-busy',
      userId,
      title: 'Read lab manual',
      priority: 'Medium',
      category: 'Academics',
      isCompleted: false,
      dueDate: '2026-11-06',
      dueTime: '17:00',
    });
    remindersStore.insertReminder({
      id: 'rem-busy',
      userId,
      task: 'Read lab manual',
      description: null,
      scheduledAt: now,
      triggerAt: now,
      status: 'pending',
      preCastAudioPath: null,
    });
    speech.startListening = jest.fn(() =>
      Promise.reject(
        Object.assign(
          new Error('Microphone is currently in use by meeting recorder.'),
          {
            code: 'MIC_IN_USE',
          },
        ),
      ),
    );
    const events: Array<{state: string; text?: string}> = [];
    const sub = DeviceEventEmitter.addListener('LAFINA_CALL_STATE_CHANGE', e =>
      events.push(e),
    );
    const silentSpeech = {
      speakText: jest.fn().mockResolvedValue(undefined),
    } as unknown as CallSpeechProvider;

    await answerCall('rem-busy', userId, true, silentSpeech);
    for (let i = 0; i < 20; i += 1) await Promise.resolve();

    sub.remove();
    expect(speech.startListening).toHaveBeenCalledTimes(1);
    expect(events).toContainEqual({
      state: 'connected',
      text: 'The microphone is being used by a recording. Use the buttons below.',
    });
    // Answered (triggered); not retried into an auto-snooze.
    expect(remindersStore.getReminderById('rem-busy')?.status).toBe(
      'triggered',
    );
    expect(
      NativeModules.LafinaMeetingRecorder.stopRecording,
    ).not.toHaveBeenCalled();
  });

  test('a voice capture still finishing is not described as a recording', async () => {
    const now = new Date().toISOString();
    remindersStore.insertReminder({
      id: 'rem-capture-busy',
      userId,
      task: 'Submit lab report',
      description: null,
      scheduledAt: now,
      triggerAt: now,
      status: 'pending',
      preCastAudioPath: null,
    });
    speech.startListening = jest.fn(() =>
      Promise.reject(
        Object.assign(
          new Error('Another offline speech capture is still finishing.'),
          {code: 'CAPTURE_BUSY'},
        ),
      ),
    );
    const events: Array<{state: string; text?: string}> = [];
    const sub = DeviceEventEmitter.addListener('LAFINA_CALL_STATE_CHANGE', e =>
      events.push(e),
    );
    const silentSpeech = {
      speakText: jest.fn().mockResolvedValue(undefined),
    } as unknown as CallSpeechProvider;

    await answerCall('rem-capture-busy', userId, true, silentSpeech);
    for (let i = 0; i < 20; i += 1) await Promise.resolve();

    sub.remove();
    expect(speech.startListening).toHaveBeenCalledTimes(1);
    expect(events).toContainEqual({
      state: 'connected',
      text: 'The microphone is still busy with another voice capture. Use the buttons below.',
    });
    expect(
      events.some(e => /being used by a recording/.test(e.text ?? '')),
    ).toBe(false);
    expect(remindersStore.getReminderById('rem-capture-busy')?.status).toBe(
      'triggered',
    );
  });
});
