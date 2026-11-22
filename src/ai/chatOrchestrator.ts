import {DeviceEventEmitter} from 'react-native';
import {
  chatStore,
  type ChatAttachment,
  type ChatMessage,
  type ChatReviewResolutionStatus,
} from '../storage/chatStore';
import {chatReplyFormatStore} from '../storage/chatReplyFormatStore';
import {chatMemoryStore} from '../storage/chatMemoryStore';
import {
  memoriesForPrompt,
  reconcileClearedMemories,
} from '../storage/onboardingMemory';
import {
  captureUstpEligibility,
  getUstpEligibility,
  ustpUnavailableMessage,
} from '../storage/ustpEligibility';
import {replyPreferenceInstruction} from './personalization';
import {
  CHAT_MEMORY_CHANGED_EVENT,
  chatMemoryService,
} from '../cloud/chatMemoryService';
import {directProviderTestEnabled} from '../cloud/directProviderTest';
import {isForgetAllMemoriesRequest} from './chatMemoryCommands';
import {studyPreference} from './studyPreference';
import {explicitMemory} from './explicitMemory';
import {db} from '../storage/database';
import {plannerQueries} from '../storage/plannerQueries';
import type {PlannerWindow} from '../storage/plannerQueries';
import {addDaysToDate, isRealDate, MINUTES_PER_DAY} from '../storage/eventTime';
import {
  handbookSourceLabel,
  onlineChatSkill,
  type OnlineChatMessage,
} from '../skills/onlineChatSkill';
import {buildStudentVoiceContext} from '../cloud/voiceConversation/localVoiceData';
import {parseScannedSchedule} from './vision/scheduleParser';
import {intentService} from './nlu/intentService';
import {addMinutesToTime, executeNluAction} from './nlu/actionExecutor';
import {routeIntent} from './nlu/intentRoutes';
import type {ResolvedIntentRoute, RingingCallContext} from './nlu/intentRoutes';
import {
  cancelReviewedCommand,
  confirmReviewedCommand,
  executeLowRiskCommand,
  formatResolvedReviewContent,
  latestPendingReview,
  planLowRiskCommand,
  prepareReviewedCommand,
  reviseReviewedCommand,
  undoLowRiskCommand,
} from './nlu/commandReview';
import type {
  ExecuteLowRiskResult,
  LowRiskDryRun,
  UndoOffer,
  UndoResult,
} from './nlu/commandReview';
import {monotonicNow, type RequestTrace} from './benchmark/requestTrace';
import {
  createMultiActionBatch,
  parseGroupedRequest,
  splitGroupedClauses,
} from './voiceActions/multiActionService';
import type {
  MultiActionBatchData,
  MultiActionItemData,
} from './voiceActions/types';
import {generateId} from '../utils';
import type {
  ConfirmResult,
  PrepareResult,
  ReviewSurface,
} from './nlu/commandReview';
import {
  acknowledgeReminderAction,
  snoozeReminderAction,
} from '../scheduler/reminderActions';
import {formatLocalDate} from './nlu/fastPathParser';
import {ttsService} from './tts/ttsService';
import {
  buildLocalConversationReply,
  classifySmallTalk,
  OFFLINE_REPLY_NOTE,
  SIGNED_OUT_REPLY_NOTE,
} from './localConversation';
import type {ValidatedIntent, NluActionResult} from './nlu/types';
import {runChatAgent} from './chatAgent';
import {
  isReferenceRequest,
  isShortReferenceFollowUp,
} from './voiceActions/structuredAction';
import {
  extractIntentWithDeepSeek,
  extractHandbookClause,
  extractMultiIntentsWithDeepSeek,
  isHandbookQuestion,
  shouldUseOnlineIntentExtraction,
} from './onlineIntentExtractor';
import {
  buildPromptHandbookContext,
  formatOfflineHandbookReply,
  LOCAL_NO_EVIDENCE_REPLY,
  localHandbookService,
  type OnlineHandbookContext,
} from '../handbook';
import {detectSkillIntent} from './skills/skillIntent';
import type {SkillIntent} from './skills/skillIntent';
import {
  prepareSkillLaunch,
  skillControlLine,
  skillStatusLine,
} from './skills/skillHandoff';
import {skillTitle} from '../skills/skillLaunch';
import type {SkillLaunch} from '../skills/skillLaunch';

export interface ScheduleConflict {
  hasConflict: boolean;
  conflictingTitle?: string;
  conflictingStartTime?: string;
  conflictingEndTime?: string;
  conflictingType?: 'time_block' | 'event';
}

export interface TimeSlot {
  startTime: string; // HH:mm
  endTime: string; // HH:mm
}

export interface ProcessMessageOptions {
  referenceDate?: Date;
  speakReply?: boolean;
  onlineMode?: boolean;
  useHandbook?: boolean;
  /** Which review card shows a proposal (AGY-PORT 04). Defaults to Chat. */
  reviewSurface?: ReviewSurface;
  /**
   * Identity captured by a ringing reminder call. Only then do acknowledge and
   * snooze act immediately, through the call actions with that identity.
   */
  ringingCall?: RingingCallContext | null;
  /**
   * Online conversation only: receives DeepSeek's reply while it is being
   * written, so the screen can show it word by word. Only the finished reply
   * is saved. Without it the reply arrives in one piece.
   */
  onReplyText?: (replySoFar: string) => void;
  /** Temporary chat mode: does not save messages or update memories in SQLite. */
  temporaryChat?: boolean;
  temporaryHistory?: ChatMessage[];
  /** Dedicated USTP Student Handbook RAG mode: routes straight to handbook Q&A. */
  ustpRagOnly?: boolean;
  /**
   * False once the student has moved on (switched account or chat). A
   * multi-step agent turn then abandons any card it prepared (audit M1).
   */
  isCurrent?: () => boolean;
  /**
   * Longest wait for the offline model in Chat; the parser answers after it.
   * See IntentExtractionOptions.slmTimeoutMs.
   */
  slmTimeoutMs?: number;
  /**
   * Called once the student's message is saved, before any thinking, so
   * Chat can show it at once instead of after the reply.
   */
  onUserMessage?: (message: ChatMessage) => void;
  /**
   * Developer timing for this one request. Only Chat (with Developer Mode
   * and performance tracking on) and the Developer benchmark pass one.
   */
  trace?: RequestTrace | null;
  /** Stops waiting for the online reply or the offline model. */
  signal?: AbortSignal;
  /**
   * Developer benchmark isolation (see BenchmarkIsolation). Never set by
   * product screens.
   */
  benchmark?: BenchmarkIsolation | null;
}

/**
 * A Developer benchmark request. It runs the normal parsing and routing but
 * cannot change the student's data: it never saves chat messages (it runs as
 * a temporary chat), never applies a planner change (low-risk changes are
 * worked out and reported, not applied; proposals stay unconfirmed for the
 * runner to cancel), never saves, forgets or marks memories, never pauses or
 * resumes a skill, never decides an open review card and never speaks.
 * Every skipped stage is listed in the trace's `bypassed`.
 */
export interface BenchmarkIsolation {
  readonly runId: string;
  /** SIMULATED: behave as if no offline model were installed. */
  readonly simulateMissingModel?: boolean;
  /** SIMULATED: the online reply fails with this status; no request is sent. */
  readonly simulateOnlineFailure?: 'offline' | 'server_unavailable';
}

/** Reply text for a stage a benchmark skipped on purpose. */
export const benchmarkSkippedReply = (what: string): string =>
  `Benchmark: ${what} was skipped. Nothing was changed.`;

/** Offline Chat waits this long for the on-device model; the parser answers after. */
export const CHAT_OFFLINE_SLM_TIMEOUT_MS = 10_000;

/** Added when DeepSeek stops part-way, so a cut-off reply is never mistaken for a full one. */
export const INTERRUPTED_REPLY_NOTE =
  '(The reply was cut off before it finished. Ask again to get the rest.)';

/** Outcome of Confirm or Cancel on a review card. */
export interface ReviewDecisionResult {
  /** Present for Confirm; absent for Cancel. */
  outcome?: ConfirmResult;
  cancelled?: boolean;
  /** The transcript line saved for this decision, when one was saved. */
  assistantMessage: ChatMessage | null;
  reply: string;
}

export interface ChatOrchestratorResult {
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  intent: ValidatedIntent;
  actionResult?: NluActionResult;
  /** An immediate change that can be reversed from a snackbar. */
  undo?: UndoOffer;
  attachment?: ChatAttachment | null;
  handbookNote?: string | null;
  usedOnline?: boolean;
  /** Route taken for the extracted intent (AGY-PORT 04). */
  route?: ResolvedIntentRoute;
  /** Present when the request would change the planner: a proposal, clarification or refusal. Nothing was written. */
  review?: PrepareResult;
  /** Present when a compound request was parsed into a grouped multi-action review card. */
  multiBatch?: MultiActionBatchData;
  /** Set when a conversational reply confirmed, revised, or cancelled an open review card. */
  resolvedReview?: {
    operationId: string;
    status: 'applied' | 'cancelled' | 'refused';
  };
  reply: string;
  /** A natural sentence to speak instead of the Markdown `reply` (audit M6). */
  spokenReply?: string;
  /**
   * ADR-041: the student asked to use a Skill. Chat shows a button that opens
   * it; nothing is opened, generated or saved until they tap.
   */
  skillLaunch?: SkillLaunch;
  /**
   * Benchmark only: what an immediate low-risk change would have done. It was
   * not applied.
   */
  dryRun?: LowRiskDryRun;
}

/** What the device made of a spoken conversation turn (see `reviewSpokenTurn`). */
export type SpokenTurnReview =
  | {kind: 'none'}
  | {kind: 'memory'; reply: string}
  | {kind: 'proposal'; review: PrepareResult; reply: string}
  | {
      kind: 'executed';
      reply: string;
      entityType?: string;
      entityId?: string | null;
      undo?: UndoOffer;
    }
  | {kind: 'multi'; batch: MultiActionBatchData; reply: string}
  | {kind: 'note'; reply: string}
  | {kind: 'local_answer'; reply: string};

/** Parses HH:mm string to minutes from midnight. */
export function timeToMinutes(timeStr: string): number {
  const parts = (timeStr || '').trim().split(':');
  const hours = parseInt(parts[0] || '0', 10);
  const minutes = parseInt(parts[1] || '0', 10);
  return isNaN(hours) || isNaN(minutes) ? 0 : hours * 60 + minutes;
}

/** Formats minutes from midnight to HH:mm string. */
export function minutesToTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, minutes));
  const hours = Math.floor(clamped / 60);
  const mins = clamped % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/** Formats HH:mm into friendly 12-hour AM/PM string. */
