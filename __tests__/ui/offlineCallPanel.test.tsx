/**
 * Offline Call Lafina on the call screen (2026-11-20): scheduling,
 * changing, saving and canceling by voice with no internet and no model,
 * and which call a tap on Call starts. Rendered in Jest with the node:sqlite
 * mock, a scripted microphone and a scripted voice; this proves screen logic,
 * not whisper.cpp, react-native-tts or a real phone.
 */
import React from 'react';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import {PermissionsAndroid} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {VoiceConversationPanel} from '../../src/ui/components/voice/VoiceConversationPanel';
import {
  db,
  initDatabase,
  localSettingsStore,
  tasksStore,
  userStore,
} from '../../src/storage';
import {cloudClient} from '../../src/cloud/cloudClient';
import {
  defaultVoiceConversationDeps,
  VOICE_CONSENT_KEY,
} from '../../src/cloud/voiceConversation';
import type {VoiceTransport} from '../../src/cloud/voiceConversation';
import {endReviewSession} from '../../src/ai/nlu/commandReview';
import {ttsService} from '../../src/ai/tts/ttsService';
import {useCommandReview} from '../../src/ui/hooks/useCommandReview';
import type {OfflineCallDeps} from '../../src/ai/offlineCall/offlineCallController';
import type {OfflineSpeechResult} from '../../src/ai/native/speechCapture';
import {
  predictCallMode,
  resolveCallMode,
} from '../../src/ai/offlineCall/callMode';

let serial = 0;
let activeUser: string | null = null;

