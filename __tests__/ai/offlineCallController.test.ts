/**
 * The offline Call Lafina loop with a scripted microphone and voice: one
 * speaker at a time, Stop, mute, typed turns, app-started lines, silence,
 * hang-up and the failures a phone can have.
 */
import {
  CAPTURE_STUCK_MESSAGE,
  OfflineCallController,
  OFFLINE_VOICE_NAME,
  TRANSCRIBE_STUCK_MESSAGE,
} from '../../src/ai/offlineCall/offlineCallController';
import type {
  OfflineCallDeps,
  OfflineReply,
} from '../../src/ai/offlineCall/offlineCallController';
import type {
  OfflineSpeechCaptureOptions,
  OfflineSpeechResult,
} from '../../src/ai/native/speechCapture';
import type {OwnedSpeechOutcome} from '../../src/ai/tts/ttsService';
import {
  cleanTranscript,
  OFFLINE_SILENCE_GOODBYE,
  speakable,
} from '../../src/ai/offlineCall/spokenReplies';

const flush = async (times = 20): Promise<void> => {
  for (let i = 0; i < times; i += 1) await Promise.resolve();
};

interface Pending<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}
const deferred = <T>(): Pending<T> => {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>(r => {
    resolve = r;
  });
  return {promise, resolve};
};

/** A microphone whose captures the test answers one at a time. */
const fakeMic = () => {
  const captures: {
    id: string;
    options: OfflineSpeechCaptureOptions;
    done: Pending<OfflineSpeechResult>;
  }[] = [];
  let seq = 0;
  const result = (
    id: string,
    patch: Partial<OfflineSpeechResult>,
  ): OfflineSpeechResult => ({
    captureId: id,
    transcript: '',
    speechDetected: false,
    cancelled: false,
    captureDurationMs: 100,
    inferenceDurationMs: 10,
    ...patch,
  });
  return {
    captures,
    start: jest.fn((options: OfflineSpeechCaptureOptions) => {
      const id = `cap-${++seq}`;
      const done = deferred<OfflineSpeechResult>();
      captures.push({id, options, done});
      return {captureId: id, result: done.promise};
    }),
    cancel: jest.fn(async (id: string) => {
      captures
        .find(c => c.id === id)
        ?.done.resolve(result(id, {cancelled: true}));
      return true;
    }),
    /** The student says something into the open capture. */
    say(text: string) {
      const open = captures[captures.length - 1];
      open.done.resolve(
        result(open.id, {transcript: text, speechDetected: !!text}),
      );
    },
    silence() {
      const open = captures[captures.length - 1];
      open.done.resolve(result(open.id, {}));
    },
  };
};

/** A voice whose lines the test finishes (or that finish by themselves). */
const fakeVoice = (autoFinish = true) => {
  const spoken: string[] = [];
  const lines: {token: number; done: Pending<OwnedSpeechOutcome>}[] = [];
  let token = 0;
  return {
    spoken,
    lines,
    ready: jest.fn(async () => true),
    speak: jest.fn((text: string) => {
      spoken.push(text);
      const done = deferred<OwnedSpeechOutcome>();
      const id = ++token;
      lines.push({token: id, done});
      if (autoFinish) done.resolve('finished');
      return {token: Promise.resolve(id), result: done.promise};
    }),
    stop: jest.fn(async (id: number) => {
      lines.find(l => l.token === id)?.done.resolve('stopped');
      return true;
    }),
  };
};

