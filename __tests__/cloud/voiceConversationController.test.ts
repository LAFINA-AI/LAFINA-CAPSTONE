import {
  VoiceConversationController,
  reminderCallContext,
} from '../../src/cloud/voiceConversation/controller';
import type {VoiceConversationDeps} from '../../src/cloud/voiceConversation/controller';
import type {
  ApiOutcome,
  ConversationClock,
  TransportEvent,
  VoiceSessionGrant,
} from '../../src/cloud/voiceConversation/types';
import {parseNativeEvent} from '../../src/cloud/voiceConversation/nativeTransport';
import {
  registerVoiceConversation,
  startVoiceConversation,
  getActiveVoiceConversation,
  endActiveVoiceConversation,
  waitForVoiceConversationRelease,
} from '../../src/cloud/voiceConversation';

const SESSION_ID = '11111111-2222-3333-4444-555555555555';

const grant = (over: Partial<VoiceSessionGrant> = {}): VoiceSessionGrant => ({
  sessionId: SESSION_ID,
  signedUrl:
    'wss://api.elevenlabs.io/v1/convai/conversation?agent_id=a&conversation_signature=s',
  grant: 'grant-token',
  voiceId: 'voice_1',
  expiresAt: '2026-11-08T00:05:00Z',
  maxDurationSeconds: 300,
  maxTurns: 30,
  ...over,
});

/** Manual clock: timers only run when the test advances time. */
const fakeClock = () => {
  let now = 1_000;
  let seq = 0;
  const timers = new Map<number, {at: number; fn: () => void}>();
  const clock: ConversationClock & {
    advance(ms: number): void;
    pending(): number;
  } = {
    now: () => now,
    setTimeout: (fn, ms) => {
      const id = ++seq;
      timers.set(id, {at: now + ms, fn});
      return id;
    },
    clearTimeout: handle => {
      timers.delete(handle as number);
    },
    advance(ms) {
      const target = now + ms;
      for (;;) {
        const next = [...timers.entries()]
          .filter(([, t]) => t.at <= target)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        timers.delete(next[0]);
        now = next[1].at;
        next[1].fn();
      }
      now = target;
    },
    pending: () => timers.size,
  };
  return clock;
};

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {promise, resolve, reject};
};

const flush = async () => {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
};

const setup = (
  over: {
    gates?: Partial<VoiceConversationDeps['gates']>;
    voice?: () => {id: string; name: string} | null;
    createSession?: VoiceConversationDeps['api']['createSession'];
    capabilities?: VoiceConversationDeps['api']['capabilities'];
    transportStart?: VoiceConversationDeps['transport']['start'];
    available?: boolean;
  } = {},
) => {
  const clock = fakeClock();
  const listeners = new Map<string, (event: TransportEvent) => void>();
  const calls = {
    capabilities: 0,
    createSession: [] as Array<{voiceId: string | null; useHandbook: boolean}>,
    connected: [] as string[],
    end: [] as Array<{sessionId: string; conversationId: string | null}>,
    status: 0,
    transportStart: [] as Array<{
      url: string;
      initiation: string;
      sessionKey: string;
    }>,
    transportEnd: [] as string[],
    muted: [] as boolean[],
    stopResponse: 0,
    sent: [] as string[],
    userTurns: [] as string[],
    assistantTurns: [] as Array<{text: string; heard: string}>,
    finalUserText: [] as string[],
    logs: [] as string[],
  };
  const deps: VoiceConversationDeps = {
    gates: {
      isGuest: () => false,
      isSignedInOwner: () => true,
      isOnlineMode: () => true,
      isOnline: async () => true,
      hasConsent: () => true,
      ensureMicPermission: async () => true,
      ...over.gates,
    },
    getVoice: over.voice ?? (() => ({id: 'voice_1', name: 'Bella'})),
    useHandbook: () => true,
    clock,
    api: {
      capabilities:
        over.capabilities ??
        (async () => {
          calls.capabilities += 1;
          return {
            ok: true,
            data: {enabled: true, maxDurationSeconds: 300, maxTurns: 30},
          };
        }),
      createSession:
        over.createSession ??
        (async body => {
          calls.createSession.push({
            voiceId: body.voiceId,
            useHandbook: body.useHandbook,
          });
          return {
            ok: true,
            data: grant({voiceId: body.voiceId ?? 'default_voice'}),
          };
        }),
      connected: async (_id, conversationId) => {
        calls.connected.push(conversationId);
        return null;
      },
      end: async (sessionId, conversationId) => {
        calls.end.push({sessionId, conversationId});
        return null;
      },
      status: async () => {
        calls.status += 1;
        return {
          ok: true,
          data: {
            status: 'active',
            lastErrorCode: 'provider_billing',
            lastErrorMessage: 'Answers are paused right now.',
          },
        };
      },
    },
    transport: {
      available: () => over.available ?? true,
      start:
        over.transportStart ??
        (async options => {
          calls.transportStart.push(options);
        }),
      setMuted: async (_key, muted) => {
        calls.muted.push(muted);
        return true;
      },
      stopResponse: async () => {
        calls.stopResponse += 1;
        return true;
      },
      sendMessage: async (_key, json) => {
        calls.sent.push(json);
        return true;
      },
      end: async key => {
        calls.transportEnd.push(key);
        return true;
      },
      subscribe: (key, listener) => {
        listeners.set(key, listener);
        return () => listeners.delete(key);
      },
    },
    persistence: {
      userTurn: text => calls.userTurns.push(text),
      assistantTurn: (text, heard) => calls.assistantTurns.push({text, heard}),
    },
    onFinalUserText: text => calls.finalUserText.push(text),
    log: line => calls.logs.push(line),
    newRequestId: () => 'req-1',
  };
  const controller = new VoiceConversationController(deps);
  const emit = (event: TransportEvent) => {
    for (const listener of [...listeners.values()]) listener(event);
  };
  const message = (payload: object) =>
    emit({kind: 'message', data: JSON.stringify(payload)});
  return {controller, calls, clock, emit, message, listeners, deps};
};