const student = (label: string): string => {
  serial += 1;
  const id = `offcall-${label}-${serial}`;
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT OR IGNORE INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
     VALUES (?, ?, ?, 'student', 0, 0, 0, 0, ?, ?)`,
    [id, id, `${id}@example.invalid`, now, now],
  );
  return id;
};

const signIn = (userId: string, online: 'true' | 'false' | null = 'true') => {
  activeUser = userId;
  jest.spyOn(userStore, 'getActiveSessionToken').mockImplementation(() => ({
    userId: activeUser,
    accessToken: 'synthetic-token',
    refreshToken: null,
  }));
  if (online) localSettingsStore.set(userId, 'chat.onlineMode', online);
  localSettingsStore.set(userId, VOICE_CONSENT_KEY, 'true');
  localSettingsStore.set(
    userId,
    'voiceConversation.directDataConsent.v1',
    'true',
  );
};

/** A phone microphone the test speaks into, one capture at a time. */
const scriptedPhone = () => {
  const open: {id: string; resolve: (r: OfflineSpeechResult) => void}[] = [];
  const spoken: string[] = [];
  /** What the call itself wrote to Chat (LAFINA's lines). */
  const written: string[] = [];
  let seq = 0;
  const result = (id: string, patch: Partial<OfflineSpeechResult>) => ({
    captureId: id,
    transcript: '',
    speechDetected: false,
    cancelled: false,
    captureDurationMs: 100,
    inferenceDurationMs: 10,
    ...patch,
  });
  const deps = (
    _userId: string,
    respond: OfflineCallDeps['respond'],
  ): OfflineCallDeps => ({
    respond,
    greeting: () => 'Hi, Lafina here. What do you want to plan?',
    speech: {
      isAvailable: async () => true,
      ensurePermission: async () => true,
      start: () => {
        const id = `cap-${++seq}`;
        let resolve: (r: OfflineSpeechResult) => void = () => undefined;
        const done = new Promise<OfflineSpeechResult>(r => {
          resolve = r;
        });
        open.push({id, resolve});
        return {captureId: id, result: done};
      },
      cancel: async id => {
        const index = open.findIndex(c => c.id === id);
        if (index >= 0) {
          const [capture] = open.splice(index, 1);
          capture.resolve(result(id, {cancelled: true}));
        }
        return true;
      },
    },
    voice: {
      ready: async () => true,
      speak: text => {
        spoken.push(text);
        return {
          token: Promise.resolve(spoken.length),
          result: Promise.resolve('finished' as const),
        };
      },
      stop: async () => true,
    },
    persistence: {
      userTurn: () => undefined,
      assistantTurn: text => {
        written.push(text);
      },
    },
  });
  /** Waits for the microphone to open, then says the line into it. */
  const say = async (text: string) => {
    await waitFor(() => expect(open.length).toBeGreaterThan(0));
    const capture = open.shift();
    await act(async () => {
      capture?.resolve(
        result(capture.id, {transcript: text, speechDetected: true}),
      );
    });
  };
  /** What LAFINA said last, once she has said something matching. */
  const heard = async (pattern: RegExp) => {
    await waitFor(() => expect(spoken[spoken.length - 1]).toMatch(pattern));
    return spoken[spoken.length - 1];
  };
  return {deps, say, heard, spoken, open, written};
};

const unusedTransport: VoiceTransport = {
  available: () => true,
  start: async () => {
    throw new Error('The online call must not start in these tests.');
  },
  setMuted: async () => true,
  stopResponse: async () => true,
  sendMessage: async () => true,
  end: async () => true,
  subscribe: () => () => undefined,
};

const PanelHost: React.FC<{
  userId: string;
  offlineDeps: NonNullable<
    React.ComponentProps<typeof VoiceConversationPanel>['offlineDeps']
  >;
  transport?: VoiceTransport;
  onBack?: () => void;
  onNavigate?: React.ComponentProps<
    typeof VoiceConversationPanel
  >['onNavigate'];
}> = ({
  userId,
  offlineDeps,
  transport = unusedTransport,
  onBack = () => undefined,
  onNavigate,
}) => {
  const review = useCommandReview(userId, 'voice');
  return (
    <VoiceConversationPanel
      userId={userId}
      review={review}
      onBack={onBack}
      onNavigate={onNavigate}
      deps={id => ({
        ...defaultVoiceConversationDeps(id),
        transport,
        log: () => undefined,
      })}
      offlineDeps={offlineDeps}
    />
  );
};

const renderCall = (
  userId: string,
  phone = scriptedPhone(),
  onBack?: () => void,
  onNavigate?: jest.Mock,
) => {
  const utils = render(
    <ThemeProvider userId={userId}>
      <PanelHost
        userId={userId}
        offlineDeps={phone.deps}
        onBack={onBack}
        onNavigate={onNavigate}
      />
    </ThemeProvider>,
  );
  return {utils, phone};
};

const startOfflineCall = async (
  userId: string,
  onBack?: () => void,
  onNavigate?: jest.Mock,
) => {
  const call = renderCall(userId, undefined, onBack, onNavigate);
  await waitFor(() =>
    expect(call.utils.getByTestId('call-offline-badge')).toBeTruthy(),
  );
  fireEvent.press(call.utils.getByTestId('voice-conversation-start'));
  await call.phone.heard(/Lafina here/);
  return call;
};

const events = (userId: string) =>
  (
    db.executeSync(
      'SELECT title, date, start_time, end_time FROM events WHERE user_id = ? AND deleted_at IS NULL ORDER BY start_time',
      [userId],
    ).rows ?? []
  ).map(row => ({
    title: String(row.title),
    date: String(row.date),
    start: String(row.start_time).slice(0, 5),
    end: String(row.end_time).slice(0, 5),
  }));

const ymd = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    '0',
  )}-${String(date.getDate()).padStart(2, '0')}`;
const tomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return ymd(d);
};

beforeAll(async () => {
  await initDatabase();
  userStore.createGuestUser();
});

beforeEach(() => {
  jest.spyOn(ttsService, 'speak').mockResolvedValue(undefined as never);
  jest.spyOn(ttsService, 'stop').mockResolvedValue(undefined as never);
  jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);
  jest.spyOn(cloudClient, 'isOnline').mockResolvedValue(true);
});

afterEach(() => {
  jest.restoreAllMocks();
  endReviewSession();
  activeUser = null;
});

