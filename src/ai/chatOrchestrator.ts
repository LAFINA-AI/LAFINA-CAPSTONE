import {
  chatStore,
  type ChatAttachment,
  type ChatMessage,
} from '../storage/chatStore';
import {chatMemoryStore} from '../storage/chatMemoryStore';
import {chatMemoryService} from '../cloud/chatMemoryService';
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
import {executeNluAction} from './nlu/actionExecutor';
import {routeIntent} from './nlu/intentRoutes';
import type {ResolvedIntentRoute, RingingCallContext} from './nlu/intentRoutes';
import {
  cancelReviewedCommand,
  confirmReviewedCommand,
  executeLowRiskCommand,
  latestPendingReview,
  prepareReviewedCommand,
  reviseReviewedCommand,
  undoLowRiskCommand,
} from './nlu/commandReview';
import type {UndoOffer, UndoResult} from './nlu/commandReview';
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
}

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
  const offlineNote = ' Your offline scheduling tools are still available.';
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
    options: ProcessMessageOptions = {},
  ): Promise<ChatOrchestratorResult> {
    const trimmed = (text || '').trim();
    const refDate = options.referenceDate || new Date();
    const isTemp = options.temporaryChat === true;
    const ustpRagOnly = options.ustpRagOnly === true;

    // Step 1: Persist user message. The reply goes to the same chat even if
    // the student opens another one while waiting.
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
    const sessionId = userMessage.sessionId;
    const memoryRevision = chatMemoryStore.revision(userId);

    const preference = isTemp || ustpRagOnly ? null : explicitMemory(trimmed);
    if (preference) {
      const enabled = chatMemoryStore.isEnabled(userId);
      const isStudy = !!studyPreference(trimmed);
      const reply = enabled
        ? isStudy
          ? "I'll remember your study preference."
          : "I'll remember that."
        : isStudy
        ? 'Your study preference was not saved because memory is turned off.'
        : 'Memory is turned off, so I did not save that.';
      const assistantMessage = db.transactionSync(tx => {
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
          return {...message, memoryChanges: changes};
        }
        return message;
      });
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

    if (!isTemp && !ustpRagOnly && isForgetAllMemoriesRequest(trimmed)) {
      const reply =
        "I've forgotten all saved memories on this phone. Your chats are kept.";
      const assistantMessage = db.transactionSync(tx => {
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
    // A complete DeepSeek conversation reply is checked for memories afterwards.
    let learnFromReply = false;

    // Step 1.5: Conversational Confirm / Cancel / Revise on an active Chat review card
    const activeSurface: ReviewSurface = options.reviewSurface ?? 'chat';
    const pendingProposal =
      !isTemp && !ustpRagOnly && !options.ringingCall
        ? latestPendingReview(userId, activeSurface)
        : null;
    if (pendingProposal) {
      if (CHAT_REVIEW_CONFIRM_RE.test(trimmed)) {
        const outcome = confirmReviewedCommand(
          userId,
          pendingProposal.operationId,
        );
        const assistantMessage = chatStore.addMessage(
          userId,
          'assistant',
          outcome.reply,
          null,
          {localReply: true},
          sessionId,
        );
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
      if (CHAT_REVIEW_CANCEL_RE.test(trimmed)) {
        cancelReviewedCommand(userId, pendingProposal.operationId);
        const cancelMsg = 'Cancelled. Nothing was changed.';
        const assistantMessage = chatStore.addMessage(
          userId,
          'assistant',
          cancelMsg,
          null,
          {localReply: true},
          sessionId,
        );
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
          const assistantMessage = chatStore.addMessage(
            userId,
            'assistant',
            revised.reply,
            null,
            {localReply: true},
            sessionId,
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
      });
      validated = localValidated;
      if (
        options.onlineMode &&
        shouldUseOnlineIntentExtraction(trimmed, localValidated)
      ) {
        const onlineValidated = await extractIntentWithDeepSeek(
          trimmed,
          refDate,
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
        const lowRisk = executeLowRiskCommand(userId, validated, {
          referenceDate: refDate,
          surface: options.reviewSurface,
          ringingCall: options.ringingCall,
        });
        if (lowRisk.status === 'applied') {
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
        if (options.onlineMode) {
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
          const onReplyText = options.onReplyText;
          // Dedicated USTP RAG mode always uses the USTP Student Handbook. In
          // general chat, respect options.useHandbook and skip greeting searches.
          const useHandbook = ustpRagOnly
            ? true
            : options.useHandbook !== false &&
              !(
                smallTalk &&
                trimmed.length <= SMALL_TALK_MAX_CHARS &&
                !isHandbookQuestion(trimmed)
              );
          // What LAFINA remembers about the student rides along (none when off).
          const memories = chatMemoryStore.isEnabled(userId)
            ? chatMemoryStore.forPrompt(userId)
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
                })
              : null;
          if (agent) {
            finalReply = agent.reply || agent.review?.reply || '';
            handbookNote = handbookSourceLabel(agent.sources);
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
          // When local USTP handbook chunks are present, send useHandbook=false
          // so LAFINA-backend skips Pinecone completely while still streaming DeepSeek.
          const remoteUseHandbook = localPopulated ? false : useHandbook;
          const onlineResult =
            agent || followUpAgent || localUstpUnsupported
              ? null
              : onReplyText
              ? await onlineChatSkill.streamChatMessage(history, {
                  useHandbook: remoteUseHandbook,
                  onReplyText,
                  ...memoryOption,
                })
              : await onlineChatSkill.sendChatMessage(history, {
                  useHandbook: remoteUseHandbook,
                  ...memoryOption,
                });
          if (!onlineResult) {
            // Answered by the Chat agent or local fail-closed refusal above.
          } else if (onlineResult.status === 'success' && onlineResult.data) {
            finalReply = onlineResult.data.interrupted
              ? `${onlineResult.data.reply}\n\n${INTERRUPTED_REPLY_NOTE}`
              : onlineResult.data.reply;
            handbookNote =
              handbookSourceLabel(onlineResult.data.sources) ??
              (localHandbookContext
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
              ustpRagOnly ||
              (options.useHandbook &&
                /\b(?:ustp|handbook|dean'?s\s+list|grading|policy|curriculum|tuition|retention)\b/i.test(
                  trimmed,
                ))
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
          if (ustpRagOnly || isHandbookQuestion(trimmed)) {
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

    // Ensure "LAFINA" is not capitalized as an acronym so chat display and TTS pronounce "lafina" naturally
    finalReply = finalReply
      .replace(/\bL[.-]?A[.-]?F[.-]?I[.-]?N[.-]?A\b/gi, 'lafina')
      .replace(/\bLAFINA\b/g, 'lafina');

    // Step 6: Persist assistant message (or return in-memory in Temporary Chat)
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

    // Background: never delays or changes the reply. Chat hears about any
    // change through CHAT_MEMORY_CHANGED_EVENT and shows it under this reply.
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

    // Step 7: Non-blocking react-native-tts speech synthesis if requested
    if (options.speakReply) {
      try {
        await ttsService.speak(finalReply);
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
      reply: finalReply,
    };
  }

  /**
   * Applies a reviewed proposal once and records the outcome in the owner's
   * transcript. A repeated Confirm returns the first receipt and adds nothing.
   */
  async confirmReview(
    userId: string,
    operationId: string,
    options: {speakReply?: boolean} = {},
  ): Promise<ReviewDecisionResult> {
    const outcome = confirmReviewedCommand(userId, operationId);
    let assistantMessage: ChatMessage | null = null;
    if (!(outcome.status === 'applied' && outcome.repeated)) {
      try {
        assistantMessage = chatStore.addMessage(
          userId,
          'assistant',
          outcome.reply,
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
    options: {recordInChat?: boolean} = {},
  ): ReviewDecisionResult {
    const cancelled = cancelReviewedCommand(userId, operationId);
    const reply = cancelled
      ? 'Cancelled. Nothing was changed.'
      : 'There was nothing to cancel. Nothing was changed.';
    let assistantMessage: ChatMessage | null = null;
    if (cancelled && options.recordInChat !== false) {
      try {
        assistantMessage = chatStore.addMessage(userId, 'assistant', reply);
      } catch (error) {
        console.warn(
          '[ChatOrchestrator] Could not save the cancellation to chat:',
          error,
        );
      }
    }
    return {cancelled, assistantMessage, reply};
  }
}

export const chatOrchestrator = new ChatOrchestrator();

const CHAT_REVIEW_CONFIRM_RE =
  /^(?:(?:yes|yeah|yep|yup|sure|ok(?:ay)?)(?:\s+please)?(?:\s+(?:confirm|save(?:\s+(?:it|that))?|do\s+it|go\s+ahead|apply))?|(?:confirm|save(?:\s+(?:it|that))?|do\s+it|go\s+ahead|apply)(?:\s+please)?)[.!]*$/i;

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
    endTime: v.endTime || undefined,
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
