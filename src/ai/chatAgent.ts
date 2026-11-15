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
import {readLocalVoiceResult} from '../cloud/voiceConversation/localVoiceData';
import {
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
  isCurrent?: () => boolean;
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
  referenceDate: Date,
): Promise<ValidatedIntent | null> => {
  const intent = await intentService.extractIntent(request, {referenceDate});
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
  const exchange: AgentExchangeMessage[] = [];
  const toolsUsed: string[] = [];
  let review: PrepareResult | undefined;
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
        const intent =
          intentFromToolArguments(fields) ??
          (typeof fields.request === 'string'
            ? await intentFromRequestText(fields.request, options.referenceDate)
            : null);
        if (!intent)
          return 'Nothing was prepared: give the action and its details (deleting needs the student to ask in their own words).';
        const prepared = prepareReviewedCommand(userId, intent, {
          referenceDate: options.referenceDate,
          surface: 'chat',
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
    const result = await onlineChatSkill.agentStep(history, {
      tools,
      exchange: [...exchange],
      useHandbook: options.useHandbook,
      ...(options.memories?.length ? {memories: options.memories} : {}),
      localNow: options.localNow,
    });
    if (!isCurrent()) return abandon();
    if (result.status !== 'success' || !result.data) return abandon();
    const {reply, toolCalls, sources} = result.data;
    if (toolCalls.length === 0) {
      return {reply, ...(review ? {review} : {}), sources, toolsUsed};
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
        sources,
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