describe('which call a tap on Call starts', () => {
  test('signed in and connected: online', () => {
    const userId = student('route-online');
    signIn(userId, 'true');
    expect(predictCallMode(userId, true)).toEqual({
      mode: 'online',
      reason: 'online',
    });
    // Online Mode never chosen either way still means online.
    const fresh = student('route-unset');
    signIn(fresh, null);
    expect(predictCallMode(fresh, true).mode).toBe('online');
  });

  test('no internet: offline', async () => {
    const userId = student('route-net');
    signIn(userId, 'true');
    expect(predictCallMode(userId, false)).toEqual({
      mode: 'offline',
      reason: 'no_internet',
    });
    jest.spyOn(cloudClient, 'isOnline').mockResolvedValue(false);
    expect(await resolveCallMode(userId)).toEqual({
      mode: 'offline',
      reason: 'no_internet',
    });
  });

  test('a guest, or a sign-in that is not this account: offline', () => {
    const userId = student('route-guest');
    expect(predictCallMode(userId, true)).toEqual({
      mode: 'offline',
      reason: 'signed_out',
    });
  });

  test('Offline chosen in Chat: offline even when connected', async () => {
    const userId = student('route-chose');
    signIn(userId, 'false');
    expect(predictCallMode(userId, true)).toEqual({
      mode: 'offline',
      reason: 'chose_offline',
    });
    expect(await resolveCallMode(userId)).toEqual({
      mode: 'offline',
      reason: 'chose_offline',
    });
  });

  test('the screen shows the online badge when signed in and connected', async () => {
    const userId = student('badge-online');
    signIn(userId, 'true');
    const {utils} = renderCall(userId);
    await waitFor(() =>
      expect(utils.getByTestId('call-online-badge')).toBeTruthy(),
    );
    expect(utils.queryByTestId('call-offline-reason')).toBeNull();
  });

  test('the screen switches to offline when the phone loses its connection', async () => {
    (NetInfo.fetch as jest.Mock).mockResolvedValueOnce({
      isConnected: false,
      isInternetReachable: false,
    });
    const userId = student('badge-net');
    signIn(userId, 'true');
    const {utils} = renderCall(userId);
    await waitFor(() =>
      expect(utils.getByTestId('call-offline-reason')).toHaveTextContent(
        /no internet/,
      ),
    );
  });
});

