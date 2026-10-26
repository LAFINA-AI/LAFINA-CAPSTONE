import {intentDate, intentWhen, IntentTimeError} from './intentTime';
import {
  validateIntent,
  validateIntentContext,
  hasControlCharacters,
  type Intent,
  type IntentContext,
  type NamedTarget,
  type ParseResult,
} from './intents';

const temporalSuffix =
  /^(.*?)\s+(?:on )?((?:today|tomorrow|\d{4}-\d{2}-\d{2})(?: at .+)?|in \d{1,4} (?:minutes?|mins?))$/i;
const vagueDate =
  /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|later|tonight|soon|next week|next month)\b/i;
const support =
  'Use one local command, such as “Remind me to revise tomorrow at 7 PM”, “Move task "revise" to tomorrow at 8 PM”, or “Show tasks today”. You can always use Calendar manually.';

function clarify(message: string, missingSlots: string[]): ParseResult {
  return {
    status: 'clarification',
    message,
    confidence: 0,
    needsConfirmation: false,
    missingSlots,
  };
}
function ready(intent: Intent, context: IntentContext): ParseResult {
  const validated = validateIntent(intent, context);
  return {
    status: 'ready',
    intent: validated,
    timezone: context.timezone,
    confidence: 1,
    needsConfirmation: !['query', 'repeat'].includes(validated.kind),
    sourceTargetId: null,
    slots: {
      present: [
        ...Object.entries(validated)
          .filter(([key, value]) => key !== 'kind' && value !== null)
          .map(([key]) => key),
        'timezone',
      ],
      missing: [],
    },
  };
}
function named(kind: string, title: string): NamedTarget {
  return {kind: kind.toLowerCase() as NamedTarget['kind'], title: title.trim()};
}
function taskBody(
  body: string,
  context: IntentContext,
  reminder: boolean,
): Intent {
  // An unquoted trailing modifier is explicit syntax. A quoted title such as
  // "UNDATED" remains literal, and reminder commands still require a time.
  const explicitUndated = !reminder && /(?:^|\s)undated$/i.test(body);
  const content = explicitUndated
    ? body.replace(/(?:^|\s)undated$/i, '').trim()
    : body;
  const quoted = /^"([^"\n]+)"(?: (.+))?$/.exec(content);
  let title: string;
  let when: string | undefined;
  if (quoted) {
    title = quoted[1]!.trim();
    when = quoted[2]?.replace(/^on /i, '');
  } else {
    const match = temporalSuffix.exec(content);
    title = (match ? match[1]! : content).trim();
    when = match?.[2];
    if (
      !match &&
      (vagueDate.test(content) ||
        /\b(?:on|at|by|in|today|tomorrow)\b/i.test(content))
    ) {
      throw new IntentTimeError(
        'Include an exact due date/time, or quote the title to create an undated task.',
        ['date', 'time'],
      );
    }
  }
  if (title.includes('"'))
    throw new IntentTimeError(
      'Use one matching pair of quotes around the title.',
      ['title'],
    );
  if (explicitUndated && when)
    throw new IntentTimeError(
      'Choose either an undated task or an explicit due date/time, not both.',
      ['date'],
    );
  if (!when && reminder)
    throw new IntentTimeError('What date and time should this reminder use?', [
      'date',
      'time',
    ]);
  const due = when
    ? intentWhen(when, context, reminder)
    : {at: null, date: null};
  return {kind: 'create_task', title, ...due, reminder};
}

/** Anchored English command grammar. Edits/deletes identify one quoted exact
 * title; weekdays, multiple actions, negation and raw JSON/SQL are refused.
 * Parsing creates data only. Every supported mutation still requires review.
 */