it.each(['interruption', 'new_turn', 'stop'])(
  'invalidates an in-flight tool on %s without ending the call',
  async action => {
    const {controller, deps, message, calls} = setup();
    const result = deferred<string>();
    let current: (() => boolean) | undefined;
    deps.onClientTool = async (_name, _args, isCurrent) => {
      current = isCurrent;
      return result.promise;
    };
    await controller.start();
    message({
      type: 'user_transcript',
      user_transcription_event: {
        user_transcript: 'Add capstone meeting',
        event_id: 901,
      },
    });
    message({
      type: 'client_tool_call',
      client_tool_call: {
        tool_name: 'prepare_lafina_action',
        tool_call_id: 'pending-tool',
        parameters: {},
      },
    });
    expect(current?.()).toBe(true);
    if (action === 'interruption') message({type: 'interruption'});
    else if (action === 'stop') controller.stopResponse();
    else
      message({
        type: 'user_transcript',
        user_transcription_event: {
          user_transcript: 'cancel that',
          event_id: 902,
        },
      });
    expect(current?.()).toBe(false);
    result.resolve('stale success');
    await flush();
    const sent = calls.sent
      .map(frame => JSON.parse(frame))
      .find(frame => frame.tool_call_id === 'pending-tool');
    expect(sent).toMatchObject({is_error: true});
    expect(sent.result).not.toContain('stale success');
    expect(controller.isActive()).toBe(true);
    controller.dispose();
  },
);

const userFinal = (text: string, eventId = 1) => ({
  type: 'user_transcript',
  user_transcription_event: {user_transcript: text, event_id: eventId},
});
const agentFinal = (text: string, eventId = 2) => ({
  type: 'agent_response',
  agent_response_event: {agent_response: text, event_id: eventId},
});

it('returns the actual app tool result once to the active conversation', async () => {
  const {controller, deps, calls, message} = setup();
  deps.onClientTool = jest.fn(
    async () => 'Review card shown. Nothing has been saved.',
  );
  await controller.start();
  const call = {
    type: 'client_tool_call',
    client_tool_call: {
      tool_name: 'prepare_lafina_action',
      tool_call_id: 'call-1',
      parameters: {request: 'schedule a meeting'},
    },
  };
  message(call);
  message(call);
  await flush();
  expect(deps.onClientTool).toHaveBeenCalledTimes(1);
  expect(calls.sent.map(v => JSON.parse(v))).toContainEqual({
    type: 'client_tool_result',
    tool_call_id: 'call-1',
    result: 'Review card shown. Nothing has been saved.',
    is_error: false,
  });
  controller.end();
});

it('does not send a delayed tool result after the conversation ends', async () => {
  const {controller, deps, calls, message} = setup();
  const response = deferred<string>();
  deps.onClientTool = () => response.promise;
  await controller.start();
  message({
    type: 'client_tool_call',
    client_tool_call: {
      tool_name: 'read_lafina_data',
      tool_call_id: 'call-2',
      parameters: {kind: 'notes'},
    },
  });
  controller.end();
  response.resolve('private content');
  await flush();
  expect(calls.sent.some(v => v.includes('private content'))).toBe(false);
});

it('waits for native microphone release before another call action', async () => {
  const {controller, deps} = setup();
  const release = deferred<boolean>();
  deps.transport.end = jest.fn(() => release.promise);
  await controller.start();
  let finished = false;
  const ending = controller.endAndWait().then(() => {
    finished = true;
  });
  await flush();
  expect(finished).toBe(false);
  release.resolve(true);
  await ending;
  expect(finished).toBe(true);
});

it('keeps the microphone muted if the student mutes during app speech', async () => {
  const {controller, calls} = setup();
  await controller.start();
  expect(await controller.setSpeechPaused(true)).toBe(true);
  await controller.setMuted(true);
  expect(await controller.setSpeechPaused(false)).toBe(true);
  expect(calls.muted).toEqual([true, true]);
  expect(controller.getSnapshot().muted).toBe(true);
  controller.end();
});

it('waits for an in-flight microphone pause before allowing another speech request', async () => {
  const {controller, deps} = setup();
  const pause = deferred<boolean>();
  deps.transport.setMuted = jest.fn(() => pause.promise);
  await controller.start();
  const first = controller.setSpeechPaused(true);
  const second = controller.setSpeechPaused(true);
  let ready = false;
  void second.then(() => {
    ready = true;
  });
  await flush();
  expect(ready).toBe(false);
  expect(deps.transport.setMuted).toHaveBeenCalledTimes(1);
  pause.resolve(true);
  expect(await first).toBe(true);
  expect(await second).toBe(true);
  controller.end();
});

it('keeps the release promise after the prior voice panel unregisters', async () => {
  const {controller, deps} = setup();
  const release = deferred<boolean>();
  deps.transport.end = jest.fn(() => release.promise);
  const unregister = registerVoiceConversation(controller);
  await controller.start();
  endActiveVoiceConversation('A reminder call started.');
  unregister();
  let finished = false;
  const waiting = waitForVoiceConversationRelease().then(() => {
    finished = true;
  });
  await flush();
  expect(finished).toBe(false);
  release.resolve(true);
  await waiting;
  expect(finished).toBe(true);
});

it('describes the answered reminder as start-of-call context that is not re-announced', () => {
  const text = reminderCallContext('  Review   math at 10 ');
  expect(text).toContain('"Review math at 10"');
  expect(text).toMatch(/do not announce or repeat it/);
  expect(reminderCallContext('   ')).toBe('');
  expect(reminderCallContext('x'.repeat(500))).toContain(
    `"${'x'.repeat(300)}"`,
  );
});

it('tells the agent the online reminder call has no buttons and how to snooze', () => {
  const text = reminderCallContext('Review math', 15);
  expect(text).toMatch(/no Acknowledge or Snooze buttons/);
  expect(text).toMatch(/never tell the student to tap/i);
  expect(text).toMatch(/Hanging up counts the reminder as received/);
  expect(text).toContain('15 minutes (their usual snooze)');
  // An unusable default is left out rather than passed to the agent.
  expect(reminderCallContext('Review math', 0)).not.toMatch(/usual snooze/);
  expect(reminderCallContext('Review math')).not.toMatch(/usual snooze/);
});

it('sends no mid-call message for the reminder: nothing a user turn or contextual update', async () => {
  const {controller, calls} = setup();
  await controller.start();
  expect(calls.sent).toEqual([]);
  expect(calls.userTurns).toEqual([]);
  await controller.endAndWait();
});

