/**
 * ADR-046: a dropped online call reconnects by itself and keeps its memory.
 */
import {
  RECONNECT_FAILED_REASON,
  RECONNECT_LINE,
  RESUME_LINE,
  VoiceConversationController,
  classifyDrop,
} from '../../src/cloud/voiceConversation/controller';
import type {VoiceConversationDeps} from '../../src/cloud/voiceConversation/controller';
import type {
  ApiOutcome,
  ConversationClock,
  TransportEvent,
  VoiceCapabilities,
  VoiceSessionGrant,
} from '../../src/cloud/voiceConversation/types';

const sessionIdFor = (n: number) =>
  `11111111-2222-3333-4444-${String(n).padStart(12, '0')}`;

const fakeClock = () => {
  let now = 1_000;
  let seq = 0;
  const timers = new Map<number, {at: number; fn: () => void}>();
  const clock: ConversationClock & {advance(ms: number): void} = {
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
  };
  return clock;
};

const flush = async () => {
  for (let i = 0; i < 40; i += 1) await Promise.resolve();
};

interface Options {
  capabilities?: Partial<VoiceCapabilities>;
  softReconnect?: boolean;
  autoReconnect?: boolean;
  createSession?: VoiceConversationDeps['api']['createSession'];
  callState?: () => string | null;
}

