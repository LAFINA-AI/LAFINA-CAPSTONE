/**
 * Regression suite for the 2026-11-26 draft card ID & revision bug:
 * - "Add jogging time 7pm to 8pm" -> card shown -> "change it to 7:30pm to 8pm
 *   instead" -> "save it" must never lose the active Card ID across turns,
 *   never reject a paraphrased revise_draft racing local revision, never mint a
 *   duplicate card ID silently, and never tell the student "I can't see the
 *   card ID" after saving.
 * - Also tests bare-meridiem revisions, end-time-only revisions, title-named
 *   revisions, alarm/update draft revisions, cancel races, multi/memory card
 *   ID sync, and Chat/Reminder-call parity.
 */
import React from 'react';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import {NativeModules, PermissionsAndroid} from 'react-native';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {VoiceConversationPanel} from '../../src/ui/components/voice/VoiceConversationPanel';
import {
  alarmsStore,
  db,
  initDatabase,
  localSettingsStore,
  tasksStore,
  timeBlocksStore,
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
  confirmReviewedCommand,
  endReviewSession,
  latestPendingReview,
  prepareReviewedCommand,
  reviseReviewedCommand,
} from '../../src/ai/nlu/commandReview';
import {prepareStructuredReview} from '../../src/ai/voiceActions/structuredAction';
import {chatOrchestrator} from '../../src/ai/chatOrchestrator';
import {describeCallCard} from '../../src/ui/screens/IncomingCallScreen';
import {ttsService} from '../../src/ai/tts/ttsService';
import {useCommandReview} from '../../src/ui/hooks/useCommandReview';

const SESSION_ID = '22222222-3333-4444-5555-666666666666';
let serial = 0;
let activeUser: string | null = null;
let eventId = 9000;

const student = (label: string): string => {
  serial += 1;
  const id = `draftsync-${label}-${serial}`;
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
  return {transport, calls, message};
};

const PanelHost: React.FC<{userId: string; transport: VoiceTransport}> = ({
  userId,
  transport,
}) => {
  const review = useCommandReview(userId, 'voice');
  return (
    <VoiceConversationPanel
      userId={userId}
      review={review}
      onBack={() => undefined}
      deps={id => ({
        ...defaultVoiceConversationDeps(id),
        transport,
        log: () => undefined,
      })}
    />
  );
};

const startCall = async (label: string) => {
  const userId = student(label);
  signIn(userId);
  fakeServer();
  const fake = fakeTransport();
  const utils = render(
    <ThemeProvider userId={userId}>
      <PanelHost userId={userId} transport={fake.transport} />
    </ThemeProvider>,
  );
  fireEvent.press(utils.getByTestId('voice-conversation-start'));
  await waitFor(() => expect(fake.calls.start).toBe(1));
  return {userId, utils, ...fake};
};

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

const JOGGING = {
  request: 'add a schedule called jogging time at 7pm to 8pm',
  action: 'create_event',
  title: 'Jogging Time',
  date: '2030-06-15',
  time: '19:00',
  endTime: '20:00',
};