describe('voice conversation controller: gates', () => {
  it.each([
    ['guest', {isGuest: () => true}, 'signin_required'],
    ['signed out', {isSignedInOwner: () => false}, 'signin_required'],
    ['Online Mode off', {isOnlineMode: () => false}, 'online_mode_required'],
    ['no consent', {hasConsent: () => false}, 'consent_required'],
    ['offline', {isOnline: async () => false}, 'offline'],
    [
      'microphone denied',
      {ensureMicPermission: async () => false},
      'mic_denied',
    ],
  ])(
    '%s: nothing is sent and the microphone never opens',
    async (_name, gates, kind) => {
      const {controller, calls} = setup({gates});
      await controller.start();
      expect(controller.getSnapshot().phase).toBe('failed');
      expect(controller.getSnapshot().failure?.kind).toBe(kind);
      expect(calls.capabilities).toBe(0);
      expect(calls.createSession).toHaveLength(0);
      expect(calls.transportStart).toHaveLength(0);
    },
  );

  it('is not offered without the native module', async () => {
    const {controller, calls} = setup({available: false});
    await controller.start();
    expect(controller.getSnapshot().failure?.kind).toBe('not_configured');
    expect(calls.capabilities).toBe(0);
  });

  it('explains a server that is not set up', async () => {
    const {controller, calls} = setup({
      capabilities: async () => ({
        ok: true,
        data: {
          enabled: false,
          maxDurationSeconds: 300,
          maxTurns: 30,
          detail: 'Not set up yet.',
        },
      }),
    });
    await controller.start();
    expect(controller.getSnapshot().failure).toEqual({
      kind: 'not_configured',
      message: 'Not set up yet.',
    });
    expect(calls.createSession).toHaveLength(0);
  });

  it.each([
    [
      {
        ok: false,
        status: 'rate_limited',
        httpStatus: 429,
        message: 'Daily limit reached.',
      },
      'limit_reached',
    ],
    [
      {
        ok: false,
        status: 'validation_error',
        httpStatus: 422,
        message: 'Voice gone.',
      },
      'voice_unavailable',
    ],
    [
      {ok: false, status: 'auth_required', httpStatus: 401, message: 'x'},
      'signin_required',
    ],
    [
      {
        ok: false,
        status: 'server_unavailable',
        httpStatus: 503,
        message: 'Not set up.',
      },
      'not_configured',
    ],
    [
      {ok: false, status: 'server_error', httpStatus: 500, message: 'Broken.'},
      'provider',
    ],
  ] as Array<[ApiOutcome<VoiceSessionGrant>, string]>)(
    'maps a refused session to %s',
    async (outcome, kind) => {
      const {controller, calls} = setup({createSession: async () => outcome});
      await controller.start();
      expect(controller.getSnapshot().failure?.kind).toBe(kind);
      expect(calls.transportStart).toHaveLength(0);
    },
  );

  it('an unreadable saved voice is explained, never replaced', async () => {
    const {controller, calls} = setup({
      voice: () => {
        throw new Error('corrupt');
      },
    });
    await controller.start();
    expect(controller.getSnapshot().failure?.kind).toBe('voice_unavailable');
    expect(calls.createSession).toHaveLength(0);
  });
});

