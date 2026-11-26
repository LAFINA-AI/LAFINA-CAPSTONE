import {NativeModules, PermissionsAndroid, Platform} from 'react-native';
import RNFS from 'react-native-fs';
import Tts from 'react-native-tts';
import {errorCodes, pick} from '@react-native-documents/picker';
import {alarmsStore, db, initDatabase, remindersStore} from '../../src/storage';
import {noteSessionChange} from '../../src/storage/sessionEpoch';
import {
  claimForegroundRing,
  NATIVE_CALL_TIMEOUT_MS,
  readLiveNativeRegistrations,
  reconcileIfDeliveryChanged,
  reconcileReminderDelivery,
} from '../../src/scheduler/deliveryReconciler';
import {syncAlarmEvents} from '../../src/scheduler/alarmService';
import {
  acknowledgeReminderAction,
  createNextRecurringReminder,
} from '../../src/scheduler/reminderActions';
import * as reminderAlarm from '../../src/scheduler/reminderAlarm';
import {ttsService} from '../../src/ai/tts/ttsService';
import {OfflineCallController} from '../../src/ai/offlineCall/offlineCallController';
import type {OfflineCallDeps} from '../../src/ai/offlineCall/offlineCallController';
import type {OfflineSpeechResult} from '../../src/ai/native/speechCapture';
import {
  QUICK_CHAT_IDLE_MS,
  quickChatController,
} from '../../src/ai/quickChat/quickChatController';
import {chatOrchestrator} from '../../src/ai/chatOrchestrator';
import {createUpdateService} from '../../src/updates/updateService';
import type {NativeUpdater, UpdaterInfo} from '../../src/updates/nativeUpdater';
import {applyPomodoro, readPomodoro} from '../../src/skills/pomodoroService';
import {newPomodoro} from '../../src/skills/studyLogic';
import {transcribeMeetingChunks} from '../../src/ai/meeting/meetingTranscriber';
import {meetingRecorder} from '../../src/ai/native/meetingRecorder';
import * as elevenlabsTranscriber from '../../src/cloud/elevenlabsTranscriber';
import {generateMeetingNotes} from '../../src/meetings/notesPipeline';
import {onlineChatSkill} from '../../src/skills/onlineChatSkill';
import {cloudClient} from '../../src/cloud';
import {
  downloadOfflineModel,
  getActiveModelDownload,
} from '../../src/ai/nlu/modelManager';
import {visionService} from '../../src/ai/vision/visionService';
import {draftRegistry} from '../../src/ai/voiceActions/draftRegistry';
import {actionService} from '../../src/ai/voiceActions/actionService';

jest.mock('@react-native-documents/picker', () => ({
  errorCodes: {
    OPERATION_CANCELED: 'OPERATION_CANCELED',
  },
  isErrorWithCode: (err: unknown): err is {code: string} =>
    typeof err === 'object' &&
    err !== null &&
    typeof (err as {code?: unknown}).code === 'string',
  pick: jest.fn(),
  types: {
    images: 'image/*',
    pdf: 'application/pdf',
  },
}));

