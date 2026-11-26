/**
 * Online Chat agent (ADR-033): DeepSeek may look at the student's planner on
 * this phone and prepare one review card, over several steps, before it
 * answers. The tools run here, on local data; the server only relays.
 *
 * Bounds: at most CHAT_AGENT_MAX_STEPS model steps and five tool calls per
 * step. Reads and free-time lookups never write. `prepare_lafina_action` only
 * shows a card; saving still takes the student's Confirm (or their own "yes").
 * Deleting is never prepared from the model's words. Any failure returns null
 * so Chat falls back to its ordinary online reply.
 */

import {chatMemoryStore} from '../storage/chatMemoryStore';
import {isUstpSchoolEnabled} from '../storage/ustpEligibility';
import {
  formatVoiceUstpToolResult,
  searchUstpSourcesForVoice,
  type UstpSearchCollection,
} from '../handbook';
import {
  extractEmbeddedMemory,
  extractExplicitMemory,
} from './explicitMemory';
import {readLocalVoiceResult} from '../cloud/voiceConversation/localVoiceData';
import {
  handbookPreference,
  onlineChatSkill,
  type AgentExchangeMessage,
  type AgentToolCall,
  type HandbookSource,
  type OnlineChatMessage,
} from '../skills/onlineChatSkill';
import {getRegisteredTool} from './voiceActions/actionRegistry';
import {validatePayload} from './voiceActions/actionValidator';
import {
  answerFreeTime,
  intentFromToolArguments,
  type StructuredActionArgs,
} from './voiceActions/structuredAction';
import {intentService} from './nlu/intentService';
import {routeIntent} from './nlu/intentRoutes';
import {
  cancelReviewedCommand,
  prepareReviewedCommand,
  type PrepareResult,
  type ReviewSurface,
} from './nlu/commandReview';
import type {ValidatedIntent} from './nlu/types';

export const CHAT_AGENT_MAX_STEPS = 4;
const MAX_CALLS_PER_STEP = 5;
const MAX_RESULT_CHARS = 4000;

/** Offered in Chat. No confirm/cancel/revise: the student owns those. */
const CHAT_TOOLS = [
  'read_calendar',
  'read_lafina_data',
  'search_notes',
  'find_free_time',
  'prepare_lafina_action',
] as const;

export interface ChatAgentOptions {
  useHandbook: boolean;
  memories?: {id: string; text: string}[];
  referenceDate: Date;
  /** "Sunday 2026-11-15, 9:00 AM". */
  localNow: string;
  reviewSurface?: ReviewSurface;
  isCurrent?: () => boolean;
  signal?: AbortSignal;
}

export interface ChatAgentResult {
  reply: string;
  /** The card the agent prepared, if any (nothing saved yet). */
  review?: PrepareResult;
  sources: HandbookSource[];
  /** Tool names run, in order (for tests and the report). */
  toolsUsed: string[];
}

const bound = (text: string): string =>
  text.length <= MAX_RESULT_CHARS
    ? text
    : `${text.slice(0, MAX_RESULT_CHARS)}\n(result shortened)`;

const asText = (value: unknown): string =>
  typeof value === 'string' ? value : JSON.stringify(value);

/** The planner change a request-only prepare call describes, read on the device. */
const intentFromRequestText = async (
  request: string,
  userId: string,
  referenceDate: Date,
): Promise<ValidatedIntent | null> => {
  const intent = await intentService.extractIntent(request, {referenceDate, userId});
  if (!intent.isValid || routeIntent(intent.intent) !== 'reviewed_mutation')
    return null;
  if (
    intent.intent.startsWith('delete_') ||
    intent.intent === 'acknowledge' ||
    intent.intent === 'snooze'
  )
    return null;
  return intent;
};

