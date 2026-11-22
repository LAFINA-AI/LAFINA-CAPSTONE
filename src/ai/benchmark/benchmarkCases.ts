/**
 * Developer benchmark cases. Expectations come from the app's own contracts
 * (intent routes, review statuses, parser date/time rules) and check
 * structured results only, never the exact wording of a generated reply.
 */
import type {ExecutionPath} from './requestTrace';

/** Bumped whenever a case, prompt or expectation changes. */
export const BENCHMARK_SUITE_VERSION = 'devbench-1.0.0';

export type BenchmarkMode = 'offline' | 'online';

export type CaseCategory =
  | 'greeting'
  | 'reminder'
  | 'task_proposal'
  | 'date_time'
  | 'varied_wording'
  | 'ambiguous'
  | 'unsupported'
  | 'read_only'
  | 'repeated'
  | 'missing_model'
  | 'online_failure'
  | 'note_proposal'
  | 'custom';

/** A date the parser must produce, relative to the run's reference date. */
export type ExpectedDate =
  | {kind: 'offsetDays'; days: number}
  /** The next given weekday (0 = Sunday), today included, within 7 days. */
  | {kind: 'weekdayWithinWeek'; weekday: number};

export interface CaseExpectation {
  /** Acceptable final intents. */
  intents?: readonly string[];
  /** Acceptable orchestrator routes. */
  routes?: readonly string[];
  /**
   * Review state: a proposal card, a clarifying question (clarify or a
   * refused/invalid request), or no planner card at all.
   */
  review?: 'proposal' | 'clarify' | 'none';
  /** Acceptable proposal intents when a card is expected. */
  proposalIntents?: readonly string[];
  date?: ExpectedDate;
  time?: string;
  endTime?: string;
  /** The offline model must have produced the answer (UNAVAILABLE when no model is installed). */
  requiresOfflineModel?: boolean;
  /** Acceptable execution paths. */
  paths?: readonly ExecutionPath[];
  /** The online provider must have written the reply. */
  requiresOnlineProvider?: boolean;
  /** Structured result must match the earlier case with this id. */
  sameStructureAs?: string;
}

export interface BenchmarkCase {
  id: string;
  name: string;
  category: CaseCategory;
  prompt: string;
  /** Modes this case runs in. */
  modes: readonly BenchmarkMode[];
  /** Per-mode expectations. */
  expect: Partial<Record<BenchmarkMode, CaseExpectation>>;
  /**
   * SIMULATED failure: labelled in results and excluded from real-provider
   * latency aggregates.
   */
  simulate?: {missingModel?: boolean; onlineFailure?: 'offline'};
  /** The custom prompt case: text is redacted from exports unless included. */
  custom?: boolean;
}

const REMINDER_PROMPT = 'Remind me to submit my thesis tomorrow at 9 AM';

const reminderExpectation: CaseExpectation = {
  intents: ['create_reminder'],
  routes: ['reviewed_mutation'],
  review: 'proposal',
  proposalIntents: ['create_reminder'],
  date: {kind: 'offsetDays', days: 1},
  time: '09:00',
};