const setup = (
  overrides: Partial<OfflineCallDeps> & {
    respond?: OfflineCallDeps['respond'];
    autoFinish?: boolean;
  } = {},
) => {
  const mic = fakeMic();
  const voice = fakeVoice(overrides.autoFinish ?? true);
  const respond = jest.fn(
    overrides.respond ??
      (async (text: string): Promise<OfflineReply> => `You said ${text}.`),
  );
  const history: string[] = [];
  const controller = new OfflineCallController({
    respond,
    greeting: () => 'Hi, Lafina here.',
    speech: {
      isAvailable: async () => true,
      ensurePermission: async () => true,
      start: mic.start,
      cancel: mic.cancel,
      isBusyError: error =>
        error instanceof Error && error.message === 'MIC_IN_USE',
      ...overrides.speech,
    },
    voice: {
      ready: voice.ready,
      speak: voice.speak,
      stop: voice.stop,
      ...overrides.voice,
    },
    persistence: {
      userTurn: text => history.push(`user: ${text}`),
      assistantTurn: (text, heard) => history.push(`lafina(${heard}): ${text}`),
    },
    limits: overrides.limits,
    now: overrides.now,
    capture: overrides.capture,
  });
  return {controller, mic, voice, respond, history};
};

describe('offline call controller', () => {
  test('greets, listens with the mic closed while speaking, answers, listens again', async () => {
    const {controller, mic, voice, respond, history} = setup();
    await controller.start();
    await flush();
    expect(voice.spoken).toEqual(['Hi, Lafina here.']);
    // One capture, opened only after the greeting finished.
    expect(mic.start).toHaveBeenCalledTimes(1);
    expect(mic.captures[0].options).toEqual({
      mode: 'automatic',
      bargeIn: false,
      context: 'main_mic',
    });
    expect(controller.getSnapshot().phase).toBe('listening');
    expect(controller.getSnapshot().voiceName).toBe(OFFLINE_VOICE_NAME);

    mic.say('schedule a capstone meeting tomorrow at 10');
    await flush();
    expect(respond).toHaveBeenCalledWith(
      'schedule a capstone meeting tomorrow at 10',
      'voice',
      expect.objectContaining({isCurrent: expect.any(Function)}),
    );
    expect(voice.spoken[1]).toBe(
      'You said schedule a capstone meeting tomorrow at 10.',
    );
    expect(mic.start).toHaveBeenCalledTimes(2);
    expect(history).toEqual([
      'lafina(complete): Hi, Lafina here.',
      'user: schedule a capstone meeting tomorrow at 10',
      'lafina(complete): You said schedule a capstone meeting tomorrow at 10.',
    ]);
    controller.end();
    expect(controller.getSnapshot().phase).toBe('ended');
  });

  test('the mic never opens while LAFINA is still speaking', async () => {
    const {controller, mic, voice} = setup({autoFinish: false});
    await controller.start();
    await flush();
    expect(controller.getSnapshot().phase).toBe('speaking');
    expect(mic.start).not.toHaveBeenCalled();
    voice.lines[0].done.resolve('finished');
    await flush();
    expect(mic.start).toHaveBeenCalledTimes(1);
    controller.end();
  });

  test('Stop ends LAFINA’s line and the call goes back to listening', async () => {
    const {controller, mic, voice, history} = setup({autoFinish: false});
    await controller.start();
    await flush();
    controller.stopResponse();
    await flush();
    expect(voice.stop).toHaveBeenCalledWith(1);
    expect(controller.getSnapshot().turns[0].status).toBe('interrupted');
    expect(history[0]).toBe('lafina(interrupted): Hi, Lafina here.');
    expect(mic.start).toHaveBeenCalledTimes(1);
    controller.end();
  });

  test('whisper noise markers are not the student’s words', async () => {
    expect(cleanTranscript('[BLANK_AUDIO]')).toBe('');
    expect(cleanTranscript(' (music) save it ')).toBe('save it');
    const {controller, mic, respond} = setup();
    await controller.start();
    await flush();
    mic.say('[BLANK_AUDIO]');
    await flush();
    expect(respond).not.toHaveBeenCalled();
    controller.end();
  });

  test('three quiet listens in a row: a polite goodbye and the call ends', async () => {
    const {controller, mic, voice} = setup();
    await controller.start();
    await flush();
    mic.silence();
    await flush();
    mic.silence();
    await flush();
    mic.silence();
    await flush();
    expect(voice.spoken[voice.spoken.length - 1]).toBe(OFFLINE_SILENCE_GOODBYE);
    expect(controller.getSnapshot().phase).toBe('ended');
  });

  test('mute closes the mic until unmuted', async () => {
    const {controller, mic} = setup();
    await controller.start();
    await flush();
    controller.setMuted(true);
    await flush();
    expect(mic.cancel).toHaveBeenCalledWith('cap-1');
    expect(mic.start).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().micCapturing).toBe(false);
    controller.setMuted(false);
    await flush();
    expect(mic.start).toHaveBeenCalledTimes(2);
    controller.end();
  });

  test('a typed turn is handled like a spoken one', async () => {
    const {controller, respond, voice} = setup();
    await controller.start();
    await flush();
    expect(await controller.sendText('save it')).toBe(true);
    await flush();
    expect(respond).toHaveBeenCalledWith('save it', 'typed', expect.anything());
    expect(voice.spoken).toContain('You said save it.');
    controller.end();
  });

  test('announce: LAFINA says a line the app started (a tapped Confirm)', async () => {
    const {controller, voice} = setup();
    await controller.start();
    await flush();
    controller.announce('Saved Capstone meeting.');
    await flush();
    expect(voice.spoken).toContain('Saved Capstone meeting.');
    controller.end();
  });

  test('a reply can hang up after it is said', async () => {
    const {controller, mic, voice} = setup({
      respond: async () => ({text: 'Bye for now!', hangUp: true}),
    });
    await controller.start();
    await flush();
    mic.say('bye');
    await flush();
    expect(voice.spoken).toContain('Bye for now!');
    expect(controller.getSnapshot().phase).toBe('ended');
  });

  test('without speech recognition the call says so and never opens the mic', async () => {
    const {controller, mic} = setup({
      speech: {
        isAvailable: async () => false,
      } as unknown as OfflineCallDeps['speech'],
    });
    await controller.start();
    expect(controller.getSnapshot().phase).toBe('failed');
    expect(controller.getSnapshot().failure?.kind).toBe('voice_unavailable');
    expect(mic.start).not.toHaveBeenCalled();
  });

  test('microphone permission refused', async () => {
    const {controller} = setup({
      speech: {
        isAvailable: async () => true,
        ensurePermission: async () => false,
      } as unknown as OfflineCallDeps['speech'],
    });
    await controller.start();
    expect(controller.getSnapshot().failure?.kind).toBe('mic_denied');
  });

  test('microphone held by another recording: the call stops with a clear reason', async () => {
    const {controller} = setup({
      limits: {busyRetryMs: 0},
      speech: {
        isAvailable: async () => true,
        ensurePermission: async () => true,
        start: () => {
          throw new Error('MIC_IN_USE');
        },
        cancel: async () => true,
        isBusyError: (error: unknown) =>
          error instanceof Error && error.message === 'MIC_IN_USE',
      },
    });
    await controller.start();
    await flush(40);
    expect(controller.getSnapshot().failure?.kind).toBe('mic_busy');
  });

  test('no offline voice: replies show as text and the call still listens', async () => {
    const {controller, mic, voice} = setup({
      voice: {ready: async () => false} as unknown as OfflineCallDeps['voice'],
    });
    await controller.start();
    await flush();
    expect(controller.getSnapshot().notice).toMatch(/replies in text/);
    expect(voice.speak).not.toHaveBeenCalled();
    expect(controller.getSnapshot().turns[0].text).toBe('Hi, Lafina here.');
    expect(mic.start).toHaveBeenCalledTimes(1);
    controller.end();
  });

  test('leaving the app stops the call and releases the mic', async () => {
    const {controller, mic} = setup();
    await controller.start();
    await flush();
    controller.stopForSystem('Left the app.');
    expect(controller.getSnapshot().phase).toBe('restart_required');
    expect(mic.cancel).toHaveBeenCalledWith('cap-1');
  });

  test('a double tap on Call starts one call', async () => {
    const {controller, voice} = setup();
    await Promise.all([controller.start(), controller.start()]);
    await flush();
    expect(voice.spoken.filter(t => t === 'Hi, Lafina here.')).toHaveLength(1);
    controller.end();
  });

  test('the call ends politely at the time limit', async () => {
    let now = 0;
    const {controller, mic, voice} = setup({
      now: () => now,
      limits: {maxDurationMs: 1000},
    });
    await controller.start();
    await flush();
    now = 2000;
    mic.say('hello');
    await flush();
    expect(voice.spoken[voice.spoken.length - 1]).toMatch(/time limit/);
    expect(controller.getSnapshot().phase).toBe('ended');
  });
});

