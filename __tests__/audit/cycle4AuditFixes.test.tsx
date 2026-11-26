import React from 'react';
import {act, render} from '@testing-library/react-native';
import {AppState, NativeModules, Platform} from 'react-native';
import {
  createMultiActionBatch,
  executeMultiActionBatch,
} from '../../src/ai/voiceActions/multiActionService';
import * as verifyDeliveryMod from '../../src/scheduler/verifyReminderDelivery';
import {SynthSplash} from '../../src/ui/splash/SynthSplash';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {intentService} from '../../src/ai/nlu/intentService';
import * as modelManager from '../../src/ai/nlu/modelManager';
import {
  endReviewSession,
  executeLowRiskCommand,
  undoLowRiskCommand,
} from '../../src/ai/nlu/commandReview';
import {parseIntentFastPath} from '../../src/ai/nlu/fastPathParser';
import {validateIntent} from '../../src/ai/nlu/types';
import {EwmaTracker, stepEwma} from '../../src/ai/ml/ewma';
import {
  extractStudentFeatures,
  getEwmaLatency,
  recordReminderInteraction,
} from '../../src/ai/ml/featureExtractor';
import {getAdaptiveGrowthInsights} from '../../src/ai/ml/timingAdvisor';
import {euclideanDistance} from '../../src/ai/ml/knn';
import {RandomForestEnsemble} from '../../src/ai/ml/randomForest';
import {answerCall, disconnectCall} from '../../src/scheduler/callDispatcher';
import {callClosingKind} from '../../src/cloud/voiceConversation/turnPolicy';
import {
  hasPersonalFileCleanup,
  runPersonalFileCleanup,
} from '../../src/storage/personalFileCleanup';
import {localSettingsStore} from '../../src/storage/localSettingsStore';
import * as reminderAlarm from '../../src/scheduler/reminderAlarm';
import {
  behaviorStore,
  db,
  initDatabase,
  notesStore,
  remindersStore,
  tasksStore,
  userStore,
} from '../../src/storage';

