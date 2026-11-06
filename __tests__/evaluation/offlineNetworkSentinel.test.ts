/**
 * AGY-PORT 12: runtime proof that offline flows reach no network API.
 *
 * Complements the static boundary check (scripts/offline-boundary.cjs): every
 * network global is replaced by a sentinel that records and throws. The flows
 * run with the device reported ONLINE, so a local path cannot pass simply
 * because a cloud call was skipped for being offline. A positive control
 * shows the same sentinel does catch a real cloud request, so a silent
 * sentinel means "no network attempted", not "sentinel not wired".
 *
 * Native alarm registration is a Jest spy here; this proves what the JS
 * layer does, not that Android rang. Synthetic data only.
 */
import {
  db,
  initDatabase,
  notesQueryStore,
  tasksStore,
  userStore,
} from '../../src/storage';
import {plannerQueries} from '../../src/storage/plannerQueries';
import * as reminderAlarm from '../../src/scheduler/reminderAlarm';
import {parseIntentFastPath} from '../../src/ai/nlu/fastPathParser';
import {intentService} from '../../src/ai/nlu/intentService';
import {validateIntent} from '../../src/ai/nlu/types';
import {
  confirmReviewedCommand,
  endReviewSession,
  prepareReviewedCommand,
} from '../../src/ai/nlu/commandReview';
import {executeNluAction} from '../../src/ai/nlu/actionExecutor';
import {chatOrchestrator} from '../../src/ai/chatOrchestrator';
import {cloudClient, setMockOnlineState} from '../../src/cloud/cloudClient';
import {
  eligibleOfflineVoices,
  selectOfflineVoice,
} from '../../src/ai/tts/ttsService';

type Hit = {api: string; detail: string};

const installSentinels = () => {
  const hits: Hit[] = [];
  const g = globalThis as Record<string, unknown>;
  const saved = {
    fetch: g.fetch,
    XMLHttpRequest: g.XMLHttpRequest,
    WebSocket: g.WebSocket,
    EventSource: g.EventSource,
  };
  g.fetch = (input: unknown) => {
    hits.push({api: 'fetch', detail: String(input)});
    // Marked handled so a fire-and-forget call cannot crash the worker before
    // the hit is reported; an awaiting caller still sees the rejection.
    const rejected = Promise.reject(new Error('network sentinel: fetch'));
    rejected.catch(() => undefined);
    return rejected;
  };
  const trap = (api: string) =>
    function Trap(this: unknown, url?: unknown) {
      hits.push({api, detail: String(url)});
      throw new Error(`network sentinel: ${api}`);
    };
  g.XMLHttpRequest = trap('XMLHttpRequest');
  g.WebSocket = trap('WebSocket');
  g.EventSource = trap('EventSource');
  return {
    hits,
    restore: () => {
      for (const [key, value] of Object.entries(saved)) g[key] = value;
    },
  };
};

const OWNER = 'p12-sentinel-owner';
const CLOCK = new Date(2026, 6, 6, 12, 0, 0);

describe('AGY-PORT 12 offline flows make zero network calls', () => {
  let sentinels: ReturnType<typeof installSentinels>;

  beforeAll(async () => {
    await initDatabase();
    const now = new Date().toISOString();
    db.executeSync(
      `INSERT INTO users (id, username, email, role, is_new_user, created_at, updated_at)
       VALUES (?, ?, ?, 'student', 0, ?, ?)`,
      [OWNER, OWNER, `${OWNER}@example.invalid`, now, now],
    );
    userStore.setCurrentUser(OWNER);
  });

  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest
      .spyOn(reminderAlarm, 'scheduleReminderAlarm')
      .mockResolvedValue(undefined);
    jest
      .spyOn(reminderAlarm, 'cancelReminderAlarm')
      .mockResolvedValue(undefined);
    setMockOnlineState(true);
    sentinels = installSentinels();
  });

  afterEach(() => {
    sentinels.restore();
    setMockOnlineState(null);
    jest.restoreAllMocks();
    endReviewSession();
  });

  test('positive control: a cloud request trips the sentinel', async () => {
    const result = await cloudClient.request('/v1/health', {}, false);
    expect(result.status).not.toBe('ok');
    expect(sentinels.hits.length).toBeGreaterThan(0);
    expect(sentinels.hits[0].api).toBe('fetch');
  });

  test('parse, review and confirm every create intent offline', async () => {
    const commands = [
      'remind me to submit the lab report tomorrow at 8 am',
      'add task buy groceries',
      'schedule study session tomorrow from 2 pm to 4 pm',
      'take a note buy index cards',
    ];
    // Confirm checks the real clock, so these use "now" rather than CLOCK.
    const now = new Date();
    for (const command of commands) {
      const extracted = await intentService.extractIntent(command, {
        referenceDate: now,
      });
      expect(extracted.source).toBe('fast_path');
      const prepared = prepareReviewedCommand(OWNER, extracted, {
        referenceDate: now,
      });
      expect([command, prepared.status]).toEqual([command, 'proposal']);
      if (prepared.status !== 'proposal') continue;
      const confirmed = confirmReviewedCommand(
        OWNER,
        prepared.proposal.operationId,
      );
      expect(confirmed.status).toBe('applied');
    }
    expect(tasksStore.getAllTasks(OWNER).map(task => task.title)).toContain(
      'Buy groceries',
    );
    expect(sentinels.hits).toEqual([]);
  });

  test('update, delete, acknowledge, snooze and query execute offline', async () => {
    const commands = [
      'mark task buy groceries as done',
      'what is on my schedule tomorrow',
      'delete note buy index cards',
      'acknowledged',
      'snooze for 10 minutes',
    ];
    for (const command of commands) {
      const validated = validateIntent(parseIntentFastPath(command, CLOCK));
      const result = await executeNluAction(OWNER, validated, {
        referenceDate: CLOCK,
      });
      expect(typeof result.reply).toBe('string');
    }
    expect(sentinels.hits).toEqual([]);
  });

  test('Chat with a local command proposes a review without the network', async () => {
    const result = await chatOrchestrator.processMessage(
      OWNER,
      'add task read chapter 5',
      {referenceDate: CLOCK},
    );
    expect(result.review?.status).toBe('proposal');
    expect(sentinels.hits).toEqual([]);
  });

  test('planner window, Notes search and voice eligibility read offline', () => {
    const window = plannerQueries.window(OWNER, '2026-07-06', '2026-07-12');
    expect(Array.isArray(window.tasks)).toBe(true);
    let page = notesQueryStore.page({userId: OWNER, search: 'index'});
    for (let i = 0; page.indexing && i < 10; i += 1) {
      page = notesQueryStore.page({userId: OWNER, search: 'index'});
    }
    expect(page.indexing).toBe(false);
    const voices = [
      {
        id: 'v',
        name: 'v',
        language: 'en-US',
        quality: 300,
        notInstalled: false,
        networkConnectionRequired: false,
      },
    ];
    expect(eligibleOfflineVoices(voices)).toHaveLength(1);
    expect(selectOfflineVoice(voices)?.id).toBe('v');
    expect(sentinels.hits).toEqual([]);
  });
});
