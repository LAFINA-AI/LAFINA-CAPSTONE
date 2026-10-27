import type {
  AcademicEvent,
  PlannerCommandTarget,
  PlannerRepository,
  ReminderWithJob,
  Task,
} from '../domain/planner';
import {validateLead} from '../domain/plannerValidation';
import {assertTimezone, assertUtc, localDateTime} from '../domain/scheduleTime';
import type {Intent, IntentContext, NamedTarget} from './intents';
import {validateIntent} from './intents';
import {parseIntent} from './parseIntent';

export interface CommandReview {
  id: string;
  summary: string;
  sourceTargetId: string | null;
  needsConfirmation: true;
}
export interface CommandReply {
  message: string;
  review?: CommandReview;
  changed?: boolean;
}
export interface CommandSession {
  submit(text: string): CommandReply;
  confirm(reviewId: string): CommandReply;
  cancel(): void;
  dispose(): void;
}
interface Pending {
  review: CommandReview;
  intent: Intent;
  context: IntentContext;
  token: string;
  defaultLead: number;
  target: PlannerCommandTarget | null;
  reminder: ReminderWithJob | null;
  apply: () => CommandReply;
}
let sequence = 0;
const FIVE_MINUTES = 300_000;
const closed = 'This chat session has ended. Reopen Chat to review a command.';
const delivery =
  ' Android delivery still depends on reminder settings and permissions; saving is not proof of delivery.';
function quote(title: string): string {
  return JSON.stringify(title);
}
function describe(at: string, timezone: string) {
  const local = localDateTime(at, timezone);
  return `${local.date} at ${local.time} (${timezone}; ${at})`;
}
function validContext(context: IntentContext): IntentContext {
  assertUtc(context.now);
  assertTimezone(context.timezone);
  return {...context};
}
function future(at: string, context: IntentContext, lead: number | null) {
  assertUtc(at);
  if (at <= context.now) throw new Error('Choose a future date and time.');
  if (
    lead !== null &&
    Date.parse(at) - lead * 60_000 <= Date.parse(context.now)
  ) {
    throw new Error(
      'The reminder lead would put its alert in the past. Choose a later time or change the default lead in Profile → Scheduling & Reminder Preferences.',
    );
  }
}
function sourceActive(source: Task | AcademicEvent) {
  return ['TODO', 'IN_PROGRESS', 'ACTIVE'].includes(source.status);
}

/** Parser output is a proposal, never a write. Only the private, expiring review
 * held here can reach an existing versioned/idempotent repository operation.
 * History and pending proposals are memory-only and disappear on disposal.
 */