describe('voice conversation controller: lifecycle', () => {
  it('starts once, sends the saved voice and the grant only in the initiation', async () => {
    const {controller, calls} = setup();
    await Promise.all([controller.start(), controller.start()]);
    expect(calls.createSession).toEqual([
      {voiceId: 'voice_1', useHandbook: true},
    ]);
    expect(calls.transportStart).toHaveLength(1);
    const initiation = JSON.parse(calls.transportStart[0].initiation);
    expect(initiation).toEqual({
      type: 'conversation_initiation_client_data',
      conversation_config_override: {tts: {voice_id: 'voice_1'}},
      dynamic_variables: {lafina_voice_grant: 'grant-token'},
      custom_llm_extra_body: {lafina_voice_grant: 'grant-token'},
    });
    const snapshot = controller.getSnapshot();
    expect(snapshot.phase).toBe('listening');
    expect(snapshot.voiceName).toBe('Bella');
    expect(JSON.stringify(snapshot)).not.toContain('grant-token');
    expect(calls.logs.join('\n')).not.toMatch(
      /grant-token|conversation_signature/,
    );
  });

  it('no saved voice uses the server default and says so', async () => {
    const {controller, calls} = setup({voice: () => null});
    await controller.start();
    expect(calls.createSession[0].voiceId).toBeNull();
    expect(controller.getSnapshot().voiceName).toBe('Default voice');
  });

  it('ending while the session is being created closes it and never opens the microphone', async () => {
    const pending = deferred<ApiOutcome<VoiceSessionGrant>>();
    const {controller, calls} = setup({createSession: () => pending.promise});
    const started = controller.start();
    await flush();
    controller.end();
    pending.resolve({ok: true, data: grant()});
    await started;
    await flush();
    expect(calls.transportStart).toHaveLength(0);
    expect(calls.end).toEqual([{sessionId: SESSION_ID, conversationId: null}]);
    expect(controller.getSnapshot().phase).toBe('ended');
  });

  it('a late socket open after End is torn down and stays ended', async () => {
    const open = deferred<void>();
    const {controller, calls} = setup({
      transportStart: async options => {
        calls.transportStart.push(options);
        return open.promise;
      },
    });
    const started = controller.start();
    await flush();
    controller.end();
    open.resolve();
    await started;
    expect(controller.getSnapshot().phase).toBe('ended');
    expect(calls.transportEnd).toHaveLength(1);
  });

  it('a busy microphone is reported without retrying', async () => {
    const {controller, calls} = setup({
      transportStart: async () => {
        throw Object.assign(new Error('busy'), {code: 'MIC_IN_USE'});
      },
    });
    await controller.start();
    expect(controller.getSnapshot().failure?.kind).toBe('mic_busy');
    expect(calls.createSession).toHaveLength(1);
    expect(calls.end).toHaveLength(1);
  });

  it('a connect that never opens times out once', async () => {
    const {controller, calls, clock} = setup({
      transportStart: () => new Promise(() => undefined),
    });
    const started = controller.start();
    await flush();
    clock.advance(20_000);
    await started;
    expect(controller.getSnapshot().failure?.kind).toBe('connect_failed');
    expect(calls.createSession).toHaveLength(1);
  });

  it('system stops need an explicit restart', async () => {
    const {controller, emit, calls} = setup();
    await controller.start();
    emit({kind: 'backgrounded'});
    expect(controller.getSnapshot().phase).toBe('restart_required');
    expect(controller.getSnapshot().restartReason).toMatch(/left the screen/);
    expect(calls.transportEnd).toHaveLength(1);
    expect(calls.createSession).toHaveLength(1);
    // Stale events from the old session are ignored.
    emit({kind: 'playback', speaking: true});
    expect(controller.getSnapshot().phase).toBe('restart_required');
    await controller.start();
    expect(calls.createSession).toHaveLength(2);
    expect(controller.getSnapshot().phase).toBe('listening');
  });

  it.each([
    [{kind: 'audio_focus_lost'} as TransportEvent, /took the audio/],
    [
      {kind: 'closed', code: 1000, reason: ''} as TransportEvent,
      /connection closed/,
    ],
  ])('%o ends the session for restart', async (event, reason) => {
    const {controller, emit} = setup();
    await controller.start();
    emit(event);
    expect(controller.getSnapshot().phase).toBe('restart_required');
    expect(controller.getSnapshot().restartReason).toMatch(reason);
  });

  it('stops at the session limit and after long silence', async () => {
    const limited = setup();
    await limited.controller.start();
    limited.clock.advance(300_000);
    expect(limited.controller.getSnapshot().phase).toBe('restart_required');

    const quiet = setup();
    await quiet.controller.start();
    quiet.clock.advance(120_000);
    expect(quiet.controller.getSnapshot().restartReason).toMatch(
      /without speech/,
    );
  });

  /** The student keeps talking (a new words turn each minute). */
  const talkUntil = (t: ReturnType<typeof setup>, totalMs: number): void => {
    let elapsed = 0;
    let turn = 0;
    while (elapsed + 60_000 <= totalMs) {
      t.clock.advance(60_000);
      elapsed += 60_000;
      t.message(userFinal(`Question ${++turn}`, 300 + turn));
      t.controller.completeLocalTurn();
    }
    t.clock.advance(totalMs - elapsed);
  };

  it('ends just before the server limit and says why', async () => {
    const t = setup();
    await t.controller.start();
    talkUntil(t, 294_000);
    expect(t.controller.getSnapshot().phase).toBe('listening');
    t.clock.advance(1_000);
    expect(t.controller.getSnapshot().phase).toBe('restart_required');
    expect(t.controller.getSnapshot().restartReason).toMatch(/5-minute limit/);
  });

  it('a server close at the time limit is reported as the limit', async () => {
    const t = setup();
    const {controller, emit} = t;
    await controller.start();
    talkUntil(t, 290_000);
    emit({kind: 'closed', code: 1000, reason: ''});
    expect(controller.getSnapshot().restartReason).toMatch(/5-minute limit/);
    expect(controller.getSnapshot().restartReason).not.toMatch(
      /connection closed/,
    );
  });

  it('a close long before the limit is still a closed connection', async () => {
    const {controller, clock, emit} = setup();
    await controller.start();
    clock.advance(60_000);
    emit({kind: 'closed', code: 1002, reason: 'custom_llm generation failed'});
    expect(controller.getSnapshot().restartReason).toMatch(/connection closed/);
  });

  it("LAFINA's own check-ins do not keep a silent call open", async () => {
    const {controller, clock, emit, message} = setup();
    await controller.start();
    for (let i = 0; i < 3; i += 1) {
      clock.advance(35_000);
      // "I'm still here whenever you're ready." with no student turn.
      message({
        type: 'agent_response',
        agent_response_event: {
          agent_response: "I'm still here whenever you're ready.",
          event_id: 50 + i,
        },
      });
      emit({kind: 'playback', speaking: true});
      clock.advance(2_000);
      emit({kind: 'playback', speaking: false});
      clock.advance(1_500);
    }
    expect(controller.getSnapshot().phase).toBe('listening');
    clock.advance(120_000 - 3 * 38_500);
    expect(controller.getSnapshot().restartReason).toMatch(/without speech/);
  });

  it('the quiet time restarts after the answer the student asked for', async () => {
    const {controller, clock, emit, message} = setup();
    await controller.start();
    clock.advance(10_000);
    message(userFinal('What is due tomorrow?'));
    message({
      type: 'agent_response',
      agent_response_event: {agent_response: 'Your essay.', event_id: 7},
    });
    emit({kind: 'playback', speaking: true});
    clock.advance(20_000);
    emit({kind: 'playback', speaking: false});
    clock.advance(119_000);
    expect(controller.getSnapshot().phase).toBe('listening');
    clock.advance(3_000);
    expect(controller.getSnapshot().restartReason).toMatch(/without speech/);
  });

  it('the quiet-time limit never cuts LAFINA off mid-answer', async () => {
    const {controller, clock, emit} = setup();
    await controller.start();
    clock.advance(110_000);
    emit({kind: 'playback', speaking: true});
    clock.advance(15_000);
    expect(controller.getSnapshot().phase).toBe('speaking');
    emit({kind: 'playback', speaking: false});
    clock.advance(120_000);
    expect(controller.getSnapshot().restartReason).toMatch(/without speech/);
  });

  it('end is idempotent and releases everything once', async () => {
    const {controller, calls, clock} = setup();
    await controller.start();
    controller.end();
    controller.end();
    expect(calls.transportEnd).toHaveLength(1);
    expect(calls.end).toHaveLength(1);
    expect(clock.pending()).toBe(0);
  });

  it('dispose stops a running conversation and emits nothing after', async () => {
    const {controller, calls} = setup();
    await controller.start();
    const seen: string[] = [];
    controller.subscribe(s => seen.push(s.phase));
    controller.dispose();
    expect(calls.transportEnd).toHaveLength(1);
    expect(seen).toEqual([]);
  });
});