describe('offline call: schedule, change and save by voice', () => {
  test('schedule a meeting, change the time, then "save it" saves it', async () => {
    const userId = student('flow');
    const {utils, phone} = await startOfflineCall(userId);

    await phone.say('Schedule a capstone meeting tomorrow from 10am to 11am');
    const cardLine = await phone.heard(/Should I save it\?$/);
    expect(cardLine).toMatch(/capstone meeting/i);
    expect(cardLine).toMatch(/10:00 AM/);
    expect(
      await utils.findByTestId('voice-conversation-review-card'),
    ).toHaveTextContent(/10:00 AM/);
    expect(events(userId)).toEqual([]);

    await phone.say('Change it to 10:30am to 11am instead.');
    const updated = await phone.heard(/^Updated\./);
    expect(updated).toMatch(/10:30 AM/);
    expect(updated).toMatch(/Should I save it\?$/);
    expect(events(userId)).toEqual([]);

    await phone.say('Save it.');
    await phone.heard(/saved/i);
    await waitFor(() =>
      expect(events(userId)).toEqual([
        expect.objectContaining({
          date: tomorrow(),
          start: '10:30',
          end: '11:00',
        }),
      ]),
    );
    expect(events(userId)[0].title).toMatch(/capstone/i);

    // "Save it" again: nothing is added twice.
    await phone.say('save it');
    await phone.heard(/already saved/i);
    expect(events(userId)).toHaveLength(1);
  });

  test('a bare "yes" answers "Should I save it?"', async () => {
    const userId = student('yes');
    const {phone} = await startOfflineCall(userId);
    await phone.say('Schedule a capstone meeting tomorrow from 1pm to 2pm');
    await phone.heard(/Should I save it\?$/);
    await phone.say('Yes.');
    await waitFor(() => expect(events(userId)).toHaveLength(1));
  });

  test('change and save in one sentence', async () => {
    const userId = student('change-save');
    const {phone} = await startOfflineCall(userId);
    await phone.say('Schedule a capstone meeting tomorrow from 10am to 11am');
    await phone.heard(/Should I save it\?$/);
    await phone.say('Change it to 3pm to 4pm and save it');
    await waitFor(() =>
      expect(events(userId)).toEqual([
        expect.objectContaining({start: '15:00', end: '16:00'}),
      ]),
    );
  });

  test('"cancel" drops the card and nothing is saved', async () => {
    const userId = student('cancel');
    const {utils, phone} = await startOfflineCall(userId);
    await phone.say('Schedule a capstone meeting tomorrow from 10am to 11am');
    await phone.heard(/Should I save it\?$/);
    await phone.say('Cancel that.');
    await phone.heard(/canceled|never mind/i);
    await waitFor(() =>
      expect(utils.queryByTestId('voice-conversation-review-card')).toBeNull(),
    );
    expect(events(userId)).toEqual([]);
  });

  test('a tap on Confirm saves it and LAFINA says so', async () => {
    const userId = student('tap');
    const {utils, phone} = await startOfflineCall(userId);
    await phone.say('Schedule a capstone meeting tomorrow from 9am to 10am');
    await phone.heard(/Should I save it\?$/);
    fireEvent.press(
      await utils.findByTestId('voice-conversation-review-confirm'),
    );
    await waitFor(() => expect(events(userId)).toHaveLength(1));
    await phone.heard(/saved/i);
  });

  test('"save it" with nothing open says there is nothing to save', async () => {
    const userId = student('nothing');
    const {phone} = await startOfflineCall(userId);
    await phone.say('save it');
    await phone.heard(/no card waiting/i);
    expect(events(userId)).toEqual([]);
  });

  test('"thank you" with nothing open says goodbye and closes the call screen', async () => {
    const userId = student('thanks-close');
    const onBack = jest.fn();
    const {phone} = await startOfflineCall(userId, onBack);
    await phone.say('thank you');
    await phone.heard(/welcome/i);
    await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1));
  });

  test('"bye" with an unsaved card asks once; "no" ends without saving', async () => {
    const userId = student('bye-card');
    const onBack = jest.fn();
    const {phone} = await startOfflineCall(userId, onBack);
    await phone.say('Schedule a capstone meeting tomorrow from 10am to 11am');
    await phone.heard(/Should I save it\?$/);
    await phone.say('bye');
    await phone.heard(/isn't saved yet/);
    expect(onBack).not.toHaveBeenCalled();
    await phone.say('no');
    await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1));
    expect(events(userId)).toEqual([]);
  });

  test('SKILL-02: "start a pomodoro" says the line, hangs up and opens Pomodoro', async () => {
    const userId = student('skill-pomo');
    const onBack = jest.fn();
    const onNavigate = jest.fn();
    const {phone} = await startOfflineCall(userId, onBack, onNavigate);
    await phone.say('start a pomodoro');
    await phone.heard(/starting a 25-minute focus session/);
    await waitFor(() => expect(onNavigate).toHaveBeenCalledTimes(1));
    expect(onNavigate.mock.calls[0][0]).toEqual({
      ownerId: userId,
      screen: 'notes',
      skill: {skill: 'pomodoro', action: 'start'},
    });
    expect(onBack).not.toHaveBeenCalled();
  });

  test('SKILL-02: "make a quiz" asks for material and opens the Quiz maker', async () => {
    const userId = student('skill-quiz');
    const onNavigate = jest.fn();
    const {phone} = await startOfflineCall(userId, undefined, onNavigate);
    await phone.say('make a quiz');
    await phone.heard(/Upload your material/);
    await waitFor(() => expect(onNavigate).toHaveBeenCalledTimes(1));
    expect(onNavigate.mock.calls[0][0].skill).toEqual({
      skill: 'quiz',
      action: 'create',
    });
  });

  test('"bye" hangs up', async () => {
    const userId = student('bye');
    const {utils, phone} = await startOfflineCall(userId);
    await phone.say('bye');
    await waitFor(() =>
      expect(utils.getByTestId('voice-conversation-start')).toHaveTextContent(
        /Call Lafina again/,
      ),
    );
  });
});