export async function runChatAgent(
  userId: string,
  history: OnlineChatMessage[],
  options: ChatAgentOptions,
): Promise<ChatAgentResult | null> {
  const isCurrent = options.isCurrent ?? (() => true);
  const tools: string[] = [...CHAT_TOOLS];
  if (chatMemoryStore.isEnabled(userId)) tools.push('read_memories');
  if (isUstpSchoolEnabled(userId) && handbookPreference.read(userId))
    tools.push('search_ustp_sources');
  const exchange: AgentExchangeMessage[] = [];
  const toolsUsed: string[] = [];
  const localUstpSources: HandbookSource[] = [];
  let lastUstpQuery: string | null = null;
  let review: PrepareResult | undefined;
  const mergeSources = (remote: HandbookSource[]): HandbookSource[] => {
    const merged: HandbookSource[] = [...localUstpSources];
    const seen = new Set(
      merged.map(s => s.passageId || `${s.title}|${s.section ?? ''}|${s.page ?? ''}`),
    );
    for (const s of remote) {
      const key = s.passageId || `${s.title}|${s.section ?? ''}|${s.page ?? ''}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(s);
      }
    }
    return merged;
  };
  const abandon = (): null => {
    if (review?.status === 'proposal')
      cancelReviewedCommand(userId, review.proposal.operationId);
    return null;
  };

  const runTool = async (call: AgentToolCall): Promise<string> => {
    const definition = getRegisteredTool(call.name);
    if (!definition || !tools.includes(call.name))
      return `The tool ${call.name} is not available in Chat.`;
    const checked = validatePayload(definition.kind, call.arguments);
    if (!checked.valid) return `Invalid arguments: ${checked.error}`;
    const args = checked.data as Record<string, unknown>;
    toolsUsed.push(call.name);
    switch (call.name) {
      case 'read_lafina_data':
        return asText(readLocalVoiceResult(userId, args.kind, args.query));
      case 'read_calendar':
        return asText(
          readLocalVoiceResult(
            userId,
            'calendar',
            args.date || args.query,
            args as {start?: string; end?: string},
          ),
        );
      case 'search_notes':
        return asText(
          readLocalVoiceResult(
            userId,
            'notes',
            args.query,
            args as {limit?: number},
          ),
        );
      case 'read_memories':
        return asText(readLocalVoiceResult(userId, 'memory', args.query));
      case 'search_ustp_sources': {
        const res = await searchUstpSourcesForVoice(
          userId,
          String(args.query ?? ''),
          {
            collection: args.collection as UstpSearchCollection | undefined,
            previousUserQuery: lastUstpQuery,
            referenceDate: options.referenceDate,
          },
        );
        if (res.status === 'ok') {
          lastUstpQuery = String(args.query ?? '');
          const seen = new Set(
            localUstpSources.map(
              s => s.passageId || `${s.title}|${s.section ?? ''}|${s.page ?? ''}`,
            ),
          );
          for (const s of res.sources) {
            const key =
              s.passageId || `${s.title}|${s.section ?? ''}|${s.page ?? ''}`;
            if (!seen.has(key)) {
              seen.add(key);
              localUstpSources.push(s);
            }
          }
        }
        return formatVoiceUstpToolResult(res);
      }
      case 'find_free_time':
        return answerFreeTime(
          userId,
          args as {date?: string; durationMinutes?: number},
          options.referenceDate,
        );
      case 'prepare_lafina_action': {
        if (review?.status === 'proposal')
          return 'A review card is already on the student’s screen. Prepare at most one card per reply.';
        const fields = args as StructuredActionArgs;
        const looksLikeMemoryNote = (value: unknown): boolean => {
          if (typeof value !== 'string') return false;
          const trimmedVal = value.trim();
          if (!trimmedVal) return false;
          return Boolean(
            extractExplicitMemory(trimmedVal) ||
              extractEmbeddedMemory(trimmedVal) ||
              /^(?:prefers\s+(?:studying|to\s+be\s+called)|night\s*owl\b|early\s*bird\b|morning\s+person\b)/i.test(
                trimmedVal,
              ),
          );
        };
        const combinedTitleDetails = [fields.title, fields.details]
          .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
          .join(': ');
        if (
          fields.action === 'create_note' &&
          (looksLikeMemoryNote(fields.request) ||
            looksLikeMemoryNote(fields.details) ||
            looksLikeMemoryNote(combinedTitleDetails))
        ) {
          return 'Personal preferences and habits belong in Chat Memory, not in Notes. No note card was prepared.';
        }
        const intent =
          intentFromToolArguments(fields) ??
          (typeof fields.request === 'string'
            ? await intentFromRequestText(
                fields.request,
                userId,
                options.referenceDate,
              )
            : null);
        if (!isCurrent() || options.signal?.aborted) {
          return 'Request canceled. Nothing was prepared.';
        }
        if (!intent)
          return 'Nothing was prepared: give the action and its details (deleting needs the student to ask in their own words).';
        const prepared = prepareReviewedCommand(userId, intent, {
          referenceDate: options.referenceDate,
          surface: options.reviewSurface ?? 'chat',
        });
        if (prepared.status === 'proposal') {
          review = prepared;
          return `A review card is shown to the student: ${prepared.reply} Nothing is saved until they tap Confirm.`;
        }
        // A clarification card is shown too, so the student can pick.
        if (prepared.status === 'clarify') review = prepared;
        return prepared.reply;
      }
      default:
        return `The tool ${call.name} is not available in Chat.`;
    }
  };

  for (let step = 0; step < CHAT_AGENT_MAX_STEPS; step++) {
    if (!isCurrent() || options.signal?.aborted) return abandon();
    const result = await onlineChatSkill.agentStep(history, {
      tools,
      exchange: [...exchange],
      useHandbook: options.useHandbook,
      ...(options.memories?.length ? {memories: options.memories} : {}),
      ...(options.signal ? {signal: options.signal} : {}),
      localNow: options.localNow,
    });
    if (!isCurrent() || options.signal?.aborted) return abandon();
    if (result.status !== 'success' || !result.data) return abandon();
    const {reply, toolCalls, sources} = result.data;
    if (toolCalls.length === 0) {
      return {
        reply,
        ...(review ? {review} : {}),
        sources: mergeSources(sources),
        toolsUsed,
      };
    }
    if (step === CHAT_AGENT_MAX_STEPS - 1) {
      // Out of steps: answer with what is known instead of looping.
      return {
        reply:
          reply ||
          (review
            ? review.reply
            : 'I looked at your planner but could not finish that in one go. Could you ask in smaller steps?'),
        ...(review ? {review} : {}),
        sources: mergeSources(sources),
        toolsUsed,
      };
    }
    const calls = toolCalls.slice(0, MAX_CALLS_PER_STEP);
    const results: AgentExchangeMessage[] = [];
    for (const call of calls) {
      let content: string;
      try {
        content = bound(await runTool(call));
      } catch (error) {
        console.warn('[ChatAgent] Tool failed:', call.name, error);
        content = 'The app could not complete that. Nothing was changed.';
      }
      if (!isCurrent()) return abandon();
      results.push({role: 'tool', tool_call_id: call.id, content});
    }
    exchange.push(
      {
        role: 'assistant',
        content: null,
        tool_calls: calls.map(call => ({
          id: call.id,
          type: 'function' as const,
          function: {
            name: call.name,
            arguments: JSON.stringify(call.arguments),
          },
        })),
      },
      ...results,
    );
  }
  return abandon();
}