describe('spoken lines', () => {
  test('long answers are cut at a sentence and point to the screen', () => {
    const long = Array.from(
      {length: 20},
      (_, i) => `Item ${i + 1} is at ten.`,
    ).join(' ');
    const spoken = speakable(long);
    expect(spoken.length).toBeLessThan(380);
    expect(spoken).toMatch(/The rest is on your screen\.$/);
  });

  test('markdown and bullets are not read aloud', () => {
    expect(speakable('**Today**\n- Lab at 9 AM\n- Capstone at 10 AM')).toBe(
      'Today. Lab at 9 AM. Capstone at 10 AM',
    );
  });
});

type CaptureEnded = (captureId: string, speechDetected: boolean) => void;

/** Real-timer wait for a condition (the watchdogs use real timers here). */
const until = async (check: () => boolean, ms = 2000): Promise<void> => {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('condition not met in time');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
};

describe('offline call never goes silent (2026-11-20 device report)', () => {
  test('recording ends: the screen says the words are being written down', async () => {
    const hook: {ended: CaptureEnded | null} = {ended: null};
    const {controller, mic} = setup({
      speech: {
        isAvailable: async () => true,
        ensurePermission: async () => true,
        onCaptureEnded: (listener: CaptureEnded) => {
          hook.ended = listener;
          return () => {
            hook.ended = null;
          };
        },
      } as unknown as OfflineCallDeps['speech'],
    });
    // The spread keeps the fake mic for start/cancel.
    await controller.start();
    await flush();
    expect(mic.start).toHaveBeenCalledTimes(1);
    hook.ended?.('cap-1', true);
    expect(controller.getSnapshot().phase).toBe('thinking');
    expect(controller.getSnapshot().toolPhrase).toMatch(/Writing down/);
    expect(controller.getSnapshot().micCapturing).toBe(false);
    mic.say('hello');
    await flush();
    expect(controller.getSnapshot().toolPhrase).toBeNull();
    controller.end();
  });

  test('writing the words down takes too long: LAFINA says so and listens again', async () => {
    const hook: {ended: CaptureEnded | null} = {ended: null};
    const {controller, mic, voice, respond} = setup({
      limits: {transcribeTimeoutMs: 30},
      speech: {
        isAvailable: async () => true,
        ensurePermission: async () => true,
        onCaptureEnded: (listener: CaptureEnded) => {
          hook.ended = listener;
          return () => undefined;
        },
      } as unknown as OfflineCallDeps['speech'],
    });
    await controller.start();
    await flush();
    hook.ended?.('cap-1', true);
    await until(() => voice.spoken.some(t => /couldn't make that out/.test(t)));
    expect(mic.cancel).toHaveBeenCalledWith('cap-1');
    expect(respond).not.toHaveBeenCalled();
    await until(() => mic.start.mock.calls.length === 2);
    controller.end();
  });

  test('speech heard but no words came out: "I didn\'t catch that", never silence', async () => {
    const {controller, mic, voice, respond} = setup();
    await controller.start();
    await flush();
    mic.say('[BLANK_AUDIO]');
    await flush();
    expect(voice.spoken[voice.spoken.length - 1]).toMatch(/didn't catch that/);
    expect(respond).not.toHaveBeenCalled();
    expect(mic.start).toHaveBeenCalledTimes(2);
    controller.end();
  });

  test('the microphone is still being released: the call waits and listens', async () => {
    let attempts = 0;
    const mic = fakeMic();
    const {controller} = setup({
      speech: {
        isAvailable: async () => true,
        ensurePermission: async () => true,
        start: options => {
          attempts += 1;
          if (attempts <= 2) throw new Error('MIC_IN_USE');
          return mic.start(options);
        },
        cancel: mic.cancel,
        isBusyError: (error: unknown) =>
          error instanceof Error && error.message === 'MIC_IN_USE',
      },
    });
    await controller.start();
    await until(() => mic.start.mock.calls.length === 1);
    expect(controller.getSnapshot().failure).toBeNull();
    expect(controller.getSnapshot().phase).toBe('listening');
    controller.end();
  });

  test('reading the request takes too long: LAFINA says so; the late answer is dropped', async () => {
    let finish: ((reply: string) => void) | null = null;
    let turnContext: {isCurrent: () => boolean} | null = null;
    const {controller, mic, voice} = setup({
      limits: {respondTimeoutMs: 30},
      respond: (_text, _source, turn) => {
        turnContext = turn;
        return new Promise<OfflineReply>(resolve => {
          finish = resolve;
        });
      },
    });
    await controller.start();
    await flush();
    mic.say('schedule a capstone meeting tomorrow at 10');
    await until(() => voice.spoken.some(t => /took too long/.test(t)));
    expect(turnContext!.isCurrent()).toBe(false);
    finish!('Create event. Should I save it?');
    await flush();
    expect(voice.spoken).not.toContain('Create event. Should I save it?');
    await until(() => mic.start.mock.calls.length === 2);
    controller.end();
  });
});

describe('start: the voice engine readies beside the microphone checks', () => {
  test('voice.ready starts before the permission answer, and nothing is spoken until it comes', async () => {
    let allow!: (allowed: boolean) => void;
    const permission = new Promise<boolean>(resolve => {
      allow = resolve;
    });
    const ready = jest.fn(async () => true);
    const {controller, voice} = setup({
      speech: {
        isAvailable: async () => true,
        ensurePermission: () => permission,
      } as unknown as OfflineCallDeps['speech'],
      voice: {ready} as unknown as OfflineCallDeps['voice'],
    });
    const started = controller.start();
    await flush();
    expect(ready).toHaveBeenCalledTimes(1);
    expect(voice.spoken).toEqual([]);
    allow(true);
    await started;
    await flush();
    expect(voice.spoken).toEqual(['Hi, Lafina here.']);
    controller.end();
  });

  test('a denied microphone still fails as before, though the engine was asked', async () => {
    const ready = jest.fn(async () => true);
    const {controller, voice} = setup({
      speech: {
        isAvailable: async () => true,
        ensurePermission: async () => false,
      } as unknown as OfflineCallDeps['speech'],
      voice: {ready} as unknown as OfflineCallDeps['voice'],
    });
    await controller.start();
    expect(controller.getSnapshot().failure?.kind).toBe('mic_denied');
    expect(voice.spoken).toEqual([]);
  });

  test('a voice engine that throws only means text replies', async () => {
    const {controller} = setup({
      voice: {
        ready: () => {
          throw new Error('no engine');
        },
      } as unknown as OfflineCallDeps['voice'],
    });
    await controller.start();
    expect(controller.getSnapshot().phase).toBe('listening');
    expect(controller.getSnapshot().notice).toMatch(/replies in text/);
    controller.end();
  });
});

describe('endAfterReply (CALLFIX-03)', () => {
  test('the call ends after the next line is said', async () => {
    let controllerRef: {endAfterReply: () => void} | null = null;
    const {controller, mic, voice} = setup({
      respond: async () => {
        controllerRef?.endAfterReply();
        return "You're welcome! Bye for now!";
      },
    });
    controllerRef = controller;
    await controller.start();
    await flush();
    mic.say('thank you');
    await flush();
    expect(voice.spoken).toContain("You're welcome! Bye for now!");
    expect(controller.getSnapshot().phase).toBe('ended');
  });

  test('cancelEndAfterReply before the line keeps the call open', async () => {
    let controllerRef: {
      endAfterReply: () => void;
      cancelEndAfterReply: () => void;
    } | null = null;
    const {controller, mic} = setup({
      respond: async () => {
        controllerRef?.endAfterReply();
        controllerRef?.cancelEndAfterReply();
        return 'Okay, what else?';
      },
    });
    controllerRef = controller;
    await controller.start();
    await flush();
    mic.say('bye');
    await flush();
    expect(controller.getSnapshot().phase).not.toBe('ended');
    controller.end();
  });
});

describe('offline call audit fixes (2026-11-22)', () => {
  /** Answers the open capture with full control of the native result. */
  const answer = (
    mic: ReturnType<typeof fakeMic>,
    patch: Partial<OfflineSpeechResult>,
  ) => {
    const open = mic.captures[mic.captures.length - 1];
    open.done.resolve({
      captureId: open.id,
      transcript: '',
      speechDetected: false,
      cancelled: false,
      captureDurationMs: 100,
      inferenceDurationMs: 10,
      ...patch,
    });
  };

  test('asks for the microphone before checking speech recognition', async () => {
    const order: string[] = [];
    const {controller} = setup({
      speech: {
        isAvailable: async () => {
          order.push('available');
          return true;
        },
        ensurePermission: async () => {
          order.push('permission');
          return true;
        },
      } as unknown as OfflineCallDeps['speech'],
    });
    await controller.start();
    expect(order).toEqual(['permission', 'available']);
    controller.end();
  });

  test('a refused microphone is reported as such, not as "not ready"', async () => {
    const isAvailable = jest.fn(async () => false);
    const {controller} = setup({
      speech: {
        isAvailable,
        ensurePermission: async () => false,
      } as unknown as OfflineCallDeps['speech'],
    });
    await controller.start();
    expect(controller.getSnapshot().failure?.kind).toBe('mic_denied');
    expect(isAvailable).not.toHaveBeenCalled();
  });

  test('reports the permission prompt so leaving the screen for it does not end the call', async () => {
    let grant!: (ok: boolean) => void;
    const {controller} = setup({
      speech: {
        isAvailable: async () => true,
        ensurePermission: () =>
          new Promise<boolean>(resolve => {
            grant = resolve;
          }),
      } as unknown as OfflineCallDeps['speech'],
    });
    const starting = controller.start();
    await flush();
    expect(controller.isRequestingPermission()).toBe(true);
    grant(true);
    await starting;
    expect(controller.isRequestingPermission()).toBe(false);
    controller.end();
  });

  test('a made-up "Thank you." on noise is silence: no answer, no hang-up', async () => {
    const {controller, mic, respond} = setup();
    await controller.start();
    await flush();
    answer(mic, {
      transcript: 'Thank you.',
      speechDetected: true,
      maxVadProbability: 0.2,
    });
    await flush();
    expect(respond).not.toHaveBeenCalled();
    expect(controller.isActive()).toBe(true);
    expect(mic.start).toHaveBeenCalledTimes(2);
    controller.end();
  });

  test('a real "thank you" (confident detector) still reaches LAFINA', async () => {
    const {controller, mic, respond} = setup();
    await controller.start();
    await flush();
    answer(mic, {
      transcript: 'Thank you.',
      speechDetected: true,
      maxVadProbability: 0.95,
    });
    await flush();
    expect(respond).toHaveBeenCalledWith(
      'Thank you.',
      'voice',
      expect.anything(),
    );
    controller.end();
  });

  test('"you" from whisper is always dropped', async () => {
    const {controller, mic, respond} = setup();
    await controller.start();
    await flush();
    answer(mic, {transcript: 'You', speechDetected: true});
    await flush();
    expect(respond).not.toHaveBeenCalled();
    controller.end();
  });

  test("LAFINA's own last words heard back are not the student", async () => {
    const {controller, mic, respond} = setup();
    await controller.start();
    await flush();
    // The greeting was "Hi, Lafina here."
    answer(mic, {
      transcript: 'Hi, Lafina here.',
      speechDetected: true,
      maxVadProbability: 0.9,
    });
    await flush();
    expect(respond).not.toHaveBeenCalled();
    controller.end();
  });

  test('the call listens with a shorter pause, skipping the moment after LAFINA spoke', async () => {
    const {controller, mic} = setup({
      capture: {endSilenceMs: 700, leadInIgnoreMs: 300},
    });
    await controller.start();
    await flush();
    expect(mic.captures[0].options).toEqual({
      mode: 'automatic',
      bargeIn: false,
      context: 'main_mic',
      endSilenceMs: 700,
      leadInIgnoreMs: 300,
    });
    // A quiet listen is followed by another with nothing said in between.
    mic.silence();
    await flush();
    expect(mic.captures[1].options).toEqual({
      mode: 'automatic',
      bargeIn: false,
      context: 'main_mic',
      endSilenceMs: 700,
    });
    controller.end();
  });

  test('Stop pressed while LAFINA is thinking: the answer is shown, not spoken', async () => {
    let finish!: (reply: string) => void;
    const {controller, mic, voice, history} = setup({
      respond: () =>
        new Promise<OfflineReply>(resolve => {
          finish = resolve;
        }),
    });
    await controller.start();
    await flush();
    mic.say('what is due today');
    await flush();
    expect(controller.getSnapshot().phase).toBe('thinking');
    controller.stopResponse();
    finish('Your lab report is due at 5 PM.');
    await flush();
    expect(voice.spoken).not.toContain('Your lab report is due at 5 PM.');
    expect(history).toContain(
      'lafina(interrupted): Your lab report is due at 5 PM.',
    );
    await until(() => mic.start.mock.calls.length === 2);
    // The next answer is spoken again.
    mic.say('what about tomorrow');
    await flush();
    finish('Nothing is due tomorrow.');
    await flush();
    expect(voice.spoken).toContain('Nothing is due tomorrow.');
    controller.end();
  });

  test('whisper running out of time twice in a row ends the call with a clear reason', async () => {
    const hook: {ended: CaptureEnded | null} = {ended: null};
    const {controller, mic} = setup({
      limits: {transcribeTimeoutMs: 30},
      speech: {
        isAvailable: async () => true,
        ensurePermission: async () => true,
        onCaptureEnded: (listener: CaptureEnded) => {
          hook.ended = listener;
          return () => undefined;
        },
      } as unknown as OfflineCallDeps['speech'],
    });
    await controller.start();
    await flush();
    hook.ended?.('cap-1', true);
    await until(() => mic.start.mock.calls.length === 2);
    hook.ended?.('cap-2', true);
    await until(() => controller.getSnapshot().phase === 'failed');
    expect(controller.getSnapshot().failure?.message).toBe(
      TRANSCRIBE_STUCK_MESSAGE,
    );
  });

  test('our own unfinished recognition is not blamed on "another recording"', async () => {
    const {controller} = setup({
      limits: {busyRetryMs: 0},
      speech: {
        isAvailable: async () => true,
        ensurePermission: async () => true,
        start: () => {
          throw Object.assign(new Error('busy'), {code: 'CAPTURE_BUSY'});
        },
        cancel: async () => true,
        isBusyError: () => true,
      },
    });
    await controller.start();
    await flush(40);
    expect(controller.getSnapshot().failure?.kind).toBe('mic_busy');
    expect(controller.getSnapshot().failure?.message).toBe(
      CAPTURE_STUCK_MESSAGE,
    );
  });
});