describe('offline call: reschedule something already saved', () => {
  test('move an existing meeting by voice, then save it', async () => {
    const userId = student('move');
    const {phone} = await startOfflineCall(userId);
    await phone.say('Schedule a capstone meeting tomorrow from 10am to 11am');
    await phone.heard(/Should I save it\?$/);
    await phone.say('save it');
    await waitFor(() => expect(events(userId)).toHaveLength(1));

    await phone.say('Move the capstone meeting tomorrow to 2pm');
    const line = await phone.heard(/Should I (?:go ahead|save it)\?$/);
    expect(line).toMatch(/2:00 PM/);
    expect(events(userId)[0].start).toBe('10:00');
    await phone.say('yes');
    await waitFor(() =>
      expect(events(userId)).toEqual([
        expect.objectContaining({start: '14:00'}),
      ]),
    );
  });
});

describe('offline call: follow-ups and fallback', () => {
  test('a time said after a request with no time completes it as one request', async () => {
    const userId = student('clarify');
    const {phone} = await startOfflineCall(userId);
    await phone.say('Schedule a capstone meeting');
    await phone.heard(/Should I save it\?$/);
    await phone.say('Tomorrow from 10am to 11am');
    const card = await phone.heard(/^Create event.*Should I save it\?$/);
    expect(card).toMatch(/capstone meeting/i);
    expect(card).toMatch(/10:00 AM to 11:00 AM/);
    await phone.say('save it');
    await waitFor(() =>
      expect(events(userId)).toEqual([
        expect.objectContaining({
          date: tomorrow(),
          start: '10:00',
          end: '11:00',
        }),
      ]),
    );
    // The task card it replaced was never saved.
    expect(tasksStore.getAllTasks(userId)).toEqual([]);
  });

  test('an online call that cannot reach the internet continues offline by itself', async () => {
    const userId = student('fallback');
    signIn(userId, 'true');
    jest.spyOn(cloudClient, 'isOnline').mockResolvedValue(false);
    const {utils, phone} = renderCall(userId);
    await waitFor(() =>
      expect(utils.getByTestId('call-online-badge')).toBeTruthy(),
    );
    fireEvent.press(utils.getByTestId('voice-conversation-start'));
    await phone.heard(/Lafina here/);
    expect(utils.getByTestId('call-offline-reason')).toHaveTextContent(
      /no internet/,
    );
  });

  test('when the online call is unavailable, "Call offline instead" continues on the phone', async () => {
    const userId = student('offer');
    signIn(userId, 'true');
    jest.spyOn(cloudClient, 'request').mockResolvedValue({
      status: 'success',
      data: {
        enabled: false,
        maxDurationSeconds: 300,
        maxTurns: 30,
        detail: null,
      },
    } as never);
    const {utils, phone} = renderCall(userId);
    await waitFor(() =>
      expect(utils.getByTestId('call-online-badge')).toBeTruthy(),
    );
    fireEvent.press(utils.getByTestId('voice-conversation-start'));
    fireEvent.press(
      await utils.findByTestId('voice-conversation-call-offline'),
    );
    await phone.heard(/Lafina here/);
    expect(utils.getByTestId('call-offline-reason')).toHaveTextContent(
      /not available right now/,
    );
  });
});