const prepareJogging = async (
  call: Awaited<ReturnType<typeof startCall>>,
): Promise<string> => {
  call.message(said(JOGGING.request));
  const toolId = `prep-${++eventId}`;
  call.message(tool('prepare_lafina_action', toolId, JOGGING));
  const card = await call.utils.findByTestId('voice-conversation-review-card');
  expect(card).toHaveTextContent(/7:00 PM/);
  await waitFor(() =>
    expect(toolResult(call.calls.sent, toolId)).not.toBeNull(),
  );
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

describe('2026-11-26 Jogging Time bug: Card ID survives every turn and tool race', () => {
  test('structured grouped reminders accept nullable optional fields and save both by voice without replay', async () => {
    const call = await startCall('two-reminders-null-fields');
    const request =
      'remind me to go walking tomorrow at 7am and then on monday 8am to go jogging';
    call.message(said(request));
    call.message(
      tool('prepare_multi_action', 'two-reminders-structured', {
        text: request,
        items: [
          {
            kind: 'reminder',
            title: 'Go walking',
            date: '2030-06-15',
            time: '07:00',
            endTime: null,
            priority: null,
            body: null,
          },
          {
            kind: 'reminder',
            title: 'Go jogging',
            date: '2030-06-17',
            time: '08:00',
            endTime: null,
            body: null,
          },
        ],
      }),
    );
    await waitFor(() =>
      expect(toolResult(call.calls.sent, 'two-reminders-structured')).toMatch(
        /grouped review card with 2 items/i,
      ),
    );
    expect(
      db.executeSync('SELECT id FROM reminders WHERE user_id = ?', [
        call.userId,
      ]).rows,
    ).toHaveLength(0);
    call.message(said('save both'));
    await waitFor(() =>
      expect(
        db.executeSync('SELECT id FROM reminders WHERE user_id = ?', [
          call.userId,
        ]).rows,
      ).toHaveLength(2),
    );
    await waitFor(() =>
      expect(
        contexts(call.calls.sent).some(c => /All 2 items saved/.test(c)),
      ).toBe(true),
    );
    call.message(said('save both'));
    await waitFor(() =>
      expect(
        contexts(call.calls.sent).some(c => /already saved/i.test(c)),
      ).toBe(true),
    );
    const rows = db.executeSync(
      'SELECT task, trigger_at FROM reminders WHERE user_id = ? ORDER BY task',
      [call.userId],
    ).rows;
    expect(rows.map(r => r.task)).toEqual(['Go jogging', 'Go walking']);
    expect(rows.map(r => new Date(r.trigger_at as string).getHours())).toEqual([
      8, 7,
    ]);
  });

  test('reported walking/jogging request routes an older single tool to a two-reminder card and saves only after confirmation', async () => {
    const call = await startCall('two-reminders-shared-verb');
    const request =
      'remind me to go walking tomorrow at 7am and then on monday 8am to go jogging';
    call.message(said(request));
    call.message(
      tool('prepare_lafina_action', 'shared-verb-prepare', {
        request,
        action: 'create_reminder',
        title: 'Go walking',
        time: '07:00',
      }),
    );
    await waitFor(() =>
      expect(toolResult(call.calls.sent, 'shared-verb-prepare')).toMatch(
        /grouped review card with 2 items/i,
      ),
    );
    expect(call.utils.getByTestId('multi-item-title-input-0').props.value).toBe(
      'Go walking',
    );
    expect(call.utils.getByTestId('multi-item-title-input-1').props.value).toBe(
      'Go jogging',
    );
    expect(
      db.executeSync('SELECT id FROM reminders WHERE user_id = ?', [
        call.userId,
      ]).rows,
    ).toHaveLength(0);
    fireEvent.press(call.utils.getByTestId('multi-action-confirm-all'));
    await waitFor(() =>
      expect(
        db.executeSync('SELECT task FROM reminders WHERE user_id = ?', [
          call.userId,
        ]).rows,
      ).toHaveLength(2),
    );
    expect(
      db
        .executeSync(
          'SELECT task FROM reminders WHERE user_id = ? ORDER BY task',
          [call.userId],
        )
        .rows.map(r => r.task),
    ).toEqual(['Go jogging', 'Go walking']);
  });

  test('prepare_lafina_action immediately sends a contextual_update with the Card ID for subsequent turns', async () => {
    const call = await startCall('ctx-on-prepare');
    const cardId = await prepareJogging(call);

    await waitFor(() =>
      expect(
        contexts(call.calls.sent).some(c =>
          c.includes(`Card ID: ${cardId}; revision: 1`),
        ),
      ).toBe(true),
    );
  });

  test('full reported flow: prepare 7-8pm -> revise to 7:30-8pm (paraphrased tool race) -> save it', async () => {
    const call = await startCall('full-jogging');
    const firstId = await prepareJogging(call);

    // Turn 2: student revises time; device updates locally AND model calls
    // revise_draft with the Turn 1 cardId and a paraphrased instruction.
    call.message(said('change it to 7:30pm to 8pm instead'));
    await waitFor(() =>
      expect(
        call.utils.getByTestId('voice-conversation-review-card'),
      ).toHaveTextContent(/7:30 PM/),
    );
    const secondId = latestPendingReview(call.userId, 'voice')?.operationId;
    expect(secondId).toBeTruthy();
    expect(secondId).not.toBe(firstId);

    call.message(
      tool('revise_draft', 'rev-paraphrase', {
        cardId: firstId,
        revision: 1,
        instruction: 'Change time to 7:30 PM - 8:00 PM',
      }),
    );
    await waitFor(() =>
      expect(toolResult(call.calls.sent, 'rev-paraphrase')).not.toBeNull(),
    );
    const revReply = toolResult(call.calls.sent, 'rev-paraphrase') ?? '';
    expect(revReply).not.toMatch(/replaced|nothing was changed/i);
    expect(revReply).toContain(`Card ID: ${secondId}; revision: 1`);
    // Card ID must remain stable (no third card minted)
    expect(latestPendingReview(call.userId, 'voice')?.operationId).toBe(
      secondId,
    );
    // And contextual_update carries the new Card ID for Turn 3!
    expect(
      contexts(call.calls.sent).some(c =>
        c.includes(`Card ID: ${secondId}; revision: 1`),
      ),
    ).toBe(true);

    // Turn 3: student says "save it"; model calls confirm_draft with secondId.
    call.message(
      agentSaid(
        'I updated Jogging Time to 7:30 PM to 8:00 PM. Should I save it?',
      ),
    );
    call.message(said('save it'));
    call.message(
      tool('confirm_draft', 'confirm-jog', {cardId: secondId, revision: 1}),
    );
    await waitFor(() =>
      expect(toolResult(call.calls.sent, 'confirm-jog')).not.toBeNull(),
    );
    expect(toolResult(call.calls.sent, 'confirm-jog')).toMatch(
      /Saved after the student confirmed|Already saved/,
    );
    await waitFor(() =>
      expect(tasksStore.getAllEvents(call.userId)).toHaveLength(1),
    );
    expect(tasksStore.getAllEvents(call.userId)[0]).toMatchObject({
      title: 'Jogging Time',
      startTime: '19:30',
      endTime: '20:00',
    });
  });

  test('if model calls prepare_lafina_action with same revised time after local revision, reuses open card ID instead of minting a duplicate', async () => {
    const call = await startCall('prepare-dedupe');
    await prepareJogging(call);

    call.message(said('change it to 7:30pm to 8pm instead'));
    await waitFor(() =>
      expect(
        call.utils.getByTestId('voice-conversation-review-card'),
      ).toHaveTextContent(/7:30 PM/),
    );
    const revisedId = latestPendingReview(call.userId, 'voice')?.operationId;
    expect(revisedId).toBeTruthy();

    call.message(
      tool('prepare_lafina_action', 'fresh-dup', {
        ...JOGGING,
        request: 'change jogging time to 7:30pm to 8pm',
        time: '19:30',
        endTime: '20:00',
      }),
    );
    await waitFor(() =>
      expect(toolResult(call.calls.sent, 'fresh-dup')).not.toBeNull(),
    );
    expect(toolResult(call.calls.sent, 'fresh-dup')).toContain(
      `Card ID: ${revisedId}; revision: 1`,
    );
    expect(latestPendingReview(call.userId, 'voice')?.operationId).toBe(
      revisedId,
    );
  });

  test('if model revise_draft adds a new detail (rename) missed by local fast-path, applies it onto the updated card', async () => {
    const call = await startCall('revise-extra-detail');
    const firstId = await prepareJogging(call);

    call.message(said('change it to 7:30pm to 8pm instead'));
    await waitFor(() =>
      expect(
        call.utils.getByTestId('voice-conversation-review-card'),
      ).toHaveTextContent(/7:30 PM/),
    );
    const secondId = latestPendingReview(call.userId, 'voice')?.operationId;

    call.message(
      tool('revise_draft', 'rev-rename', {
        cardId: firstId,
        revision: 2,
        instruction: 'rename it to Evening Run',
      }),
    );
    await waitFor(() =>
      expect(toolResult(call.calls.sent, 'rev-rename')).not.toBeNull(),
    );
    const revReply = toolResult(call.calls.sent, 'rev-rename') ?? '';
    expect(revReply).toContain('Evening Run');
    const thirdId = latestPendingReview(call.userId, 'voice')?.operationId;
    expect(thirdId).toBeTruthy();
    expect(thirdId).not.toBe(secondId);
    expect(revReply).toContain(`Card ID: ${thirdId}; revision: 1`);
    await waitFor(() =>
      expect(
        contexts(call.calls.sent).some(c =>
          c.includes(`Card ID: ${thirdId}; revision: 1`),
        ),
      ).toBe(true),
    );
  });

  test('revise_draft with placeholder cardId or revision > 1 resolves cleanly to the active open card', async () => {
    const call = await startCall('placeholder-revise');
    await prepareJogging(call);

    call.message(
      tool('revise_draft', 'rev-placeholder', {
        cardId: 'current',
        revision: 2,
        instruction: 'change it to 7:30pm to 8pm',
      }),
    );
    await waitFor(() =>
      expect(toolResult(call.calls.sent, 'rev-placeholder')).not.toBeNull(),
    );
    const reply = toolResult(call.calls.sent, 'rev-placeholder') ?? '';
    const updated = latestPendingReview(call.userId, 'voice');
    expect(updated?.draftFields?.time).toBe('19:30');
    expect(updated?.draftFields?.endTime).toBe('20:00');
    expect(reply).toContain(`Card ID: ${updated?.operationId}; revision: 1`);
  });

  test('title-named revision ("make jogging time 7:30pm to 8pm") revises the open card locally', async () => {
    const call = await startCall('title-named');
    await prepareJogging(call);

    call.message(said('make jogging time 7:30pm to 8pm'));
    await waitFor(() =>
      expect(
        call.utils.getByTestId('voice-conversation-review-card'),
      ).toHaveTextContent(/7:30 PM/),
    );
    const updated = latestPendingReview(call.userId, 'voice');
    expect(updated?.draftFields?.time).toBe('19:30');
    expect(updated?.draftFields?.endTime).toBe('20:00');
  });

  test('"change it to 7:30pm to 8pm and save it" + racing revise_draft with old ID reports already saved', async () => {
    const call = await startCall('change-and-save-race');
    const firstId = await prepareJogging(call);

    call.message(said('change it to 7:30pm to 8pm and save it'));
    call.message(
      tool('revise_draft', 'race-rev-after-save', {
        cardId: firstId,
        revision: 1,
        instruction: '7:30pm to 8pm',
      }),
    );
    await waitFor(() =>
      expect(tasksStore.getAllEvents(call.userId)).toHaveLength(1),
    );
    await waitFor(() =>
      expect(toolResult(call.calls.sent, 'race-rev-after-save')).not.toBeNull(),
    );
    expect(toolResult(call.calls.sent, 'race-rev-after-save')).toMatch(
      /already saved/i,
    );
    expect(tasksStore.getAllEvents(call.userId)[0]).toMatchObject({
      startTime: '19:30',
      endTime: '20:00',
    });
  });

  test('voice cancel + racing model cancel_draft reports already canceled instead of unavailable', async () => {
    const call = await startCall('cancel-race');
    const firstId = await prepareJogging(call);

    call.message(said('cancel it'));
    await waitFor(() =>
      expect(
        call.utils.queryByTestId('voice-conversation-review-card'),
      ).toBeNull(),
    );
    call.message(
      tool('cancel_draft', 'late-cancel', {cardId: firstId, revision: 1}),
    );
    await waitFor(() =>
      expect(toolResult(call.calls.sent, 'late-cancel')).not.toBeNull(),
    );
    expect(toolResult(call.calls.sent, 'late-cancel')).toMatch(
      /already canceled/i,
    );
  });

  test('prepare_memory and prepare_multi_action emit contextual_update with Card ID', async () => {
    const call = await startCall('mem-batch-ctx');

    call.message(said('remember that I prefer evening runs'));
    call.message(
      tool('prepare_memory', 'prep-mem', {text: 'Prefers evening runs'}),
    );
    await waitFor(() =>
      expect(toolResult(call.calls.sent, 'prep-mem')).not.toBeNull(),
    );
    await waitFor(() =>
      expect(
        contexts(call.calls.sent).some(
          c =>
            c.includes('Active memory card on screen') &&
            c.includes('Card ID: '),
        ),
      ).toBe(true),
    );

    call.message(
      tool('prepare_multi_action', 'prep-batch', {
        items: [
          {kind: 'task', title: 'Buy running shoes', date: '2030-06-15'},
          {kind: 'task', title: 'Stretch routine', date: '2030-06-15'},
        ],
      }),
    );
    await waitFor(() =>
      expect(toolResult(call.calls.sent, 'prep-batch')).not.toBeNull(),
    );
    await waitFor(() =>
      expect(
        contexts(call.calls.sent).some(
          c =>
            c.includes('Active grouped review card on screen') &&
            c.includes('Card ID: '),
        ),
      ).toBe(true),
    );
  });

  test('intermediate schedule query preserves the open card ID in its contextual_update', async () => {
    const call = await startCall('preserve-open-card');
    const cardId = await prepareJogging(call);

    call.message(said('what is on my schedule tomorrow'));
    await waitFor(() =>
      expect(
        contexts(call.calls.sent).some(
          c =>
            c.includes('Local verified database result') &&
            c.includes(`Card ID: ${cardId}; revision: 1`),
        ),
      ).toBe(true),
    );
  });
});

describe('reviseReviewedCommand edge cases (bare meridiem, end-time-only, alarm, update)', () => {
  test('"change it to 7:30 to 8" on a 7 PM - 8 PM draft preserves PM (19:30 - 20:00)', () => {
    const owner = student('pm-preserve');
    const p = prepareStructuredReview(owner, JOGGING, 'voice');
    if (p?.status !== 'proposal') throw new Error('expected proposal');
    const r = reviseReviewedCommand(
      owner,
      p.proposal.operationId,
      'change it to 7:30 to 8',
    );
    if (r.status !== 'proposal') throw new Error(r.reply);
    expect(r.proposal.draftFields?.time).toBe('19:30');
    expect(r.proposal.draftFields?.endTime).toBe('20:00');
  });

  test('"change it to 7:30 AM" on a 7 PM draft respects explicit AM', () => {
    const owner = student('explicit-am');
    const p = prepareStructuredReview(owner, JOGGING, 'voice');
    if (p?.status !== 'proposal') throw new Error('expected proposal');
    const r = reviseReviewedCommand(
      owner,
      p.proposal.operationId,
      'change it to 7:30 AM',
    );
    if (r.status !== 'proposal') throw new Error(r.reply);
    expect(r.proposal.draftFields?.time).toBe('07:30');
    expect(r.proposal.draftFields?.endTime).toBe('08:30');
  });

  test('"change the end time to 8:30" keeps 7:00 PM start and updates end to 8:30 PM', () => {
    const owner = student('end-time-only');
    const p = prepareStructuredReview(owner, JOGGING, 'voice');
    if (p?.status !== 'proposal') throw new Error('expected proposal');
    const r = reviseReviewedCommand(
      owner,
      p.proposal.operationId,
      'change the end time to 8:30',
    );
    if (r.status !== 'proposal') throw new Error(r.reply);
    expect(r.proposal.draftFields?.time).toBe('19:00');
    expect(r.proposal.draftFields?.endTime).toBe('20:30');
  });

  test('"push it to 8pm" moves start to 8:00 PM and keeps 1-hour duration', () => {
    const owner = student('push-start');
    const p = prepareStructuredReview(owner, JOGGING, 'voice');
    if (p?.status !== 'proposal') throw new Error('expected proposal');
    const r = reviseReviewedCommand(
      owner,
      p.proposal.operationId,
      'push it to 8pm',
    );
    if (r.status !== 'proposal') throw new Error(r.reply);
    expect(r.proposal.draftFields?.time).toBe('20:00');
    expect(r.proposal.draftFields?.endTime).toBe('21:00');
  });

  test('can revise a create_alarm draft time and preserve weekdays repeat', () => {
    const owner = student('alarm-revise');
    const p = prepareStructuredReview(
      owner,
      {
        request: 'set an alarm at 6am on weekdays for gym',
        action: 'create_alarm',
        title: 'Gym',
        time: '06:00',
        repeat: 'weekdays',
      },
      'voice',
    );
    if (p?.status !== 'proposal') throw new Error('expected alarm proposal');
    const r = reviseReviewedCommand(
      owner,
      p.proposal.operationId,
      'change it to 6:30am',
    );
    if (r.status !== 'proposal') throw new Error(r.reply);
    const saved = confirmReviewedCommand(owner, r.proposal.operationId);
    expect(saved.status).toBe('applied');
    const alarms = alarmsStore.list(owner);
    expect(alarms).toHaveLength(1);
    expect(alarms[0]).toMatchObject({hour: 6, minute: 30, repeatDays: 31});
  });

  test('can revise an update_schedule_item draft before saving', () => {
    const owner = student('update-block-revise');
    timeBlocksStore.insert({
      id: 'tb-jog-1',
      userId: owner,
      title: 'Jogging Time',
      date: '2030-06-15',
      startTime: '18:00',
      endTime: '19:00',
      color: '#3498db',
      category: 'Personal',
    });
    const p = prepareReviewedCommand(
      owner,
      {
        intent: 'update_time_block',
        targetEntityType: 'time_block',
        title: 'Jogging Time',
        date: '2030-06-15',
        time: '19:00',
        endTime: '20:00',
        durationMinutes: 60,
        category: 'Personal',
        details: null,
        snoozeMinutes: null,
        confidence: 1,
        source: 'fast_path',
        rawTranscript: 'move jogging time to 7pm to 8pm',
        isValid: true,
      },
      {surface: 'voice'},
    );
    if (p.status !== 'proposal') throw new Error(p.reply);
    const r = reviseReviewedCommand(
      owner,
      p.proposal.operationId,
      'actually make it 7:30 to 8 instead',
    );
    if (r.status !== 'proposal') throw new Error(r.reply);
    expect(r.proposal.draftFields?.time).toBe('19:30');
    expect(r.proposal.draftFields?.endTime).toBe('20:00');
    const saved = confirmReviewedCommand(owner, r.proposal.operationId);
    expect(saved.status).toBe('applied');
    expect(timeBlocksStore.getAll(owner)[0]).toMatchObject({
      title: 'Jogging Time',
      startTime: '19:30',
      endTime: '20:00',
    });
  });

  test('can revise a reminder draft delivery style to notify only', () => {
    const owner = student('delivery-revise');
    const p = prepareStructuredReview(
      owner,
      {
        request: 'remind me to stretch at 7pm',
        action: 'create_reminder',
        title: 'Stretch',
        date: '2030-06-15',
        time: '19:00',
        deliveryStyle: 'call',
      },
      'voice',
    );
    if (p?.status !== 'proposal') throw new Error('expected reminder proposal');
    expect(p.proposal.reminderDelivery).toBe('call');
    const r = reviseReviewedCommand(
      owner,
      p.proposal.operationId,
      'just notify me instead of a call',
    );
    if (r.status !== 'proposal') throw new Error(r.reply);
    expect(r.proposal.reminderDelivery).toBe('notify');
  });

  test('describeCallCard includes Card ID and revision for reminder calls', () => {
    const owner = student('reminder-card-id');
    const p = prepareReviewedCommand(
      owner,
      {
        intent: 'create_time_block',
        targetEntityType: 'event',
        title: 'Jogging Time',
        date: '2030-06-15',
        time: '19:00',
        endTime: '20:00',
        durationMinutes: 60,
        category: 'Personal',
        details: null,
        snoozeMinutes: null,
        confidence: 1,
        source: 'fast_path',
        rawTranscript: 'add jogging time 7pm to 8pm',
        isValid: true,
      },
      {surface: 'voice'},
    );
    if (p.status !== 'proposal') throw new Error('expected proposal');
    expect(describeCallCard(p.proposal)).toContain(
      `Card ID: ${p.proposal.operationId}; revision: 1.`,
    );
  });

  test('Chat handles polite revision ("can you change it to 7:30pm to 8pm instead") and "yes, save it"', async () => {
    const owner = student('chat-revise');
    const first = await chatOrchestrator.processMessage(
      owner,
      'Add a schedule called Jogging Time on June 15 2030 at 7pm to 8pm',
      {onlineMode: false, temporaryChat: true},
    );
    expect(first.review?.status).toBe('proposal');

    const second = await chatOrchestrator.processMessage(
      owner,
      'can you change it to 7:30pm to 8pm instead',
      {onlineMode: false, temporaryChat: true},
    );
    expect(second.review?.status).toBe('proposal');
    if (second.review?.status === 'proposal') {
      expect(second.review.proposal.draftFields?.time).toBe('19:30');
      expect(second.review.proposal.draftFields?.endTime).toBe('20:00');
    }

    const third = await chatOrchestrator.processMessage(owner, 'yes, save it', {
      onlineMode: false,
      temporaryChat: true,
    });
    expect(third.resolvedReview?.status).toBe('applied');
    const savedBlocks = [
      ...tasksStore.getAllEvents(owner),
      ...timeBlocksStore.getAll(owner),
    ];
    expect(savedBlocks).toHaveLength(1);
    expect(savedBlocks[0]).toMatchObject({
      title: 'Jogging Time',
      startTime: '19:30',
      endTime: '20:00',
    });
  });
});