describe('voice conversation controller: turns', () => {
  it('shows provisional words, then one final turn saved once', async () => {
    const {controller, message, calls} = setup();
    await controller.start();
    message({
      type: 'tentative_user_transcript',
      tentative_user_transcription_event: {user_transcript: 'what is'},
    });
    expect(controller.getSnapshot().turns).toEqual([
      expect.objectContaining({
        role: 'user',
        text: 'what is',
        status: 'provisional',
      }),
    ]);
    message(userFinal('What is the grading system?'));
    message(userFinal('What is the grading system?')); // duplicate final
    const turns = controller.getSnapshot().turns;
    expect(turns).toHaveLength(1);
    expect(turns[0]).toEqual(
      expect.objectContaining({
        text: 'What is the grading system?',
        status: 'final',
      }),
    );
    expect(calls.userTurns).toEqual(['What is the grading system?']);
    expect(calls.finalUserText).toEqual(['What is the grading system?']);
    expect(controller.getSnapshot().phase).toBe('thinking');
  });

  it('noise and empty finals are dropped and answer nothing', async () => {
    const {controller, message, calls} = setup();
    await controller.start();
    message({
      type: 'tentative_user_transcript',
      tentative_user_transcription_event: {user_transcript: '...'},
    });
    message(userFinal('...'));
    message(userFinal('  ', 3));
    expect(controller.getSnapshot().turns).toHaveLength(0);
    expect(calls.userTurns).toHaveLength(0);
    expect(controller.getSnapshot().phase).toBe('listening');
  });

  it('a completed answer is saved once as complete after playback ends', async () => {
    const {controller, message, emit, calls, clock} = setup();
    await controller.start();
    message(userFinal('Hello'));
    message({
      type: 'agent_chat_response_part',
      text_response_part: {type: 'delta', text: 'Hi '},
    });
    message({
      type: 'agent_chat_response_part',
      text_response_part: {type: 'delta', text: 'there.'},
    });
    expect(controller.getSnapshot().turns[1]).toEqual(
      expect.objectContaining({text: 'Hi there.', status: 'provisional'}),
    );
    emit({kind: 'playback', speaking: true});
    expect(controller.getSnapshot().phase).toBe('speaking');
    message(agentFinal('Hi there.'));
    message(agentFinal('Hi there.'));
    message({type: 'agent_response_complete'});
    emit({kind: 'playback', speaking: false});
    expect(controller.getSnapshot().phase).toBe('listening');
    // A brief underrun: audio resumes, so nothing is saved yet.
    clock.advance(500);
    emit({kind: 'playback', speaking: true});
    clock.advance(2000);
    expect(calls.assistantTurns).toEqual([]);
    emit({kind: 'playback', speaking: false});
    clock.advance(1200);
    expect(calls.assistantTurns).toEqual([
      {text: 'Hi there.', heard: 'complete'},
    ]);
    expect(controller.getSnapshot().lastTiming?.toFirstText).toBeDefined();
    expect(controller.getSnapshot().lastTiming?.toFirstAudio).toBeDefined();
  });

  it('without a completion event, a heard answer is still complete at the next turn', async () => {
    const {controller, message, emit, calls} = setup();
    await controller.start();
    message(userFinal('Hi'));
    message(agentFinal('Hello!'));
    emit({kind: 'playback', speaking: true});
    emit({kind: 'playback', speaking: false});
    message(userFinal('What time is it?', 5));
    expect(calls.assistantTurns).toEqual([{text: 'Hello!', heard: 'complete'}]);
  });

  it('a new final while the answer is still playing counts as an interruption', async () => {
    const {controller, message, emit, calls} = setup();
    await controller.start();
    message(userFinal('Hi'));
    message(agentFinal('Hello, here is a long story'));
    emit({kind: 'playback', speaking: true});
    message(userFinal('Stop, different question', 6));
    expect(calls.assistantTurns).toEqual([
      {text: 'Hello, here is a long story', heard: 'interrupted'},
    ]);
  });

  it('an interruption flushes, marks and saves the trimmed answer once', async () => {
    const {controller, message, emit, calls, clock} = setup();
    await controller.start();
    message(userFinal('Tell me about enrollment'));
    message(agentFinal('Enrollment opens in June and closes in July.'));
    emit({kind: 'playback', speaking: true});
    message({type: 'interruption', interruption_event: {event_id: 3}});
    expect(controller.getSnapshot().phase).toBe('listening');
    message({
      type: 'agent_response_correction',
      agent_response_correction_event: {
        original_agent_response: 'Enrollment opens in June and closes in July.',
        corrected_agent_response: 'Enrollment opens in June',
      },
    });
    clock.advance(2000);
    emit({kind: 'playback', speaking: false});
    expect(calls.assistantTurns).toEqual([
      {text: 'Enrollment opens in June', heard: 'interrupted'},
    ]);
    expect(controller.getSnapshot().turns[1].status).toBe('interrupted');
    expect(controller.getSnapshot().lastTiming?.toSilence).toBeDefined();
  });

  it('an interruption without a correction is still saved once', async () => {
    const {controller, message, emit, calls, clock} = setup();
    await controller.start();
    message(userFinal('Hi'));
    message(agentFinal('Hello, how can I help today?'));
    emit({kind: 'playback', speaking: true});
    message({type: 'interruption'});
    clock.advance(800);
    message(userFinal('Actually, never mind', 9));
    expect(calls.assistantTurns).toEqual([
      {text: 'Hello, how can I help today?', heard: 'interrupted'},
    ]);
  });

  it('an interruption after playback already stopped is not timed against the next answer', async () => {
    const {controller, message, emit, clock} = setup();
    await controller.start();
    message(userFinal('Hi'));
    message(agentFinal('Hello there, a long answer'));
    emit({kind: 'playback', speaking: true});
    emit({kind: 'playback', speaking: false});
    message({type: 'interruption'});
    message(userFinal('Next question', 7));
    emit({kind: 'playback', speaking: true});
    clock.advance(9000);
    emit({kind: 'playback', speaking: false});
    expect(controller.getSnapshot().lastTiming?.toSilence).toBeUndefined();
  });

  it('Stop silences the answer and keeps listening', async () => {
    const {controller, message, emit, calls} = setup();
    await controller.start();
    message(userFinal('Hi'));
    message(agentFinal('A long answer'));
    emit({kind: 'playback', speaking: true});
    controller.stopResponse();
    expect(calls.stopResponse).toBe(1);
    expect(controller.getSnapshot().phase).toBe('listening');
    controller.end();
    expect(calls.assistantTurns).toEqual([
      {text: 'A long answer', heard: 'interrupted'},
    ]);
  });

  it('ending mid-answer saves it as interrupted', async () => {
    const {controller, message, emit, calls} = setup();
    await controller.start();
    message(userFinal('Hi'));
    message(agentFinal('Half an answer'));
    emit({kind: 'playback', speaking: true});
    controller.end();
    expect(calls.assistantTurns).toEqual([
      {text: 'Half an answer', heard: 'interrupted'},
    ]);
  });

  it('a slow turn asks the server once why and says so', async () => {
    const {controller, message, clock, calls} = setup();
    await controller.start();
    message(userFinal('Hi'));
    clock.advance(25_000);
    await flush();
    expect(calls.status).toBe(1);
    expect(controller.getSnapshot().notice).toBe(
      'Answers are paused right now.',
    );
    expect(controller.getSnapshot().phase).toBe('listening');
  });

  it('mute goes through the native recorder', async () => {
    const {controller, calls} = setup();
    await controller.start();
    await controller.setMuted(true);
    await controller.setMuted(true);
    expect(calls.muted).toEqual([true]);
    expect(controller.getSnapshot().muted).toBe(true);
    await controller.setMuted(false);
    expect(controller.getSnapshot().muted).toBe(false);
  });

  it('typed turns are sent as user messages and not doubled by their echo', async () => {
    const {controller, message, calls} = setup();
    await controller.start();
    expect(await controller.sendText('  When is the midterm?  ')).toBe(true);
    expect(JSON.parse(calls.sent[0])).toEqual({
      type: 'user_message',
      text: 'When is the midterm?',
    });
    message(userFinal('When is the midterm?', 4));
    expect(calls.userTurns).toEqual(['When is the midterm?']);
    expect(controller.getSnapshot().turns).toHaveLength(1);
  });

  it('binds the provider conversation id once', async () => {
    const {controller, message, calls} = setup();
    await controller.start();
    const meta = {
      type: 'conversation_initiation_metadata',
      conversation_initiation_metadata_event: {conversation_id: 'conv_1'},
    };
    message(meta);
    message(meta);
    message({
      type: 'conversation_initiation_metadata',
      conversation_initiation_metadata_event: {conversation_id: 'bad id!'},
    });
    expect(calls.connected).toEqual(['conv_1']);
    controller.end();
    expect(calls.end).toEqual([
      {sessionId: SESSION_ID, conversationId: 'conv_1'},
    ]);
  });

  it('a malformed frame is ignored', async () => {
    const {controller, emit} = setup();
    await controller.start();
    emit({kind: 'message', data: '{not json'});
    expect(controller.getSnapshot().phase).toBe('listening');
  });
});