export function format12HourTime(timeStr?: string | null): string {
  if (!timeStr) return '';
  const match = /^(\d{1,2}):(\d{2})/.exec(timeStr.trim());
  if (!match) return timeStr;
  let hour = parseInt(match[1], 10);
  const min = parseInt(match[2], 10);
  const meridiem = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12;
  if (hour === 0) hour = 12;
  const minStr = min < 10 ? `0${min}` : `${min}`;
  return `${hour}:${minStr} ${meridiem}`;
}

const REFERENCE_CLARIFY_REPLY =
  'Which one do you mean? Tell me what to add or change and when, for example "add physics review Monday at 2 PM".';

/** True when LAFINA's last reply (before this message) was about the planner. */
function lastAssistantIsPlanner(
  recent: ChatMessage[],
  current: string,
): boolean {
  const earlier = [...recent].reverse();
  const lastReply = earlier.find(msg => msg.sender === 'assistant');
  if (!lastReply || lastReply.content.trim() === current.trim()) return false;
  return (
    needsPlannerContext(lastReply.content) ||
    /\b(?:free|slot|slots|open|available|\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i.test(
      lastReply.content,
    )
  );
}

/**
 * Bounded, owner-scoped context for online requests. A read failure sends no
 * history rather than blocking the reply; the message itself is already saved.
 */
function readRecentHistory(
  userId: string,
  count: number,
  sessionId?: string | null,
): ChatMessage[] {
  try {
    return chatStore.getRecentMessages(userId, count, sessionId);
  } catch (error) {
    console.warn(
      '[ChatOrchestrator] Could not read recent chat history:',
      error,
    );
    return [];
  }
}

/**
 * Returns the YYYY-MM-DD date for the next occurrence of a weekday name.
 */
export function getNextDateForDay(
  dayName: string,
  refDate: Date = new Date(),
): string {
  const days = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ];
  const targetDay = days.indexOf(dayName.toLowerCase());
  if (targetDay === -1) return formatLocalDate(refDate);

  const currentDay = refDate.getDay();
  let diff = targetDay - currentDay;
  if (diff < 0) diff += 7;

  const result = new Date(refDate);
  result.setDate(result.getDate() + diff);
  return formatLocalDate(result);
}

/** Small talk at most this long is sent without a handbook search. */
const SMALL_TALK_MAX_CHARS = 60;

/** Handbook topic detection lives in onlineIntentExtractor for reuse. */

/**
 * On-device replies are tagged when saved. Replies saved before the tag
 * existed are recognized by their fixed wording so DeepSeek never sees them.
 */
const isLocalReply = (msg: ChatMessage): boolean =>
  msg.localReply === true ||
  /^(?:hey! )?i am lafina, (?:your offline academic assistant|doing great)/i.test(
    msg.content.trim(),
  );

/**
 * One bounded read of a day's blocks and events, recurring occurrences
 * included (AGY-PORT 06). The day before and after are read too (AGY-PORT 08),
 * so an overnight item that spills into this day, or one this proposal spills
 * into, is seen. Like the legacy store getters it replaces, a storage failure
 * yields an empty day here, so the check never blocks a proposal; the change
 * itself still waits for review and Confirm.
 */
const readDay = (userId: string, date: string): PlannerWindow => {
  try {
    return plannerQueries.window(
      userId,
      addDaysToDate(date, -1),
      addDaysToDate(date, 1),
    );
  } catch (error) {
    console.warn(
      '[ChatOrchestrator] Could not read the day for a conflict check:',
      error,
    );
    return {tasks: [], events: [], blocks: []};
  }
};

/**
 * Online Mode must never pass off a local reply as DeepSeek. Each failure says
 * plainly that the online answer is missing and that offline tools still work.
 */
export const describeOnlineChatFailure = (status: string): string => {
  const offlineNote = ' Your offline scheduling features are still available.';
  switch (status) {
    case 'auth_required':
      return (
        'Sign in again in Profile to use DeepSeek in Online Mode.' + offlineNote
      );
    case 'account_disabled':
      return (
        'This account is disabled, so DeepSeek cannot reply.' + offlineNote
      );
    case 'offline':
      return (
        'You are offline, so DeepSeek cannot reply. Reconnect and send your message again.' +
        offlineNote
      );
    case 'rate_limited':
      return (
        'DeepSeek usage limit reached. Wait a moment and try again.' +
        offlineNote
      );
    default:
      return (
        'DeepSeek could not reply right now. Check your connection and try sending your message again.' +
        offlineNote
      );
  }
};

export class ChatOrchestrator {
  /**
   * Conflict-aware check for time block and calendar event overlaps.
   * `day` lets a caller that checks many slots read the day only once.
   */
  checkScheduleConflict(
    userId: string,
    date: string,
    startTime: string,
    endTime: string,
    day: PlannerWindow = readDay(userId, date),
  ): ScheduleConflict {
    // Minutes from this day's midnight. An end before the start is on the
    // next day (the floating overnight rule Calendar draws). An equal start and
    // end is not checked, as before.
    const previousDay = isRealDate(date) ? addDaysToDate(date, -1) : null;
    const nextDay = isRealDate(date) ? addDaysToDate(date, 1) : null;
    const span = (
      itemDate: string,
      start: string,
      end: string,
    ): [number, number] | null => {
      const from = timeToMinutes(start);
      let to = timeToMinutes(end);
      if (to === from) return null;
      if (to < from) to += MINUTES_PER_DAY;
      const offset =
        itemDate === date
          ? 0
          : itemDate === previousDay
          ? -MINUTES_PER_DAY
          : itemDate === nextDay
          ? MINUTES_PER_DAY
          : null;
      return offset === null ? null : [from + offset, to + offset];
    };
    const proposal = span(date, startTime, endTime);
    if (!proposal) {
      return {hasConflict: false};
    }
    const overlaps = (item: {
      date: string;
      startTime: string;
      endTime: string;
    }): boolean => {
      const other = span(item.date, item.startTime, item.endTime);
      return (
        !!other &&
        Math.max(proposal[0], other[0]) < Math.min(proposal[1], other[1])
      );
    };
    // Same-day items first, as before, then the neighbouring days.
    const byDay = <T extends {date: string}>(items: T[]): T[] => [
      ...items.filter(item => item.date === date),
      ...items.filter(item => item.date !== date),
    ];

    // 1. Check existing time blocks
    for (const b of byDay(day.blocks)) {
      if (overlaps(b)) {
        return {
          hasConflict: true,
          conflictingTitle: b.title,
          conflictingStartTime: b.startTime,
          conflictingEndTime: b.endTime,
          conflictingType: 'time_block',
        };
      }
    }

    // 2. Check existing calendar events
    for (const e of byDay(day.events)) {
      if (overlaps(e)) {
        return {
          hasConflict: true,
          conflictingTitle: e.title,
          conflictingStartTime: e.startTime,
          conflictingEndTime: e.endTime,
          conflictingType: 'event',
        };
      }
    }

    return {hasConflict: false};
  }

  /**
   * Adaptive slot recommendation:
   * Finds the first available non-overlapping daytime slot (between 08:00 and 20:00).
   */
  recommendAvailableSlot(
    userId: string,
    date: string,
    durationMinutes: number,
  ): TimeSlot | null {
    const duration = Math.max(15, durationMinutes || 60);
    const dayStartMinutes = 8 * 60; // 08:00 AM
    const dayEndMinutes = 20 * 60; // 08:00 PM
    const step = 30; // 30 minute increments
    const day = readDay(userId, date);

    for (
      let current = dayStartMinutes;
      current + duration <= dayEndMinutes;
      current += step
    ) {
      const candidateStart = minutesToTime(current);
      const candidateEnd = minutesToTime(current + duration);

      const conflict = this.checkScheduleConflict(
        userId,
        date,
        candidateStart,
        candidateEnd,
        day,
      );

      if (!conflict.hasConflict) {
        return {
          startTime: candidateStart,
          endTime: candidateEnd,
        };
      }
    }

    return null;
  }

  /**
   * End-to-end assistant loop:
   * 1. Persists user query to chatStore.
   * 2. Handles online document generation (PDF, Word, Excel, PowerPoint) if requested.
   * 3. Extracts validated intent via IntentService (fast-path / on-device SLM).
   * 4. Performs conflict checks & adaptive slot recommendation for schedule items.
   * 5. Executes SQLite actions & native scheduler alarms, or online RAG chat when Online Mode is active.
   * 6. Persists assistant reply (and optional document attachment) to chatStore.
   * 7. Reads aloud reply via react-native-tts if requested.
   */
  /**
   * A finished spoken turn in a live voice conversation, read on the device.
   *
   * A planner change becomes a review card on the voice surface (nothing is
   * written until the student taps Confirm); a schedule question is answered
   * from local data, shown on screen and never sent online; anything else is
   * left to the conversation. Nothing is saved to the chat here: the
   * conversation persists its own turns.
   */
  async reviewSpokenTurn(
    userId: string,
    text: string,
    options: {
      referenceDate?: Date;
      onlineMode?: boolean;
      actionSessionId?: string;
      isCurrent?: () => boolean;
      /** See IntentExtractionOptions.slmTimeoutMs. */
      slmTimeoutMs?: number;
    } = {},
  ): Promise<SpokenTurnReview> {
    const trimmed = (text || '').trim();
    if (!trimmed) return {kind: 'none'};
    const fact = explicitMemory(trimmed);
    if (fact) {
      if (!chatMemoryStore.isEnabled(userId))
        return {
          kind: 'memory',
          reply: 'Memory is turned off, so I did not save that.',
        };
      const saved = chatMemoryStore.add(userId, fact);
      return {
        kind: 'memory',
        reply: saved
          ? 'I saved that in your memory.'
          : 'That is already in your memory.',
      };
    }
    const refDate = options.referenceDate || new Date();
    const localValidated = await intentService.extractIntent(trimmed, {
      referenceDate: refDate,
      userId,
      // Offline, the student's installed model reads every request.
      preferOnDeviceSlm: !options.onlineMode,
      slmTimeoutMs: options.slmTimeoutMs,
      // A call answers a clear request from the parser right away.
      trustConfidentFastPath: true,
    });
    // Extraction may finish after the conversation or owning screen closes.
    if (options.isCurrent && !options.isCurrent()) return {kind: 'none'};
    let validated = localValidated;
    if (
      options.onlineMode &&
      shouldUseOnlineIntentExtraction(trimmed, localValidated)
    ) {
      const onlineValidated = await extractIntentWithDeepSeek(trimmed, refDate);
      if (options.isCurrent && !options.isCurrent()) return {kind: 'none'};
      if (onlineValidated) {
        validated = onlineValidated;
      }
    }
    if (hasCompoundPlannerActions(trimmed, validated)) {
      const batch = await buildCompoundBatch(
        userId,
        trimmed,
        refDate,
        options.onlineMode === true,
        options.actionSessionId || generateId('voice-batch'),
      );
      if (options.isCurrent && !options.isCurrent()) return {kind: 'none'};
      if (batch) {
        return {
          kind: 'multi',
          batch,
          reply: `Prepared ${batch.items.length} actions for review. Say confirm all or tap Confirm All on the card.`,
        };
      }
    }
    const route = routeIntent(validated.intent);
    if (route === 'reviewed_mutation') {
      const smallTalk = classifySmallTalk(trimmed);
      if (
        validated.intent === 'acknowledge' ||
        smallTalk === 'thanks' ||
        smallTalk === 'acknowledgement'
      ) {
        // "yes", "okay", "thanks": conversation, never an authorization.
        return {kind: 'none'};
      }
      // "book the first one" only points back at the call. The voice model
      // knows what it meant and describes it through prepare_lafina_action's
      // fields; a card called "First one" first would flicker or stay
      // (audit 2, B3).
      if (isReferenceRequest(validated, trimmed)) return {kind: 'none'};
      const lowRisk = executeLowRiskCommand(userId, validated, {
        referenceDate: refDate,
        surface: 'voice',
      });
      if (lowRisk.status === 'applied') {
        return {
          kind: 'executed',
          reply: lowRisk.reply,
          entityType: lowRisk.entityType,
          entityId: lowRisk.entityId,
          ...(lowRisk.undo ? {undo: lowRisk.undo} : {}),
        };
      }
      if (lowRisk.status === 'clarify' || lowRisk.status === 'invalid') {
        return {kind: 'note', reply: lowRisk.reply};
      }
      const review = prepareReviewedCommand(userId, validated, {
        referenceDate: refDate,
        surface: 'voice',
      });
      return review.status === 'proposal'
        ? {kind: 'proposal', review, reply: review.reply}
        : {kind: 'note', reply: review.reply};
    }
    if (route === 'read_only') {
      const result = await executeNluAction(userId, validated, {
        referenceDate: refDate,
      });
      return {kind: 'local_answer', reply: result.reply};
    }
    return {kind: 'none'};
  }