describe('offline call: device report fixes (2026-11-20, second test)', () => {
  test('"Rename the event to just capstone meeting" names it "capstone meeting"', async () => {
    const userId = student('rename');
    const {phone} = await startOfflineCall(userId);
    await phone.say(
      'Schedule a capstone meeting about the sync tomorrow from 10pm to 11pm',
    );
    await phone.heard(/Should I save it\?$/);
    await phone.say('Rename the event to just capstone meeting.');
    const updated = await phone.heard(/^Updated\./);
    expect(updated).toMatch(/"capstone meeting"/i);
    expect(updated).not.toMatch(/the event to/i);
    await phone.say('Yes.');
    await waitFor(() =>
      expect(events(userId)).toEqual([
        expect.objectContaining({title: 'capstone meeting', start: '22:00'}),
      ]),
    );
  });

  test('after a save, the confirmation shows once and says what was saved', async () => {
    const userId = student('saved-once');
    const {utils, phone} = await startOfflineCall(userId);
    await phone.say('Schedule a capstone meeting tomorrow from 10am to 11am');
    await phone.heard(/Should I save it\?$/);
    await phone.say('Save it');
    const line = await phone.heard(/^Saved "capstone meeting/i);
    expect(line).toMatch(/10:00 AM/);
    expect(line).toMatch(/reminder alarm/i);
    await waitFor(() =>
      expect(utils.getByTestId('call-details-reply')).toHaveTextContent(
        /Saved "capstone meeting/i,
      ),
    );
    // The same line is not repeated under it as a note.
    expect(utils.queryByTestId('voice-conversation-local-note')).toBeNull();
  });

  test('a save is written to Chat once, not again as the spoken line', async () => {
    const userId = student('saved-chat');
    const {phone} = await startOfflineCall(userId);
    await phone.say('Schedule a capstone meeting tomorrow from 1pm to 2pm');
    await phone.heard(/Should I save it\?$/);
    await phone.say('Save it');
    await phone.heard(/^Saved "capstone meeting/i);
    await waitFor(() => expect(events(userId)).toHaveLength(1));
    const receipts = (
      db.executeSync(
        `SELECT m.content FROM messages m JOIN chat_sessions s ON s.id = m.session_id
         WHERE s.user_id = ? AND m.sender = 'assistant' AND m.content LIKE 'Scheduled event%'`,
        [userId],
      ).rows ?? []
    ).length;
    expect(receipts).toBe(1);
    expect(phone.written.some(text => /^Saved "/.test(text))).toBe(false);
    // Lines that are not saves are still written by the call.
    expect(phone.written.some(text => /Should I save it\?$/.test(text))).toBe(
      true,
    );
  });

  test('a tap on Confirm is also written to Chat once', async () => {
    const userId = student('tap-chat');
    const {utils, phone} = await startOfflineCall(userId);
    await phone.say('Schedule a capstone meeting tomorrow from 3pm to 4pm');
    await phone.heard(/Should I save it\?$/);
    fireEvent.press(
      await utils.findByTestId('voice-conversation-review-confirm'),
    );
    await phone.heard(/^Saved "capstone meeting/i);
    expect(phone.written.some(text => /^Saved "/.test(text))).toBe(false);
  });
});

describe('speech recognition is loaded before it is needed', () => {
  const {NativeModules} = jest.requireActual('react-native');
  let warmup: jest.Mock;
  beforeEach(() => {
    warmup = jest.fn(async () => true);
    NativeModules.LafinaSpeechToText.warmup = warmup;
  });
  afterEach(() => {
    delete NativeModules.LafinaSpeechToText.warmup;
  });

  test('an open screen that will call offline loads it, and Call loads it again', async () => {
    const userId = student('warm-open');
    const call = renderCall(userId);
    await waitFor(() =>
      expect(call.utils.getByTestId('call-offline-badge')).toBeTruthy(),
    );
    await waitFor(() => expect(warmup).toHaveBeenCalled());
    const beforeCall = warmup.mock.calls.length;
    fireEvent.press(call.utils.getByTestId('voice-conversation-start'));
    await call.phone.heard(/Lafina here/);
    expect(warmup.mock.calls.length).toBeGreaterThan(beforeCall);
  });

  test('a minimized (paused) screen does not load it', async () => {
    const userId = student('warm-paused');
    const phone = scriptedPhone();
    const Host = () => {
      const review = useCommandReview(userId, 'voice');
      return (
        <VoiceConversationPanel
          userId={userId}
          review={review}
          onBack={() => undefined}
          offlineDeps={phone.deps}
          paused
        />
      );
    };
    const utils = render(
      <ThemeProvider userId={userId}>
        <Host />
      </ThemeProvider>,
    );
    await waitFor(() =>
      expect(utils.getByTestId('call-offline-badge')).toBeTruthy(),
    );
    expect(warmup).not.toHaveBeenCalled();
  });
});