export function parseIntent(text: string, context: IntentContext): ParseResult {
  try {
    validateIntentContext(context);
    if (
      typeof text !== 'string' ||
      !text.trim() ||
      text.length > 2000 ||
      hasControlCharacters(text)
    ) {
      return clarify(
        'Enter one command of 1–2000 characters, without control characters or multiple lines.',
        ['command'],
      );
    }
    const command = text
      .trim()
      .replace(/[“”]/g, '"')
      .replace(/[’]/g, "'")
      .replace(/\s+/g, ' ')
      .replace(/^please /i, '')
      .replace(/\.$/, '');
    if (
      /\b(?:not|never|don't|cannot|can't)\b/i.test(command) ||
      [';', '{', '}', '[', ']'].some(character =>
        command.includes(character),
      ) ||
      /\b(?:and|then|but|also)\s+(?:please\s+)?(?:add|create|remind|move|complete|delete|cancel|ack|acknowledge|snooze|repeat|show|list|schedule|mark|change)\b/i.test(
        command,
      )
    ) {
      return clarify(
        'That wording is negative, conflicting or contains multiple actions. State one action explicitly; nothing has changed.',
        ['action'],
      );
    }
    if (/^(?:ok(?:ay)?|sure|alright)(?:\b|$)/i.test(command)) {
      return clarify(
        'Do you want to acknowledge a specific alert or snooze it for an exact number of minutes? “Okay” alone changes nothing.',
        ['action', 'target'],
      );
    }
    if (/^(?:repeat|repeat that|repeat (?:the )?last reply)$/i.test(command))
      return ready({kind: 'repeat'}, context);
    const query =
      /^(?:show|list)(?: my)? (?:(active|completed|all) )?tasks(?: (?:on )?(today|tomorrow|\d{4}-\d{2}-\d{2}))?\??$/i.exec(
        command,
      );
    if (query)
      return ready(
        {
          kind: 'query',
          scope: 'tasks',
          date: query[2] ? intentDate(query[2], context) : null,
          filter: (query[1]?.toLowerCase() ?? 'active') as
            | 'active'
            | 'completed'
            | 'all',
        },
        context,
      );
    const dueQuery =
      /^(?:what(?:'s| is) due|show(?: my)? (?:schedule|agenda)) (?:on )?(today|tomorrow|\d{4}-\d{2}-\d{2})\??$/i.exec(
        command,
      );
    if (dueQuery)
      return ready(
        {
          kind: 'query',
          scope: 'agenda',
          date: intentDate(dueQuery[1]!, context),
          filter: 'active',
        },
        context,
      );
    if (command.endsWith('?'))
      return {
        status: 'unsupported',
        message: support,
        confidence: 0,
        needsConfirmation: false,
        missingSlots: [],
      };
    const ack =
      /^(?:ack|acknowledge)(?: (?:the )?reminder)?(?: for (task|event) "([^"\n]+)")?$/i.exec(
        command,
      );
    if (ack)
      return ready(
        {kind: 'ack', target: ack[1] ? named(ack[1], ack[2]!) : null},
        context,
      );
    const snooze =
      /^snooze(?: (?:the )?reminder)?(?: for (task|event) "([^"\n]+)")? (?:for )?(\d{1,4}) (?:minutes?|mins?)$/i.exec(
        command,
      );
    if (snooze)
      return ready(
        {
          kind: 'snooze',
          target: snooze[1] ? named(snooze[1], snooze[2]!) : null,
          minutes: Number(snooze[3]),
        },
        context,
      );
    const move = /^(?:move|reschedule) (task|event) "([^"\n]+)" to (.+)$/i.exec(
      command,
    );
    if (move) {
      const when = intentWhen(move[3]!, context, true);
      return ready(
        {kind: 'move', target: named(move[1]!, move[2]!), at: when.at!},
        context,
      );
    }
    const complete =
      /^(?:complete|finish) task "([^"\n]+)"$/i.exec(command) ??
      /^mark task "([^"\n]+)" complete$/i.exec(command);
    if (complete)
      return ready(
        {kind: 'complete', target: {kind: 'task', title: complete[1]!.trim()}},
        context,
      );
    const remove = /^(?:delete|remove) (task|event) "([^"\n]+)"$/i.exec(
      command,
    );
    if (remove)
      return ready(
        {kind: 'delete', target: named(remove[1]!, remove[2]!)},
        context,
      );
    const event =
      /^(?:schedule|add|create) (?:an? )?event (.+) (?:for|lasting) (\d{1,4}) (?:minutes?|mins?)$/i.exec(
        command,
      );
    if (event) {
      const base = taskBody(event[1]!, context, true);
      if (base.kind !== 'create_task' || base.at === null)
        throw new Error('Include the event start time.');
      const minutes = Number(event[2]);
      if (minutes < 1 || minutes > 1440)
        throw new IntentTimeError('Use an event duration of 1–1440 minutes.', [
          'duration',
        ]);
      return ready(
        {
          kind: 'create_event',
          title: base.title,
          startAt: base.at,
          endAt: new Date(Date.parse(base.at) + minutes * 60_000).toISOString(),
        },
        context,
      );
    }
    const create = /^(remind me to|(?:add|create) (?:a )?task) (.+)$/i.exec(
      command,
    );
    if (create)
      return ready(
        taskBody(
          create[2]!,
          context,
          create[1]!.toLowerCase() === 'remind me to',
        ),
        context,
      );
    if (
      /^(?:delete|remove|move|reschedule|complete|finish|mark|ack|acknowledge|snooze|cancel|change)\b/i.test(
        command,
      )
    ) {
      return clarify(
        'Specify one exact task or event title in quotes, the action and any required time. Bulk actions and vague targets are not supported; use Calendar to review items individually.',
        ['target', 'action'],
      );
    }
    if (
      vagueDate.test(command) ||
      /^(?:schedule|add|create) (?:an? )?event\b/i.test(command)
    ) {
      return clarify(
        'Use an exact date and time. Events also need a duration such as “for 60 minutes”. Weekdays and “later” are not assigned a guessed time.',
        ['date', 'time', 'duration'],
      );
    }
    return {
      status: 'unsupported',
      message: support,
      confidence: 0,
      needsConfirmation: false,
      missingSlots: [],
    };
  } catch (error) {
    return clarify(
      error instanceof Error
        ? error.message
        : 'The command could not be validated. Use Calendar or rephrase with exact values.',
      error instanceof IntentTimeError ? error.missingSlots : ['command'],
    );
  }
}