describe('native event parsing', () => {
  it('accepts known events and drops anything else', () => {
    expect(parseNativeEvent({kind: 'playback', speaking: true})).toEqual({
      kind: 'playback',
      speaking: true,
    });
    expect(parseNativeEvent({kind: 'level', level: 4})).toEqual({
      kind: 'level',
      level: 1,
    });
    expect(parseNativeEvent({kind: 'message', data: 7})).toBeNull();
    expect(parseNativeEvent({kind: 'mystery'})).toBeNull();
    expect(parseNativeEvent({kind: 'error', code: 'MIC_FAILED'})).toEqual({
      kind: 'error',
      code: 'MIC_FAILED',
      message: '',
    });
  });
});

describe('Call Lafina remediation lifecycle', () => {
  it('sends saved language/style preferences to the active provider as context', async () => {
    const {controller, calls} = setup();
    controller.setPreferences({
      language: 'ceb',
      verbosity: 'detailed',
      pacing: 'slow',
    });
    await controller.start();
    expect(
      calls.sent.some(
        s => s.includes('Cebuano') && s.includes('contextual_update'),
      ),
    ).toBe(true);
    controller.setPreferences({language: 'fil'});
    expect(calls.sent.some(s => s.includes('Filipino'))).toBe(true);
    await controller.endAndWait();
  });
  it('wait directive stops playback and suppresses late assistant audio until the next user turn', async () => {
    const {controller, calls, message, emit} = setup();
    await controller.start();
    message(userFinal('wait, I am thinking'));
    await flush();
    expect(calls.stopResponse).toBeGreaterThan(0);
    emit({kind: 'playback', speaking: true});
    expect(controller.getSnapshot().phase).toBe('listening');
    expect(controller.getSnapshot().outputLevel).toBe(0);
    message(userFinal('I am ready now', 3));
    message(agentFinal('Ready to help', 4));
    emit({kind: 'playback', speaking: true});
    expect(controller.getSnapshot().phase).toBe('speaking');
    await controller.endAndWait();
  });
  it('tool current guard rejects revoked consent and a late tool result after End is never sent', async () => {
    let consent = true;
    let current: (() => boolean) | undefined;
    const wait = deferred<string>();
    const {controller, deps, message, calls} = setup({
      gates: {hasConsent: () => consent},
    });
    deps.onClientTool = async (_name, _params, isCurrent) => {
      current = isCurrent;
      return wait.promise;
    };
    await controller.start();
    message({
      type: 'client_tool_call',
      client_tool_call: {
        tool_name: 'search_notes',
        tool_call_id: 'late',
        parameters: {query: 'Synthetic'},
      },
    });
    expect(current?.()).toBe(true);
    consent = false;
    expect(current?.()).toBe(false);
    await controller.endAndWait();
    wait.resolve('Late local record');
    await flush();
    expect(calls.sent.some(s => s.includes('Late local record'))).toBe(false);
  });
});

it('returns an explicit partial result instead of cutting a large JSON tool result in half', async () => {
  const {controller, deps, message, calls} = setup();
  deps.onClientTool = async () =>
    JSON.stringify({notes: [{body: 'x'.repeat(6000)}]});
  await controller.start();
  message({
    type: 'client_tool_call',
    client_tool_call: {
      tool_name: 'search_notes',
      tool_call_id: 'large-result',
      parameters: {query: 'Synthetic'},
    },
  });
  await flush();
  const packet = calls.sent
    .map(s => JSON.parse(s))
    .find(e => e.type === 'client_tool_result');
  expect(JSON.parse(packet.result)).toMatchObject({
    partial: true,
    message: expect.stringContaining('narrow the query'),
  });
  expect(packet.is_error).toBe(false);
  await controller.endAndWait();
});

describe('provider error humanization and close status checks', () => {
  it('humanizes raw custom_llm generation failed errors instead of surfacing technical strings', async () => {
    const {controller, message, emit} = setup();
    await controller.start();

    message({
      type: 'client_error',
      client_error: {message: 'custom_llm generation failed'},
    });
    expect(controller.getSnapshot().notice).toMatch(
      /temporary connection issue/i,
    );
    expect(controller.getSnapshot().notice).not.toContain('custom_llm');

    emit({kind: 'closed', code: 1006, reason: 'custom_llm generation failed'});
    expect(controller.getSnapshot().phase).toBe('restart_required');
    expect(controller.getSnapshot().notice).not.toContain('custom_llm');
  });

  it('queries server failure status after remote close with post-stop generation', async () => {
    const {controller, emit, calls} = setup();
    await controller.start();

    emit({kind: 'closed', code: 1006, reason: ''});
    await flush();

    expect(calls.status).toBe(1);
    expect(controller.getSnapshot().notice).toBe(
      'Answers are paused right now.',
    );
  });
});

it('reacquires a retained live controller after the reminder panel unmounts', async () => {
  const live = setup();
  const reminder = setup();
  const releaseLive = registerVoiceConversation(live.controller);
  await startVoiceConversation(live.controller);
  expect(getActiveVoiceConversation()).toBe(live.controller);
  const releaseReminder = registerVoiceConversation(reminder.controller);
  expect(getActiveVoiceConversation()).toBe(live.controller);
  await startVoiceConversation(reminder.controller);
  expect(live.controller.isActive()).toBe(false);
  reminder.controller.end();
  releaseReminder();
  await startVoiceConversation(live.controller);
  expect(getActiveVoiceConversation()).toBe(live.controller);
  endActiveVoiceConversation('Reminder incoming');
  expect(live.controller.isActive()).toBe(false);
  await waitForVoiceConversationRelease();
  releaseLive();
});

it('keeps the native audio-focus failure when startup rejects with ENDED afterwards', async () => {
  const pending = deferred<void>();
  const app = setup({transportStart: () => pending.promise});
  const start = app.controller.start();
  await flush();
  app.emit({
    kind: 'error',
    code: 'AUDIO_FOCUS_DENIED',
    message: 'Another call is using audio.',
  });
  pending.reject(Object.assign(new Error('ended'), {code: 'ENDED'}));
  await start;
  expect(app.controller.getSnapshot().failure?.kind).toBe('audio');
  expect(app.controller.getSnapshot().failure?.message).toMatch(/using audio/);
});