export function createCommandSession({
  repository,
  context,
  defaultLeadMinutes,
  token = () =>
    `cmd_${Date.now().toString(36)}_${sequence++}_${Math.random()
      .toString(36)
      .slice(2, 14)}`,
}: {
  repository: PlannerRepository;
  context: () => IntentContext;
  defaultLeadMinutes: () => number;
  token?: () => string;
}): CommandSession {
  let pending: Pending | null = null;
  let disposed = false;
  let previous = '';
  const completed = new Map<string, CommandReply>();
  function reply(result: CommandReply): CommandReply {
    previous = result.message;
    return result;
  }
  function target(named: NamedTarget): PlannerCommandTarget {
    const page = repository.findTargets(named);
    if (page.hasMore || page.items.length > 1) {
      throw new Error(
        'More than one saved item has that exact title. Rename the intended item in Calendar before using a chat action.',
      );
    }
    const item = page.items[0];
    if (!item) {
      throw new Error(
        'No saved item has that exact title. Use the full title in quotes, or choose it in Calendar.',
      );
    }
    return item;
  }
  function source(item: PlannerCommandTarget): Task | AcademicEvent {
    const saved =
      item.kind === 'task'
        ? repository.getTask(item.id)
        : repository.getEvent(item.id);
    if (!saved || saved.version !== item.version) {
      throw new Error(
        'That item changed or was deleted. Send a new command and review it again.',
      );
    }
    return saved;
  }
  function ringing(item: PlannerCommandTarget): ReminderWithJob {
    const page = repository.reminderPage({
      kind: item.kind,
      id: item.id,
      limit: 50,
    });
    const active = page.items.filter(
      row => row.reminder.status === 'RINGING' && row.job.status === 'RINGING',
    );
    if (page.hasMore || active.length !== 1) {
      throw new Error(
        'Choose one currently ringing reminder using its visible controls. This item has no unique ringing reminder in the bounded chat view.',
      );
    }
    return active[0]!;
  }
  function query(intent: Extract<Intent, {kind: 'query'}>, ctx: IntentContext) {
    const lines: string[] = [];
    let more = false;
    if (intent.date === null) {
      const page = repository.tasksPage({filter: intent.filter, limit: 20});
      more = page.hasMore;
      for (const task of page.items) {
        lines.push(
          `${quote(task.title)} — ${task.status}; ${
            task.dueAt
              ? describe(task.dueAt, ctx.timezone)
              : task.dueDate ?? 'no due date'
          }.`,
        );
      }
    } else {
      const page = repository.agendaPage({
        fromDate: intent.date,
        toDate: intent.date,
        timezone: ctx.timezone,
        includeCompleted: intent.filter !== 'active',
        limit: 20,
      });
      more = page.nextCursor !== null;
      for (const item of page.items) {
        if (intent.scope === 'tasks' && item.kind !== 'task') continue;
        if (intent.filter === 'completed' && item.status !== 'COMPLETED')
          continue;
        lines.push(
          `${item.kind}: ${quote(item.title)} — ${item.status}; ${
            item.at
              ? describe(item.at, ctx.timezone)
              : `${item.date} (date only)`
          }.`,
        );
      }
    }
    const visible: string[] = [];
    let length = 0;
    for (const line of lines) {
      if (length + line.length > 1650) {
        more = true;
        break;
      }
      visible.push(line);
      length += line.length;
    }
    const heading = intent.date
      ? `${intent.scope === 'tasks' ? 'Tasks' : 'Planner'} for ${
          intent.date
        } (${ctx.timezone}).`
      : 'Saved tasks.';
    return {
      message: `${heading}\n${
        visible.join('\n') || 'No matching items in this page.'
      }${
        more ? '\nThis is a bounded page. Open Calendar for further items.' : ''
      }`,
      changed: false,
    };
  }
  function prepare(intent: Intent, ctx: IntentContext): CommandReply {
    const operationToken = token();
    const defaultLead = defaultLeadMinutes();
    validateLead(defaultLead);
    let item: PlannerCommandTarget | null = null;
    let reminder: ReminderWithJob | null = null;
    let summary: string;
    let apply: () => CommandReply;
    switch (intent.kind) {
      case 'create_task': {
        const lead = intent.reminder ? defaultLead : null;
        if (intent.at) future(intent.at, ctx, lead);
        if (
          intent.date &&
          intent.date < localDateTime(ctx.now, ctx.timezone).date
        ) {
          throw new Error('Choose today or a future date for a new task.');
        }
        summary = `Create task ${quote(intent.title)}: ${
          intent.at
            ? describe(intent.at, ctx.timezone)
            : intent.date ?? 'no due date'
        }. ${
          lead === null ? 'No reminder.' : `Reminder ${lead} minutes before.`
        }`;
        apply = () => {
          repository.createTask({
            token: operationToken,
            draft: {
              title: intent.title,
              notes: '',
              dueAt: intent.at,
              dueDate: intent.date,
              timezone: ctx.timezone,
              status: 'TODO',
            },
            reminderLeadMinutes: lead,
          });
          return {
            message: `Saved task ${quote(intent.title)} on this phone.${
              lead === null ? ' No reminder was requested.' : delivery
            }`,
            changed: true,
          };
        };
        break;
      }
      case 'create_event': {
        future(intent.startAt, ctx, defaultLead);
        summary = `Create event ${quote(intent.title)} from ${describe(
          intent.startAt,
          ctx.timezone,
        )} until ${describe(
          intent.endAt,
          ctx.timezone,
        )}. Reminder ${defaultLead} minutes before.`;
        apply = () => {
          repository.createEvent({
            token: operationToken,
            draft: {
              title: intent.title,
              notes: '',
              startAt: intent.startAt,
              endAt: intent.endAt,
              timezone: ctx.timezone,
              recurrence: null,
              status: 'ACTIVE',
            },
            reminderLeadMinutes: defaultLead,
          });
          return {
            message: `Saved event ${quote(
              intent.title,
            )} on this phone.${delivery}`,
            changed: true,
          };
        };
        break;
      }
      case 'move': {
        item = target(intent.target);
        const saved = source(item);
        if (!sourceActive(saved))
          throw new Error(
            'Only an open task or active event can be moved. Use Calendar to change its status explicitly.',
          );
        if (item.kind === 'event' && (saved as AcademicEvent).recurrence)
          throw new Error(
            'Use Calendar to review a recurring series. Chat will not move the whole series implicitly.',
          );
        future(intent.at, ctx, saved.reminderLeadMinutes);
        const captured = item;
        const movedEnd =
          captured.kind === 'event'
            ? new Date(
                Date.parse(intent.at) +
                  Date.parse((saved as AcademicEvent).endAt) -
                  Date.parse((saved as AcademicEvent).startAt),
              ).toISOString()
            : null;
        if (movedEnd) assertUtc(movedEnd);
        summary = `Move ${item.kind} ${quote(saved.title)} to ${describe(
          intent.at,
          ctx.timezone,
        )}${movedEnd ? ` until ${describe(movedEnd, ctx.timezone)}` : ''}. ${
          saved.reminderLeadMinutes === null
            ? 'No reminder.'
            : `Keep its ${saved.reminderLeadMinutes}-minute reminder lead.`
        }`;
        apply = () => {
          if (captured.kind === 'task')
            repository.updateTask({
              token: operationToken,
              id: captured.id,
              expectedVersion: captured.version,
              draft: {
                ...(saved as Task),
                dueAt: intent.at,
                dueDate: null,
                timezone: ctx.timezone,
              },
              reminderLeadMinutes: saved.reminderLeadMinutes,
            });
          else {
            const event = saved as AcademicEvent;
            repository.updateEvent({
              token: operationToken,
              id: captured.id,
              expectedVersion: captured.version,
              draft: {
                ...event,
                startAt: intent.at,
                endAt: movedEnd!,
                timezone: ctx.timezone,
              },
              reminderLeadMinutes: event.reminderLeadMinutes,
            });
          }
          return {
            message: `Moved ${captured.kind} ${quote(
              saved.title,
            )} to ${describe(intent.at, ctx.timezone)}.${
              saved.reminderLeadMinutes === null ? '' : delivery
            }`,
            changed: true,
          };
        };
        break;
      }
      case 'complete':
      case 'delete': {
        item = target(intent.target);
        const saved = source(item);
        const captured = item;
        if (
          intent.kind === 'complete' &&
          (item.kind !== 'task' || !sourceActive(saved))
        )
          throw new Error(
            'Completion requires one open task. Reminder acknowledgement is a separate action.',
          );
        if (
          intent.kind === 'delete' &&
          item.kind === 'event' &&
          (saved as AcademicEvent).recurrence
        )
          throw new Error(
            'Use Calendar to review deletion of a recurring series. Chat will not remove all its occurrences implicitly.',
          );
        summary =
          intent.kind === 'complete'
            ? `Mark task ${quote(
                saved.title,
              )} COMPLETED and cancel its outstanding reminders.`
            : `Delete ${item.kind} ${quote(
                saved.title,
              )} and cancel its reminders. This hides it and keeps cancellation tombstones.`;
        apply = () => {
          const command = {
            token: operationToken,
            id: captured.id,
            expectedVersion: captured.version,
          };
          if (intent.kind === 'complete')
            repository.updateTask({
              ...command,
              draft: {...(saved as Task), status: 'COMPLETED'},
              reminderLeadMinutes: saved.reminderLeadMinutes,
            });
          else if (captured.kind === 'task') repository.deleteTask(command);
          else repository.deleteEvent(command);
          return {
            message:
              intent.kind === 'complete'
                ? `Task ${quote(
                    saved.title,
                  )} marked COMPLETED explicitly. Outstanding reminders were cancelled.`
                : `Deleted ${captured.kind} ${quote(
                    saved.title,
                  )}. Its reminders were cancelled.`,
            changed: true,
          };
        };
        break;
      }
      case 'ack':
      case 'snooze': {
        if (!intent.target)
          throw new Error(
            'Name the exact task or event for the ringing reminder, or use its visible Answer/Snooze controls. A bare acknowledgement never chooses an alert automatically.',
          );
        item = target(intent.target);
        const saved = source(item);
        if (!sourceActive(saved))
          throw new Error(
            'That source is no longer open. Check its reminder in Calendar.',
          );
        reminder = ringing(item);
        const captured = reminder;
        const unchanged =
          item.kind === 'task'
            ? 'The underlying task has not been completed.'
            : 'The event remains active.';
        summary =
          intent.kind === 'ack'
            ? `Acknowledge the ringing reminder for ${quote(saved.title)}. ${
                item.kind === 'task'
                  ? 'The task stays incomplete.'
                  : 'The event stays active.'
              }`
            : `Snooze the ringing reminder for ${quote(saved.title)} by ${
                intent.minutes
              } minutes from confirmation. Its academic deadline stays unchanged.`;
        apply = () => {
          const outcome = repository.reminderAction({
            token: operationToken,
            id: captured.reminder.id,
            occurrenceKey: captured.reminder.occurrenceKey,
            generation: captured.job.generation,
            action:
              intent.kind === 'ack'
                ? {kind: 'ACK'}
                : {kind: 'SNOOZE', minutes: intent.minutes},
          });
          return outcome === 'applied'
            ? {
                message:
                  intent.kind === 'ack'
                    ? `Reminder acknowledged. ${unchanged}`
                    : `Reminder snoozed for ${intent.minutes} minutes. Its source and academic deadline have not changed.`,
                changed: true,
              }
            : {
                message:
                  'That reminder changed or its response window expired. No acknowledgement or snooze was applied. Check the planner.',
                changed: false,
              };
        };
        break;
      }
      default:
        throw new Error('This command has no planner change to confirm.');
    }
    const review: CommandReview = {
      id: `review_${operationToken}`,
      summary,
      sourceTargetId: item?.id ?? null,
      needsConfirmation: true,
    };
    pending = {
      review: {...review},
      intent,
      context: ctx,
      token: operationToken,
      defaultLead,
      target: item,
      reminder,
      apply,
    };
    return {
      message: 'Review the exact action below. Nothing has changed yet.',
      review,
    };
  }
  return {
    submit(text) {
      if (disposed) return {message: closed, changed: false};
      pending = null;
      try {
        const ctx = validContext(context());
        const parsed = parseIntent(text, ctx);
        if (parsed.status !== 'ready')
          return reply({message: parsed.message, changed: false});
        const intent = validateIntent(parsed.intent, ctx);
        if (intent.kind === 'repeat')
          return {
            message:
              previous ||
              'There is no earlier reply in this chat. Send a command first.',
            changed: false,
          };
        if (intent.kind === 'query') return reply(query(intent, ctx));
        return reply(prepare(intent, ctx));
      } catch (error) {
        pending = null;
        return reply({
          message:
            error instanceof Error
              ? error.message
              : 'The local command could not be reviewed. Use Calendar or rephrase it.',
          changed: false,
        });
      }
    },
    confirm(reviewId) {
      if (disposed) return {message: closed, changed: false};
      const cached = completed.get(reviewId);
      if (cached) return {...cached};
      const review = pending;
      if (!review || review.review.id !== reviewId)
        return reply({
          message:
            'That review is no longer current. Send the command again; nothing was confirmed.',
          changed: false,
        });
      try {
        const ctx = validContext(context());
        const elapsed = Date.parse(ctx.now) - Date.parse(review.context.now);
        if (
          elapsed < 0 ||
          elapsed >= FIVE_MINUTES ||
          ctx.timezone !== review.context.timezone ||
          defaultLeadMinutes() !== review.defaultLead
        ) {
          pending = null;
          return reply({
            message:
              'Time, timezone or default reminder settings changed, or this review expired. Send a fresh command and check its exact date/time.',
            changed: false,
          });
        }
        validateIntent(review.intent, ctx);
        const intent = review.intent;
        if (intent.kind === 'create_task' && intent.at)
          future(intent.at, ctx, intent.reminder ? review.defaultLead : null);
        if (intent.kind === 'create_event')
          future(intent.startAt, ctx, review.defaultLead);
        if (review.target) {
          const current = target({
            kind: review.target.kind,
            title: review.target.title,
          });
          if (
            current.id !== review.target.id ||
            current.version !== review.target.version
          )
            throw new Error(
              'That item changed or was deleted. Send a new command and review it again.',
            );
          const saved = source(current);
          if (intent.kind === 'move')
            future(intent.at, ctx, saved.reminderLeadMinutes);
          if (review.reminder) {
            const active = ringing(current);
            if (
              active.reminder.id !== review.reminder.reminder.id ||
              active.reminder.version !== review.reminder.reminder.version ||
              active.job.generation !== review.reminder.job.generation ||
              active.reminder.occurrenceKey !==
                review.reminder.reminder.occurrenceKey
            )
              throw new Error(
                'The ringing reminder changed. Review it again or use its visible controls.',
              );
          }
        }
        const result = review.apply();
        pending = null;
        completed.set(reviewId, {...result});
        if (completed.size > 64)
          completed.delete(completed.keys().next().value!);
        return reply(result);
      } catch (error) {
        // Keep the same private token for a retry after a failed transaction.
        // Version/generation checks and repository receipts still fence the write.
        return reply({
          message: `The action could not be confirmed. ${
            error instanceof Error
              ? error.message
              : 'Retry this review or use Calendar.'
          }`,
          review: {...review.review},
          changed: false,
        });
      }
    },
    cancel() {
      pending = null;
    },
    dispose() {
      disposed = true;
      pending = null;
      completed.clear();
      previous = '';
    },
  };
}