let seq = 0;
const createStudent = (prefix: string): string => {
  seq += 1;
  const id = `c4_${prefix}_${seq}`;
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT OR IGNORE INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
     VALUES (?, ?, ?, 'student', 0, 0, 0, 0, ?, ?)`,
    [id, id, `${id}@example.invalid`, now, now],
  );
  return id;
};

beforeAll(async () => {
  await initDatabase();
  userStore.createGuestUser();
});

afterEach(() => {
  jest.restoreAllMocks();
  endReviewSession();
  disconnectCall();
  jest.useRealTimers();
});

describe('Cycle 4 cross-cutting performance & reliability audit fixes', () => {
  test('C4-01: executeMultiActionBatch preserves saved status when verifyReminderDelivery throws after commit', async () => {
    const userId = createStudent('multi');
    jest
      .spyOn(verifyDeliveryMod, 'verifyReminderDelivery')
      .mockRejectedValue(new Error('native alarm verification crash'));

    const future = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const yyyy = future.getFullYear();
    const mm = String(future.getMonth() + 1).padStart(2, '0');
    const dd = String(future.getDate()).padStart(2, '0');
    const hh = String(future.getHours()).padStart(2, '0');
    const min = String(future.getMinutes()).padStart(2, '0');

    const batch = createMultiActionBatch('sess-c4', userId, [
      {
        id: 'rem-item-1',
        kind: 'reminder',
        title: 'Submit audit report',
        date: `${yyyy}-${mm}-${dd}`,
        time: `${hh}:${min}`,
        status: 'draft',
        savedEntityId: null,
        error: null,
      },
    ]);

    const outcome = await executeMultiActionBatch(batch, userId);
    const savedItem = outcome.batch.items[0];
    expect(outcome.batch.status).toBe('saved');
    expect(savedItem.status).toBe('saved');
    expect(savedItem.savedEntityId).toBeTruthy();
    expect(savedItem.deliveryStatus).toBe('unavailable');
    expect(
      remindersStore.getReminderById(savedItem.savedEntityId!),
    ).toBeTruthy();
  });

  test('C4-02: SynthSplash fires onFinished at most once and pauses RAF when backgrounded', () => {
    jest.useFakeTimers();
    let appStateHandler: ((state: string) => void) | null = null;
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_event, handler) => {
        appStateHandler = handler as (state: string) => void;
        return {remove: jest.fn()};
      });

    const onFinished = jest.fn();
    const utils = render(
      <ThemeProvider userId={null}>
        <SynthSplash ready={true} onFinished={onFinished} />
      </ThemeProvider>,
    );

    act(() => {
      appStateHandler?.('background');
      jest.advanceTimersByTime(5000);
    });
    expect(onFinished).toHaveBeenCalledTimes(1);

    // Re-rendering after finish must not invoke onFinished a second time.
    utils.rerender(
      <ThemeProvider userId={null}>
        <SynthSplash ready={true} onFinished={onFinished} />
      </ThemeProvider>,
    );
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(onFinished).toHaveBeenCalledTimes(1);
    utils.unmount();
  });

  test('C4-03: intentService skips native SLM invocation when signal aborts during model config read', async () => {
    const controller = new AbortController();
    const extractMock = jest.fn(async () => '{"engine":"slm"}');
    const origExtractor = (NativeModules as Record<string, unknown>)
      .LafinaIntentExtractor;
    const origPlatform = Platform.OS;
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'android',
    });
    (NativeModules as Record<string, unknown>).LafinaIntentExtractor = {
      extractIntent: extractMock,
      cancelExtraction: jest.fn(),
    };
    jest
      .spyOn(modelManager, 'getActiveOfflineModelReadyConfig')
      .mockImplementation(async () => {
        controller.abort();
        return {
          modelId: 'smollm2_360m_q4',
          modelPath: '/models/mock.gguf',
          promptFormat: 'chatml',
          minValidSizeBytes: 1024,
        } as never;
      });

    try {
      const result = await intentService.extractIntent(
        'pa-remind bukas ng 8pm mag-aral',
        {
          signal: controller.signal,
          preferOnDeviceSlm: true,
        },
      );
      expect(result.source).toBe('fast_path');
      expect(extractMock).not.toHaveBeenCalled();
    } finally {
      (NativeModules as Record<string, unknown>).LafinaIntentExtractor =
        origExtractor;
      Object.defineProperty(Platform, 'OS', {
        configurable: true,
        value: origPlatform,
      });
    }
  });

  test('C4-04: undoLowRiskCommand preserves owner entry on foreign probe and update_note inverse avoids notesStore.getAll', () => {
    const userId = createStudent('undo');
    notesStore.insert({
      id: 'c4-note-1',
      userId,
      title: 'Physics Formulas',
      body: 'Initial content',
      isPinned: false,
      tags: [],
      category: 'Personal',
      isVoiceTranscribed: false,
      imageUri: null,
      sortOrder: 0,
    });

    const getAllSpy = jest.spyOn(notesStore, 'getAll');
    const validated = validateIntent(
      parseIntentFastPath('Pin note Physics Formulas'),
    );
    const executed = executeLowRiskCommand(userId, validated);
    expect(executed?.status).toBe('applied');
    // O(1) transactional SELECT inside inverseOf('update_note') must NOT scan all notes via notesStore.getAll.
    expect(getAllSpy.mock.calls.length).toBeLessThanOrEqual(1);

    const token =
      executed && executed.status === 'applied' ? executed.undo?.token : null;
    expect(token).toBeTruthy();

    // Another user probing the undo token must be refused WITHOUT deleting the owner's undo entry.
    expect(undoLowRiskCommand('foreign-user', token!).status).toBe('refused');
    expect(undoLowRiskCommand(userId, token!).status).toBe('undone');
  });

  test('C4-05: ML pipeline resists NaN/Infinity poisoning and avoids full-table scans', () => {
    const userId = createStudent('ml');
    // EWMA numerical safety
    expect(stepEwma(60, Number.POSITIVE_INFINITY, 0.3)).toBe(60);
    expect(stepEwma(60, Number.NaN, 0.3)).toBe(60);
    const tracker = new EwmaTracker({alpha: 0.3, initialValue: 50});
    expect(tracker.observe(40)).toBe(40);
    expect(tracker.observe(Number.NaN)).toBe(40);
    expect(tracker.observe(Number.POSITIVE_INFINITY)).toBe(40);

    // KNN distance safety against corrupt vectors
    const dist = euclideanDistance([0.5, Number.NaN], [0.5, 0.2]);
    expect(Number.isFinite(dist)).toBe(true);

    // RandomForest regression safety against Infinity leaf
    const rf = new RandomForestEnsemble({
      treePoolSize: 1,
      featureDimension: 1,
      trees: [
        {
          id: 'inf-tree',
          root: {isLeaf: true, prediction: Number.POSITIVE_INFINITY},
        },
      ],
    });
    expect(rf.regress([0.5], 0).predictedValue).toBe(0);

    // recordReminderInteraction ignores Infinity latency and keeps valid EWMA
    recordReminderInteraction(userId, {
      reminderId: 'r-1',
      outcome: 'acknowledged',
      latencySeconds: 30,
    });
    const beforeInf = getEwmaLatency(userId);
    recordReminderInteraction(userId, {
      reminderId: 'r-2',
      outcome: 'acknowledged',
      latencySeconds: Number.POSITIVE_INFINITY,
    });
    expect(getEwmaLatency(userId)).toBe(beforeInf);

    // extractStudentFeatures computes academicLoad via COUNT(*) without tasksStore.getAllTasks
    tasksStore.insertTask({
      id: 'c4-task-1',
      userId,
      title: 'Pending task',
      dueDate: '2030-05-01',
      dueTime: null,
      isCompleted: false,
      priority: 'Medium',
      category: 'Academic',
      notes: null,
    });
    const getAllTasksSpy = jest.spyOn(tasksStore, 'getAllTasks');
    const features = extractStudentFeatures(userId, {targetDate: '2030-05-02'});
    expect(features.academicLoad).toBe(1);
    expect(getAllTasksSpy).not.toHaveBeenCalled();

    // getAdaptiveGrowthInsights scans behavior logs once (not twice)
    const getLogsSpy = jest.spyOn(behaviorStore, 'getBehaviorLogs');
    getAdaptiveGrowthInsights(userId);
    expect(getLogsSpy).toHaveBeenCalledTimes(1);
  });

  test('C4-06: callDispatcher answerCall tolerates native finishNativeIncomingCall rejection without throwing', async () => {
    const userId = createStudent('call');
    const reminderId = 'c4-rem-1';
    const triggerAt = new Date(Date.now() + 60_000).toISOString();
    remindersStore.insertReminder({
      id: reminderId,
      userId,
      task: 'Lab submission',
      description: null,
      scheduledAt: triggerAt,
      triggerAt,
      status: 'pending',
      preCastAudioPath: null,
    });
    jest
      .spyOn(reminderAlarm, 'finishNativeIncomingCall')
      .mockRejectedValue(new Error('IPC busy'));

    const accepted = await answerCall(
      reminderId,
      userId,
      false,
      undefined,
      undefined,
      false,
      {buttonsOnly: true},
    );
    expect(accepted).toBe(true);
  });

  test('C4-07: turnPolicy closing matcher avoids ReDoS on multi-word phrases while preserving classification', () => {
    expect(callClosingKind('sige bye')).toBe('goodbye');
    expect(callClosingKind('salamat po')).toBe('thanks');
    expect(callClosingKind('bye for now')).toBe('goodbye');
    expect(callClosingKind('see you later')).toBe('goodbye');

    const started = Date.now();
    for (const phrase of [
      'sige bye ',
      'salamat po ',
      'bye for now ',
      'see you later ',
      'bye ',
    ]) {
      expect(callClosingKind(`${phrase.repeat(25)}wait`)).toBe('none');
    }
    expect(Date.now() - started).toBeLessThan(100);
  });

  test('C4-08: runPersonalFileCleanup reports pending: null on corrupt JSON consistent with hasPersonalFileCleanup', async () => {
    const userId = createStudent('cleanup');
    localSettingsStore.set(userId, 'dataReset.fileCleanup.v1', '{broken-json');
    expect(hasPersonalFileCleanup(userId)).toBe(true);
    const result = await runPersonalFileCleanup(userId, () => true);
    expect(result.pending).toBeNull();
  });
});
