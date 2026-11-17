/**
 * Call flow audit (2026-11-16): Acknowledge and Snooze in a reminder call.
 * Runs the real dispatcher against the node:sqlite mock with native modules
 * mocked. It proves the scheduler logic, not alarms, speech or a real phone.
 * See docs/reports/call-flow-audit-2026-11-16.md.
 */
import {DeviceEventEmitter} from 'react-native';
import {
  db,
  getDefaultUserPreferences,
  initDatabase,
  preferencesStore,
  remindersStore,
} from '../../src/storage';
import {
  answerCall,
  detectCallKeyword,
  disconnectCall,
  manualAcknowledgeCall,
  manualSnoozeCall,
  prepareCallSpeech,
} from '../../src/scheduler';
import type {CallStateEvent} from '../../src/scheduler';
import {
  ACKNOWLEDGE_MESSAGE,
  snoozeMessage,
} from '../../src/scheduler/reminderActions';

const userId = 'student-call-audit';

const addReminder = (id: string, task = 'Review math'): void => {
  const now = new Date().toISOString();
  remindersStore.insertReminder({
    id,
    userId,
    task,
    description: null,
    scheduledAt: now,
    triggerAt: now,
    status: 'pending',
    preCastAudioPath: null,
  });
};

/** A speech provider whose sentences finish only when the test says so. */
const heldSpeech = () => {
  const finish: Array<() => void> = [];
  const spoken: string[] = [];
  return {
    spoken,
    finishAll: () => finish.splice(0).forEach(done => done()),
    provider: {
      speakText: jest.fn(
        (text: string) =>
          new Promise<{source: 'native_tts'}>(resolve => {
            spoken.push(text);
            finish.push(() => resolve({source: 'native_tts'}));
          }),
      ),
      stopSpeech: jest.fn(async () => {
        finish.splice(0).forEach(done => done());
      }),
    },
  };
};

/** Lets pending promise chains (mocked native calls included) run. */
const flush = async (turns = 20): Promise<void> => {
  for (let i = 0; i < turns; i += 1)
    await new Promise<void>(resolve => setImmediate(resolve));
};

const recordEvents = () => {
  const events: CallStateEvent[] = [];
  const sub = DeviceEventEmitter.addListener(
    'LAFINA_CALL_STATE_CHANGE',
    (event: CallStateEvent) => events.push(event),
  );
  return {events, stop: () => sub.remove()};
};

beforeAll(async () => {
  await initDatabase();
});

beforeEach(() => {
  jest.clearAllMocks();
  db.executeSync('DELETE FROM active_session');
  db.executeSync('DELETE FROM sync_outbox');
  db.executeSync('DELETE FROM reminders');
  db.executeSync('DELETE FROM user_preferences');
  db.executeSync('DELETE FROM users');
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      'Call Student',
      'audit@example.invalid',
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
    reminderLeadMinutes: 15,
    snoozeTendency: 'snooze_once',
  });
});

afterEach(() => {
  disconnectCall();
});