it('never opens transport after a permission grant arrives while backgrounded', async () => {
  const permission = deferred<boolean>();
  const app = setup({
    gates: {
      ensureMicPermission: () => permission.promise,
      isForeground: () => false,
    },
  });
  const start = app.controller.start();
  await flush();
  expect(app.controller.isRequestingPermission()).toBe(true);
  permission.resolve(true);
  await start;
  expect(app.calls.transportStart).toHaveLength(0);
  expect(app.controller.getSnapshot().phase).toBe('restart_required');
});

it('starts a new conversation even when the previous controller already released natively', async () => {
  const first = setup();
  first.deps.transport.end = async () => false;
  const second = setup();
  const unregFirst = registerVoiceConversation(first.controller);
  const unregSecond = registerVoiceConversation(second.controller);
  await startVoiceConversation(first.controller);
  first.emit({kind: 'closed', code: 1006, reason: 'network'});
  await flush();
  await startVoiceConversation(second.controller);
  expect(second.controller.getSnapshot().phase).toBe('listening');
  expect(getActiveVoiceConversation()).toBe(second.controller);
  second.controller.end();
  unregSecond();
  unregFirst();
});

it('caps oversized studentContext at 12000 characters in the initiation payload', async () => {
  const app = setup();
  app.deps.getStudentContext = () => 'x'.repeat(20_000);
  await app.controller.start();
  const initiation = JSON.parse(app.calls.transportStart[0].initiation);
  expect(initiation.custom_llm_extra_body.student_context).toHaveLength(12_000);
  expect(initiation.dynamic_variables.student_context).toHaveLength(12_000);
  app.controller.end();
});

it('times out a stalled pre-socket API call instead of hanging in connecting', async () => {
  const app = setup({
    capabilities: () => new Promise(() => undefined),
  });
  const started = app.controller.start();
  await flush();
  app.clock.advance(20_000);
  await started;
  expect(app.controller.getSnapshot().phase).toBe('failed');
  expect(app.controller.getSnapshot().failure?.kind).toBe('connect_failed');
});

describe('prepare: capabilities asked for when the call screen opens', () => {
  const counted = (
    answers: Array<ApiOutcome<{
      enabled: boolean;
      maxDurationSeconds: number;
      maxTurns: number;
    }> | null>,
  ) => {
    const counter = {calls: 0};
    const capabilities: VoiceConversationDeps['api']['capabilities'] =
      async () => {
        const answer = answers[Math.min(counter.calls, answers.length - 1)];
        counter.calls += 1;
        // null stands for a request that never answers.
        return answer ?? new Promise(() => undefined);
      };
    return {counter, capabilities};
  };
  const ENABLED = {
    ok: true as const,
    data: {enabled: true, maxDurationSeconds: 300, maxTurns: 30},
  };

  it('asks once, and the next start reuses the answer', async () => {
    const {controller, calls} = setup();
    controller.prepare();
    controller.prepare();
    await flush();
    expect(calls.capabilities).toBe(1);
    await controller.start();
    expect(calls.capabilities).toBe(1);
    expect(calls.createSession).toHaveLength(1);
    expect(controller.getSnapshot().phase).toBe('listening');
    expect(
      calls.logs.some(line =>
        /connected in \d+ms \(server \d+ms, audio \d+ms, capabilities prepared\)/.test(
          line,
        ),
      ),
    ).toBe(true);
    controller.end();
  });

  it('asks again once the prepared answer is a minute old', async () => {
    const {controller, calls, clock} = setup();
    controller.prepare();
    await flush();
    clock.advance(60_001);
    await controller.start();
    expect(calls.capabilities).toBe(2);
    expect(calls.logs.some(line => /capabilities fetched/.test(line))).toBe(
      true,
    );
    controller.end();
  });

  it.each<[string, Partial<VoiceConversationDeps['gates']>]>([
    ['no consent', {hasConsent: () => false}],
    ['guest', {isGuest: () => true}],
    ['signed out', {isSignedInOwner: () => false}],
    ['Offline Mode', {isOnlineMode: () => false}],
  ])('%s: nothing is sent', async (_name, gates) => {
    const {controller, calls} = setup({gates});
    controller.prepare();
    await flush();
    expect(calls.capabilities).toBe(0);
  });

  it('is not offered without the native module', async () => {
    const {controller, calls} = setup({available: false});
    controller.prepare();
    await flush();
    expect(calls.capabilities).toBe(0);
  });

  it('a failed or disabled answer is never reused', async () => {
    const {counter, capabilities} = counted([
      {ok: false, status: 'server_unavailable', message: 'down'},
      ENABLED,
    ]);
    const {controller} = setup({capabilities});
    controller.prepare();
    await flush();
    await controller.start();
    expect(counter.calls).toBe(2);
    expect(controller.getSnapshot().phase).toBe('listening');
    controller.end();
  });

  it('a stalled prepare is waited for only briefly', async () => {
    const {counter, capabilities} = counted([null, ENABLED]);
    const {controller, clock} = setup({capabilities});
    controller.prepare();
    await flush();
    clock.advance(5_001);
    await controller.start();
    expect(counter.calls).toBe(2);
    expect(controller.getSnapshot().phase).toBe('listening');
    controller.end();
  });

  it('an answer still on its way is shared with an early tap', async () => {
    let answer!: (value: typeof ENABLED) => void;
    let count = 0;
    const {controller} = setup({
      capabilities: () => {
        count += 1;
        return new Promise(resolve => {
          answer = resolve;
        });
      },
    });
    controller.prepare();
    await flush();
    const started = controller.start();
    await flush();
    answer(ENABLED);
    await started;
    expect(count).toBe(1);
    expect(controller.getSnapshot().phase).toBe('listening');
    controller.end();
  });
});

describe('endAfterReply (CALLFIX-03)', () => {
  it('ends the call once the next spoken answer has finished playing', async () => {
    const {controller, clock, emit, message, calls} = setup();
    await controller.start();
    message(userFinal('bye', 901));
    controller.endAfterReply(10_000);
    message(agentFinal('Bye for now!', 902));
    emit({kind: 'playback', speaking: true});
    clock.advance(1_000);
    expect(controller.getSnapshot().phase).toBe('speaking');
    emit({kind: 'playback', speaking: false});
    expect(controller.getSnapshot().phase).toBe('listening');
    clock.advance(500);
    expect(controller.getSnapshot().phase).toBe('ended');
    expect(calls.transportEnd).toHaveLength(1);
  });

  it('ends after the cap when no answer is heard', async () => {
    const {controller, clock} = setup();
    await controller.start();
    controller.endAfterReply(10_000);
    clock.advance(9_000);
    expect(controller.getSnapshot().phase).not.toBe('ended');
    clock.advance(1_500);
    expect(controller.getSnapshot().phase).toBe('ended');
  });

  it('a new student turn or cancel keeps the call open', async () => {
    const {controller, clock, emit, message} = setup();
    await controller.start();
    controller.endAfterReply(10_000);
    message(userFinal('wait, one more thing', 911));
    emit({kind: 'playback', speaking: true});
    emit({kind: 'playback', speaking: false});
    clock.advance(11_000);
    expect(controller.getSnapshot().phase).not.toBe('ended');

    controller.endAfterReply(10_000);
    controller.cancelEndAfterReply();
    clock.advance(11_000);
    expect(controller.getSnapshot().phase).not.toBe('ended');
  });
});

