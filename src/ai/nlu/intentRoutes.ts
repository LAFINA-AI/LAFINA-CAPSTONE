import type {ParsedIntentType} from './types';

/**
 * How an assistant intent is allowed to reach local data (AGY-PORT 04).
 *
 * - `reviewed_mutation`: the assistant only prepares a private proposal; nothing
 *   is written until the student presses Confirm on the review card.
 * - `read_only`: answered from local data without writing anything.
 * - `conversation`: offline replies, online Chat and Handbook RAG, unchanged.
 *
 * `immediateInRingingCall` marks the two reminder actions that stay immediate
 * while a reminder call is ringing. There they go through the call dispatcher's
 * actions with the identity captured by the call, as Answer/ACK/Snooze always did.
 */
export type IntentRouteKind =
  | 'reviewed_mutation'
  | 'read_only'
  | 'conversation';

export interface IntentRouteSpec {
  readonly kind: IntentRouteKind;
  readonly immediateInRingingCall: boolean;
}

/** Exhaustive by construction: adding an intent type fails to compile until it is routed here. */
export const INTENT_ROUTES: Readonly<
  Record<ParsedIntentType, IntentRouteSpec>
> = Object.freeze({
  create_task: {kind: 'reviewed_mutation', immediateInRingingCall: false},
  create_time_block: {kind: 'reviewed_mutation', immediateInRingingCall: false},
  create_reminder: {kind: 'reviewed_mutation', immediateInRingingCall: false},
  create_note: {kind: 'reviewed_mutation', immediateInRingingCall: false},
  update_task: {kind: 'reviewed_mutation', immediateInRingingCall: false},
  update_time_block: {kind: 'reviewed_mutation', immediateInRingingCall: false},
  update_note: {kind: 'reviewed_mutation', immediateInRingingCall: false},
  delete_task: {kind: 'reviewed_mutation', immediateInRingingCall: false},
  delete_time_block: {kind: 'reviewed_mutation', immediateInRingingCall: false},
  delete_note: {kind: 'reviewed_mutation', immediateInRingingCall: false},
  acknowledge: {kind: 'reviewed_mutation', immediateInRingingCall: true},
  snooze: {kind: 'reviewed_mutation', immediateInRingingCall: true},
  reschedule: {kind: 'reviewed_mutation', immediateInRingingCall: false},
  query_schedule: {kind: 'read_only', immediateInRingingCall: false},
  chat: {kind: 'conversation', immediateInRingingCall: false},
  out_of_scope: {kind: 'conversation', immediateInRingingCall: false},
});

export type ResolvedIntentRoute =
  | 'reviewed_mutation'
  | 'read_only'
  | 'call_context_immediate'
  | 'conversation';

/** The identity captured by a ringing reminder call. */
export interface RingingCallContext {
  reminderId: string;
  generation: number;
}

export const isRingingCallContext = (
  value: unknown,
): value is RingingCallContext => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.reminderId === 'string' &&
    candidate.reminderId.length > 0 &&
    typeof candidate.generation === 'number' &&
    Number.isSafeInteger(candidate.generation) &&
    candidate.generation >= 0
  );
};

/**
 * Picks the route for one intent. Unknown values (for example a malformed model
 * output that slipped past validation) fall back to conversation, which never writes.
 */
export const routeIntent = (
  intent: ParsedIntentType,
  context: {ringingCall?: RingingCallContext | null} = {},
): ResolvedIntentRoute => {
  const spec = Object.prototype.hasOwnProperty.call(INTENT_ROUTES, intent)
    ? INTENT_ROUTES[intent]
    : undefined;
  if (!spec) return 'conversation';
  if (
    spec.immediateInRingingCall &&
    isRingingCallContext(context.ringingCall)
  ) {
    return 'call_context_immediate';
  }
  return spec.kind;
};
