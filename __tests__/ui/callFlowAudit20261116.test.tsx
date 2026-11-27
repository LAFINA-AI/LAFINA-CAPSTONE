/**
 * Call flow audit (2026-11-16): the review card must be on screen whenever
 * the call says it is. Rendered in Jest with the node:sqlite mock and a fake
 * transport; this proves screen logic, not audio, ElevenLabs or a real phone.
 * See docs/reports/call-flow-audit-2026-11-16.md.
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
  endReviewSession,
  latestPendingReview,
  prepareReviewedCommand,
} from '../../src/ai/nlu/commandReview';
import {parseIntentFastPath} from '../../src/ai/nlu/fastPathParser';
import {validateIntent} from '../../src/ai/nlu/types';
import {ttsService} from '../../src/ai/tts/ttsService';
import {useCommandReview} from '../../src/ui/hooks/useCommandReview';
import {chatOrchestrator} from '../../src/ai/chatOrchestrator';

const SESSION_ID = '11111111-2222-3333-4444-555555555555';
let serial = 0;
let activeUser: string | null = null;

const student = (label: string): string => {
  serial += 1;
  const id = `callflow-${label}-${serial}`;
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
      // Online intent extraction and anything else: fail closed to the device.
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
  return {transport, calls, message};
};

const PanelHost: React.FC<{
  userId: string;
  transport: VoiceTransport;
  onAttention?: () => void;
}> = ({userId, transport, onAttention}) => {
  const review = useCommandReview(userId, 'voice');
  return (
    <VoiceConversationPanel
      userId={userId}
      review={review}
      onBack={() => undefined}
      onAttention={onAttention}
      deps={id => ({
        ...defaultVoiceConversationDeps(id),
        transport,
        log: () => undefined,
      })}
    />
  );
};

const startCall = async (label: string, onAttention?: () => void) => {
  const userId = student(label);
  signIn(userId);
  fakeServer();
  const fake = fakeTransport();
  const utils = render(
    <ThemeProvider userId={userId}>
      <PanelHost
        userId={userId}
        transport={fake.transport}
        onAttention={onAttention}
      />
    </ThemeProvider>,
  );
  fireEvent.press(utils.getByTestId('voice-conversation-start'));
  await waitFor(() => expect(fake.calls.start).toBe(1));
  return {userId, utils, ...fake};
};

let eventId = 900;
const said = (text: string) => ({
  type: 'user_transcript',
  user_transcription_event: {user_transcript: text, event_id: ++eventId},
});
const agentSaid = (text: string) => ({
  type: 'agent_response',
  agent_response_event: {agent_response: text, event_id: ++eventId},
});

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

describe('Call Lafina: a card the call talks about is on screen', () => {
  test('online fields make a clean card without a second extraction or a save', async () => {
    const {userId, utils, message, calls} = await startCall('online-fields');
    const extract = jest.spyOn(chatOrchestrator, 'reviewSpokenTurn');
    const request =
      'Yeah. I want you to set a schedule for capstone meeting tomorrow at 5 PM';
    message(said(request));
    expect(utils.queryByTestId('voice-conversation-review-card')).toBeNull();
    const parameters = {
      request,
      action: 'create_event',
      title: 'Capstone Meeting',
      date: '2030-06-12',
      time: '17:00',
      endTime: '18:00',
      location: 'Room 201',
    };
    message({
      type: 'client_tool_call',
      client_tool_call: {
        tool_name: 'prepare_lafina_action',
        tool_call_id: 'clean-title',
        parameters,
      },
    });
    const card = await utils.findByTestId('voice-conversation-review-card');
    expect(card).toHaveTextContent(/Capstone Meeting/);
    expect(card).not.toHaveTextContent(/Yeah/);
    expect(card).toHaveTextContent(/Room 201/);
    expect(extract).not.toHaveBeenCalled();
    expect(utils.getByTestId('synth-wave-avatar')).toBeTruthy();
    const id = latestPendingReview(userId, 'voice')?.operationId;
    message({
      type: 'client_tool_call',
      client_tool_call: {
        tool_name: 'prepare_lafina_action',
        tool_call_id: 'duplicate-prepare',
        parameters,
      },
    });
    await waitFor(() =>
      expect(calls.sent.some(f => f.includes('duplicate-prepare'))).toBe(true),
    );
    expect(latestPendingReview(userId, 'voice')?.operationId).toBe(id);
    message({
      type: 'client_tool_call',
      client_tool_call: {
        tool_name: 'confirm_draft',
        tool_call_id: 'self-confirm',
        parameters: {cardId: id, revision: 1},
      },
    });
    await waitFor(() =>
      expect(calls.sent.some(f => f.includes('self-confirm'))).toBe(true),
    );
    expect(tasksStore.getAllEvents(userId)).toHaveLength(0);
    message(said('yes, but change it to tomorrow'));
    expect(tasksStore.getAllEvents(userId)).toHaveLength(0);
    message(said('confirm'));
    await waitFor(() =>
      expect(tasksStore.getAllEvents(userId)).toHaveLength(1),
    );
    expect(tasksStore.getAllEvents(userId)[0].title).toBe('Capstone Meeting');
  });

  test('a failed commit sends a failure context rather than a saved claim', async () => {
    const {utils, message, calls} = await startCall('failed-confirm');
    message(said('Add task: Submit slides tomorrow at 3pm'));
    message({
      type: 'client_tool_call',
      client_tool_call: {
        tool_name: 'prepare_lafina_action',
        tool_call_id: 'failed-card',
        parameters: {
          request: 'Add slides',
          action: 'create_task',
          title: 'Submit slides',
        },
      },
    });
    await utils.findByTestId('voice-conversation-review-card');
    jest.spyOn(chatOrchestrator, 'confirmReview').mockResolvedValue({
      reply: 'Could not save. Try again.',
      outcome: {status: 'refused', reason: 'failed'},
    } as never);
    fireEvent.press(utils.getByTestId('voice-conversation-review-confirm'));
    await waitFor(() =>
      expect(calls.sent.some(f => f.includes('Action was not saved'))).toBe(
        true,
      ),
    );
    expect(
      calls.sent.some(f => f.includes('Confirmed and saved action result')),
    ).toBe(false);
    expect(utils.getByTestId('voice-conversation-review-card')).toBeTruthy();
  });

  test('a compound request cannot be flattened into a single event', async () => {
    const {userId, utils, message, calls} = await startCall('compound');
    message(
      said(
        'Add a meeting tomorrow at 5 PM and a reminder to submit slides Friday at 3 PM',
      ),
    );
    message({
      type: 'client_tool_call',
      client_tool_call: {
        tool_name: 'prepare_lafina_action',
        tool_call_id: 'wrong-single',
        parameters: {
          request: 'meeting',
          action: 'create_event',
          title: 'Meeting',
          time: '17:00',
        },
      },
    });
    await waitFor(() =>
      expect(
        calls.sent.some(f => f.includes('grouped review card with 2 items')),
      ).toBe(true),
    );
    expect(utils.getByTestId('multi-item-title-input-1').props.value).toBe(
      'Submit slides',
    );
    expect(utils.getByTestId('multi-action-confirm-all')).toBeTruthy();
    message({
      type: 'client_tool_call',
      client_tool_call: {
        tool_name: 'prepare_multi_action',
        tool_call_id: 'correct-group',
        parameters: {
          items: [
            {
              kind: 'event',
              title: 'Capstone Meeting',
              date: '2030-06-12',
              time: '17:00',
              endTime: '18:00',
            },
            {
              kind: 'reminder',
              title: 'Submit slides',
              date: '2030-06-14',
              time: '15:00',
            },
          ],
        },
      },
    });
    await utils.findByTestId('multi-action-confirm-all');
    expect(tasksStore.getAllEvents(userId)).toHaveLength(0);
  });
  test('a finished memory card does not hide the next review card', async () => {
    const {utils, message} = await startCall('memory-then-task');

    message(said('Remember that I prefer studying at night'));
    await utils.findByTestId('memory-draft-confirm');
    fireEvent.press(utils.getByTestId('memory-draft-confirm'));
    await waitFor(() =>
      expect(utils.queryByTestId('memory-draft-confirm')).toBeNull(),
    );

    message(said('Add task: Submit slides tomorrow at 3pm'));
    message({
      type: 'client_tool_call',
      client_tool_call: {
        tool_name: 'prepare_lafina_action',
        tool_call_id: `online-${++eventId}`,
        parameters: {
          request: 'Add task: Submit slides tomorrow at 3pm',
          action: 'create_task',
          title: 'Submit slides',
          date: '2030-06-12',
          time: '15:00',
        },
      },
    });
    const card = await utils.findByTestId('voice-conversation-review-card');
    expect(card).toHaveTextContent(/Submit slides/i);
    // The saved memory card gave way to the card that needs an answer.
    expect(utils.queryByTestId('memory-review-card')).toBeNull();
  });

  test('prepare_lafina_action shows a pending draft that is not on screen', async () => {
    const {userId, utils, message, calls} = await startCall('pending-hidden');

    // A draft prepared elsewhere on the voice surface: pending, never shown here.
    const prepared = prepareReviewedCommand(
      userId,
      validateIntent(
        parseIntentFastPath('Add task: Print handouts tomorrow at 9am'),
      ),
      {surface: 'voice'},
    );
    expect(prepared.status).toBe('proposal');
    expect(utils.queryByTestId('voice-conversation-review-card')).toBeNull();

    message({
      type: 'client_tool_call',
      client_tool_call: {
        tool_name: 'prepare_lafina_action',
        tool_call_id: 'prep-hidden',
        parameters: {},
      },
    });

    const card = await utils.findByTestId('voice-conversation-review-card');
    expect(card).toHaveTextContent(/Print handouts/i);
    await waitFor(() =>
      expect(
        calls.sent.some(
          s => s.includes('prep-hidden') && /card is now on screen/i.test(s),
        ),
      ).toBe(true),
    );
  });

  test('when LAFINA says a card is on screen and none is, the screen says so', async () => {
    const {userId, utils, message, calls} = await startCall('false-claim');

    message(said('hmm okay'));
    message(
      agentSaid(
        'I have put a confirmation card on your screen. Tap Confirm to save it.',
      ),
    );

    await waitFor(() =>
      expect(
        utils.getByTestId('voice-conversation-local-note'),
      ).toHaveTextContent(/no card/i),
    );
    expect(utils.queryByTestId('voice-conversation-review-card')).toBeNull();
    expect(latestPendingReview(userId, 'voice')).toBeNull();
    expect(tasksStore.getAllTasks(userId)).toHaveLength(0);
    // The agent is told the truth so it can correct itself.
    await waitFor(() =>
      expect(
        calls.sent.some(
          s => s.includes('contextual_update') && /no review card/i.test(s),
        ),
      ).toBe(true),
    );
  });

  test('a card claim with a card on screen leaves the card alone', async () => {
    const {utils, message} = await startCall('true-claim');

    message(said('Add task: Submit slides tomorrow at 3pm'));
    message({
      type: 'client_tool_call',
      client_tool_call: {
        tool_name: 'prepare_lafina_action',
        tool_call_id: `online-${++eventId}`,
        parameters: {
          request: 'Add task: Submit slides tomorrow at 3pm',
          action: 'create_task',
          title: 'Submit slides',
          date: '2030-06-12',
          time: '15:00',
        },
      },
    });
    await utils.findByTestId('voice-conversation-review-card');
    message(agentSaid('I put a card on your screen. Check it and confirm.'));

    await waitFor(() =>
      expect(utils.getByTestId('voice-conversation-review-card')).toBeTruthy(),
    );
    expect(utils.queryByText(/no card/i)).toBeNull();
  });

  test('a new card asks the app to bring a minimized call forward', async () => {
    const onAttention = jest.fn();
    const {utils, message} = await startCall('attention', onAttention);
    expect(onAttention).not.toHaveBeenCalled();

    message(said('Add task: Submit slides tomorrow at 3pm'));
    message({
      type: 'client_tool_call',
      client_tool_call: {
        tool_name: 'prepare_lafina_action',
        tool_call_id: `online-${++eventId}`,
        parameters: {
          request: 'Add task: Submit slides tomorrow at 3pm',
          action: 'create_task',
          title: 'Submit slides',
          date: '2030-06-12',
          time: '15:00',
        },
      },
    });
    await utils.findByTestId('voice-conversation-review-card');
    await waitFor(() => expect(onAttention).toHaveBeenCalled());
  });

  test('cards sit in a scrolling area so tall cards are never clipped', async () => {
    const {utils, message} = await startCall('scroll');

    message(said('Add task: Submit slides tomorrow at 3pm'));
    message({
      type: 'client_tool_call',
      client_tool_call: {
        tool_name: 'prepare_lafina_action',
        tool_call_id: `online-${++eventId}`,
        parameters: {
          request: 'Add task: Submit slides tomorrow at 3pm',
          action: 'create_task',
          title: 'Submit slides',
          date: '2030-06-12',
          time: '15:00',
        },
      },
    });
    await utils.findByTestId('voice-conversation-review-card');
    // The stage stays a fixed View; only the overlay content scrolls.
    expect(utils.getByTestId('call-content-stage').type).toBe('View');
    expect(utils.getByTestId('call-overlay-scroll')).toBeTruthy();
  });
});