describe('quiet opening (reminder call: the app already read the reminder)', () => {
  it('asks the transport to drop the opening audio and hides the fixed greeting', async () => {
    const {controller, deps, calls, message} = setup();
    deps.quietOpening = true;
    await controller.start();
    expect(calls.transportStart[0]).toMatchObject({suppressOpeningAudio: true});
    message(agentFinal("Hi, I'm listening. What's on your mind?", 50));
    expect(
      controller.getSnapshot().turns.filter(t => t.role === 'assistant'),
    ).toEqual([]);
    expect(calls.assistantTurns).toEqual([]);
    controller.dispose();
  });

  it("answers normally from the student's first spoken words", async () => {
    const {controller, deps, message} = setup();
    deps.quietOpening = true;
    await controller.start();
    message(agentFinal("Hi, I'm listening. What's on your mind?", 50));
    message(userFinal('Call me back in ten minutes', 51));
    message(agentFinal('Okay, I will call you back in ten minutes.', 52));
    const answers = controller
      .getSnapshot()
      .turns.filter(t => t.role === 'assistant')
      .map(t => t.text);
    expect(answers).toEqual(['Okay, I will call you back in ten minutes.']);
    controller.dispose();
  });

  it('answers normally after a typed first turn', async () => {
    const {controller, deps, message} = setup();
    deps.quietOpening = true;
    await controller.start();
    await controller.sendText('What else is due today?');
    message(agentFinal('Your lab report is due at 5 PM.', 60));
    expect(
      controller
        .getSnapshot()
        .turns.some(
          t =>
            t.role === 'assistant' &&
            t.text === 'Your lab report is due at 5 PM.',
        ),
    ).toBe(true);
    controller.dispose();
  });

  it('a normal Call LAFINA still shows its greeting', async () => {
    const {controller, calls, message} = setup();
    await controller.start();
    expect(calls.transportStart[0]).not.toHaveProperty('suppressOpeningAudio');
    message(agentFinal("Hi, I'm listening. What's on your mind?", 70));
    expect(
      controller.getSnapshot().turns.some(t => t.role === 'assistant'),
    ).toBe(true);
    controller.dispose();
  });
});

describe('opening line', () => {
  const allowOpening =
    (): VoiceConversationDeps['api']['capabilities'] => async () => ({
      ok: true,
      data: {
        enabled: true,
        maxDurationSeconds: 300,
        maxTurns: 30,
        openingLine: true,
      },
    });

  it("keeps the agent's own line when the server does not allow another", async () => {
    const app = setup();
    app.deps.getOpeningLine = () => 'Hey Ana! What is up?';
    await app.controller.start();
    const initiation = JSON.parse(app.calls.transportStart[0].initiation);
    expect(initiation.conversation_config_override).toEqual({
      tts: {voice_id: 'voice_1'},
    });
    app.controller.end();
  });

  it("sends LAFINA's chosen line when the agent accepts it", async () => {
    const app = setup({capabilities: allowOpening()});
    app.deps.getOpeningLine = () => 'Hey Ana! What is up?';
    await app.controller.start();
    const initiation = JSON.parse(app.calls.transportStart[0].initiation);
    expect(initiation.conversation_config_override).toEqual({
      tts: {voice_id: 'voice_1'},
      agent: {first_message: 'Hey Ana! What is up?'},
    });
    app.controller.end();
  });

  it('a reminder call asks the agent for no opening at all', async () => {
    const app = setup({capabilities: allowOpening()});
    app.deps.quietOpening = true;
    app.deps.getOpeningLine = () => 'Hey Ana! What is up?';
    await app.controller.start();
    const initiation = JSON.parse(app.calls.transportStart[0].initiation);
    expect(initiation.conversation_config_override.agent).toEqual({
      first_message: '',
    });
    app.controller.end();
  });

  it("drops the agent's variable braces, and falls back on a broken picker", async () => {
    const braces = setup({capabilities: allowOpening()});
    braces.deps.getOpeningLine = () => 'Hi {{system__time}} Ana!';
    await braces.controller.start();
    expect(
      JSON.parse(braces.calls.transportStart[0].initiation)
        .conversation_config_override.agent,
    ).toEqual({first_message: 'Hi system__time Ana!'});
    braces.controller.end();

    const broken = setup({capabilities: allowOpening()});
    broken.deps.getOpeningLine = () => {
      throw new Error('settings unreadable');
    };
    await broken.controller.start();
    expect(
      JSON.parse(broken.calls.transportStart[0].initiation)
        .conversation_config_override.agent,
    ).toBeUndefined();
    expect(broken.controller.getSnapshot().phase).toBe('listening');
    broken.controller.end();
  });
});

test.each(['owner', 'mode', 'consent'] as const)(
  'revoking %s during session creation never opens native audio',
  async revoked => {
    let owner = true,
      mode = true,
      consent = true;
    const pending = deferred<ApiOutcome<VoiceSessionGrant>>();
    const {controller, calls} = setup({
      gates: {
        isSignedInOwner: () => owner,
        isOnlineMode: () => mode,
        hasConsent: () => consent,
      },
      createSession: () => pending.promise,
    });
    const start = controller.start();
    await flush();
    if (revoked === 'owner') owner = false;
    if (revoked === 'mode') mode = false;
    if (revoked === 'consent') consent = false;
    pending.resolve({ok: true, data: grant()});
    await start;
    expect(calls.transportStart).toHaveLength(0);
    expect(controller.getSnapshot().failure?.kind).toBe(
      revoked === 'owner'
        ? 'signin_required'
        : revoked === 'mode'
        ? 'online_mode_required'
        : 'consent_required',
    );
    expect(calls.end).toHaveLength(1);
    controller.dispose();
  },
);

test('turning Online Mode off during connectivity checking does not request microphone access or server capability', async () => {
  let onlineMode = true;
  const network = deferred<boolean>();
  const permission = jest.fn(async () => true);
  const {controller, calls} = setup({
    gates: {
      isOnlineMode: () => onlineMode,
      isOnline: () => network.promise,
      ensureMicPermission: permission,
    },
  });
  const start = controller.start();
  onlineMode = false;
  network.resolve(true);
  await start;
  expect(permission).not.toHaveBeenCalled();
  expect(calls.capabilities).toBe(0);
  controller.dispose();
});