const setup = (options: Options = {}) => {
  const clock = fakeClock();
  const listeners = new Map<string, (event: TransportEvent) => void>();
  let online = true;
  let signedIn = true;
  let sessions = 0;
  const calls = {
    createSession: [] as Array<Record<string, unknown>>,
    end: [] as string[],
    transportStart: [] as Array<Record<string, unknown> & {sessionKey: string}>,
    transportReconnect: [] as Array<{sessionKey: string; initiation: string}>,
    transportEnd: [] as string[],
    initiations: [] as string[],
    detach: [] as string[],
    muted: [] as Array<{key: string; muted: boolean}>,
    sent: [] as string[],
    userTurns: [] as string[],
    assistantTurns: [] as Array<{text: string; heard: string}>,
    finalUserText: [] as string[],
    logs: [] as string[],
  };
  const caps: VoiceCapabilities = {
    enabled: true,
    maxDurationSeconds: 300,
    maxTurns: 30,
    openingLine: true,
    ...options.capabilities,
  };
  const grant = (): VoiceSessionGrant => {
    sessions += 1;
    return {
      sessionId: sessionIdFor(sessions),
      signedUrl: `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=a&s=${sessions}`,
      grant: 'grant-token',
      voiceId: 'voice_1',
      expiresAt: '2026-11-26T00:05:00Z',
      maxDurationSeconds: 300,
      maxTurns: 30,
    };
  };
  const deps: VoiceConversationDeps = {
    gates: {
      isGuest: () => false,
      isSignedInOwner: () => signedIn,
      isOnlineMode: () => true,
      isOnline: async () => online,
      hasConsent: () => true,
      ensureMicPermission: async () => true,
    },
    getVoice: () => ({id: 'voice_1', name: 'Bella'}),
    useHandbook: () => false,
    getStudentContext: () => 'Earlier in this chat: Student: hi',
    clock,
    autoReconnect: options.autoReconnect ?? true,
    getCallState: options.callState,
    api: {
      capabilities: async () => ({ok: true, data: caps}),
      createSession:
        options.createSession ??
        (async body => {
          calls.createSession.push(body as Record<string, unknown>);
          return {ok: true, data: grant()} as ApiOutcome<VoiceSessionGrant>;
        }),
      connected: async () => null,
      end: async sessionId => {
        calls.end.push(sessionId);
        return null;
      },
      status: async () => ({
        ok: true,
        data: {status: 'active', lastErrorCode: null, lastErrorMessage: null},
      }),
    },
    transport: {
      available: () => true,
      start: async opts => {
        calls.transportStart.push(opts);
        calls.initiations.push(opts.initiation);
      },
      ...(options.softReconnect
        ? {
            reconnect: async (opts: {
              sessionKey: string;
              initiation: string;
            }) => {
              calls.transportReconnect.push(opts);
              calls.initiations.push(opts.initiation);
            },
            detach: async (key: string) => {
              calls.detach.push(key);
              return true;
            },
          }
        : {}),
      setMuted: async (key, muted) => {
        calls.muted.push({key, muted});
        return true;
      },
      stopResponse: async () => true,
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
  /** Runs due timers and lets the attempt's awaits finish. */
  const tick = async (ms = 0) => {
    clock.advance(ms);
    await flush();
  };
  const lastInitiation = () => JSON.parse(calls.initiations.at(-1) as string);
  return {
    controller,
    calls,
    clock,
    emit,
    message,
    tick,
    listeners,
    deps,
    lastInitiation,
    setOnline: (value: boolean) => {
      online = value;
    },
    signOut: () => {
      signedIn = false;
    },
  };
};

const userFinal = (text: string, eventId: number) => ({
  type: 'user_transcript',
  user_transcription_event: {user_transcript: text, event_id: eventId},
});
const agentFinal = (text: string, eventId: number) => ({
  type: 'agent_response',
  agent_response_event: {agent_response: text, event_id: eventId},
});
const drop = {kind: 'closed', code: 1006, reason: 'network'} as TransportEvent;

describe('classifyDrop', () => {
  it.each([
    [1006, '', 'reconnect'],
    [1006, 'network', 'reconnect'],
    [1001, '', 'reconnect'],
    [1011, 'internal error', 'reconnect'],
    [1002, 'custom_llm generation failed', 'llm'],
    [1000, '', 'stop'],
    [1008, 'quota exceeded', 'stop'],
    [4001, 'unauthorized', 'stop'],
  ] as const)('code %d %j → %s', (code, reason, expected) => {
    expect(classifyDrop(code, reason)).toBe(expected);
  });
});

describe('automatic reconnect', () => {
  it('a network drop reconnects the same call and keeps its transcript and timer', async () => {
    const t = setup();
    await t.controller.start();
    const first = t.controller.getSnapshot();
    t.message(userFinal('What is due tomorrow?', 1));
    t.message(agentFinal('Your capstone draft is due tomorrow.', 2));
    t.emit({kind: 'playback', speaking: true});
    t.emit({kind: 'playback', speaking: false});
    await t.tick(1500); // the answer settles and is saved as heard
    t.clock.advance(20_000);
    t.emit(drop);
    expect(t.controller.getSnapshot().phase).toBe('reconnecting');
    expect(t.controller.isActive()).toBe(true);
    expect(t.controller.getSnapshot().notice).toMatch(/Reconnecting/);
    await t.tick(0);
    const now = t.controller.getSnapshot();
    expect(now.phase).toBe('listening');
    expect(t.calls.createSession).toHaveLength(2);
    expect(now.turns.map(turn => turn.text)).toEqual([
      'What is due tomorrow?',
      'Your capstone draft is due tomorrow.',
    ]);
    expect(now.connectedAt).toBe(first.connectedAt);
    expect(now.endsAt).toBe(first.endsAt);
    expect(now.reconnects).toBe(1);
    expect(now.notice).toBe('Reconnected.');
    // Saved to Chat exactly once each.
    expect(t.calls.userTurns).toEqual(['What is due tomorrow?']);
    expect(t.calls.assistantTurns).toEqual([
      {text: 'Your capstone draft is due tomorrow.', heard: 'complete'},
    ]);
    // The old server session was closed.
    expect(t.calls.end).toContain(sessionIdFor(1));
    // LAFINA says it is back, and is told not to greet again.
    const initiation = t.lastInitiation();
    expect(initiation.conversation_config_override.agent.first_message).toBe(
      RECONNECT_LINE,
    );
    expect(initiation.custom_llm_extra_body.student_context).toMatch(
      /^Call reconnected/,
    );
    expect(initiation.custom_llm_extra_body.student_context).toContain(
      'Earlier in this chat',
    );
    await t.tick(3000);
    expect(t.controller.getSnapshot().notice).toBeNull();
    t.controller.end();
  });

  it('the reconnect line is heard but not saved to Chat', async () => {
    const t = setup();
    await t.controller.start();
    t.clock.advance(20_000);
    t.emit(drop);
    await t.tick(0);
    t.message(agentFinal(RECONNECT_LINE, 1));
    t.emit({kind: 'playback', speaking: true});
    t.emit({kind: 'playback', speaking: false});
    await t.tick(1500);
    expect(t.calls.assistantTurns).toEqual([]);
    t.controller.end();
  });

  it('turn ids stay unique when the new conversation restarts event ids', async () => {
    const t = setup();
    await t.controller.start();
    t.message(userFinal('first question', 1));
    t.clock.advance(20_000);
    t.emit(drop);
    await t.tick(0);
    t.message(userFinal('second question', 1));
    const users = t.controller
      .getSnapshot()
      .turns.filter(turn => turn.role === 'user');
    expect(users.map(turn => turn.text)).toEqual([
      'first question',
      'second question',
    ]);
    expect(new Set(users.map(turn => turn.id)).size).toBe(2);
    t.controller.end();
  });

  it('asks an unanswered turn again once, without saving or reviewing it twice', async () => {
    const t = setup();
    await t.controller.start();
    t.clock.advance(15_000);
    t.message(userFinal('Am I free tonight?', 1));
    expect(t.controller.getSnapshot().phase).toBe('thinking');
    t.emit(drop);
    await t.tick(0);
    const initiation = t.lastInitiation();
    // The replayed answer is the first thing heard: no "I'm back" line.
    expect(initiation.conversation_config_override.agent.first_message).toBe(
      '',
    );
    expect(initiation.custom_llm_extra_body.student_context).toContain(
      'Am I free tonight?',
    );
    const replays = t.calls.sent
      .map(frame => JSON.parse(frame))
      .filter(frame => frame.type === 'user_message');
    expect(replays).toEqual([
      {type: 'user_message', text: 'Am I free tonight?'},
    ]);
    expect(t.controller.getSnapshot().phase).toBe('thinking');
    // The echo of the replay is ignored.
    t.message(userFinal('Am I free tonight?', 1));
    expect(t.calls.userTurns).toEqual(['Am I free tonight?']);
    expect(t.calls.finalUserText).toEqual(['Am I free tonight?']);
    expect(
      t.controller.getSnapshot().turns.filter(turn => turn.role === 'user'),
    ).toHaveLength(1);
    // A second drop before the answer does not ask it a third time.
    t.clock.advance(15_000);
    t.emit(drop);
    await t.tick(0);
    expect(
      t.calls.sent
        .map(frame => JSON.parse(frame))
        .filter(frame => frame.type === 'user_message'),
    ).toHaveLength(1);
    t.controller.end();
  });

  it('a drop mid-answer saves the cut-off part and LAFINA picks it up', async () => {
    const t = setup();
    await t.controller.start();
    t.clock.advance(15_000);
    t.message(userFinal('Explain the grading policy', 1));
    t.message(agentFinal('The grading policy has three parts.', 2));
    t.emit({kind: 'playback', speaking: true});
    t.emit(drop);
    expect(t.calls.assistantTurns).toEqual([
      {text: 'The grading policy has three parts.', heard: 'interrupted'},
    ]);
    await t.tick(0);
    const context = t.lastInitiation().custom_llm_extra_body.student_context;
    expect(context).toContain('had started with');
    expect(context).toContain('three parts');
    expect(
      t.calls.sent.some(frame => JSON.parse(frame).type === 'user_message'),
    ).toBe(true);
    t.controller.end();
  });

  it('never asks a turn again after a tool ran for it', async () => {
    const t = setup({
      callState: () => 'a review card ("Capstone meeting") is waiting',
    });
    t.deps.onClientTool = async () => 'Review card shown.';
    await t.controller.start();
    t.clock.advance(15_000);
    t.message(userFinal('Add a capstone meeting tomorrow at 3', 1));
    t.message({
      type: 'client_tool_call',
      client_tool_call: {
        tool_name: 'prepare_lafina_action',
        tool_call_id: 'tool-1',
        parameters: {},
      },
    });
    await t.tick(0);
    t.emit(drop);
    await t.tick(0);
    expect(
      t.calls.sent.some(frame => JSON.parse(frame).type === 'user_message'),
    ).toBe(false);
    const context = t.lastInitiation().custom_llm_extra_body.student_context;
    expect(context).toContain('already handled');
    expect(context).toContain('On screen now: a review card');
    t.controller.end();
  });

  it('without an opening-line override the agent greeting is hidden and nothing is replayed', async () => {
    const t = setup({capabilities: {openingLine: false}});
    await t.controller.start();
    t.clock.advance(15_000);
    t.message(userFinal('Am I free tonight?', 1));
    t.emit(drop);
    await t.tick(0);
    const initiation = t.lastInitiation();
    expect(initiation.conversation_config_override.agent).toBeUndefined();
    expect(t.calls.transportStart.at(-1)?.suppressOpeningAudio).toBe(true);
    expect(
      t.calls.sent.some(frame => JSON.parse(frame).type === 'user_message'),
    ).toBe(false);
    // The agent's stock greeting is not shown.
    t.message(agentFinal("Hi, I'm LAFINA!", 1));
    expect(
      t.controller.getSnapshot().turns.some(turn => /Hi, I'm/.test(turn.text)),
    ).toBe(false);
    t.controller.end();
  });

  it('keeps the mute choice across a reconnect', async () => {
    const t = setup();
    await t.controller.start();
    await t.controller.setMuted(true);
    t.clock.advance(15_000);
    t.emit(drop);
    await t.tick(0);
    expect(t.calls.transportStart.at(-1)?.startMuted).toBe(true);
    expect(t.controller.getSnapshot().muted).toBe(true);
    t.controller.end();
  });

  it('with native soft reconnect, the same audio session gets a new socket', async () => {
    const t = setup({softReconnect: true});
    await t.controller.start();
    const key = t.calls.transportStart[0].sessionKey;
    t.clock.advance(15_000);
    t.emit({...drop, recoverable: true} as TransportEvent);
    await t.tick(0);
    expect(t.controller.getSnapshot().phase).toBe('listening');
    expect(t.calls.transportStart).toHaveLength(1);
    expect(t.calls.transportReconnect).toHaveLength(1);
    expect(t.calls.transportReconnect[0].sessionKey).toBe(key);
    expect(t.calls.transportEnd).toEqual([]);
    // Events on the reused key reach the call.
    t.message(userFinal('still there?', 7));
    expect(t.controller.getSnapshot().turns.at(-1)?.text).toBe('still there?');
    t.controller.end();
    expect(t.calls.transportEnd).toEqual([key]);
  });

  it('a parked session that native released is replaced by a new one', async () => {
    const t = setup({softReconnect: true});
    await t.controller.start();
    const key = t.calls.transportStart.at(-1)!.sessionKey;
    t.clock.advance(15_000);
    t.setOnline(false);
    t.emit({...drop, recoverable: true} as TransportEvent);
    await t.tick(0);
    t.emit({kind: 'ended', reason: 'reconnect_timeout'});
    t.setOnline(true);
    await t.tick(1000);
    expect(t.calls.transportReconnect).toHaveLength(0);
    expect(t.calls.transportEnd).toContain(key);
    expect(t.calls.transportStart.at(-1)!.sessionKey).not.toBe(key);
    expect(t.controller.getSnapshot().phase).toBe('listening');
    t.controller.end();
  });
});

describe('when not to reconnect', () => {
  it.each([
    [{kind: 'closed', code: 1000, reason: ''}],
    [{kind: 'closed', code: 1008, reason: 'quota'}],
    [{kind: 'backgrounded'}],
    [{kind: 'audio_focus_lost'}],
    [{kind: 'error', code: 'MIC_FAILED', message: 'mic'}],
  ] as Array<[TransportEvent]>)('%o stops the call', async event => {
    const t = setup();
    await t.controller.start();
    t.clock.advance(15_000);
    t.emit(event);
    await t.tick(5000);
    expect(['restart_required', 'failed']).toContain(
      t.controller.getSnapshot().phase,
    );
    expect(t.calls.createSession).toHaveLength(1);
  });

  it('a failed custom-LLM turn reconnects once per call', async () => {
    const t = setup();
    await t.controller.start();
    t.clock.advance(15_000);
    const llm = {
      kind: 'closed',
      code: 1002,
      reason: 'custom_llm generation failed',
    } as TransportEvent;
    t.emit(llm);
    await t.tick(0);
    expect(t.controller.getSnapshot().phase).toBe('listening');
    t.clock.advance(15_000);
    t.emit(llm);
    await t.tick(0);
    expect(t.controller.getSnapshot().phase).toBe('restart_required');
    expect(t.calls.createSession).toHaveLength(2);
  });

  it('a goodbye in progress ends instead of reconnecting', async () => {
    const t = setup();
    await t.controller.start();
    t.clock.advance(15_000);
    t.controller.endAfterReply();
    t.emit(drop);
    await t.tick(0);
    expect(t.controller.getSnapshot().phase).toBe('restart_required');
    expect(t.calls.createSession).toHaveLength(1);
  });

  it('near the time limit, a drop is the limit', async () => {
    const t = setup();
    await t.controller.start();
    t.clock.advance(282_000); // 18 s left
    t.emit(drop);
    await t.tick(0);
    expect(t.calls.createSession).toHaveLength(1);
    expect(t.controller.getSnapshot().phase).toBe('restart_required');
  });

  it('stops when the connection keeps dropping right after connecting', async () => {
    const t = setup();
    await t.controller.start();
    t.emit(drop); // 0 s in: short
    await t.tick(0);
    expect(t.controller.getSnapshot().phase).toBe('listening');
    t.clock.advance(2000);
    t.emit(drop); // short again
    await t.tick(0);
    expect(t.controller.getSnapshot().phase).toBe('restart_required');
    expect(t.calls.createSession).toHaveLength(2);
  });

  it('stops after three drops in two minutes', async () => {
    const t = setup();
    await t.controller.start();
    for (let i = 0; i < 2; i += 1) {
      t.clock.advance(15_000);
      t.emit(drop);
      await t.tick(0);
      expect(t.controller.getSnapshot().phase).toBe('listening');
    }
    t.clock.advance(15_000);
    t.emit(drop);
    await t.tick(0);
    expect(t.controller.getSnapshot().phase).toBe('restart_required');
  });

  it('without autoReconnect a drop stops the call as before', async () => {
    const t = setup({autoReconnect: false});
    await t.controller.start();
    t.clock.advance(15_000);
    t.emit(drop);
    expect(t.controller.getSnapshot().phase).toBe('restart_required');
    expect(t.controller.handlesNetworkLoss()).toBe(false);
  });
});

describe('reconnect attempts', () => {
  it('waits for the internet, then reconnects at once when it returns', async () => {
    const t = setup();
    await t.controller.start();
    t.clock.advance(15_000);
    t.setOnline(false);
    t.emit(drop);
    await t.tick(0);
    await t.tick(1000);
    await t.tick(1000);
    expect(t.calls.createSession).toHaveLength(1);
    expect(t.controller.getSnapshot().phase).toBe('reconnecting');
    t.setOnline(true);
    t.controller.networkChanged(true);
    await t.tick(0);
    expect(t.calls.createSession).toHaveLength(2);
    expect(t.controller.getSnapshot().phase).toBe('listening');
    t.controller.end();
  });

  it('gives up after the reconnect window and offers Continue call', async () => {
    let n = 0;
    const t = setup({
      createSession: async () => {
        n += 1;
        return n === 1
          ? {
              ok: true,
              data: {
                sessionId: sessionIdFor(1),
                signedUrl: 'wss://api.elevenlabs.io/v1/convai/conversation?x=1',
                grant: 'g',
                voiceId: 'voice_1',
                expiresAt: '',
                maxDurationSeconds: 300,
                maxTurns: 30,
              },
            }
          : {ok: false, status: 'server_error', message: 'upstream down'};
      },
    });
    await t.controller.start();
    t.clock.advance(15_000);
    t.emit(drop);
    for (let i = 0; i < 40; i += 1) await t.tick(1000);
    const snapshot = t.controller.getSnapshot();
    expect(snapshot.phase).toBe('restart_required');
    expect(snapshot.restartReason).toBe(RECONNECT_FAILED_REASON);
    expect(snapshot.restartReason).toMatch(/connection dropped/);
    // Bounded: immediate, then 1 s, 2 s, 4 s, 8 s, 8 s … within 30 s.
    expect(n).toBeGreaterThan(2);
    expect(n).toBeLessThan(10);
  });

  it('ending during a reconnect stops everything', async () => {
    const t = setup({softReconnect: true});
    await t.controller.start();
    const key = t.calls.transportStart[0].sessionKey;
    t.clock.advance(15_000);
    t.setOnline(false);
    t.emit({...drop, recoverable: true} as TransportEvent);
    await t.tick(0);
    t.controller.end();
    expect(t.controller.getSnapshot().phase).toBe('ended');
    expect(t.calls.transportEnd).toEqual([key]);
    t.setOnline(true);
    await t.tick(5000);
    expect(t.calls.createSession).toHaveLength(1);
  });

  it('signing out during a reconnect stops it without contacting the server', async () => {
    const t = setup();
    await t.controller.start();
    t.clock.advance(15_000);
    t.setOnline(false);
    t.emit(drop);
    await t.tick(0);
    t.signOut();
    t.setOnline(true);
    await t.tick(1000);
    expect(t.controller.getSnapshot().phase).toBe('failed');
    expect(t.controller.getSnapshot().failure?.kind).toBe('signin_required');
    expect(t.calls.createSession).toHaveLength(1);
  });

  it('muting while reconnecting is kept for the next segment', async () => {
    const t = setup();
    await t.controller.start();
    t.clock.advance(15_000);
    t.setOnline(false);
    t.emit(drop);
    await t.tick(0);
    await t.controller.setMuted(true);
    expect(t.controller.getSnapshot().muted).toBe(true);
    t.setOnline(true);
    await t.tick(1000);
    expect(t.calls.transportStart.at(-1)?.startMuted).toBe(true);
    t.controller.end();
  });
});

describe('network changes', () => {
  it('a short loss is waited out', async () => {
    const t = setup({softReconnect: true});
    await t.controller.start();
    t.clock.advance(15_000);
    t.controller.networkChanged(false);
    await t.tick(2000);
    t.controller.networkChanged(true);
    await t.tick(5000);
    expect(t.controller.getSnapshot().phase).toBe('listening');
    expect(t.calls.createSession).toHaveLength(1);
    expect(t.calls.detach).toEqual([]);
    t.controller.end();
  });

  it('a longer loss reconnects without waiting for the socket to time out', async () => {
    const t = setup({softReconnect: true});
    await t.controller.start();
    const key = t.calls.transportStart[0].sessionKey;
    t.clock.advance(15_000);
    t.setOnline(false);
    t.controller.networkChanged(false);
    await t.tick(3000);
    expect(t.controller.getSnapshot().phase).toBe('reconnecting');
    expect(t.calls.detach).toEqual([key]);
    t.setOnline(true);
    t.controller.networkChanged(true);
    await t.tick(0);
    expect(t.controller.getSnapshot().phase).toBe('listening');
    expect(t.calls.transportReconnect[0].sessionKey).toBe(key);
    t.controller.end();
  });

  it('a loss while still connecting stops the start', async () => {
    const t = setup();
    // Native rejects a start that was ended (ENDED); this fake does too.
    let rejectStart: (error: unknown) => void = () => undefined;
    t.deps.transport.start = () =>
      new Promise((_resolve, reject) => {
        rejectStart = reject;
      });
    t.deps.transport.end = async () => {
      rejectStart(Object.assign(new Error('ended'), {code: 'ENDED'}));
      return true;
    };
    const started = t.controller.start();
    await flush();
    t.controller.networkChanged(false);
    expect(t.controller.getSnapshot().phase).toBe('restart_required');
    await started;
    expect(t.calls.createSession).toHaveLength(1);
  });
});

describe('Continue call', () => {
  it('a call stopped by the system continues with its transcript and memory', async () => {
    const t = setup();
    await t.controller.start();
    t.message(userFinal('Remind me about the quiz', 1));
    t.emit({kind: 'backgrounded'});
    expect(t.controller.getSnapshot().phase).toBe('restart_required');
    await t.controller.resume();
    const snapshot = t.controller.getSnapshot();
    expect(snapshot.phase).toBe('listening');
    expect(snapshot.turns.map(turn => turn.text)).toEqual([
      'Remind me about the quiz',
    ]);
    const initiation = t.lastInitiation();
    expect(initiation.conversation_config_override.agent.first_message).toBe(
      RESUME_LINE,
    );
    expect(initiation.custom_llm_extra_body.student_context).toMatch(
      /^Call continued/,
    );
    expect(t.calls.createSession).toHaveLength(2);
    t.controller.end();
  });

  it('a new call still clears the screen', async () => {
    const t = setup();
    await t.controller.start();
    t.message(userFinal('hello', 1));
    t.emit({kind: 'backgrounded'});
    await t.controller.start();
    expect(t.controller.getSnapshot().turns).toEqual([]);
    t.controller.end();
  });
});

describe('server-side resume (capability `resume`)', () => {
  it('links the session and sends the call recap', async () => {
    const t = setup({capabilities: {resume: true}});
    await t.controller.start();
    t.message(userFinal('What is due tomorrow?', 1));
    t.message(agentFinal('Your capstone draft.', 2));
    t.emit({kind: 'playback', speaking: true});
    t.emit({kind: 'playback', speaking: false});
    await t.tick(1500);
    t.clock.advance(15_000);
    t.emit(drop);
    await t.tick(0);
    expect(t.calls.createSession[1].resumeOf).toBe(sessionIdFor(1));
    const extra = t.lastInitiation().custom_llm_extra_body;
    expect(extra.call_mode).toBe('reconnect');
    expect(extra.call_recap).toEqual([
      {role: 'user', text: 'What is due tomorrow?'},
      {role: 'assistant', text: 'Your capstone draft.'},
    ]);
    t.controller.end();
  });

  it('a server that refuses the link is asked again without it', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    let n = 0;
    const t = setup({
      capabilities: {resume: true},
      createSession: async body => {
        bodies.push(body as Record<string, unknown>);
        n += 1;
        if ((body as {resumeOf?: string}).resumeOf)
          return {
            ok: false,
            status: 'validation_error',
            httpStatus: 409,
            message: 'too old',
          };
        return {
          ok: true,
          data: {
            sessionId: sessionIdFor(n),
            signedUrl: `wss://api.elevenlabs.io/v1/convai/conversation?x=${n}`,
            grant: 'g',
            voiceId: 'voice_1',
            expiresAt: '',
            maxDurationSeconds: 300,
            maxTurns: 30,
          },
        };
      },
    });
    await t.controller.start();
    t.clock.advance(15_000);
    t.emit(drop);
    await t.tick(0);
    await t.tick(1000);
    expect(bodies.map(body => Boolean(body.resumeOf))).toEqual([
      false,
      true,
      false,
    ]);
    expect(t.controller.getSnapshot().phase).toBe('listening');
    t.controller.end();
  });
});