const CASES: Record<string, BenchmarkCase> = {
  greeting: {
    id: 'greeting',
    name: 'Greeting',
    category: 'greeting',
    prompt: 'Hello',
    modes: ['offline', 'online'],
    expect: {
      offline: {
        intents: ['chat'],
        routes: ['conversation'],
        review: 'none',
        paths: ['fast_path'],
      },
      online: {
        intents: ['chat'],
        routes: ['conversation'],
        review: 'none',
        requiresOnlineProvider: true,
      },
    },
  },
  reminder: {
    id: 'reminder',
    name: 'Simple reminder',
    category: 'reminder',
    prompt: REMINDER_PROMPT,
    modes: ['offline', 'online'],
    expect: {offline: reminderExpectation, online: reminderExpectation},
  },
  task: {
    id: 'task',
    name: 'Task creation proposal',
    category: 'task_proposal',
    prompt: 'Add a task to finish the lab report due Friday at 5 PM',
    modes: ['offline', 'online'],
    expect: {
      offline: {
        intents: ['create_task'],
        routes: ['reviewed_mutation'],
        review: 'proposal',
        proposalIntents: ['create_task'],
        date: {kind: 'weekdayWithinWeek', weekday: 5},
        time: '17:00',
      },
      online: {
        intents: ['create_task'],
        routes: ['reviewed_mutation'],
        review: 'proposal',
        proposalIntents: ['create_task'],
        date: {kind: 'weekdayWithinWeek', weekday: 5},
        time: '17:00',
      },
    },
  },
  datetime: {
    id: 'datetime',
    name: 'Date/time interpretation',
    category: 'date_time',
    prompt: 'Schedule a study block tomorrow from 7 PM to 9 PM',
    modes: ['offline', 'online'],
    expect: {
      offline: {
        intents: ['create_time_block'],
        routes: ['reviewed_mutation'],
        review: 'proposal',
        proposalIntents: ['create_time_block'],
        date: {kind: 'offsetDays', days: 1},
        time: '19:00',
        endTime: '21:00',
      },
      online: {
        intents: ['create_time_block'],
        routes: ['reviewed_mutation'],
        review: 'proposal',
        proposalIntents: ['create_time_block'],
        date: {kind: 'offsetDays', days: 1},
        time: '19:00',
        endTime: '21:00',
      },
    },
  },
  varied: {
    id: 'varied',
    name: 'Varied wording (offline model)',
    category: 'varied_wording',
    prompt: 'pa-remind ako mag-aral bukas ng 7pm',
    modes: ['offline'],
    expect: {
      offline: {
        intents: ['create_reminder', 'create_task', 'create_time_block'],
        routes: ['reviewed_mutation'],
        review: 'proposal',
        date: {kind: 'offsetDays', days: 1},
        time: '19:00',
        requiresOfflineModel: true,
      },
    },
  },
  ambiguous: {
    id: 'ambiguous',
    name: 'Ambiguous request asks first',
    category: 'ambiguous',
    prompt: 'Remind me tomorrow',
    modes: ['offline', 'online'],
    expect: {
      offline: {
        intents: ['create_reminder'],
        review: 'clarify',
      },
      online: {review: 'clarify'},
    },
  },
  unsupported: {
    id: 'unsupported',
    name: 'Unsupported request',
    category: 'unsupported',
    prompt: 'Turn on the flashlight',
    modes: ['offline', 'online'],
    expect: {
      offline: {
        intents: ['chat', 'out_of_scope'],
        routes: ['conversation'],
        review: 'none',
      },
      online: {routes: ['conversation'], review: 'none'},
    },
  },
  readonly: {
    id: 'readonly',
    name: 'Read-only planner query',
    category: 'read_only',
    prompt: 'What is my schedule for today?',
    modes: ['offline', 'online'],
    expect: {
      offline: {
        intents: ['query_schedule'],
        routes: ['read_only'],
        review: 'none',
        date: {kind: 'offsetDays', days: 0},
      },
      online: {
        intents: ['query_schedule'],
        routes: ['read_only'],
        review: 'none',
        date: {kind: 'offsetDays', days: 0},
      },
    },
  },
  repeated: {
    id: 'repeated',
    name: 'Repeated request',
    category: 'repeated',
    prompt: REMINDER_PROMPT,
    modes: ['offline', 'online'],
    expect: {
      offline: {...reminderExpectation, sameStructureAs: 'reminder'},
      online: {...reminderExpectation, sameStructureAs: 'reminder'},
    },
  },
  note: {
    id: 'note',
    name: 'Note proposal',
    category: 'note_proposal',
    prompt: 'Create a note about operating system semaphores',
    modes: ['offline', 'online'],
    expect: {
      offline: {
        intents: ['create_note'],
        routes: ['reviewed_mutation'],
        review: 'proposal',
        proposalIntents: ['create_note'],
      },
      online: {
        intents: ['create_note'],
        routes: ['reviewed_mutation'],
        review: 'proposal',
        proposalIntents: ['create_note'],
      },
    },
  },
  missingModel: {
    id: 'missingModel',
    name: 'Missing offline model (SIMULATED)',
    category: 'missing_model',
    prompt: 'pa-remind ako mag-aral bukas ng 7pm',
    modes: ['offline'],
    simulate: {missingModel: true},
    expect: {
      offline: {
        // The parser still answers when no model is installed.
        intents: ['create_reminder', 'create_task', 'create_time_block'],
        routes: ['reviewed_mutation'],
        review: 'proposal',
        date: {kind: 'offsetDays', days: 1},
        time: '19:00',
        paths: ['fast_path'],
      },
    },
  },
  onlineFailure: {
    id: 'onlineFailure',
    name: 'Online failure falls back (SIMULATED)',
    category: 'online_failure',
    prompt: 'Hello',
    // Runs with Online Mode requested; no request is actually sent.
    modes: ['online'],
    simulate: {onlineFailure: 'offline'},
    expect: {
      online: {
        intents: ['chat'],
        routes: ['conversation'],
        review: 'none',
        paths: ['fallback'],
      },
    },
  },
};