let seq = 0;
const createStudentUser = (label: string, activate = false): string => {
  seq += 1;
  const id = `c2-${label}-${seq}`;
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT INTO users (id, username, email, role, is_new_user, created_at, updated_at)
     VALUES (?, ?, ?, 'student', 0, ?, ?)`,
    [id, id, `${id}@example.invalid`, now, now],
  );
  if (activate) {
    db.executeSync('DELETE FROM active_session');
    db.executeSync(
      'INSERT INTO active_session (user_id, access_token, refresh_token, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [id, `tok-${id}`, null, now, now],
    );
    noteSessionChange();
  }
  return id;
};

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {promise, resolve, reject};
};

describe('Cycle 2 audit fixes (scheduler, voice/TTS, updates, skills, AI, materials)', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    quickChatController.resetForTests();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    db.executeSync('DELETE FROM active_session');
    noteSessionChange();
  });

  test('C2-02: deliveryReconciler detects A -> null -> A ABA transition and bounds native reads/claims', async () => {
    const uid = createStudentUser('reconcile-aba');
    const native = NativeModules.LafinaReminder as Record<string, jest.Mock>;
    const origSetOwner = native.setDeliveryOwner;
    const origDrain = native.drainDeliveryReceipts;
    const origList = native.listDeliveryRegistrations;
    const origClaim = native.claimForegroundDelivery;

    try {
      const gate = deferred<boolean>();
      native.setDeliveryOwner = jest
        .fn()
        .mockImplementationOnce(() => gate.promise)
        .mockResolvedValue(true);
      native.drainDeliveryReceipts = jest.fn(async () => []);
      native.listDeliveryRegistrations = jest.fn(async () => []);

      const firstA = reconcileReminderDelivery(uid);
      const midNull = reconcileReminderDelivery(null);
      const secondA = reconcileReminderDelivery(uid);

      gate.resolve(true);
      const [r1, r2, r3] = await Promise.all([firstA, midNull, secondA]);

      expect(r1.aborted).toBe(true);
      expect(r2.aborted).toBe(true);
      expect(r3.aborted).toBeUndefined();

      // Aborted reconcileIfDeliveryChanged must not cache fingerprint.
      const gate2 = deferred<boolean>();
      native.setDeliveryOwner = jest
        .fn()
        .mockImplementationOnce(() => gate2.promise)
        .mockResolvedValue(true);
      remindersStore.insertReminder({
        id: `rem-aba-${seq}`,
        userId: uid,
        task: 'ABA test',
        description: null,
        scheduledAt: new Date(Date.now() + 60 * 60_000).toISOString(),
        triggerAt: new Date(Date.now() + 60 * 60_000).toISOString(),
        status: 'pending',
        preCastAudioPath: null,
      });
      const ifChanged1 = reconcileIfDeliveryChanged(uid);
      const supersede = reconcileReminderDelivery(null);
      const restore = reconcileReminderDelivery(uid);
      gate2.resolve(true);
      const s1 = await ifChanged1;
      await supersede;
      await restore;
      expect(s1?.aborted).toBe(true);

      // Next reconcileIfDeliveryChanged must still run (not skipped via stale cached fingerprint).
      const s2 = await reconcileIfDeliveryChanged(uid);
      expect(s2).not.toBeNull();

      // claimForegroundRing & readLiveNativeRegistrations are bounded by NATIVE_CALL_TIMEOUT_MS.
      jest.useFakeTimers();
      native.claimForegroundDelivery = jest.fn(
        () => new Promise(() => undefined),
      );
      native.listDeliveryRegistrations = jest.fn(
        () => new Promise(() => undefined),
      );
      const claimPromise = claimForegroundRing('r1', uid, 1);
      const listPromise = readLiveNativeRegistrations();
      await jest.advanceTimersByTimeAsync(NATIVE_CALL_TIMEOUT_MS + 10);
      expect(await claimPromise).toBe(false);
      expect(await listPromise).toBe('unreadable');
    } finally {
      native.setDeliveryOwner = origSetOwner;
      native.drainDeliveryReceipts = origDrain;
      native.listDeliveryRegistrations = origList;
      native.claimForegroundDelivery = origClaim;
    }
  });

  test('C2-03: syncAlarmEvents survives invalid atMs without dropping valid sibling events', async () => {
    const uid = createStudentUser('alarm-evt');
    const alarm = alarmsStore.create(uid, {
      hour: 7,
      minute: 0,
      repeatDays: 0,
      oneShotDate: '2026-12-01',
      label: 'Morning Study',
      enabled: true,
    });
    const origOS = Platform.OS;
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'android',
    });
    const origAlarmModule = NativeModules.LafinaAlarm;
    const validMs = Date.UTC(2026, 11, 1, 7, 0, 0);
    NativeModules.LafinaAlarm = {
      reconcile: jest.fn(async () => []),
      drainEvents: jest.fn(async () => [
        {alarmId: alarm.id, kind: 'fired', atMs: Number.NaN, generation: 1},
        {alarmId: alarm.id, kind: 'dismissed', atMs: validMs, generation: 1},
      ]),
      testAlarm: jest.fn(async () => Date.now()),
      stopRinging: jest.fn(async () => true),
      getStatus: jest.fn(),
      openBatterySettings: jest.fn(async () => true),
    };
    try {
      const events = await syncAlarmEvents(uid, validMs + 1000);
      expect(events).toHaveLength(2);
      const refreshed = alarmsStore.get(alarm.id, uid);
      expect(refreshed?.lastOutcome).toBe('dismissed');
      expect(refreshed?.lastFiredAt).toBe(
        new Date(validMs + 1000).toISOString(),
      );
    } finally {
      Object.defineProperty(Platform, 'OS', {
        configurable: true,
        value: origOS,
      });
      NativeModules.LafinaAlarm = origAlarmModule;
    }
  });

  test('C2-05: reminderActions handles bad triggerAt in recurrence and still finishes incoming call if alarm cancel rejects', async () => {
    const uid = createStudentUser('rem-act');
    const nowIso = new Date().toISOString();
    const reminder = {
      id: `rem-rec-${seq}`,
      userId: uid,
      task: 'Weekly Quiz',
      description: 'Daily review [RRULE:FREQ=DAILY;INTERVAL=1]',
      scheduledAt: nowIso,
      triggerAt: 'not-a-date',
      status: 'triggered' as const,
      snoozedUntil: null,
      snoozeCount: 0,
      preCastAudioPath: null,
      createdAt: nowIso,
      updatedAt: nowIso,
      deletedAt: null,
    };
    let next: {id: string; task: string; triggerAt: string} | null = null;
    db.transactionSync(tx => {
      next = createNextRecurringReminder(reminder, uid, tx, new Date());
    });
    expect(next).not.toBeNull();
    expect(Number.isNaN(Date.parse(next!.triggerAt))).toBe(false);

    // acknowledgeReminderAction still calls finishNativeIncomingCall when cancelReminderAlarm rejects.
    const remId = `rem-ack-${seq}`;
    const future = new Date(Date.now() + 30 * 60_000).toISOString();
    remindersStore.insertReminder({
      id: remId,
      userId: uid,
      task: 'Ack test',
      description: null,
      scheduledAt: future,
      triggerAt: future,
      status: 'triggered',
      preCastAudioPath: null,
    });
    jest
      .spyOn(reminderAlarm, 'cancelReminderAlarm')
      .mockRejectedValueOnce(new Error('alarm cancel failed'));
    const finishSpy = jest
      .spyOn(reminderAlarm, 'finishNativeIncomingCall')
      .mockResolvedValueOnce(undefined);

    const outcome = await acknowledgeReminderAction(remId, uid);
    expect(outcome.ok).toBe(true);
    expect(finishSpy).toHaveBeenCalledWith(remId, uid, undefined);
  });

  test('C2-06: ttsService clamps >3900-char utterances and bounds hung Tts.stop()', async () => {
    await ttsService.init();
    const speakSpy = jest.spyOn(Tts, 'speak');
    const huge = 'A'.repeat(4500);
    await ttsService.speak(huge);
    expect(speakSpy).toHaveBeenCalled();
    const spokenArg = String(speakSpy.mock.calls[0]?.[0] ?? '');
    expect(spokenArg.length).toBeLessThanOrEqual(3900);

    const stopSpy = jest
      .spyOn(Tts, 'stop')
      .mockImplementation(
        () =>
          new Promise<boolean>(() => undefined) as unknown as Promise<boolean>,
      );

    jest.useFakeTimers();
    const stopPromise = ttsService.stopSpeaking();
    await jest.advanceTimersByTimeAsync(3100);
    await expect(stopPromise).resolves.toBeUndefined();
    expect(stopSpy).toHaveBeenCalled();
  });

  test('C2-07: offlineCallController honors endAfterReply after announce()', async () => {
    const speakCalls: string[] = [];
    const captures = new Map<
      string,
      ReturnType<typeof deferred<OfflineSpeechResult>>
    >();
    let capSeq = 0;
    const deps: OfflineCallDeps = {
      respond: jest.fn(async () => ({text: 'Okay'})),
      greeting: () => '',
      speech: {
        isAvailable: jest.fn(async () => true),
        ensurePermission: jest.fn(async () => true),
        start: jest.fn(() => {
          const id = `cap-${++capSeq}`;
          const gate = deferred<OfflineSpeechResult>();
          captures.set(id, gate);
          return {captureId: id, result: gate.promise};
        }),
        cancel: jest.fn(async (captureId: string) => {
          captures.get(captureId)?.resolve({
            captureId,
            transcript: '',
            speechDetected: false,
            cancelled: true,
            captureDurationMs: 10,
            inferenceDurationMs: 0,
          });
          return true;
        }),
      },
      voice: {
        ready: jest.fn(async () => true),
        speak: jest.fn((text: string) => {
          speakCalls.push(text);
          return {
            token: Promise.resolve(1),
            result: Promise.resolve('finished' as const),
          };
        }),
        stop: jest.fn(async () => true),
      },
    };
    const controller = new OfflineCallController(deps);
    controller.start();
    for (let i = 0; i < 20; i += 1) {
      await Promise.resolve();
    }
    controller.endAfterReply();
    controller.announce('Opening Pomodoro now.');
    for (let i = 0; i < 30; i += 1) {
      await Promise.resolve();
    }
    expect(speakCalls).toContain('Opening Pomodoro now.');
    expect(controller.getSnapshot().phase).toBe('ended');
    controller.dispose();
  });

  test('C2-08: quickChatController aborts in-flight processMessage on stop() and enforces 30m idle expiry on getters', async () => {
    const uid = createStudentUser('quick-chat', true);
    let capturedSignal: AbortSignal | undefined;
    const pending = deferred<never>();

    jest
      .spyOn(chatOrchestrator, 'processMessage')
      .mockImplementationOnce(async (_uid, _text, opts) => {
        capturedSignal = opts?.signal;
        return pending.promise;
      });

    const sendPromise = quickChatController.send(uid, 'check my tasks');
    await Promise.resolve();
    expect(capturedSignal).toBeDefined();
    expect(capturedSignal?.aborted).toBe(false);

    quickChatController.stop();
    expect(capturedSignal?.aborted).toBe(true);
    pending.reject(new Error('Aborted'));
    await sendPromise;

    jest.useFakeTimers({
      doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'clearTimeout'],
    });
    jest.setSystemTime(new Date('2026-11-26T10:00:00.000Z'));
    jest.spyOn(chatOrchestrator, 'processMessage').mockResolvedValueOnce({
      userMessage: {
        id: 'u-1',
        sessionId: 'temp_chat',
        sender: 'user',
        content: 'hello',
        createdAt: '2026-11-26T10:00:00.000Z',
        updatedAt: '2026-11-26T10:00:00.000Z',
      },
      assistantMessage: {
        id: 'a-1',
        sessionId: 'temp_chat',
        sender: 'assistant',
        content: 'All caught up.',
        createdAt: '2026-11-26T10:00:00.000Z',
        updatedAt: '2026-11-26T10:00:00.000Z',
      },
      reply: 'All caught up.',
      intent: {
        intent: 'chat',
        rawTranscript: 'hello',
        title: null,
        date: null,
        time: null,
        endTime: null,
        durationMinutes: null,
        category: 'General',
        details: null,
        snoozeMinutes: null,
        confidence: 1,
        source: 'fast_path',
        isValid: true,
      },
    });
    await quickChatController.send(uid, 'hello');
    expect(quickChatController.getLastResult(uid)).not.toBeNull();

    jest.setSystemTime(
      new Date(
        Date.parse('2026-11-26T10:00:00.000Z') + QUICK_CHAT_IDLE_MS + 1000,
      ),
    );
    expect(quickChatController.getLastResult(uid)).toBeNull();
    expect(quickChatController.getCardSource(uid, 'any-card')).toBeNull();
  });

  test('C2-09: updateService upgrades quiet in-flight check on explicit check and blocks concurrent install()', async () => {
    const info: UpdaterInfo = {
      nativeVersionCode: 7,
      nativeVersionName: '1.1.0',
      isDebug: false,
      updatesEnabled: true,
      runningVersion: null,
      pendingVersion: null,
      rejectedVersions: [],
      signerSha256: ['a'.repeat(64)],
      supportedAbis: ['arm64-v8a'],
    };
    const fetchGate = deferred<Response>();
    const installGate = deferred<boolean>();
    const native: NativeUpdater = {
      updatesEnabled: true,
      buildType: 'release',
      getInfo: jest.fn(async () => info),
      verifyManifest: jest.fn(async (payload: string) =>
        Buffer.from(payload, 'base64').toString('utf8'),
      ),
      downloadBundle: jest.fn(async () => true),
      downloadApk: jest.fn(async () => true),
      installApk: jest.fn(() => installGate.promise),
      canInstallApks: jest.fn(async () => true),
      openInstallPermissionSettings: jest.fn(async () => true),
      cancelDownload: jest.fn(async () => true),
      restart: jest.fn(async () => true),
      markLaunchSuccessful: jest.fn(async () => true),
      onProgress: jest.fn(() => ({remove: jest.fn()})),
      onInstallStatus: jest.fn(() => ({remove: jest.fn()})),
    };

    const fetchImpl = jest.fn(() => fetchGate.promise);
    const service = createUpdateService({
      native,
      currentVersion: '1.1.0',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    // Quiet check starts first; explicit check joins and upgrades it so failure surfaces as 'error'.
    const quietPromise = service.check({quiet: true});
    const explicitPromise = service.check();
    fetchGate.reject(new Error('network down'));
    const [sQuiet, sExplicit] = await Promise.all([
      quietPromise,
      explicitPromise,
    ]);
    expect(sExplicit.phase).toBe('error');
    expect(sQuiet.phase).toBe('error');

    // Concurrent install() double-tap must call native.installApk only once.
    const manifestObj = {
      schema: 1,
      product: 'com.lafina.capstone',
      version: '1.2.0',
      platform: 'android',
      nativeVersionCode: 8,
      file: 'lafina-android-bundle-1.2.0.zip',
      size: 4_000_000,
      sha256: 'c'.repeat(64),
      signedAt: '2026-11-23T00:00:00.000Z',
      title: 'LAFINA v1.2.0',
      notes: 'Notes',
      apk: {
        file: 'LAFINA-v1.2.0-arm64-v8a.apk',
        size: 140_000_000,
        sha256: 'd'.repeat(64),
        versionCode: 8,
        abis: ['arm64-v8a'],
        signerSha256: 'a'.repeat(64),
      },
    };
    const signedBody = JSON.stringify({
      payload: Buffer.from(JSON.stringify(manifestObj), 'utf8').toString(
        'base64',
      ),
      signature: 'Z29vZA==',
    });
    fetchImpl.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => signedBody,
      json: async () => JSON.parse(signedBody),
    } as unknown as Response);

    await service.check();
    await service.download();
    const i1 = service.install();
    const i2 = service.install();
    installGate.resolve(true);
    await Promise.all([i1, i2]);
    expect(native.installApk).toHaveBeenCalledTimes(1);
  });

  test('C2-10: pomodoroService starts timer and persists deadline even if POST_NOTIFICATIONS request rejects', async () => {
    const uid = createStudentUser('pomo', true);
    const origOS = Platform.OS;
    const origPlatformVersion = Platform.Version;
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'android',
    });
    Object.defineProperty(Platform, 'Version', {
      configurable: true,
      value: 34,
    });
    jest
      .spyOn(PermissionsAndroid, 'request')
      .mockRejectedValueOnce(new Error('permission dialog error'));
    const origFocus = NativeModules.LafinaFocus;
    NativeModules.LafinaFocus = {
      schedule: jest.fn(async () => true),
      cancel: jest.fn(async () => true),
    };
    try {
      const result = await applyPomodoro(uid, newPomodoro(), {starting: true});
      expect(result.state.deadline).not.toBeNull();
      expect(result.notice).toContain('Notifications are off');
      expect(readPomodoro(uid).deadline).toBe(result.state.deadline);
    } finally {
      Object.defineProperty(Platform, 'OS', {
        configurable: true,
        value: origOS,
      });
      Object.defineProperty(Platform, 'Version', {
        configurable: true,
        value: origPlatformVersion,
      });
      NativeModules.LafinaFocus = origFocus;
    }
  });

  test('C2-11: meetingTranscriber reports accurate completedChunks, skips local fallback on cancel, and preserves failed audio chunks', async () => {
    let cancelAfterElevenLabs = false;
    jest
      .spyOn(elevenlabsTranscriber, 'transcribeChunkWithElevenLabs')
      .mockImplementationOnce(async () => {
        cancelAfterElevenLabs = true;
        return null;
      });
    const whisperSpy = jest.spyOn(meetingRecorder, 'transcribeChunk');
    const deleteSpy = jest
      .spyOn(meetingRecorder, 'deleteAudioFile')
      .mockResolvedValue(true);

    const cancelledResult = await transcribeMeetingChunks({
      meetingId: 'm-cancel',
      chunkFiles: ['/tmp/c1.wav', '/tmp/c2.wav'],
      useElevenLabs: true,
      shouldCancel: () => cancelAfterElevenLabs,
    });
    expect(cancelledResult.cancelled).toBe(true);
    expect(cancelledResult.completedChunks).toBe(0);
    expect(whisperSpy).not.toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();

    // Failed chunk preserves its audio file while succeeded chunk deletes it.
    jest
      .spyOn(meetingRecorder, 'transcribeChunk')
      .mockResolvedValueOnce([{start_ms: 0, end_ms: 1000, text: 'Hello'}])
      .mockRejectedValueOnce(new Error('whisper error'));

    const partialResult = await transcribeMeetingChunks({
      meetingId: 'm-partial',
      chunkFiles: ['/tmp/ok.wav', '/tmp/fail.wav'],
      useElevenLabs: false,
    });
    expect(partialResult.completedChunks).toBe(1);
    expect(partialResult.failedChunks).toBe(1);
    expect(deleteSpy).toHaveBeenCalledTimes(1);
    expect(deleteSpy).toHaveBeenCalledWith('/tmp/ok.wav');
  });

  test('C2-13: notesPipeline removes abort listener after retry backoff wait', async () => {
    const controller = new AbortController();
    const removeSpy = jest.spyOn(controller.signal, 'removeEventListener');
    let calls = 0;
    const result = await generateMeetingNotes({
      segments: [{startMs: 0, endMs: 5000, text: 'Discuss exam review.'}],
      retryDelayMs: 5,
      signal: controller.signal,
      skill: {
        summarizeSection: jest.fn(),
        synthesizeNotes: jest.fn(async () => {
          calls += 1;
          if (calls === 1) {
            return {
              status: 'server_unavailable' as const,
              error: 'temporary outage',
            };
          }
          return {
            status: 'success' as const,
            data: {
              title: 'Exam Review',
              summary: 'Reviewed exam topics.',
              key_topics: [],
              decisions: [],
              action_items: [],
              important_dates: [],
              issues: [],
              unresolved_questions: [],
              key_points: ['Chapter 1'],
            },
          };
        }),
      },
    });
    expect(calls).toBe(2);
    expect(result.notes.title).toBe('Exam Review');
    expect(removeSpy).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  test('C2-14: onlineChatSkill.agentStep forwards AbortSignal and streamChatMessage refuses fallback after session change', async () => {
    createStudentUser('chat-agent', true);
    const controller = new AbortController();
    const requestSpy = jest
      .spyOn(cloudClient, 'request')
      .mockResolvedValueOnce({
        status: 'success',
        data: {reply: 'Done', toolCalls: []},
      });

    await onlineChatSkill.agentStep([{role: 'user', content: 'hi'}], {
      tools: [],
      exchange: [],
      signal: controller.signal,
    });
    expect(requestSpy).toHaveBeenCalledWith(
      '/v1/ai/chat/agent',
      expect.objectContaining({signal: controller.signal}),
      true,
    );

    const streamSpy = jest
      .spyOn(cloudClient, 'stream')
      .mockImplementationOnce(async () => {
        noteSessionChange();
        return {status: 'server_unavailable', error: 'stream dropped'};
      });
    const sendSpy = jest.spyOn(onlineChatSkill, 'sendChatMessage');

    const streamRes = await onlineChatSkill.streamChatMessage(
      [{role: 'user', content: 'hello'}],
      {onReplyText: jest.fn()},
    );
    expect(streamSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).not.toHaveBeenCalled();
    expect(streamRes.status).toBe('server_unavailable');
  });

  test('C2-17: modelManager prevents concurrent double-tap downloads across isOfflineModelEngineAvailable()', async () => {
    const origOS = Platform.OS;
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'android',
    });
    const origExtractor = NativeModules.LafinaIntentExtractor;
    const rnfsRec = RNFS as unknown as Record<string, unknown>;
    const origMoveFile = rnfsRec.moveFile;
    const origDownloadFile = rnfsRec.downloadFile;
    const engineGate = deferred<boolean>();
    const dlGate = deferred<{
      jobId: number;
      statusCode: number;
      bytesWritten: number;
    }>();
    NativeModules.LafinaIntentExtractor = {
      isEngineAvailable: jest.fn(() => engineGate.promise),
    };
    rnfsRec.moveFile = jest.fn(async () => undefined);
    const downloadSpy = jest.fn(() => ({
      jobId: 42,
      promise: dlGate.promise,
    }));
    rnfsRec.downloadFile = downloadSpy;
    jest.spyOn(RNFS, 'exists').mockResolvedValue(false);
    jest.spyOn(RNFS, 'mkdir').mockResolvedValue(undefined);
    jest.spyOn(RNFS, 'stat').mockResolvedValue({
      size: 105_000_000,
    } as unknown as RNFS.StatResult);
    jest.spyOn(RNFS, 'unlink').mockResolvedValue(undefined);

    try {
      const p1 = downloadOfflineModel('smollm2-135m');
      const p2 = downloadOfflineModel('smollm2-135m');
      await expect(p2).rejects.toThrow(/already downloading/i);
      expect(getActiveModelDownload()).not.toBeNull();
      engineGate.resolve(true);
      await new Promise(resolve => setTimeout(resolve, 20));
      dlGate.resolve({jobId: 42, statusCode: 200, bytesWritten: 105_000_000});
      const r1 = await p1;
      expect(downloadSpy).toHaveBeenCalledTimes(1);
      expect(typeof r1).toBe('string');
      expect(getActiveModelDownload()).toBeNull();
    } finally {
      Object.defineProperty(Platform, 'OS', {
        configurable: true,
        value: origOS,
      });
      NativeModules.LafinaIntentExtractor = origExtractor;
      rnfsRec.moveFile = origMoveFile;
      rnfsRec.downloadFile = origDownloadFile;
    }
  });

  test('C2-18: visionService treats errorCodes.OPERATION_CANCELED as clean cancellation', async () => {
    (pick as jest.Mock).mockRejectedValueOnce({
      code: errorCodes.OPERATION_CANCELED,
      message: 'User canceled',
    });
    await expect(visionService.pickImageFromGallery()).resolves.toBeNull();
  });

  test('C2-19: draftRegistry and actionService cap in-memory map/set sizes', () => {
    draftRegistry.clearAll();
    for (let i = 0; i < 125; i += 1) {
      draftRegistry.registerDraft({
        cardId: `card-${i}`,
        sessionId: 'sess-1',
        ownerId: 'u-1',
        revision: 1,
        kind: 'task',
        title: `Task ${i}`,
        details: [],
        assumptions: [],
        warnings: [],
      });
    }
    expect(draftRegistry.getDraft('card-0')).toBeUndefined();
    expect(draftRegistry.getDraft('card-124')).toBeDefined();

    for (let i = 0; i < 120; i += 1) {
      actionService.clearSessionActions(`retired-sess-${i}`);
    }
    const retired = (actionService as unknown as {retiredSessions: Set<string>})
      .retiredSessions;
    expect(retired.size).toBeLessThanOrEqual(100);
  });
});
