/**
 * Call Lafina save approval (2026-11-20): the student's own words, the card's
 * button and LAFINA's confirm_draft all reach one save, and LAFINA always
 * hears how it ended. Rendered in Jest with the node:sqlite mock and a fake
 * transport; this proves screen logic, not audio, ElevenLabs or a real phone.
 */
import React from 'react';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import {NativeModules, PermissionsAndroid} from 'react-native';
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
import type {
  TransportEvent,
  VoiceTransport,
} from '../../src/cloud/voiceConversation';
import {
  hasDraftApproval,
  isCompoundVoiceRequest,
  isDraftCancel,
  isExplicitSaveCommand,
  splitTrailingSave,
} from '../../src/cloud/voiceConversation/turnPolicy';
import {
  endReviewSession,
  latestPendingReview,
} from '../../src/ai/nlu/commandReview';
import {ttsService} from '../../src/ai/tts/ttsService';
import {useCommandReview} from '../../src/ui/hooks/useCommandReview';

const SESSION_ID = '11111111-2222-3333-4444-555555555555';
let serial = 0;
let activeUser: string | null = null;

const student = (label: string): string => {
  serial += 1;
  const id = `callsave-${label}-${serial}`;
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT OR IGNORE INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
     VALUES (?, ?, ?, 'student', 0, 0, 0, 0, ?, ?)`,
    [id, id, `${id}@example.invalid`, now, now],
  );
  return id;
};

const signIn = (userId: string) => {
  activeUser = userId;
  jest.spyOn(userStore, 'getActiveSessionToken').mockImplementation(() => ({
    userId: activeUser,
    accessToken: 'synthetic-token',
    refreshToken: null,
  }));
  localSettingsStore.set(userId, 'chat.onlineMode', 'true');
  localSettingsStore.set(userId, VOICE_CONSENT_KEY, 'true');
  localSettingsStore.set(
    userId,
    'voiceConversation.directDataConsent.v1',
    'true',
  );
};

const fakeServer = () => {
  jest
    .spyOn(cloudClient, 'request')
    .mockImplementation(async (path: string) => {
      if (path === '/v1/ai/voice/capabilities') {
        return {
          status: 'success',
          data: {
            enabled: true,
            maxDurationSeconds: 300,
            maxTurns: 30,
            detail: null,
          },
        } as never;
      }
      if (path === '/v1/ai/voice/sessions') {
        return {
          status: 'success',
          data: {
            sessionId: SESSION_ID,
            signedUrl:
              'wss://api.elevenlabs.io/v1/convai/conversation?agent_id=a&conversation_signature=s',
            grant: 'synthetic-grant',
            voiceId: 'default_voice',
            expiresAt: new Date(Date.now() + 300_000).toISOString(),
            maxDurationSeconds: 300,
            maxTurns: 30,
          },
        } as never;
      }
      if (path.startsWith(`/v1/ai/voice/sessions/${SESSION_ID}`)) {
        return {
          status: 'success',
          data: {status: 'active', lastErrorCode: null, lastErrorMessage: null},
        } as never;
      }
      return {
        status: 'error',
        error: {code: 'offline', message: 'n/a'},
      } as never;
    });
};

const fakeTransport = () => {
  let listener: ((event: TransportEvent) => void) | null = null;
  const calls = {start: 0, sent: [] as string[]};
  const transport: VoiceTransport = {
    available: () => true,
    start: async () => {
      calls.start += 1;
    },
    setMuted: async () => true,
    stopResponse: async () => true,
    sendMessage: async (_key, payload) => {
      calls.sent.push(payload);
      return true;
    },
    end: async () => true,
    subscribe: (_key, fn) => {
      listener = fn;
      return () => {
        listener = null;
      };
    },
  };
  const message = (payload: object) =>
    act(() => {
      listener?.({kind: 'message', data: JSON.stringify(payload)});
    });
  const emit = (event: TransportEvent) =>
    act(() => {
      listener?.(event);
    });
  return {transport, calls, message, emit};
};

const PanelHost: React.FC<{
  userId: string;
  transport: VoiceTransport;
  onBack?: () => void;
}> = ({userId, transport, onBack = () => undefined}) => {
  const review = useCommandReview(userId, 'voice');
  return (
    <VoiceConversationPanel
      userId={userId}
      review={review}
      onBack={onBack}
      deps={id => ({
        ...defaultVoiceConversationDeps(id),
        transport,
        log: () => undefined,
      })}
    />
  );
};

const startCall = async (label: string, onBack?: () => void) => {
  const userId = student(label);
  signIn(userId);
  fakeServer();
  const fake = fakeTransport();
  const utils = render(
    <ThemeProvider userId={userId}>
      <PanelHost userId={userId} transport={fake.transport} onBack={onBack} />
    </ThemeProvider>,
  );
  fireEvent.press(utils.getByTestId('voice-conversation-start'));
  await waitFor(() => expect(fake.calls.start).toBe(1));
  return {userId, utils, ...fake};
};

let eventId = 5000;
const said = (text: string) => ({
  type: 'user_transcript',
  user_transcription_event: {user_transcript: text, event_id: ++eventId},
});
const agentSaid = (text: string) => ({
  type: 'agent_response',
  agent_response_event: {agent_response: text, event_id: ++eventId},
});
const tool = (name: string, id: string, parameters: object) => ({
  type: 'client_tool_call',
  client_tool_call: {tool_name: name, tool_call_id: id, parameters},
});
/** The result LAFINA received for one tool call. */
const toolResult = (sent: string[], id: string): string | null => {
  for (const frame of sent) {
    const parsed = JSON.parse(frame) as {
      type?: string;
      tool_call_id?: string;
      result?: string;
    };
    if (parsed.type === 'client_tool_result' && parsed.tool_call_id === id)
      return parsed.result ?? '';
  }
  return null;
};
const contexts = (sent: string[]): string[] =>
  sent
    .map(frame => JSON.parse(frame) as {type?: string; text?: string})
    .filter(f => f.type === 'contextual_update')
    .map(f => f.text ?? '');

const MEETING = {
  request: 'schedule a meeting at 10am to 11am for capstone meeting',
  action: 'create_event',
  title: 'Capstone Meeting',
  date: '2030-06-12',
  time: '10:00',
  endTime: '11:00',
};

/** LAFINA prepares the meeting card from its own fields (a suggested card). */
const prepareMeeting = async (
  call: Awaited<ReturnType<typeof startCall>>,
): Promise<string> => {
  call.message(said(MEETING.request));
  call.message(tool('prepare_lafina_action', `prep-${++eventId}`, MEETING));
  const card = await call.utils.findByTestId('voice-conversation-review-card');
  expect(card).toHaveTextContent(/10:00 AM/);
  const id = latestPendingReview(call.userId, 'voice')?.operationId;
  expect(id).toBeTruthy();
  return id as string;
};

beforeAll(async () => {
  await initDatabase();
  userStore.createGuestUser();
});

beforeEach(() => {
  jest.spyOn(ttsService, 'speak').mockResolvedValue(undefined as never);
  jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);
  jest.spyOn(cloudClient, 'isOnline').mockResolvedValue(true);
});

afterEach(() => {
  jest.restoreAllMocks();
  endReviewSession();
  activeUser = null;
  delete (NativeModules as Record<string, unknown>).LafinaVoiceConversation;
});

describe('spoken save approval reads real speech-to-text', () => {
  test.each([
    'Save it.',
    'save it',
    'Okay, save it.',
    'Okay, save it, Lafina.',
    'Yes. Save it.',
    'Yes, please save it.',
    'Can you save it?',
    'Yes. Can you save it now?',
    'Go ahead and save it.',
    'Please save that for me.',
    'Save it to my calendar.',
    'Confirm.',
    'Yeah, confirm it.',
    'Lock it in.',
    'Book it.',
    'Add it.',
    'Okay, go ahead.',
    'That looks good, save it.',
    'Save the meeting.',
    'Sige, save mo na.',
  ])('"%s" saves whatever LAFINA last said', text => {
    expect(isExplicitSaveCommand(text)).toBe(true);
    expect(hasDraftApproval(text, 'I updated the time.')).toBe(true);
  });

  test.each([
    'Save it at 3pm.',
    'Yes, but change it to tomorrow.',
    "Don't save it yet.",
    'Did you save it?',
    'Is it saved?',
    'Wait, save it later.',
    'No, cancel it.',
    'Save it on Friday.',
    'Okay but move it to 11.',
    'What did you save?',
    'Not yet.',
  ])('"%s" is not a save', text => {
    expect(hasDraftApproval(text, 'Should I save it?')).toBe(false);
  });

  test.each([
    'Want me to lock that in?',
    'Would you like me to save it?',
    'Does that look right?',
    'Is that correct?',
    'Okay to save?',
    'Should I go ahead?',
  ])('a bare yes answers LAFINA asking "%s"', question => {
    expect(hasDraftApproval('Yes.', question)).toBe(true);
    expect(hasDraftApproval('Sounds good.', question)).toBe(true);
    expect(hasDraftApproval('Thanks.', question)).toBe(false);
  });

  test('a bare yes to anything else is not a save', () => {
    expect(hasDraftApproval('Yes.', 'Anything else for today?')).toBe(false);
    expect(hasDraftApproval('Okay.', "I can't save that.")).toBe(false);
  });

  test('a change with a save at the end splits into both', () => {
    expect(splitTrailingSave('Change it to 10:30 and save it.')).toBe(
      'Change it to 10:30',
    );
    expect(splitTrailingSave('make it 3pm, then save it please')).toBe(
      'make it 3pm',
    );
    expect(splitTrailingSave('change the title to save it')).toBeNull();
    expect(splitTrailingSave('save it')).toBeNull();
  });

  test('discarding the draft is recognized; deleting a real item is not', () => {
    for (const text of [
      'Cancel that.',
      'No, cancel it, Lafina.',
      'Never mind.',
      "Don't save it.",
      'Scrap it.',
      'Forget it.',
    ])
      expect(isDraftCancel(text)).toBe(true);
    for (const text of ['Cancel my 3pm meeting.', 'Delete it.', 'No.'])
      expect(isDraftCancel(text)).toBe(false);
  });

  test('"…and save it" is one request, not two', () => {
    expect(
      isCompoundVoiceRequest(
        'Schedule a capstone meeting at 10am to 11am and save it',
      ),
    ).toBe(false);
    expect(
      isCompoundVoiceRequest('Add a meeting at 10am and remind me at 9am'),
    ).toBe(true);
  });
});

describe('Call Lafina saves when the student says so', () => {
  test('the reported call: change to 10:30, then "save it" saves once and LAFINA gets the receipt', async () => {
    const call = await startCall('reported');
    const firstId = await prepareMeeting(call);

    call.message(said('change it to 10:30am to 11am instead'));
    await waitFor(() =>
      expect(
        call.utils.getByTestId('voice-conversation-review-card'),
      ).toHaveTextContent(/10:30 AM/),
    );
    // LAFINA, a step behind, tries to save the card it prepared first.
    call.message(
      tool('confirm_draft', 'early-confirm', {cardId: firstId, revision: 1}),
    );
    await waitFor(() =>
      expect(toolResult(call.calls.sent, 'early-confirm')).not.toBeNull(),
    );
    expect(toolResult(call.calls.sent, 'early-confirm')).toMatch(
      /Not saved yet/,
    );
    expect(tasksStore.getAllEvents(call.userId)).toHaveLength(0);

    call.message(agentSaid('I moved it to 10:30 to 11. Should I save it?'));
    call.message(said('Okay, save it, Lafina.'));
    await waitFor(() =>
      expect(tasksStore.getAllEvents(call.userId)).toHaveLength(1),
    );
    expect(tasksStore.getAllEvents(call.userId)[0]).toMatchObject({
      title: 'Capstone Meeting',
      startTime: '10:30',
      endTime: '11:00',
    });
    expect(
      call.utils.queryByTestId('voice-conversation-review-card'),
    ).toBeNull();

    // LAFINA's confirm_draft for the same words, with the old card ID, gets
    // the receipt instead of "ask them to confirm again".
    call.message(
      tool('confirm_draft', 'late-confirm', {cardId: firstId, revision: 2}),
    );
    await waitFor(() =>
      expect(toolResult(call.calls.sent, 'late-confirm')).not.toBeNull(),
    );
    expect(toolResult(call.calls.sent, 'late-confirm')).toMatch(
      /Already saved/,
    );
    expect(tasksStore.getAllEvents(call.userId)).toHaveLength(1);
    const told = contexts(call.calls.sent).join('\n');
    expect(told).toMatch(/The student said to save the card on screen/);
    expect(told).toMatch(/Confirmed and saved action result/);
  });

  test('"save it" and LAFINA\'s confirm_draft together save exactly once', async () => {
    const call = await startCall('race');
    const id = await prepareMeeting(call);
    call.message(said('save it'));
    call.message(
      tool('confirm_draft', 'race-confirm', {cardId: id, revision: 1}),
    );
    await waitFor(() =>
      expect(toolResult(call.calls.sent, 'race-confirm')).not.toBeNull(),
    );
    expect(toolResult(call.calls.sent, 'race-confirm')).toMatch(
      /Saved after the student confirmed|Already saved/,
    );
    expect(tasksStore.getAllEvents(call.userId)).toHaveLength(1);
  });

  test('a bare "yes" saves only after LAFINA asked to save', async () => {
    const call = await startCall('bare-yes');
    await prepareMeeting(call);
    call.message(agentSaid('Anything else you want on it?'));
    call.message(said('Yes.'));
    await act(async () => undefined);
    expect(tasksStore.getAllEvents(call.userId)).toHaveLength(0);
    call.message(agentSaid('Want me to lock that in?'));
    call.message(said('Yes.'));
    await waitFor(() =>
      expect(tasksStore.getAllEvents(call.userId)).toHaveLength(1),
    );
  });

  test('"change it to 3pm and save it" changes, then saves the new card', async () => {
    const call = await startCall('change-and-save');
    await prepareMeeting(call);
    call.message(said('change it to 3pm to 4pm and save it'));
    await waitFor(() =>
      expect(tasksStore.getAllEvents(call.userId)).toHaveLength(1),
    );
    expect(tasksStore.getAllEvents(call.userId)[0]).toMatchObject({
      startTime: '15:00',
      endTime: '16:00',
    });
    expect(
      call.utils.queryByTestId('voice-conversation-review-card'),
    ).toBeNull();
  });

  test('"yes, but change it" changes the card and saves nothing', async () => {
    const call = await startCall('yes-but');
    await prepareMeeting(call);
    call.message(agentSaid('Should I save it?'));
    call.message(said('yes, but change it to 11am to 12pm'));
    await waitFor(() =>
      expect(
        call.utils.getByTestId('voice-conversation-review-card'),
      ).toHaveTextContent(/11:00 AM/),
    );
    expect(tasksStore.getAllEvents(call.userId)).toHaveLength(0);
  });

  test('"save it" before a card exists never approves the card that comes later', async () => {
    const call = await startCall('early-save');
    call.message(said('save it'));
    call.message(tool('prepare_lafina_action', 'late-prep', MEETING));
    await call.utils.findByTestId('voice-conversation-review-card');
    const id = latestPendingReview(call.userId, 'voice')?.operationId;
    call.message(tool('confirm_draft', 'late-card', {cardId: id, revision: 1}));
    await waitFor(() =>
      expect(toolResult(call.calls.sent, 'late-card')).not.toBeNull(),
    );
    expect(toolResult(call.calls.sent, 'late-card')).toMatch(/Not saved yet/);
    expect(tasksStore.getAllEvents(call.userId)).toHaveLength(0);
  });

  test('a spoken cancel discards the card and tells LAFINA', async () => {
    const call = await startCall('cancel');
    await prepareMeeting(call);
    call.message(said('No, cancel it, Lafina.'));
    await waitFor(() =>
      expect(
        call.utils.queryByTestId('voice-conversation-review-card'),
      ).toBeNull(),
    );
    expect(contexts(call.calls.sent).join('\n')).toMatch(
      /canceled the draft card by voice/,
    );
    expect(tasksStore.getAllEvents(call.userId)).toHaveLength(0);
  });
});

describe('LAFINA knows when the student taps the card', () => {
  test('tapping Confirm saves, tells LAFINA, and a later confirm_draft gets the receipt', async () => {
    const call = await startCall('tap');
    const id = await prepareMeeting(call);
    fireEvent.press(
      call.utils.getByTestId('voice-conversation-review-confirm'),
    );
    await waitFor(() =>
      expect(tasksStore.getAllEvents(call.userId)).toHaveLength(1),
    );
    await waitFor(() =>
      expect(contexts(call.calls.sent).join('\n')).toMatch(
        /tapped Confirm on the card\. It is saved now/,
      ),
    );
    call.message(tool('confirm_draft', 'after-tap', {cardId: id, revision: 1}));
    await waitFor(() =>
      expect(toolResult(call.calls.sent, 'after-tap')).not.toBeNull(),
    );
    expect(toolResult(call.calls.sent, 'after-tap')).toMatch(/Already saved/);
    // "Save it" after the tap adds nothing and says it is already saved.
    call.message(said('save it'));
    await waitFor(() =>
      expect(contexts(call.calls.sent).join('\n')).toMatch(
        /The last card is already saved/,
      ),
    );
    expect(tasksStore.getAllEvents(call.userId)).toHaveLength(1);
  });

  test('a double tap with a spoken save still writes once', async () => {
    const call = await startCall('double');
    await prepareMeeting(call);
    const confirm = call.utils.getByTestId('voice-conversation-review-confirm');
    fireEvent.press(confirm);
    call.message(said('save it'));
    await waitFor(() =>
      expect(tasksStore.getAllEvents(call.userId)).toHaveLength(1),
    );
    await act(async () => undefined);
    expect(tasksStore.getAllEvents(call.userId)).toHaveLength(1);
  });
});

describe('a saved card never comes back as a new card (2026-11-20 device report)', () => {
  /** "Save it" by voice, then wait until it is saved and the card is gone. */
  const saveByVoice = async (call: Awaited<ReturnType<typeof startCall>>) => {
    call.message(agentSaid('Should I save it?'));
    call.message(said('save it'));
    await waitFor(() =>
      expect(tasksStore.getAllEvents(call.userId)).toHaveLength(1),
    );
    await waitFor(() =>
      expect(
        call.utils.queryByTestId('voice-conversation-review-card'),
      ).toBeNull(),
    );
  };

  test('the reported call: LAFINA prepares the saved meeting again; no card, no conflict, one event', async () => {
    const call = await startCall('reprepare');
    await prepareMeeting(call);
    await saveByVoice(call);
    call.message(tool('prepare_lafina_action', 'again', MEETING));
    await waitFor(() =>
      expect(toolResult(call.calls.sent, 'again')).not.toBeNull(),
    );
    expect(toolResult(call.calls.sent, 'again')).toMatch(/Already saved/);
    await act(async () => undefined);
    expect(
      call.utils.queryByTestId('voice-conversation-review-card'),
    ).toBeNull();
    expect(call.utils.queryByText(/Overlaps/i)).toBeNull();
    expect(latestPendingReview(call.userId, 'voice')).toBeNull();
    expect(tasksStore.getAllEvents(call.userId)).toHaveLength(1);
  });

  test('the same meeting described a little differently is still the saved one', async () => {
    const call = await startCall('reprepare-variant');
    await prepareMeeting(call);
    await saveByVoice(call);
    call.message(
      tool('prepare_lafina_action', 'variant', {
        ...MEETING,
        title: 'capstone meeting.',
        endTime: undefined,
      }),
    );
    await waitFor(() =>
      expect(toolResult(call.calls.sent, 'variant')).toMatch(/Already saved/),
    );
    expect(latestPendingReview(call.userId, 'voice')).toBeNull();
  });

  test('LAFINA prepares it again while the save is still running: one event, no card', async () => {
    const call = await startCall('reprepare-race');
    await prepareMeeting(call);
    call.message(agentSaid('Should I save it?'));
    call.message(said('save it'));
    call.message(tool('prepare_lafina_action', 'race', MEETING));
    await waitFor(() =>
      expect(toolResult(call.calls.sent, 'race')).toMatch(/Already saved/),
    );
    expect(tasksStore.getAllEvents(call.userId)).toHaveLength(1);
    expect(latestPendingReview(call.userId, 'voice')).toBeNull();
  });

  test('after a tap on Confirm, a repeat prepare is refused the same way', async () => {
    const call = await startCall('reprepare-tap');
    await prepareMeeting(call);
    fireEvent.press(
      call.utils.getByTestId('voice-conversation-review-confirm'),
    );
    await waitFor(() =>
      expect(tasksStore.getAllEvents(call.userId)).toHaveLength(1),
    );
    call.message(tool('prepare_lafina_action', 'after-tap-again', MEETING));
    await waitFor(() =>
      expect(toolResult(call.calls.sent, 'after-tap-again')).toMatch(
        /Already saved/,
      ),
    );
    expect(latestPendingReview(call.userId, 'voice')).toBeNull();
  });

  test('a different meeting (another time) still gets its own card', async () => {
    const call = await startCall('reprepare-other');
    await prepareMeeting(call);
    await saveByVoice(call);
    call.message(said('schedule another capstone meeting at 2pm'));
    call.message(
      tool('prepare_lafina_action', 'other', {
        ...MEETING,
        request: 'schedule another capstone meeting at 2pm',
        time: '14:00',
        endTime: '15:00',
      }),
    );
    expect(
      await call.utils.findByTestId('voice-conversation-review-card'),
    ).toHaveTextContent(/2:00 PM/);
    expect(toolResult(call.calls.sent, 'other')).toMatch(/Review card/);
  });

  test('revise_draft or cancel_draft on the saved card changes nothing and says why', async () => {
    const call = await startCall('reprepare-revise');
    const id = await prepareMeeting(call);
    await saveByVoice(call);
    call.message(
      tool('revise_draft', 'rev', {cardId: id, instruction: 'make it 1pm'}),
    );
    call.message(tool('cancel_draft', 'can', {cardId: id}));
    await waitFor(() =>
      expect(toolResult(call.calls.sent, 'rev')).toMatch(/already saved/),
    );
    await waitFor(() =>
      expect(toolResult(call.calls.sent, 'can')).toMatch(/already saved/),
    );
    expect(tasksStore.getAllEvents(call.userId)).toEqual([
      expect.objectContaining({startTime: expect.stringMatching(/^10:00/)}),
    ]);
  });
});

describe('CALLFIX-01: one "yes" saves the card LAFINA just showed (2026-11-22 report)', () => {
  test('after "Nothing is saved until you confirm", a bare "Yes." saves once', async () => {
    const call = await startCall('fix-just-shown');
    await prepareMeeting(call);
    call.message(
      agentSaid(
        "I've shown a card for Capstone Meeting at 10 AM. Nothing is saved until you confirm.",
      ),
    );
    call.message(said('Yes.'));
    await waitFor(() =>
      expect(tasksStore.getAllEvents(call.userId)).toHaveLength(1),
    );
  });

  test.each([
    'yes add it to my calendar, thanks',
    'oo, sige',
    'yes do that',
    'yes, safe it',
  ])('"%s" right after the card saves', async text => {
    const call = await startCall('fix-phrases');
    await prepareMeeting(call);
    call.message(agentSaid('Check the card on your screen.'));
    call.message(said(text));
    await waitFor(() =>
      expect(tasksStore.getAllEvents(call.userId)).toHaveLength(1),
    );
  });

  test('a later "okay" to something else does not save an older card', async () => {
    const call = await startCall('fix-stale');
    await prepareMeeting(call);
    call.message(said('what is on my schedule tomorrow'));
    call.message(agentSaid('You have nothing else tomorrow.'));
    call.message(said('okay'));
    await act(async () => undefined);
    expect(tasksStore.getAllEvents(call.userId)).toHaveLength(0);
    expect(latestPendingReview(call.userId, 'voice')).toBeTruthy();
  });

  test("when the device cannot place a plain yes, LAFINA's confirm_draft saves it", async () => {
    const call = await startCall('fix-second-key');
    const id = await prepareMeeting(call);
    call.message(agentSaid('Anything else you want on it?'));
    call.message(said('Yes.'));
    await act(async () => undefined);
    expect(tasksStore.getAllEvents(call.userId)).toHaveLength(0);
    call.message(
      tool('confirm_draft', 'second-key', {cardId: id, revision: 1}),
    );
    await waitFor(() =>
      expect(toolResult(call.calls.sent, 'second-key')).not.toBeNull(),
    );
    expect(toolResult(call.calls.sent, 'second-key')).toMatch(
      /Saved after the student said yes/,
    );
    expect(tasksStore.getAllEvents(call.userId)).toHaveLength(1);
  });

  test('confirm_draft after "yes but at 5" or a question still saves nothing', async () => {
    const call = await startCall('fix-second-key-guard');
    const id = await prepareMeeting(call);
    call.message(agentSaid('Anything else you want on it?'));
    call.message(said('did you save it?'));
    call.message(tool('confirm_draft', 'guard-1', {cardId: id, revision: 1}));
    await waitFor(() =>
      expect(toolResult(call.calls.sent, 'guard-1')).toMatch(/Not saved yet/),
    );
    expect(tasksStore.getAllEvents(call.userId)).toHaveLength(0);
  });
});

describe('CALLFIX-02: a saved card shows "Saved" on its button, then leaves', () => {
  test('a spoken save: the card is replaced by its Saved echo, which then goes away', async () => {
    const call = await startCall('fix-exit-voice');
    await prepareMeeting(call);
    call.message(agentSaid('Check the card on your screen.'));
    call.message(said('yes save it'));
    await waitFor(() =>
      expect(tasksStore.getAllEvents(call.userId)).toHaveLength(1),
    );
    // The pending card is retired at once; its echo says Saved.
    expect(
      call.utils.queryByTestId('voice-conversation-review-card'),
    ).toBeNull();
    const savedButton = await call.utils.findByTestId(
      'voice-conversation-saved-confirm-saved',
    );
    expect(savedButton).toHaveTextContent('Saved');
    expect(call.utils.getByTestId('call-card-saved-exit')).toBeTruthy();
    // Then the stage is empty again (about 1 s on a phone; Jest renders of
    // the whole call screen can delay its timers by several seconds).
    await waitFor(
      () => expect(call.utils.queryByTestId('call-card-saved-exit')).toBeNull(),
      {timeout: 9000},
    );
    expect(call.utils.queryByTestId('call-action-card-stage')).toBeNull();
  });

  test('a tap on Confirm plays the same exit', async () => {
    const call = await startCall('fix-exit-tap');
    await prepareMeeting(call);
    fireEvent.press(
      call.utils.getByTestId('voice-conversation-review-confirm'),
    );
    expect(
      await call.utils.findByTestId('voice-conversation-saved-confirm-saved'),
    ).toBeTruthy();
    expect(tasksStore.getAllEvents(call.userId)).toHaveLength(1);
    await waitFor(
      () => expect(call.utils.queryByTestId('call-card-saved-exit')).toBeNull(),
      {timeout: 9000},
    );
  });

  test('a cancelled card leaves at once, without a Saved echo', async () => {
    const call = await startCall('fix-exit-cancel');
    await prepareMeeting(call);
    call.message(said('cancel it'));
    await waitFor(() =>
      expect(
        call.utils.queryByTestId('voice-conversation-review-card'),
      ).toBeNull(),
    );
    expect(call.utils.queryByTestId('call-card-saved-exit')).toBeNull();
  });
});

describe('CALLFIX-03: goodbye ends the call after LAFINA says goodbye', () => {
  /** LAFINA's goodbye is heard: audio starts, then stops. */
  const goodbyePlays = (call: Awaited<ReturnType<typeof startCall>>) => {
    call.message(agentSaid('Bye for now! Good luck today.'));
    call.emit({kind: 'playback', speaking: true});
    call.emit({kind: 'playback', speaking: false});
  };

  test('"bye" with nothing open: Ending call banner, goodbye, then the call closes', async () => {
    const onBack = jest.fn();
    const call = await startCall('close-bye', onBack);
    call.message(said('Okay, bye Lafina.'));
    expect(await call.utils.findByTestId('call-ending-banner')).toBeTruthy();
    expect(contexts(call.calls.sent).join('\n')).toMatch(
      /The student is ending the call/,
    );
    expect(onBack).not.toHaveBeenCalled();
    goodbyePlays(call);
    await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1), {
      timeout: 9000,
    });
  });

  test('"thank you" with nothing open also closes the call', async () => {
    const onBack = jest.fn();
    const call = await startCall('close-thanks', onBack);
    call.message(said('Thank you!'));
    expect(await call.utils.findByTestId('call-ending-banner')).toBeTruthy();
    goodbyePlays(call);
    await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1), {
      timeout: 9000,
    });
  });

  test('"thank you" while a card is waiting does not end the call', async () => {
    const onBack = jest.fn();
    const call = await startCall('close-thanks-card', onBack);
    await prepareMeeting(call);
    call.message(said('thank you'));
    await act(async () => undefined);
    expect(call.utils.queryByTestId('call-ending-banner')).toBeNull();
    goodbyePlays(call);
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 600));
    });
    expect(onBack).not.toHaveBeenCalled();
    expect(latestPendingReview(call.userId, 'voice')).toBeTruthy();
  });

  test('"bye" with an unsaved card asks once; "no" discards it and closes', async () => {
    const onBack = jest.fn();
    const call = await startCall('close-ask', onBack);
    await prepareMeeting(call);
    call.message(said('bye'));
    await waitFor(() =>
      expect(contexts(call.calls.sent).join('\n')).toMatch(
        /said goodbye, but the card on screen/,
      ),
    );
    expect(call.utils.queryByTestId('call-ending-banner')).toBeNull();
    call.message(
      agentSaid(
        "Before you go, your meeting isn't saved yet. Should I save it?",
      ),
    );
    call.message(said('no'));
    expect(await call.utils.findByTestId('call-ending-banner')).toBeTruthy();
    expect(latestPendingReview(call.userId, 'voice')).toBeNull();
    goodbyePlays(call);
    await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1), {
      timeout: 9000,
    });
    expect(tasksStore.getAllEvents(call.userId)).toHaveLength(0);
  });

  test('"yes" to "save it before you go?" saves, then closes', async () => {
    const onBack = jest.fn();
    const call = await startCall('close-ask-yes', onBack);
    await prepareMeeting(call);
    call.message(said('bye'));
    call.message(
      agentSaid(
        "Before you go, your meeting isn't saved yet. Should I save it?",
      ),
    );
    call.message(said('yes'));
    await waitFor(() =>
      expect(tasksStore.getAllEvents(call.userId)).toHaveLength(1),
    );
    expect(await call.utils.findByTestId('call-ending-banner')).toBeTruthy();
    goodbyePlays(call);
    await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1), {
      timeout: 9000,
    });
  });

  test('"yes save it, thanks, bye" saves first, then closes', async () => {
    const onBack = jest.fn();
    const call = await startCall('close-save-bye', onBack);
    await prepareMeeting(call);
    call.message(agentSaid('Check the card on your screen.'));
    call.message(said('yes save it, thanks, bye'));
    await waitFor(() =>
      expect(tasksStore.getAllEvents(call.userId)).toHaveLength(1),
    );
    expect(await call.utils.findByTestId('call-ending-banner')).toBeTruthy();
    goodbyePlays(call);
    await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1), {
      timeout: 9000,
    });
  });

  test('Keep talking cancels the hang-up', async () => {
    const onBack = jest.fn();
    const call = await startCall('close-keep', onBack);
    call.message(said('bye'));
    fireEvent.press(await call.utils.findByTestId('call-ending-keep-talking'));
    expect(call.utils.queryByTestId('call-ending-banner')).toBeNull();
    expect(contexts(call.calls.sent).join('\n')).toMatch(/Keep talking/);
    goodbyePlays(call);
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 600));
    });
    expect(onBack).not.toHaveBeenCalled();
    expect(call.utils.getByTestId('voice-conversation-end')).toBeTruthy();
  });

  test('new words before the goodbye is over keep the call open', async () => {
    const onBack = jest.fn();
    const call = await startCall('close-more', onBack);
    call.message(said('bye'));
    await call.utils.findByTestId('call-ending-banner');
    call.message(said('wait, what is on my schedule tomorrow?'));
    await waitFor(() =>
      expect(call.utils.queryByTestId('call-ending-banner')).toBeNull(),
    );
    goodbyePlays(call);
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 600));
    });
    expect(onBack).not.toHaveBeenCalled();
  });
});