describe('Acknowledge and Snooze buttons', () => {
  it('shows the result as soon as it is saved, before the confirmation ends', async () => {
    addReminder('rem-early');
    const speech = heldSpeech();
    // Microphone off: the announcement plays and the buttons are the way out.
    expect(await answerCall('rem-early', userId, false, speech.provider)).toBe(
      true,
    );
    const {events, stop} = recordEvents();

    const tap = manualAcknowledgeCall('rem-early', userId);
    await flush(60);

    // Saved, and on screen, while LAFINA is still speaking the confirmation.
    expect(remindersStore.getReminderById('rem-early')?.status).toBe(
      'acknowledged',
    );
    const early = events.find(event => event.resolution);
    expect(early).toMatchObject({
      state: 'speaking',
      resolution: {outcome: 'acknowledged', message: ACKNOWLEDGE_MESSAGE},
    });
    expect(events.some(event => event.state === 'disconnected')).toBe(false);
    expect(speech.spoken).toContain(ACKNOWLEDGE_MESSAGE);

    speech.finishAll();
    expect(await tap).toBe('done');
    expect(events[events.length - 1]).toMatchObject({
      state: 'disconnected',
      resolution: {outcome: 'acknowledged'},
    });
    stop();
  });

  it('a second tap while the first is being carried out changes nothing', async () => {
    addReminder('rem-double');
    const speech = heldSpeech();
    await answerCall('rem-double', userId, false, speech.provider);

    const first = manualSnoozeCall('rem-double', userId, 10);
    await flush(60);
    expect(await manualAcknowledgeCall('rem-double', userId)).toBe('busy');
    speech.finishAll();
    expect(await first).toBe('done');
    // The first tap won: snoozed, not acknowledged.
    expect(remindersStore.getReminderById('rem-double')?.status).toBe(
      'snoozed',
    );
  });

  it('still works when the call session is gone', async () => {
    addReminder('rem-lost');
    // No answerCall: the screen is up but the scheduler has no session
    // (for example after a reload). The button must not do nothing.
    const {events, stop} = recordEvents();
    expect(await manualAcknowledgeCall('rem-lost', userId, null)).toBe('done');
    expect(remindersStore.getReminderById('rem-lost')?.status).toBe(
      'acknowledged',
    );
    expect(events[events.length - 1]).toMatchObject({
      state: 'disconnected',
      resolution: {outcome: 'acknowledged'},
    });
    stop();
  });

  it('reports a failure instead of closing when the reminder cannot be changed', async () => {
    const {events, stop} = recordEvents();
    expect(await manualSnoozeCall('rem-missing', userId, 5, null)).toBe(
      'failed',
    );
    expect(events.some(event => event.state === 'disconnected')).toBe(false);
    expect(events[events.length - 1]?.text).toMatch(/not found/i);
    stop();
  });

  it('prepares the same confirmation sentences it will speak', async () => {
    const prepared: string[] = [];
    await prepareCallSpeech(
      {
        speakText: jest.fn(async () => ({source: 'native_tts' as const})),
        prepareText: jest.fn(async (text: string) => {
          prepared.push(text);
        }),
      } as never,
      'Review math',
      10,
    );
    expect(prepared).toContain(ACKNOWLEDGE_MESSAGE);
    expect(prepared).toContain(snoozeMessage(10));
    expect(ACKNOWLEDGE_MESSAGE).not.toMatch(/!\./);
  });
});

describe('spoken answers', () => {
  const casual = (text: string) => detectCallKeyword(text, {casual: true});

  it.each([
    'okay',
    'Yes.',
    'alright',
    'noted',
    'will do',
    "I'll do it",
    'on my way',
    'sige',
    'okay thanks',
  ])('"%s" acknowledges when the call asked for an answer', text => {
    expect(casual(text)).toEqual({intent: 'acknowledge', minutes: null});
  });

  it.each([
    ['later', null],
    ['not now', null],
    ["I'm busy", null],
    ['mamaya na', null],
    ['ten more minutes', 10],
    ['5 minutes', 5],
    ['in 15 minutes', 15],
  ])('"%s" snoozes when the call asked for an answer', (text, minutes) => {
    expect(casual(text)).toEqual({intent: 'snooze', minutes});
  });

  it('short answers are not commands inside a longer sentence', () => {
    expect(casual('okay so what is this reminder about')).toBeNull();
    expect(casual('maybe later I will think about the essay')).toBeNull();
  });

  it('everyday words are not commands in the online conversation', () => {
    // The default (strict) mode is what the online call uses.
    for (const text of ['okay', 'yes', 'later', 'not now', 'ten more minutes'])
      expect(detectCallKeyword(text)).toBeNull();
  });

  it('a negated command is never carried out', () => {
    expect(detectCallKeyword("don't snooze")).toBeNull();
    expect(detectCallKeyword('do not acknowledge it')).toBeNull();
    expect(casual("don't snooze it")).toBeNull();
  });
});

describe('Call ownership regression (CALL-FIX-01)', () => {
  it('a late outcome from A cannot disconnect an answered B', async () => {
    addReminder('late-a');
    addReminder('late-b', 'Review chemistry');
    const first = heldSpeech();
    await answerCall('late-a', userId, false, first.provider);
    const pending = manualAcknowledgeCall('late-a', userId);
    await flush();
    const second = heldSpeech();
    expect(await answerCall('late-b', userId, false, second.provider)).toBe(
      true,
    );
    const {events, stop} = recordEvents();
    first.finishAll();
    await pending;
    await flush();
    expect(
      events.some(
        event =>
          event.state === 'disconnected' && event.reminderId === 'late-b',
      ),
    ).toBe(false);
    const acknowledgeB = manualAcknowledgeCall('late-b', userId);
    await flush();
    second.finishAll();
    expect(await acknowledgeB).toBe('done');
    expect(remindersStore.getReminderById('late-b')?.status).toBe(
      'acknowledged',
    );
    stop();
  });
});
