/**
 * Everyday-use call audit regression tests (2026-11-27).
 * Covers verified bugs fixed across online Call LAFINA, reconnect, offline call,
 * USTP handbook voice search, skill handoff, action cards, and reminder calls.
 */
import {
  VoiceConversationController,
  type VoiceConversationDeps,
} from '../../src/cloud/voiceConversation/controller';
import type {
  ApiOutcome,
  ConversationClock,
  TransportEvent,
  VoiceCapabilities,
  VoiceSessionGrant,
} from '../../src/cloud/voiceConversation/types';
import {
  OfflineCallController,
  type OfflineCallDeps,
} from '../../src/ai/offlineCall/offlineCallController';
import {
  extractQueryTokens,
  replyDisclaimsHandbook,
} from '../../src/handbook/handbookSearch';
import {detectSkillIntent} from '../../src/ai/skills/skillIntent';
import {validatePayload} from '../../src/ai/voiceActions/actionValidator';
import {
  shortDate,
  time12,
} from '../../src/ui/components/callLafina/cards/cardFormat';
import {parseRingingReminderChange} from '../../src/ai/nlu/ringingReminderChange';
import {detectCallKeyword} from '../../src/scheduler/callCommand';

const fakeClock = () => {
  let now = 10_000;
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

const makeGrant = (n: number): VoiceSessionGrant => ({
  sessionId: `11111111-2222-3333-4444-${String(n).padStart(12, '0')}`,
  signedUrl: `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=a&s=${n}`,
  grant: 'grant-token',
  voiceId: 'voice_1',
  expiresAt: '2026-11-27T01:05:00Z',
  maxDurationSeconds: 300,
  maxTurns: 30,
});

const baseCaps: VoiceCapabilities = {
  enabled: true,
  maxDurationSeconds: 300,
  maxTurns: 30,
  openingLine: true,
};

describe('Call audit 2026-11-27 regressions', () => {
  describe('Online Call LAFINA engine & reconnect', () => {
    it('retries on transient 401 token renewal failure (sessionEnded: false) and restores micCapturing on soft reconnect', async () => {
      const clock = fakeClock();
      const listeners = new Map<string, (e: TransportEvent) => void>();
      let createCalls = 0;
      const deps: VoiceConversationDeps = {
        gates: {
          isGuest: () => false,
          isSignedInOwner: () => true,
          isOnlineMode: () => true,
          isOnline: async () => true,
          hasConsent: () => true,
          ensureMicPermission: async () => true,
        },
        getVoice: () => ({id: 'voice_1', name: 'Bella'}),
        useHandbook: () => false,
        getStudentContext: () => 'Earlier in this chat: Student: hi',
        clock,
        autoReconnect: true,
        api: {
          capabilities: async () => ({ok: true, data: baseCaps}),
          createSession: async (): Promise<ApiOutcome<VoiceSessionGrant>> => {
            createCalls += 1;
            if (createCalls === 1) return {ok: true, data: makeGrant(1)};
            if (createCalls === 2) {
              return {
                ok: false,
                message: 'Temporary auth renewal failure',
                status: 'auth_required',
                sessionEnded: false,
              };
            }
            return {ok: true, data: makeGrant(2)};
          },
          connected: async () => null,
          end: async () => null,
          status: async () => ({
            ok: true,
            data: {status: 'active', lastErrorCode: null, lastErrorMessage: null},
          }),
        },
        transport: {
          available: () => true,
          start: async req => {
            listeners.get(req.sessionKey)?.({
              kind: 'open',
            });
            listeners.get(req.sessionKey)?.({
              kind: 'mic',
              capturing: true,
            });
          },
          reconnect: async req => {
            listeners.get(req.sessionKey)?.({
              kind: 'open',
            });
          },
          detach: async () => true,
          setMuted: async () => true,
          stopResponse: async () => true,
          sendMessage: async () => true,
          end: async () => true,
          subscribe: (key, listener) => {
            listeners.set(key, listener);
            return () => listeners.delete(key);
          },
        },
      };

      const controller = new VoiceConversationController(deps);
      await controller.start();
      await flush();
      expect(controller.getSnapshot().phase).toBe('listening');

      const key = [...listeners.keys()][0];
      listeners.get(key)?.({
        kind: 'closed',
        code: 1006,
        reason: 'network',
        recoverable: true,
      });
      await flush();
      expect(controller.getSnapshot().phase).toBe('reconnecting');

      // Attempt 1 gets transient unauthorized (sessionEnded: false) -> schedules attempt 2
      clock.advance(1_500);
      await flush();
      expect(createCalls).toBe(2);
      expect(controller.getSnapshot().phase).toBe('reconnecting');

      // Attempt 2 succeeds and restores micCapturing on soft reconnect
      clock.advance(3_500);
      await flush();
      expect(createCalls).toBe(3);
      expect(controller.getSnapshot().phase).toBe('listening');
      expect(controller.getSnapshot().micCapturing).toBe(true);
    });

    it('sanitizes reasoning tags on interruption and safely reports client_tool_call rejections', async () => {
      const clock = fakeClock();
      const listeners = new Map<string, (e: TransportEvent) => void>();
      const sent: string[] = [];
      const assistantTurns: Array<{text: string; heard: string}> = [];
      const deps: VoiceConversationDeps = {
        gates: {
          isGuest: () => false,
          isSignedInOwner: () => true,
          isOnlineMode: () => true,
          isOnline: async () => true,
          hasConsent: () => true,
          ensureMicPermission: async () => true,
        },
        getVoice: () => ({id: 'voice_1', name: 'Bella'}),
        useHandbook: () => false,
        getStudentContext: () => '',
        clock,
        onClientTool: async () => {
          throw new Error('boom');
        },
        persistence: {
          userTurn: () => undefined,
          assistantTurn: (text, heard) => {
            assistantTurns.push({text, heard});
          },
        },
        api: {
          capabilities: async () => ({ok: true, data: baseCaps}),
          createSession: async () => ({ok: true, data: makeGrant(1)}),
          connected: async () => null,
          end: async () => null,
          status: async () => ({
            ok: true,
            data: {status: 'active', lastErrorCode: null, lastErrorMessage: null},
          }),
        },
        transport: {
          available: () => true,
          start: async req => {
            listeners.get(req.sessionKey)?.({
              kind: 'open',
            });
          },
          setMuted: async () => true,
          stopResponse: async () => true,
          sendMessage: async (_key, json) => {
            sent.push(json);
            return true;
          },
          end: async () => true,
          subscribe: (key, listener) => {
            listeners.set(key, listener);
            return () => listeners.delete(key);
          },
        },
      };

      const controller = new VoiceConversationController(deps);
      await controller.start();
      await flush();
      const key = [...listeners.keys()][0];

      // Student speaks first so the assistant answer is persisted to Chat
      listeners.get(key)?.({
        kind: 'message',
        data: JSON.stringify({
          type: 'user_transcript',
          user_transcription_event: {user_transcript: 'What is my next class?'},
        }),
      });
      // Stream text with <think>...</think> then interrupt
      listeners.get(key)?.({
        kind: 'message',
        data: JSON.stringify({
          type: 'agent_chat_response_part',
          text_response_part: {
            type: 'delta',
            text: '<think>secret chain</think>Your next class is Math',
          },
        }),
      });
      listeners.get(key)?.({
        kind: 'message',
        data: JSON.stringify({type: 'interruption'}),
      });
      await flush();
      const interruptedTurn = controller
        .getSnapshot()
        .turns.find(t => t.role === 'assistant');
      expect(interruptedTurn?.text).toBe('Your next class is Math');
      expect(interruptedTurn?.status).toBe('interrupted');

      clock.advance(2_000);
      await flush();
      expect(assistantTurns[0]?.text).toBe('Your next class is Math');
      expect(assistantTurns[0]?.text).not.toContain('secret chain');

      // Throwing client tool returns safe is_error: true JSON instead of unhandled rejection
      listeners.get(key)?.({
        kind: 'message',
        data: JSON.stringify({
          type: 'client_tool_call',
          client_tool_call: {
            tool_name: 'search_ustp_sources',
            tool_call_id: 'call_1',
            parameters: {query: 'dress code'},
          },
        }),
      });
      await flush();
      const toolReply = sent
        .map(s => JSON.parse(s))
        .find(m => m.type === 'client_tool_result');
      expect(toolReply).toBeDefined();
      expect(toolReply.tool_call_id).toBe('call_1');
      expect(toolReply.is_error).toBe(true);
    });
  });

  describe('Offline Call LAFINA release coordination', () => {
    it('endAndWait() awaits native mic/TTS release even when stopForSystem() already began finish()', async () => {
      let resolveCancel!: () => void;
      const cancelPromise = new Promise<boolean>(resolve => {
        resolveCancel = () => resolve(true);
      });
      let cancelFinished = false;
      const deps: OfflineCallDeps = {
        greeting: () => 'Hi!',
        respond: async () => 'ok',
        speech: {
          isAvailable: async () => true,
          ensurePermission: async () => true,
          start: () => ({
            captureId: 'cap-1',
            result: new Promise(() => undefined),
          }),
          cancel: async () => {
            const done = await cancelPromise;
            cancelFinished = true;
            return done;
          },
        },
        voice: {
          ready: async () => true,
          speak: () => ({
            token: Promise.resolve(1),
            result: Promise.resolve('finished'),
          }),
          stop: async () => true,
        },
      };
      const controller = new OfflineCallController(deps);
      void controller.start();
      await flush();

      expect(controller.getSnapshot().phase).toBe('listening');

      // System interruption triggers finish() while cancel() is still pending
      controller.stopForSystem('Reminder call');
      let waited = false;
      const waitPromise = controller.endAndWait().then(res => {
        waited = true;
        return res;
      });
      await flush();
      expect(waited).toBe(false);
      expect(cancelFinished).toBe(false);

      resolveCancel();
      const res = await waitPromise;
      expect(cancelFinished).toBe(true);
      expect(res).toBe(true);
    });
  });

  describe('USTP Handbook voice search & Skill intent guards', () => {
    it('strips spoken contractions from query tokens and recognizes USTP sources disclaimers', () => {
      const tokens = extractQueryTokens(
        "What's the dress code and why can't I wear slippers?",
      );
      expect(tokens).not.toContain('whats');
      expect(tokens).not.toContain('cant');
      expect(tokens).toContain('dress');
      expect(tokens).toContain('slippers');

      expect(
        replyDisclaimsHandbook(
          "My USTP sources don't answer that question directly.",
        ),
      ).toBe(true);
      expect(
        replyDisclaimsHandbook(
          "I couldn't verify that from the USTP Student Handbook.",
        ),
      ).toBe(true);
    });

    it('does not treat future-scheduled break or document requests as immediate skill launches', () => {
      expect(detectSkillIntent('remind me to take a break at 3 PM')).toBeNull();
      expect(
        detectSkillIntent('schedule a study break tomorrow at 4'),
      ).toBeNull();
      expect(
        detectSkillIntent('remind me to make a reviewer tomorrow'),
      ).toBeNull();
      const intent = detectSkillIntent('start a 25 minute focus timer');
      expect(intent?.kind).toBe('launch');
      if (intent?.kind === 'launch') {
        expect(intent.launch.skill).toBe('pomodoro');
      }
    });
  });

  describe('Voice action validator & card formatting', () => {
    it('accepts 15-field payloads and explicit null optional fields without false validation errors', () => {
      const result = validatePayload('legacy.prepare_action', {
        request: 'add task Physics Lab Report due December 1 at 5 PM',
        action: 'create_task',
        title: 'Physics Lab Report',
        date: '2026-12-01',
        time: '17:00',
        endTime: null,
        durationMinutes: null,
        priority: 'high',
        category: 'Physics',
        location: null,
        newTitle: null,
        details: null,
        deliveryStyle: null,
        repeat: null,
        enabled: null,
      });
      expect(result.valid).toBe(true);
    });

    it('rejects impossible calendar dates and out-of-range times in cardFormat', () => {
      expect(shortDate('2026-02-31')).toBe('2026-02-31');
      expect(shortDate('2026-13-05')).toBe('2026-13-05');
      expect(shortDate('2026-11-25')).toBe('Wed, Nov 25');
      expect(time12('25:99')).toBe('25:99');
      expect(time12('14:05')).toBe('2:05 PM');
    });
  });

  describe('Reminder call NLU & voice commands', () => {
    const now = new Date('2026-11-27T09:00:00.000Z');

    it('parses exact relative minutes without +1 min inflation and supports bare hour moves', () => {
      const snooze10 = parseRingingReminderChange(
        'call me back in 10 minutes',
        now,
      );
      expect(snooze10?.kind).toBe('snooze');
      if (snooze10?.kind === 'snooze') {
        expect(snooze10.minutes).toBe(10);
      }

      const snooze2h = parseRingingReminderChange(
        'call me back in 2 hours',
        now,
      );
      expect(snooze2h?.kind).toBe('snooze');
      if (snooze2h?.kind === 'snooze') {
        expect(snooze2h.minutes).toBe(120);
      }

      const bareHour = parseRingingReminderChange('move it to 7', now);
      expect(bareHour?.kind).toBe('reschedule');

      const remindIn15 = parseRingingReminderChange(
        'remind me in 15 minutes',
        now,
      );
      expect(remindIn15?.kind).toBe('snooze');
      if (remindIn15?.kind === 'snooze') {
        expect(remindIn15.minutes).toBe(15);
      }
    });

    it('recognizes shorthand snooze and negated snooze call commands', () => {
      expect(detectCallKeyword('snooze 5')).toEqual({
        intent: 'snooze',
        minutes: 5,
      });
      expect(detectCallKeyword('no, snooze 10 minutes')).toEqual({
        intent: 'snooze',
        minutes: 10,
      });
      expect(detectCallKeyword('no, later', {casual: true})).toEqual({
        intent: 'snooze',
        minutes: null,
      });
    });
  });
});