export type SuiteId = 'quick_offline' | 'quick_online' | 'compare' | 'extended';

export interface SuiteDefinition {
  id: SuiteId;
  name: string;
  /** Case ids in run order. */
  caseIds: readonly string[];
  /** Modes the suite runs each case in (cases skip modes they do not list). */
  modes: readonly BenchmarkMode[];
  defaultRepeats: number;
}

export const SUITES: Record<SuiteId, SuiteDefinition> = {
  quick_offline: {
    id: 'quick_offline',
    name: 'Quick Offline Test',
    caseIds: [
      'greeting',
      'reminder',
      'task',
      'datetime',
      'varied',
      'ambiguous',
      'unsupported',
      'readonly',
      'repeated',
      'missingModel',
    ],
    modes: ['offline'],
    defaultRepeats: 1,
  },
  quick_online: {
    id: 'quick_online',
    name: 'Quick Online Test',
    caseIds: [
      'greeting',
      'reminder',
      'ambiguous',
      'unsupported',
      'readonly',
      'onlineFailure',
    ],
    modes: ['online'],
    defaultRepeats: 1,
  },
  compare: {
    id: 'compare',
    name: 'Compare Supported Commands',
    caseIds: ['reminder', 'task', 'datetime', 'readonly', 'note'],
    modes: ['offline', 'online'],
    defaultRepeats: 1,
  },
  extended: {
    id: 'extended',
    name: 'Extended Suite',
    caseIds: [
      'greeting',
      'reminder',
      'task',
      'datetime',
      'varied',
      'ambiguous',
      'unsupported',
      'readonly',
      'repeated',
      'note',
      'missingModel',
      'onlineFailure',
    ],
    modes: ['offline', 'online'],
    defaultRepeats: 3,
  },
};

export const MAX_REPEATS = 10;

export const getCase = (id: string): BenchmarkCase | null => CASES[id] ?? null;

export const listCases = (): readonly BenchmarkCase[] => Object.values(CASES);

/** A one-off case for "Run Custom Prompt": timed and checked for safety only. */
export const customCase = (
  prompt: string,
  mode: BenchmarkMode,
): BenchmarkCase => ({
  id: 'custom',
  name: 'Custom prompt',
  category: 'custom',
  prompt,
  modes: [mode],
  expect: {[mode]: {}},
  custom: true,
});

export interface PlannedAttempt {
  testCase: BenchmarkCase;
  mode: BenchmarkMode;
  repeatIndex: number;
}

/** The exact sequence a suite will run, in order. */
export const planSuite = (
  suite: SuiteDefinition,
  options: {repeats?: number; modes?: readonly BenchmarkMode[]} = {},
): PlannedAttempt[] => {
  const repeats = Math.min(
    MAX_REPEATS,
    Math.max(1, Math.floor(options.repeats ?? suite.defaultRepeats)),
  );
  const modes = (options.modes ?? suite.modes).filter(m =>
    suite.modes.includes(m),
  );
  const planned: PlannedAttempt[] = [];
  for (const mode of modes) {
    for (let r = 0; r < repeats; r++) {
      for (const id of suite.caseIds) {
        const testCase = CASES[id];
        if (testCase && testCase.modes.includes(mode)) {
          planned.push({testCase, mode, repeatIndex: r});
        }
      }
    }
  }
  return planned;
};

/** Requests that reach the online provider (simulated failures send none). */
export const countProviderRequests = (
  planned: readonly PlannedAttempt[],
): number =>
  planned.filter(
    p => p.mode === 'online' && !p.testCase.simulate?.onlineFailure,
  ).length;