  async processMessage(
    userId: string,
    text: string,
    rawOptions: ProcessMessageOptions = {},
  ): Promise<ChatOrchestratorResult> {
    // A benchmark always runs as an unsaved, silent Chat turn.
    const options: ProcessMessageOptions = rawOptions.benchmark
      ? {
          ...rawOptions,
          // Without its own history a temporary chat sends just this message.
          temporaryChat: true,
          speakReply: false,
          reviewSurface: 'chat',
          ringingCall: null,
        }
      : rawOptions;
    const trace = options.trace ?? null;
    const result = await this.processMessageInner(userId, text, options);
    if (trace) {
      trace.note({
        route:
          result.route ??
          (result.skillLaunch ? 'skill' : result.multiBatch ? 'multi' : 'local'),
        intent: result.intent.intent,
        intentSource: result.intent.source,
        ...(result.usedOnline ? {onlineUsed: true} : {}),
      });
      trace.mark('replyReady');
    }
    return result;
  }

  private async processMessageInner(
    userId: string,
    text: string,
    options: ProcessMessageOptions,
  ): Promise<ChatOrchestratorResult> {
    const trace = options.trace ?? null;
    const bench = options.benchmark ?? null;
    const trimmed = (text || '').trim();
    const refDate = options.referenceDate || new Date();
    const isTemp = options.temporaryChat === true;
    const ustpRagOnly = options.ustpRagOnly === true;
    // USTP school features (handbook RAG and academic context) follow one
    // eligibility decision, captured now and checked again before the reply
    // is published so a mode change mid-request cannot leak a school answer.
    const schoolAccess = captureUstpEligibility(userId);
    const schoolEnabled = schoolAccess.eligibleAtStart;
    const blockedSchoolQuestion =
      !schoolEnabled && asksForUstpSchoolContent(trimmed);

    // Step 1: Persist user message. The reply goes to the same chat even if
    // the student opens another one while waiting.
    const persistStartedAt = trace && !isTemp ? monotonicNow() : 0;
    const userMessage: ChatMessage = isTemp
      ? {
          id: `temp_user_${Date.now()}_${Math.random()
            .toString(36)
            .slice(2, 7)}`,
          sessionId: 'temp_chat',
          sender: 'user',
          content: trimmed,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      : chatStore.addMessage(userId, 'user', trimmed);
    if (trace) {
      if (!isTemp) {
        trace.addDuration('persistUser', monotonicNow() - persistStartedAt);
      }
      trace.mark('userSaved');
    }
    const sessionId = userMessage.sessionId;
    const memoryRevision = chatMemoryStore.revision(userId);
    try {
      options.onUserMessage?.(userMessage);
    } catch {
      // Showing it early is a courtesy; the reply still arrives.
    }
    trace?.mark('processingStarted');

    // A USTP handbook chat (an old link, a restored screen, a stale button)
    // never reaches retrieval without a confirmed COR setup.
    if (ustpRagOnly && !schoolEnabled) {
      const reply = ustpUnavailableMessage(schoolAccess.reason);
      const assistantMessage: ChatMessage = isTemp
        ? {
            id: `temp_asst_${Date.now()}_${Math.random()
              .toString(36)
              .slice(2, 7)}`,
            sessionId: 'temp_chat',
            sender: 'assistant',
            content: reply,
            localReply: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
        : chatStore.addMessage(
            userId,
            'assistant',
            reply,
            null,
            {localReply: true},
            sessionId,
          );
      return {
        userMessage,
        assistantMessage,
        reply,
        usedOnline: false,
        intent: plainChatIntent(trimmed),
      };
    }

    // ADR-041: "make flashcards", "start a pomodoro", "how many cards are
    // due?" are answered on the device; a launch is a button to tap.
    const skillIntent = ustpRagOnly ? null : detectSkillIntent(trimmed);
    // A benchmark never pauses or resumes the student's focus session.
    const benchSkipsSkill = bench !== null && skillIntent?.kind === 'control';
    if (benchSkipsSkill) trace?.bypass('skill control (pause/resume)');
    const skillAnswer = skillIntent
      ? benchSkipsSkill
        ? {
            reply: benchmarkSkippedReply('pausing or resuming a skill'),
            launch: undefined,
          }
        : await chatSkillReply(userId, skillIntent, options.onlineMode === true)
      : null;
    if (skillAnswer) {
      const {reply, launch} = skillAnswer;
      const assistantMessage: ChatMessage = isTemp
        ? {
            id: `temp_asst_${Date.now()}_${Math.random()
              .toString(36)
              .slice(2, 7)}`,
            sessionId: 'temp_chat',
            sender: 'assistant',
            content: reply,
            localReply: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
        : chatStore.addMessage(
            userId,
            'assistant',
            reply,
            null,
            {localReply: true},
            sessionId,
          );
      return {
        userMessage,
        assistantMessage,
        reply,
        usedOnline: false,
        intent: plainChatIntent(trimmed),
        ...(launch ? {skillLaunch: launch} : {}),
      };
    }

    const preference = ustpRagOnly ? null : explicitMemory(trimmed);
    if (preference) {
      const enabled = chatMemoryStore.isEnabled(userId);
      const isStudy = !!studyPreference(trimmed);
      if (bench) trace?.bypass('memory save');
      if (isTemp && options.reviewSurface !== 'quick') {
        const reply =
          "Temporary chats don't save new memories. Turn off Temporary Chat or add this in Profile -> Chat Memory.";
        const assistantMessage: ChatMessage = {
          id: `temp_asst_${Date.now()}_${Math.random()
            .toString(36)
            .slice(2, 7)}`,
          sessionId: 'temp_chat',
          sender: 'assistant',
          content: reply,
          localReply: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        if (options.speakReply) {
          try {
            await ttsService.speak(reply);
          } catch (error) {
            console.warn('[ChatOrchestrator] TTS playback error:', error);
          }
        }
        return {
          userMessage,
          assistantMessage,
          reply,
          usedOnline: false,
          intent: plainChatIntent(trimmed),
        };
      }
      const reply = enabled
        ? isStudy
          ? "I'll remember your study preference."
          : "I'll remember that."
        : isStudy
        ? 'Your study preference was not saved because memory is turned off.'
        : 'Memory is turned off, so I did not save that.';
      let assistantMessage: ChatMessage;
      if (isTemp) {
        const changes = enabled
          ? chatMemoryStore.applyChanges(
              userId,
              {add: [preference], remove: []},
              null,
            )
          : null;
        const msgId = `temp_asst_${Date.now()}_${Math.random()
          .toString(36)
          .slice(2, 7)}`;
        if (changes && (changes.added.length || changes.removed.length)) {
          DeviceEventEmitter.emit(CHAT_MEMORY_CHANGED_EVENT, {
            userId,
            messageId: msgId,
            changes,
          });
        }
        assistantMessage = {
          id: msgId,
          sessionId: 'temp_chat',
          sender: 'assistant',
          content: reply,
          localReply: true,
          ...(changes && (changes.added.length || changes.removed.length)
            ? {memoryChanges: changes}
            : {}),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      } else {
        assistantMessage = db.transactionSync(tx => {
          const message = chatStore.addMessage(
            userId,
            'assistant',
            reply,
            null,
            {localReply: true},
            sessionId,
            tx,
          );
          if (!enabled) return message;
          const changes = chatMemoryStore.applyChanges(
            userId,
            {add: [preference], remove: []},
            sessionId,
            tx,
          );
          if (changes.added.length || changes.removed.length) {
            if (!chatStore.setMemoryChanges(userId, message.id, changes, tx)) {
              throw new Error('The memory notice could not be saved.');
            }
            tx.afterCommit?.(() =>
              DeviceEventEmitter.emit(CHAT_MEMORY_CHANGED_EVENT, {
                userId,
                messageId: message.id,
                changes,
              }),
            );
            return {...message, memoryChanges: changes};
          }
          return message;
        });
      }
      if (options.speakReply) {
        try {
          await ttsService.speak(reply);
        } catch (error) {
          console.warn('[ChatOrchestrator] TTS playback error:', error);
        }
      }
      return {
        userMessage,
        assistantMessage,
        reply,
        usedOnline: false,
        intent: {
          intent: 'chat',
          title: '',
          date: null,
          time: null,
          endTime: null,
          durationMinutes: null,
          category: 'Academic',
          details: trimmed,
          snoozeMinutes: null,
          confidence: 1,
          source: 'fast_path',
          rawTranscript: trimmed,
          isValid: true,
        },
      };
    }

    if (!ustpRagOnly && bench && isForgetAllMemoriesRequest(trimmed)) {
      // Never run by a benchmark, not even in its temporary chat.
      trace?.bypass('forget all memories');
      const reply = benchmarkSkippedReply('"forget everything"');
      return {
        userMessage,
        assistantMessage: {
          id: `temp_asst_${Date.now()}_${Math.random()
            .toString(36)
            .slice(2, 7)}`,
          sessionId: 'temp_chat',
          sender: 'assistant',
          content: reply,
          localReply: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        reply,
        usedOnline: false,
        intent: plainChatIntent(trimmed),
      };
    }

    if (!ustpRagOnly && isForgetAllMemoriesRequest(trimmed)) {
      const reply =
        "I've forgotten all saved memories on this phone. Your chats are kept.";
      let assistantMessage: ChatMessage;
      if (isTemp) {
        const prevCount = chatMemoryStore.list(userId).length;
        db.transactionSync(tx => {
          chatMemoryStore.clear(userId, tx);
        });
        reconcileClearedMemories(userId);
        const tempId = `temp_asst_${Date.now()}_${Math.random()
          .toString(36)
          .slice(2, 7)}`;
        if (prevCount > 0) {
          DeviceEventEmitter.emit(CHAT_MEMORY_CHANGED_EVENT, {
            userId,
            messageId: tempId,
            changes: {
              added: [],
              removed: [],
              revision: chatMemoryStore.revision(userId),
            },
          });
        }
        assistantMessage = {
          id: tempId,
          sessionId: 'temp_chat',
          sender: 'assistant',
          content: reply,
          localReply: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      } else {
        assistantMessage = db.transactionSync(tx => {
          const message = chatStore.addMessage(
            userId,
            'assistant',
            reply,
            null,
            {localReply: true},
            sessionId,
            tx,
          );
          chatMemoryService.forgetAll(userId, sessionId, message.id, tx);
          return {
            ...message,
            memoryChanges:
              chatStore.getMemoryChanges(userId, message.id, tx) ?? null,
          };
        });
      }
      if (options.speakReply) {
        try {
          await ttsService.speak(reply);
        } catch (error) {
          console.warn('[ChatOrchestrator] TTS playback error:', error);
        }
      }
      return {
        userMessage,
        assistantMessage,
        reply,
        usedOnline: false,
        intent: {
          intent: 'chat',
          title: '',
          date: null,
          time: null,
          endTime: null,
          durationMinutes: null,
          category: 'Academic',
          details: trimmed,
          snoozeMinutes: null,
          confidence: 1,
          source: 'fast_path',
          rawTranscript: trimmed,
          isValid: true,
        },
      };
    }

    let finalReply = '';
    let actionResult: NluActionResult | undefined;
    let undo: UndoOffer | undefined;
    let attachment: ChatAttachment | null = null;
    let handbookNote: string | null = null;
    let usedOnline = false;
    // On-device conversational replies; never replayed to DeepSeek as its own.
    let localReply = false;
    let route: ResolvedIntentRoute | undefined;
    let review: PrepareResult | undefined;
    let multiBatch: MultiActionBatchData | undefined;
    let dryRun: LowRiskDryRun | undefined;
    // A complete DeepSeek conversation reply is checked for memories afterwards.
    let learnFromReply = false;

    // Step 1.5: Conversational Confirm / Cancel / Revise on an active Chat review card
    const makeLocalAssistantMessage = (content: string): ChatMessage =>
      isTemp
        ? {
            id: `temp_asst_${Date.now()}_${Math.random()
              .toString(36)
              .slice(2, 7)}`,
            sessionId: 'temp_chat',
            sender: 'assistant',
            content,
            localReply: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
        : chatStore.addMessage(
            userId,
            'assistant',
            content,
            null,
            {localReply: true},
            sessionId,
          );
    const activeSurface: ReviewSurface = options.reviewSurface ?? 'chat';
    const realOpenProposal =
      !ustpRagOnly && !options.ringingCall
        ? latestPendingReview(userId, activeSurface)
        : null;
    // A benchmark never confirms, cancels or revises the student's own card.
    if (bench && realOpenProposal) {
      trace?.bypass('decisions on an open review card');
    }
    const openProposal = bench ? null : realOpenProposal;
    // A card answers only to the chat that offered it (audit M1).
    const openTurn = openProposal
      ? reviewTurns.get(openProposal.operationId)
      : undefined;
    const pendingProposal =
      openProposal && (!openTurn || openTurn.sessionId === sessionId)
        ? openProposal
        : null;
    // A bare "ok" / "yes" / "no" may be the answer to the model's own
    // question; it decides the card only when the card was the last reply.
    const bareDecision =
      BARE_CONFIRM_RE.test(trimmed) || BARE_CANCEL_RE.test(trimmed);
    const lastAssistantId = isTemp
      ? [...(options.temporaryHistory ?? [])]
          .reverse()
          .find(msg => msg.sender === 'assistant')?.id ?? null
      : lastAssistantMessageId(userId, sessionId);
    const cardWasLastTurn = Boolean(
      pendingProposal &&
        openTurn &&
        lastAssistantId === openTurn.assistantMessageId,
    );
    const decisionAllowed = !bareDecision || cardWasLastTurn;
    if (pendingProposal) {
      if (decisionAllowed && CHAT_REVIEW_CONFIRM_RE.test(trimmed)) {
        const outcome = confirmReviewedCommand(
          userId,
          pendingProposal.operationId,
        );
        if (outcome.status === 'applied') {
          if (isTemp) {
            reviewTurns.delete(pendingProposal.operationId);
          } else {
            markReviewMessageResolved(
              userId,
              pendingProposal.operationId,
              'confirmed',
              sessionId,
            );
          }
        }
        const assistantMessage = makeLocalAssistantMessage(outcome.reply);
        return {
          userMessage,
          assistantMessage,
          intent: {
            intent: 'chat',
            title: pendingProposal.title,
            date: null,
            time: null,
            endTime: null,
            durationMinutes: null,
            category: 'Academic',
            details: trimmed,
            snoozeMinutes: null,
            confidence: 1,
            source: 'fast_path',
            rawTranscript: trimmed,
            isValid: true,
          },
          resolvedReview: {
            operationId: pendingProposal.operationId,
            status: outcome.status,
          },
          usedOnline: false,
          reply: outcome.reply,
        };
      }
      if (decisionAllowed && CHAT_REVIEW_CANCEL_RE.test(trimmed)) {
        cancelReviewedCommand(userId, pendingProposal.operationId);
        const cancelMsg = 'Cancelled. Nothing was changed.';
        if (isTemp) {
          reviewTurns.delete(pendingProposal.operationId);
        } else {
          markReviewMessageResolved(
            userId,
            pendingProposal.operationId,
            'cancelled',
            sessionId,
          );
        }
        const assistantMessage = makeLocalAssistantMessage(cancelMsg);
        return {
          userMessage,
          assistantMessage,
          intent: {
            intent: 'chat',
            title: pendingProposal.title,
            date: null,
            time: null,
            endTime: null,
            durationMinutes: null,
            category: 'Academic',
            details: trimmed,
            snoozeMinutes: null,
            confidence: 1,
            source: 'fast_path',
            rawTranscript: trimmed,
            isValid: true,
          },
          resolvedReview: {
            operationId: pendingProposal.operationId,
            status: 'cancelled',
          },
          usedOnline: false,
          reply: cancelMsg,
        };
      }
      if (CHAT_REVIEW_REVISE_RE.test(trimmed)) {
        const revised = reviseReviewedCommand(
          userId,
          pendingProposal.operationId,
          trimmed,
        );
        if (revised.status === 'proposal') {
          const assistantMessage = makeLocalAssistantMessage(revised.reply);
          rememberReviewTurn(
            revised.proposal.operationId,
            sessionId,
            assistantMessage.id,
          );
          return {
            userMessage,
            assistantMessage,
            intent: {
              intent: 'chat',
              title: revised.proposal.title,
              date: null,
              time: null,
              endTime: null,
              durationMinutes: null,
              category: 'Academic',
              details: trimmed,
              snoozeMinutes: null,
              confidence: 1,
              source: 'fast_path',
              rawTranscript: trimmed,
              isValid: true,
            },
            review: revised,
            route: 'reviewed_mutation',
            usedOnline: false,
            reply: revised.reply,
          };
        }
      }
    }

    // "yes" / "confirm" with no card waiting. Offline there is no conversation
    // it could answer, so say so instead of "needs Online Mode". Online, it may
    // answer DeepSeek's own question, so it goes to the conversation.
    if (
      !pendingProposal &&
      !isTemp &&
      !ustpRagOnly &&
      !options.ringingCall &&
      !options.onlineMode &&
      (NOTHING_PENDING_CONFIRM_RE.test(trimmed) ||
        NOTHING_PENDING_CANCEL_RE.test(trimmed))
    ) {
      const reply = NOTHING_PENDING_CONFIRM_RE.test(trimmed)
        ? 'There\'s nothing waiting for confirmation right now. Tell me what to add or change, for example "add review chapter 4 to my to-do".'
        : "There's nothing to cancel right now. Nothing was changed.";
      const assistantMessage = chatStore.addMessage(
        userId,
        'assistant',
        reply,
        null,
        {localReply: true},
        sessionId,
      );
      return {
        userMessage,
        assistantMessage,
        intent: {
          intent: 'chat',
          title: '',
          date: null,
          time: null,
          endTime: null,
          durationMinutes: null,
          category: 'Academic',
          details: trimmed,
          snoozeMinutes: null,
          confidence: 1,
          source: 'fast_path',
          rawTranscript: trimmed,
          isValid: true,
        },
        usedOnline: false,
        reply,
      };
    }

    // Step 2.5: Check for scanned class schedule
    const isScheduleScan =
      !ustpRagOnly &&
      /^(?:scan\s+schedule|scanned\s+schedule|import\s+schedule|schedule\s+scan)[\s:]+/i.test(
        trimmed,
      );

    if (isScheduleScan) {
      const ocrBody = trimmed
        .replace(
          /^(?:scan\s+schedule|scanned\s+schedule|import\s+schedule|schedule\s+scan)[\s:]+/i,
          '',
        )
        .trim();
      const parsedSchedule = parseScannedSchedule(ocrBody, refDate);

      if (parsedSchedule.classes.length > 0) {
        finalReply = `${parsedSchedule.markdownTable}\n\nWould you like me to add these classes to your Calendar?`;

        // Flatten all scanned classes across their specified days into calendar sessions
        const calendarSessions: Array<{
          title: string;
          day: string;
          startTime: string;
          endTime: string;
          room?: string;
        }> = [];

        for (const c of parsedSchedule.classes) {
          for (const day of c.days) {
            calendarSessions.push({
              title: c.subject,
              day,
              startTime: c.startTime,
              endTime: c.endTime,
              room: c.room,
            });
          }
        }

        const firstSession = calendarSessions[0];
        const targetDate = getNextDateForDay(firstSession.day, refDate);
        const duration = Math.max(
          15,
          timeToMinutes(firstSession.endTime) -
            timeToMinutes(firstSession.startTime),
        );

        const ruleWithUntil = `FREQ=WEEKLY;UNTIL=${parsedSchedule.semesterEndDate}`;

        const otherSessions = calendarSessions.slice(1).map(s => ({
          title: s.title,
          date: getNextDateForDay(s.day, refDate),
          startTime: s.startTime,
          endTime: s.endTime,
          category: 'Class',
          notes: s.room && s.room !== 'TBA' ? `Location: ${s.room}` : null,
          recurrenceRule: ruleWithUntil,
        }));

        const batchPayload = JSON.stringify({
          firstClassLocation:
            firstSession.room && firstSession.room !== 'TBA'
              ? `Location: ${firstSession.room}`
              : null,
          semesterEndDate: parsedSchedule.semesterEndDate,
          classes: otherSessions,
        });

        const scanIntent: ValidatedIntent = {
          intent: 'create_time_block',
          title: firstSession.title,
          date: targetDate,
          time: firstSession.startTime,
          endTime: firstSession.endTime,
          durationMinutes: duration,
          category: 'Class',
          recurrenceRule: ruleWithUntil,
          details: `[BATCH_CLASSES:${batchPayload}]`,
          snoozeMinutes: null,
          confidence: 1,
          source: 'fast_path',
          rawTranscript: trimmed,
          isValid: true,
        };

        review = prepareReviewedCommand(userId, scanIntent, {
          referenceDate: refDate,
          surface: options.reviewSurface,
        });
      } else {
        finalReply = parsedSchedule.markdownTable;
      }

      const assistantMessage: ChatMessage = isTemp
        ? {
            id: `temp_asst_${Date.now()}_${Math.random()
              .toString(36)
              .slice(2, 7)}`,
            sessionId: 'temp_chat',
            sender: 'assistant',
            content: finalReply,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            localReply: true,
          }
        : chatStore.addMessage(
            userId,
            'assistant',
            finalReply,
            null,
            {localReply: true},
            sessionId,
          );

      return {
        userMessage,
        assistantMessage,
        intent: {
          intent: 'create_time_block',
          title: parsedSchedule.classes[0]?.subject || 'Scanned Schedule',
          date: null,
          time: null,
          endTime: null,
          durationMinutes: null,
          category: 'Class',
          details: trimmed,
          snoozeMinutes: null,
          confidence: 1,
          source: 'fast_path',
          rawTranscript: trimmed,
          isValid: true,
        },
        review,
        usedOnline: false,
        reply: finalReply,
      };
    }

    // Step 3: Extract validated intent (DeepSeek structured extraction when
    // Online Mode is active for scheduling/planner commands, with local fallback).
    // Dedicated USTP Handbook RAG chats bypass planner NLU so handbook queries never misroute.
    const defaultChatIntent: ValidatedIntent = {
      intent: 'chat',
      title: '',
      date: null,
      time: null,
      endTime: null,
      durationMinutes: null,
      category: 'Academic',
      details: trimmed,
      snoozeMinutes: null,
      confidence: 1,
      source: 'fast_path',
      rawTranscript: trimmed,
      isValid: true,
    };
    let validated: ValidatedIntent = defaultChatIntent;
    if (!ustpRagOnly) {
      const localValidated = await intentService.extractIntent(trimmed, {
        referenceDate: refDate,
        userId,
        // Offline (or offline model chosen in Chat), the installed model
        // reads every scheduling request, not only unclear ones.
        preferOnDeviceSlm: !options.onlineMode,
        slmTimeoutMs: options.slmTimeoutMs,
        trace,
        signal: options.signal,
        simulateMissingModel: bench?.simulateMissingModel === true,
      });
      validated = localValidated;
      const onlineExtraction =
        options.onlineMode &&
        shouldUseOnlineIntentExtraction(trimmed, localValidated);
      if (onlineExtraction && bench?.simulateOnlineFailure) {
        trace?.bypass('online intent extraction (SIMULATED online failure)');
      } else if (onlineExtraction) {
        const extractionStartedAt = trace ? monotonicNow() : 0;
        const onlineValidated = await extractIntentWithDeepSeek(
          trimmed,
          refDate,
        );
        trace?.addDuration(
          'onlineIntentExtraction',
          monotonicNow() - extractionStartedAt,
        );
        if (onlineValidated) {
          validated = onlineValidated;
          if (onlineValidated.intent !== 'chat') {
            usedOnline = true;
          }
        }
      }
    }

    if (
      !finalReply &&
      !ustpRagOnly &&
      !isScheduleScan &&
      hasCompoundPlannerActions(trimmed, validated)
    ) {
      const batch = await buildCompoundBatch(
        userId,
        trimmed,
        refDate,
        options.onlineMode === true,
        `chat-${sessionId}`,
      );
      if (batch) {
        multiBatch = batch;
        finalReply = `I prepared ${batch.items.length} actions for your review below. Tap Confirm All when ready.`;
      }
    }

    // Step 4 (conflicts) lives on the review card: it lists the overlap and
    // offers the free times as one-tap choices, so chat never asks a question
    // nothing could answer (audit finding 5).

    // A request that only points back at the conversation ("book the first
    // one", "move it to 4pm") goes to the Chat agent, which sees the history;
    // offline, a new item named only by a pointer asks instead of saving a
    // card called "First one" (audit 2, B2).
    let followUpAgent = false;
    let pointerOnly = false;
    if (
      !finalReply &&
      !ustpRagOnly &&
      !isScheduleScan &&
      !options.ringingCall
    ) {
      const pointsBack =
        isReferenceRequest(validated, trimmed) ||
        (validated.intent === 'chat' &&
          !isTemp &&
          options.onlineMode === true &&
          isShortReferenceFollowUp(trimmed) &&
          lastAssistantIsPlanner(
            readRecentHistory(userId, 6, sessionId),
            trimmed,
          ));
      if (pointsBack && options.onlineMode && !isTemp) {
        followUpAgent = true;
      } else if (pointsBack) {
        pointerOnly = true;
      }
    }

    // Step 5: Low-risk planner updates execute immediately; higher-risk changes
    // become a private proposal waiting for Confirm. Reads & calls keep their routes.
    if (!finalReply) {
      route = followUpAgent
        ? 'conversation'
        : routeIntent(validated.intent, {ringingCall: options.ringingCall});
      if (route === 'reviewed_mutation') {
        const lowRiskOptions = {
          referenceDate: refDate,
          surface: options.reviewSurface,
          ringingCall: options.ringingCall,
        };
        // A benchmark works out the immediate change without applying it.
        const lowRisk: ExecuteLowRiskResult | LowRiskDryRun = bench
          ? planLowRiskCommand(userId, validated, lowRiskOptions)
          : executeLowRiskCommand(userId, validated, lowRiskOptions);
        if (lowRisk.status === 'would_apply') {
          trace?.bypass('immediate low-risk change');
          dryRun = lowRisk;
          finalReply = benchmarkSkippedReply(
            `the immediate change (${lowRisk.operation})`,
          );
          localReply = true;
        } else if (lowRisk.status === 'applied') {
          actionResult = {
            success: true,
            intent: validated.intent,
            entityType: lowRisk.entityType,
            entityId: lowRisk.entityId ?? undefined,
            reply: lowRisk.reply,
          };
          finalReply = lowRisk.reply;
          undo = lowRisk.undo;
        } else if (lowRisk.status === 'clarify') {
          review = {
            status: 'clarify',
            reply: lowRisk.reply,
            candidates: lowRisk.candidates,
          };
          finalReply = lowRisk.reply;
        } else if (lowRisk.status === 'invalid') {
          review = {status: 'invalid', reply: lowRisk.reply};
          finalReply = lowRisk.reply;
        } else {
          review = prepareReviewedCommand(userId, validated, {
            referenceDate: refDate,
            surface: options.reviewSurface,
            ringingCall: options.ringingCall,
          });
          finalReply = review.reply;
          // Offline, a card named only by a pointer ("First one") is
          // withdrawn and LAFINA asks instead.
          if (pointerOnly && review.status === 'proposal') {
            cancelReviewedCommand(userId, review.proposal.operationId);
            review = undefined;
            finalReply = REFERENCE_CLARIFY_REPLY;
          }
        }
        // "thanks" / "ok" with no ringing call and nothing to acknowledge is
        // just conversation. The refused review wrote nothing, so drop it.
        const smallTalk = classifySmallTalk(trimmed);
        if (
          review?.status === 'invalid' &&
          !options.ringingCall &&
          validated.intent === 'acknowledge' &&
          (smallTalk === 'thanks' || smallTalk === 'acknowledgement')
        ) {
          review = undefined;
          route = 'conversation';
          finalReply = '';
        }
      }
      if (route === 'call_context_immediate' && options.ringingCall) {
        const call = options.ringingCall;
        const outcome =
          validated.intent === 'acknowledge'
            ? await acknowledgeReminderAction(
                call.reminderId,
                userId,
                call.generation,
              )
            : await snoozeReminderAction(
                call.reminderId,
                userId,
                validated.snoozeMinutes || 10,
                call.generation,
              );
        actionResult = {
          success: outcome.ok,
          intent: validated.intent,
          entityType: 'reminder',
          entityId: call.reminderId,
          reply: outcome.message,
          ...(outcome.ok ? {} : {error: outcome.message}),
        };
        finalReply = outcome.message;
      } else if (route === 'read_only') {
        actionResult = await executeNluAction(userId, validated, {
          referenceDate: refDate,
        });
        finalReply = actionResult.reply;
        // "my schedule tomorrow and the attendance policy": answer both.
        if (!ustpRagOnly) {
          const withHandbook = await appendHandbookPart(
            finalReply,
            trimmed,
            userId,
          );
          finalReply = withHandbook.reply;
          handbookNote = withHandbook.note ?? handbookNote;
        }
      } else if (route !== 'reviewed_mutation') {
        // Conversation. Online Mode always asks DeepSeek first, greetings
        // included; on-device replies are only the offline or fallback voice.
        const recent = isTemp
          ? (options.temporaryHistory ?? [userMessage]).slice(-10)
          : readRecentHistory(userId, 10, sessionId);
        const recentReplies = recent
          .filter(msg => msg.sender === 'assistant')
          .map(msg => msg.content);
        const recentUserQueries = recent
          .filter(
            msg => msg.sender === 'user' && msg.content.trim() !== trimmed,
          )
          .map(msg => msg.content);
        const previousUserQuery =
          recentUserQueries.length > 0
            ? recentUserQueries[recentUserQueries.length - 1]
            : null;
        const smallTalk = classifySmallTalk(trimmed);
        if (options.onlineMode && !blockedSchoolQuestion) {
          const history: OnlineChatMessage[] = recent
            // DeepSeek must not imitate on-device replies as if it wrote them.
            .filter(msg => !(msg.sender === 'assistant' && isLocalReply(msg)))
            .map(msg => ({
              role: msg.sender,
              content: msg.content,
            }));

          // The agent reads the planner itself, only what it needs.
          const plainHistory = history.map(msg => ({...msg}));
          // The planner snapshot rides along only when the question is about
          // the student's own plans, notes or time (audit findings 11 and 15);
          // a general study question never sends their planner.
          let agentContext = '';
          if (
            !ustpRagOnly &&
            !smallTalk &&
            !isHandbookQuestion(trimmed) &&
            needsPlannerContext(trimmed)
          ) {
            try {
              const plannerSnap = buildStudentVoiceContext(userId, {
                referenceDate: refDate,
              });
              if (plannerSnap) {
                agentContext = `\n\n[AI Agent Database Context — Student Planner (Now: ${describeNow(
                  refDate,
                )}):\n${plannerSnap}]`;
              }
            } catch (err) {
              console.warn(
                '[ChatOrchestrator] Could not build student planner context for AI chat:',
                err,
              );
            }
          }

          if (
            agentContext &&
            history.length > 0 &&
            history[history.length - 1].role === 'user'
          ) {
            history[history.length - 1] = {
              ...history[history.length - 1],
              content: history[history.length - 1].content + agentContext,
            };
          }
          // Reply settings the student chose (tone, answer length) apply to
          // online replies whether or not conversational memory is on.
          const replyPreferences = replyPreferenceInstruction(userId);
          if (replyPreferences) {
            for (const list of [history, plainHistory]) {
              const last = list[list.length - 1];
              if (last && last.role === 'user') {
                list[list.length - 1] = {
                  ...last,
                  content: `${last.content}\n\n${replyPreferences}`,
                };
              }
            }
          }
          const streamReply = options.onReplyText;
          // Streaming stops showing text the moment school features turn off.
          const onReplyText = streamReply
            ? (partial: string) => {
                if (!schoolEnabled || schoolAccess.stillAllowed()) {
                  streamReply(partial);
                }
              }
            : undefined;
          // Dedicated USTP RAG mode always uses the USTP Student Handbook. In
          // general chat the caller must opt in (audit H2: a caller that
          // passed nothing, like the reminder call, used to get excerpts),
          // and greetings never search.
          const useHandbook = !schoolEnabled
            ? false
            : ustpRagOnly
            ? true
            : options.useHandbook === true &&
              !(
                smallTalk &&
                trimmed.length <= SMALL_TALK_MAX_CHARS &&
                !isHandbookQuestion(trimmed)
              );
          // What LAFINA remembers about the student rides along (none when off).
          // Academic facts are left out unless school features are on.
          const memories = chatMemoryStore.isEnabled(userId)
            ? memoriesForPrompt(userId)
            : [];
          const memoryOption = memories.length > 0 ? {memories} : {};
          // Questions about the student's own plans go to the Chat agent
          // first (ADR-033): it can look things up and prepare one card.
          const agent =
            followUpAgent ||
            (!isTemp &&
              !ustpRagOnly &&
              !smallTalk &&
              !isHandbookQuestion(trimmed) &&
              needsPlannerContext(trimmed))
              ? await runChatAgent(userId, plainHistory, {
                  // Handbook passages don't help a planner turn (audit 2, B4).
                  useHandbook: false,
                  ...memoryOption,
                  referenceDate: refDate,
                  localNow: describeNow(refDate),
                  ...(options.isCurrent ? {isCurrent: options.isCurrent} : {}),
                })
              : null;
          if (agent) {
            finalReply = agent.reply || agent.review?.reply || '';
            handbookNote = handbookSourceLabel(agent.sources);
            if (finalReply) {
              const withHandbook = await appendHandbookPart(
                finalReply,
                trimmed,
                userId,
              );
              finalReply = withHandbook.reply;
              handbookNote = withHandbook.note ?? handbookNote;
            }
            usedOnline = true;
            learnFromReply = Boolean(agent.reply);
            if (agent.review) review = agent.review;
          }
          // Without the agent, a pointer can't be resolved: ask, never guess.
          if (!agent && followUpAgent) {
            finalReply = REFERENCE_CLARIFY_REPLY;
          }
          const localHandbookStatus = await localHandbookService.ensureReady();
          const localPopulated = localHandbookStatus.populated;
          let localHandbookContext: OnlineHandbookContext | null = null;
          if (!agent && !followUpAgent && useHandbook && localPopulated) {
            localHandbookContext =
              await localHandbookService.buildOnlineContext(trimmed, {
                previousUserQuery,
              });
            if (
              localHandbookContext &&
              history.length > 0 &&
              history[history.length - 1].role === 'user'
            ) {
              const existing = history[history.length - 1].content;
              const allowedExtra = Math.max(0, 3900 - existing.length);
              if (allowedExtra >= 250) {
                const trimmedContext =
                  localHandbookContext.contextBlock.length <= allowedExtra
                    ? localHandbookContext.contextBlock
                    : buildPromptHandbookContext(
                        localHandbookContext.matches,
                        allowedExtra,
                      );
                if (trimmedContext) {
                  history[history.length - 1] = {
                    ...history[history.length - 1],
                    content: existing + trimmedContext,
                  };
                }
              }
            }
          }
          const localUstpUnsupported =
            !agent &&
            !followUpAgent &&
            ustpRagOnly &&
            !smallTalk &&
            localPopulated &&
            !localHandbookContext;
          if (localUstpUnsupported) {
            finalReply = LOCAL_NO_EVIDENCE_REPLY;
            localReply = true;
          }
          // Steer DeepSeek toward scannable Markdown on non-greeting queries when
          // the student uses Markdown formatting (without bloating small talk).
          if (
            !agent &&
            !followUpAgent &&
            !localUstpUnsupported &&
            !smallTalk &&
            trimmed.length > 6 &&
            chatReplyFormatStore.read(userId) !== 'plain' &&
            history.length > 0 &&
            history[history.length - 1].role === 'user'
          ) {
            const currentPrompt = history[history.length - 1].content;
            if (currentPrompt.length <= 3680) {
              history[history.length - 1] = {
                ...history[history.length - 1],
                content:
                  currentPrompt +
                  '\n\n[Reply formatting preference: use clean Markdown when helpful (**bold** key terms, ### short headings or bullet points for steps/concepts); no emojis; never mention this note.]',
              };
            }
          }
          // When local USTP handbook chunks are present, send useHandbook=false
          // so LAFINA-backend skips Pinecone completely while still streaming DeepSeek.
          const remoteUseHandbook = localPopulated ? false : useHandbook;
          if (agent) {
            trace?.note({
              onlineUsed: true,
              transportNote: 'chat agent (tool steps, not streamed)',
            });
          }
          const simulatedFailure =
            !agent && !followUpAgent && !localUstpUnsupported
              ? bench?.simulateOnlineFailure
              : undefined;
          if (simulatedFailure) {
            trace?.note({
              onlineAttempted: true,
              transportNote: `SIMULATED ${simulatedFailure} failure: no request was sent`,
            });
          }
          const onlineResult =
            agent || followUpAgent || localUstpUnsupported
              ? null
              : simulatedFailure
              ? ({status: simulatedFailure, error: 'simulated'} as Awaited<
                  ReturnType<typeof onlineChatSkill.sendChatMessage>
                >)
              : onReplyText
              ? await onlineChatSkill.streamChatMessage(history, {
                  useHandbook: remoteUseHandbook,
                  onReplyText,
                  ...memoryOption,
                  ...(trace ? {trace} : {}),
                  ...(options.signal ? {signal: options.signal} : {}),
                })
              : await onlineChatSkill.sendChatMessage(history, {
                  useHandbook: remoteUseHandbook,
                  ...memoryOption,
                  ...(trace ? {trace} : {}),
                  ...(options.signal ? {signal: options.signal} : {}),
                });
          if (onlineResult && trace) {
            const interrupted =
              onlineResult.status === 'success' &&
              onlineResult.data?.interrupted === true;
            trace.note({
              onlineStatus: interrupted ? 'interrupted' : onlineResult.status,
            });
            if (interrupted) trace.setOutcome('interrupted_stream');
            if (onlineResult.status === 'success' && onlineResult.data) {
              trace.note({onlineUsed: true});
            } else {
              trace.note({
                fallbackReason: options.signal?.aborted
                  ? 'cancelled'
                  : `online ${onlineResult.status}${
                      simulatedFailure ? ' (SIMULATED)' : ''
                    }; local reply used`,
              });
            }
          }
          if (!onlineResult) {
            // Answered by the Chat agent or local fail-closed refusal above.
          } else if (onlineResult.status === 'success' && onlineResult.data) {
            finalReply = onlineResult.data.interrupted
              ? `${onlineResult.data.reply}\n\n${INTERRUPTED_REPLY_NOTE}`
              : onlineResult.data.reply;
            // The note names passages the reply was given, which passed the
            // evidence gate; it is dropped when the model says they did not
            // answer the question (audit H2 item 1).
            handbookNote =
              handbookSourceLabel(onlineResult.data.sources) ??
              (localHandbookContext &&
              !replyDisclaimsHandbook(onlineResult.data.reply)
                ? handbookSourceLabel(localHandbookContext.sources)
                : null);
            usedOnline = true;
            learnFromReply = !onlineResult.data.interrupted;
          } else {
            console.warn(
              '[ChatOrchestrator] Online AI chat failed:',
              onlineResult.status,
            );
            localReply = true;
            if (localHandbookContext) {
              finalReply = formatOfflineHandbookReply({
                matches: localHandbookContext.matches,
                sources: localHandbookContext.sources,
                insufficientEvidence: false,
                queryUsed: trimmed,
              });
              handbookNote = handbookSourceLabel(localHandbookContext.sources);
            } else if (
              schoolEnabled &&
              localPopulated &&
              (ustpRagOnly || isHandbookQuestion(trimmed))
            ) {
              const offlineFallback = await localHandbookService.answerOffline(
                trimmed,
                {previousUserQuery},
              );
              finalReply = offlineFallback.reply;
              handbookNote = handbookSourceLabel(offlineFallback.sources);
            } else if (
              schoolEnabled &&
              (ustpRagOnly ||
                (options.useHandbook &&
                  /\b(?:ustp|handbook|dean'?s\s+list|grading|policy|curriculum|tuition|retention)\b/i.test(
                    trimmed,
                  )))
            ) {
              finalReply =
                "I couldn't verify that from the USTP Student Handbook right now. Please check your internet connection or refer directly to the USTP Student Affairs office.";
            } else if (smallTalk) {
              // Still friendly, but clearly not DeepSeek's words.
              finalReply = `${buildLocalConversationReply(userId, trimmed, {
                recentReplies,
              })}\n\n${
                onlineResult.status === 'auth_required'
                  ? SIGNED_OUT_REPLY_NOTE
                  : OFFLINE_REPLY_NOTE
              }`;
            } else {
              finalReply = describeOnlineChatFailure(onlineResult.status);
            }
          }
        }

        if (!finalReply) {
          localReply = true;
          if (blockedSchoolQuestion) {
            finalReply = ustpUnavailableMessage(schoolAccess.reason);
          } else if (
            schoolEnabled &&
            (ustpRagOnly || isHandbookQuestion(trimmed))
          ) {
            const localStatus = await localHandbookService.ensureReady();
            if (localStatus.populated) {
              const offlineAns = await localHandbookService.answerOffline(
                trimmed,
                {previousUserQuery},
              );
              finalReply = offlineAns.reply;
              handbookNote = handbookSourceLabel(offlineAns.sources);
            } else {
              finalReply =
                'Official USTP Student Handbook guidelines require Online Mode. Switch to Online Mode in the chat header to look up verified handbook policies and academic regulations.';
            }
          } else {
            finalReply = buildLocalConversationReply(userId, trimmed, {
              recentReplies,
            });
          }
        }
      }
    }

    // Recheck after the asynchronous work: an answer that used USTP school
    // content is never published once the owner's school features are off.
    if ((handbookNote || ustpRagOnly) && !schoolAccess.stillAllowed()) {
      const current = getUstpEligibility(userId);
      finalReply = current.eligible
        ? 'Your USTP setup changed while I was answering, so I did not show that reply. Please ask again.'
        : ustpUnavailableMessage(current.reason);
      handbookNote = null;
      localReply = true;
    }

    // Ensure "LAFINA" is not capitalized as an acronym so chat display and TTS pronounce "lafina" naturally
    finalReply = finalReply
      .replace(/\bL[.-]?A[.-]?F[.-]?I[.-]?N[.-]?A\b/gi, 'lafina')
      .replace(/\bLAFINA\b/g, 'lafina');

    // Step 6: Persist assistant message (or return in-memory in Temporary Chat)
    const assistantPersistStartedAt = trace && !isTemp ? monotonicNow() : 0;
    const assistantMessage: ChatMessage = isTemp
      ? {
          id: `temp_asst_${Date.now()}_${Math.random()
            .toString(36)
            .slice(2, 7)}`,
          sessionId: 'temp_chat',
          sender: 'assistant',
          content: finalReply,
          attachment,
          handbookNote,
          localReply,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      : chatStore.addMessage(
          userId,
          'assistant',
          finalReply,
          attachment,
          {handbookNote, localReply},
          sessionId,
        );
    if (trace && !isTemp) {
      trace.addDuration(
        'persistAssistant',
        monotonicNow() - assistantPersistStartedAt,
      );
    }

    if (review?.status === 'proposal') {
      rememberReviewTurn(
        review.proposal.operationId,
        sessionId,
        assistantMessage.id,
      );
    }

    // Background: never delays or changes the reply. Chat hears about any
    // change through CHAT_MEMORY_CHANGED_EVENT and shows it under this reply.
    if (usedOnline && bench) {
      trace?.bypass('memory "last used" update');
    } else if (usedOnline && chatMemoryStore.isEnabled(userId)) {
      const promptIds = memoriesForPrompt(userId).map(m => m.id);
      if (promptIds.length > 0) chatMemoryStore.markUsed(userId, promptIds);
    }
    if (learnFromReply && !isTemp && !directProviderTestEnabled()) {
      void chatMemoryService.afterExchange({
        userId,
        sessionId,
        assistantMessageId: assistantMessage.id,
        userText: trimmed,
        replyText: finalReply,
        memoryRevision,
      });
    }

    // The natural spoken summary applies only while the reply is exactly the
    // read card it describes (nothing appended, such as a handbook part).
    const spokenReply =
      actionResult?.spokenReply &&
      actionResult.reply.replace(
        /\bL[.-]?A[.-]?F[.-]?I[.-]?N[.-]?A\b/gi,
        'lafina',
      ) === finalReply
        ? actionResult.spokenReply
        : undefined;

    // Step 7: Non-blocking react-native-tts speech synthesis if requested
    if (options.speakReply) {
      try {
        await ttsService.speak(spokenReply ?? finalReply);
      } catch (err) {
        console.warn('[ChatOrchestrator] TTS playback error:', err);
      }
    }

    return {
      userMessage,
      assistantMessage,
      intent: validated,
      actionResult,
      ...(undo ? {undo} : {}),
      attachment,
      handbookNote,
      usedOnline,
      route,
      review,
      ...(multiBatch ? {multiBatch} : {}),
      ...(dryRun ? {dryRun} : {}),
      reply: finalReply,
      ...(spokenReply ? {spokenReply} : {}),
    };
  }

  /**
   * Applies a reviewed proposal once and records the outcome in the owner's
   * transcript. A repeated Confirm returns the first receipt and adds nothing.
   */
  async confirmReview(
    userId: string,
    operationId: string,
    options: {speakReply?: boolean; temporaryChat?: boolean} = {},
  ): Promise<ReviewDecisionResult> {
    const outcome = confirmReviewedCommand(userId, operationId);
    let assistantMessage: ChatMessage | null = null;
    if (
      !(outcome.status === 'applied' && outcome.repeated) &&
      !options.temporaryChat
    ) {
      const turn = reviewTurns.get(operationId);
      if (outcome.status === 'applied') {
        markReviewMessageResolved(userId, operationId, 'confirmed');
      }
      try {
        assistantMessage = chatStore.addMessage(
          userId,
          'assistant',
          outcome.reply,
          null,
          {localReply: true},
          turn?.sessionId,
        );
      } catch (error) {
        console.warn(
          '[ChatOrchestrator] Could not save the review outcome to chat:',
          error,
        );
      }
    }
    if (options.speakReply) {
      try {
        await ttsService.speak(outcome.reply);
      } catch (err) {
        console.warn('[ChatOrchestrator] TTS playback error:', err);
      }
    }
    return {outcome, assistantMessage, reply: outcome.reply};
  }

  /**
   * Reverses an immediate action from its Undo snackbar and notes it in the
   * transcript. Refused (nothing changes) when the item changed since.
   */
  undoAction(
    userId: string,
    token: string,
    options: {recordInChat?: boolean} = {},
  ): UndoResult {
    const result = undoLowRiskCommand(userId, token);
    if (result.status === 'undone' && options.recordInChat !== false) {
      try {
        chatStore.addMessage(userId, 'assistant', result.reply, null, {
          localReply: true,
        });
      } catch (error) {
        console.warn(
          '[ChatOrchestrator] Could not save the undo to chat:',
          error,
        );
      }
    }
    return result;
  }

  /** Discards a proposal. Writes no planner data. */
  cancelReview(
    userId: string,
    operationId: string,
    options: {recordInChat?: boolean; temporaryChat?: boolean} = {},
  ): ReviewDecisionResult {
    const cancelled = cancelReviewedCommand(userId, operationId);
    const reply = cancelled
      ? 'Cancelled. Nothing was changed.'
      : 'There was nothing to cancel. Nothing was changed.';
    let assistantMessage: ChatMessage | null = null;
    if (cancelled && !options.temporaryChat) {
      const turn = reviewTurns.get(operationId);
      markReviewMessageResolved(userId, operationId, 'cancelled');
      if (options.recordInChat !== false) {
        try {
          assistantMessage = chatStore.addMessage(
            userId,
            'assistant',
            reply,
            null,
            {localReply: true},
            turn?.sessionId,
          );
        } catch (error) {
          console.warn(
            '[ChatOrchestrator] Could not save the cancellation to chat:',
            error,
          );
        }
      }
    }
    return {cancelled, assistantMessage, reply};
  }
}

/** A Skill request answered in Chat (ADR-041), or null when it is not one. */
async function chatSkillReply(
  userId: string,
  intent: SkillIntent,
  online: boolean,
): Promise<{reply: string; launch?: SkillLaunch} | null> {
  if (intent.kind === 'status')
    return {reply: skillStatusLine(userId, intent.topic)};
  if (intent.kind === 'control')
    return {reply: await skillControlLine(userId, intent.control)};
  const prepared = prepareSkillLaunch(userId, intent.launch, {
    online,
    materialHint: intent.materialHint,
  });
  if (!prepared) return null;
  // In Chat nothing opens by itself: the line points at the button.
  const lead = prepared.line
    .replace(/^Got it, starting/, 'Ready to start')
    .replace(/^Got it, opening/, 'I can open');
  return {
    reply: `${lead} Tap **Open ${skillTitle(prepared.launch.skill)}** below.`,
    launch: prepared.launch,
  };
}

export const chatOrchestrator = new ChatOrchestrator();

const CHAT_REVIEW_CONFIRM_RE =
  /^(?:(?:yes|yeah|yep|yup|sure|ok(?:ay)?)(?:\s+please)?(?:\s+(?:confirm|save(?:\s+(?:it|that))?|do\s+it|go\s+ahead|apply))?|(?:confirm|save(?:\s+(?:it|that))?|do\s+it|go\s+ahead|apply)(?:\s+please)?)[.!]*$/i;

/** A one-word yes/no that could just as well answer the model's question. */
const BARE_CONFIRM_RE =
  /^(?:yes|yeah|yep|yup|sure|ok(?:ay)?)(?:\s+please)?[.!]*$/i;
const BARE_CANCEL_RE = /^(?:no|nope)[.!]*$/i;

/** Which chat, and which assistant reply, offered each review card (audit M1). */
const reviewTurns = new Map<
  string,
  {sessionId: string; assistantMessageId: string}
>();
const MAX_REMEMBERED_REVIEW_TURNS = 50;

function rememberReviewTurn(
  operationId: string,
  sessionId: string,
  assistantMessageId: string,
): void {
  reviewTurns.delete(operationId);
  reviewTurns.set(operationId, {sessionId, assistantMessageId});
  while (reviewTurns.size > MAX_REMEMBERED_REVIEW_TURNS) {
    const oldest = reviewTurns.keys().next().value;
    if (oldest === undefined) break;
    reviewTurns.delete(oldest);
  }
}

/** Keeps the originating chat bubble linked when a pending draft is edited. */
export function rebindReviewTurn(
  oldOperationId: string,
  newOperationId: string,
): void {
  const existing = reviewTurns.get(oldOperationId);
  if (!existing || oldOperationId === newOperationId) return;
  reviewTurns.delete(oldOperationId);
  rememberReviewTurn(
    newOperationId,
    existing.sessionId,
    existing.assistantMessageId,
  );
}

function markReviewMessageResolved(
  userId: string,
  operationId: string,
  status: ChatReviewResolutionStatus,
  fallbackSessionId?: string,
): void {
  try {
    const turn = reviewTurns.get(operationId);
    let targetMessageId = turn?.assistantMessageId;
    if (!targetMessageId) {
      const recent = chatStore.getRecentMessages(
        userId,
        6,
        turn?.sessionId ?? fallbackSessionId,
      );
      for (let i = recent.length - 1; i >= 0; i -= 1) {
        const msg = recent[i];
        if (
          msg.sender === 'assistant' &&
          !msg.reviewResolution &&
          /^(?:\*\*)?Please review:/i.test(msg.content.trim())
        ) {
          targetMessageId = msg.id;
          break;
        }
      }
    }
    if (!targetMessageId) return;
    chatStore.setReviewResolution(
      userId,
      targetMessageId,
      {status, resolvedAt: new Date().toISOString()},
      prev => formatResolvedReviewContent(prev),
    );
    reviewTurns.delete(operationId);
  } catch (error) {
    console.warn(
      '[ChatOrchestrator] Could not mark review message resolved:',
      error,
    );
  }
}

function lastAssistantMessageId(
  userId: string,
  sessionId: string,
): string | null {
  try {
    const recent = chatStore.getRecentMessages(userId, 4, sessionId);
    for (let i = recent.length - 1; i >= 0; i -= 1) {
      if (recent[i].sender === 'assistant') return recent[i].id;
    }
  } catch {
    // Unreadable history: treat the card as not the last turn.
  }
  return null;
}

/** "yes" / "confirm" said when no review card is open. */
const NOTHING_PENDING_CONFIRM_RE =
  /^(?:(?:yes|yeah|yep|yup)(?:\s+please)?(?:\s+(?:confirm|save(?:\s+(?:it|that))?|do\s+it|go\s+ahead|apply))?|(?:confirm|save\s+(?:it|that)|do\s+it|go\s+ahead|apply)(?:\s+(?:it|that))?(?:\s+please)?)[.!]*$/i;

/** "cancel" / "never mind" said when no review card is open. */
const NOTHING_PENDING_CANCEL_RE =
  /^(?:cancel(?:\s+(?:it|that))?|discard(?:\s+(?:it|that))?)[.!]*$/i;

/**
 * Online chat sends the planner snapshot only for questions about the
 * student's own schedule, tasks, notes or time.
 */
const PLANNER_TOPIC_RE =
  /\b(?:schedule|calendar|agenda|plan|plans|planning|class(?:es)?|lecture|exams?|quiz(?:zes)?|midterms?|finals?|deadlines?|due|tasks?|to-?dos?|todo|checklists?|notes?|remind(?:ers?)?|alarm|free|busy|available|week(?:end)?|today|tonight|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next|overdue|behind|study\s+(?:time|session|plan|schedule)|homework|assignments?|projects?|when\s+(?:is|are|do|should)|what\s+(?:do|should)\s+i|my\s+(?:day|morning|afternoon|evening))\b/i;

export const needsPlannerContext = (text: string): boolean =>
  PLANNER_TOPIC_RE.test(text);

const HANDBOOK_PART_UNAVAILABLE =
  "For the USTP Student Handbook part of your question: the offline handbook isn't available on this device yet, so I can't check that policy right now.";

/**
 * Answers the handbook half of a mixed planner + policy message from the
 * local handbook and appends it to the planner reply (audit H3). The planner
 * half is never dropped and the handbook half is never silently ignored.
 */
async function appendHandbookPart(
  reply: string,
  text: string,
  userId: string,
): Promise<{reply: string; note: string | null}> {
  const clause = extractHandbookClause(text);
  if (!clause) {
    return {reply, note: null};
  }
  const eligibility = getUstpEligibility(userId);
  if (!eligibility.eligible) {
    // The planner half is answered; the handbook half is explained, not searched.
    return {
      reply: `${reply}\n\nFor the USTP Student Handbook part of your question: ${ustpUnavailableMessage(
        eligibility.reason,
      )}`,
      note: null,
    };
  }
  try {
    const status = await localHandbookService.ensureReady();
    if (!status.populated) {
      return {reply: `${reply}\n\n${HANDBOOK_PART_UNAVAILABLE}`, note: null};
    }
    const answer = await localHandbookService.answerOffline(clause);
    return {
      reply: `${reply}\n\n---\n\n${answer.reply}`,
      note: handbookSourceLabel(answer.sources),
    };
  } catch (error) {
    console.warn(
      '[ChatOrchestrator] Handbook part of a mixed question:',
      error,
    );
    return {reply: `${reply}\n\n${HANDBOOK_PART_UNAVAILABLE}`, note: null};
  }
}

/** A question that explicitly asks for USTP or Student Handbook content. */
const USTP_SCHOOL_CONTENT_RE =
  /\b(?:ustp|student\s+handbook|handbook|university\s+of\s+science\s+and\s+technology\s+of\s+southern\s+philippines)\b/i;

export const asksForUstpSchoolContent = (text: string): boolean =>
  USTP_SCHOOL_CONTENT_RE.test(text);

const plainChatIntent = (text: string): ValidatedIntent => ({
  intent: 'chat',
  title: '',
  date: null,
  time: null,
  endTime: null,
  durationMinutes: null,
  category: 'Academic',
  details: text,
  snoozeMinutes: null,
  confidence: 1,
  source: 'fast_path',
  rawTranscript: text,
  isValid: true,
});

/** The model said the handbook excerpts it was given don't cover the question. */
const HANDBOOK_DISCLAIMER_RE =
  /\b(?:(?:excerpts?|handbook|passages?)\s+(?:provided\s+)?(?:do(?:es)?\s+not|don['’]t|doesn['’]t)\s+(?:specify|mention|cover|address|say|include|contain)|(?:not|isn['’]t)\s+(?:covered|mentioned|specified|addressed)\s+in\s+the\s+(?:provided\s+)?(?:handbook|excerpts?))/i;

export const replyDisclaimsHandbook = (reply: string): boolean =>
  HANDBOOK_DISCLAIMER_RE.test(reply);

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

/** "Friday 2026-11-13, 10:00 AM" so "what's next?" can be answered. */
const describeNow = (now: Date): string =>
  `${WEEKDAY_NAMES[now.getDay()]} ${formatLocalDate(now)}, ${format12HourTime(
    `${String(now.getHours()).padStart(2, '0')}:${String(
      now.getMinutes(),
    ).padStart(2, '0')}`,
  )}`;

const CHAT_REVIEW_CANCEL_RE =
  /^(?:no|nope|cancel(?:\s+(?:it|that))?|never\s*mind|nevermind|forget\s+it|stop|discard(?:\s+(?:it|that))?)[.!]*$/i;

const CHAT_REVIEW_REVISE_RE =
  /^(?:change|rename|move|make|set|shift|update|reschedule|put|switch|actually)\b/i;

const CLAUSE_ACTION_VERB_RE =
  /\b(?:add|schedule|create|make|remind|set|mark|complete|reopen|pin|unpin|delete|remove|cancel|move|reschedule|update|edit|change|rename|jot|write|save|note:|task:|event:|reminder:)\b/i;

function hasCompoundPlannerActions(
  text: string,
  localValidated: ValidatedIntent,
): boolean {
  if (!text) return false;
  if (
    localValidated.checklistItems &&
    localValidated.checklistItems.length > 0
  ) {
    return false;
  }
  if (localValidated.details?.startsWith('[BATCH_CLASSES:')) {
    return false;
  }
  if (classifySmallTalk(text) || isHandbookQuestion(text)) {
    return false;
  }
  const clauses = splitGroupedClauses(text);
  if (clauses.length < 2) return false;
  const actionClauses = clauses.filter(c => CLAUSE_ACTION_VERB_RE.test(c));
  return actionClauses.length >= 2;
}

function validatedIntentToMultiItem(
  v: ValidatedIntent,
  index: number,
): MultiActionItemData | null {
  let kind: MultiActionItemData['kind'];
  if (v.intent === 'create_task') {
    kind = 'task';
  } else if (v.intent === 'create_reminder') {
    kind = 'reminder';
  } else if (v.intent === 'create_time_block') {
    kind = 'event';
  } else if (v.intent === 'create_note') {
    kind = 'note';
  } else {
    return null;
  }
  return {
    id: `item-${index + 1}-${generateId().slice(0, 6)}`,
    kind,
    title: v.title || `Action ${index + 1}`,
    date: v.date || undefined,
    time: v.time || undefined,
    endTime:
      v.endTime ||
      (kind === 'event' && v.time
        ? addMinutesToTime(v.time, v.durationMinutes ?? 60)
        : undefined),
    priority:
      v.priority?.toLowerCase() === 'high'
        ? 'high'
        : v.priority?.toLowerCase() === 'low'
        ? 'low'
        : 'medium',
    body: kind === 'note' ? v.details || v.title || '' : v.details || undefined,
    status: 'draft',
    savedEntityId: null,
    error: null,
  };
}

async function buildCompoundBatch(
  userId: string,
  text: string,
  referenceDate: Date,
  onlineMode: boolean,
  sessionId: string,
): Promise<MultiActionBatchData | null> {
  if (onlineMode) {
    const extracted = await extractMultiIntentsWithDeepSeek(
      text,
      referenceDate,
    );
    if (extracted && extracted.length >= 2) {
      const mapped = extracted
        .map((v, idx) => validatedIntentToMultiItem(v, idx))
        .filter((item): item is MultiActionItemData => item !== null);
      if (mapped.length >= 2) {
        return createMultiActionBatch(
          sessionId,
          userId,
          mapped,
          extracted.length > 5,
        );
      }
    }
  }
  const parsed = parseGroupedRequest(text, referenceDate);
  if (parsed.items.length >= 2) {
    return createMultiActionBatch(
      sessionId,
      userId,
      parsed.items,
      parsed.truncated,
    );
  }
  return null;
}
