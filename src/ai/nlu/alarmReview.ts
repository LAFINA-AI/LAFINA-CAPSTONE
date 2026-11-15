/**
 * Alarm plan A3: review cards for alarm requests ("wake me up at 6 on
 * weekdays", "turn off my 6 AM alarm"). Like every planner change, nothing is
 * written until the student presses Confirm (ADR-018); `commandReview` owns the
 * card, the expiry and the receipt, and calls in here to build and apply.
 *
 * Alarms are device-local (ADR-034): no sync outbox, no revision rows. A card
 * that names an existing alarm carries its `generation`, so an alarm changed in
 * the Alarms screen after the card was shown makes the card stale.
 */
import {alarmsStore, MAX_ALARMS_PER_OWNER} from '../../storage/alarmsStore';
import type {Alarm} from '../../storage/alarmsStore';
import type {DatabaseTransaction} from '../../storage/database';
import {
  bitForDate,
  describeRepeat,
  describeTimeUntil,
  formatAlarmTime,
  localDateKey,
  nextAlarmTrigger,
  oneShotDateFor,
  repeatDaysFromRule,
} from '../../scheduler/alarmSchedule';

export interface AlarmRef {
  readonly id: string;
  readonly label: string;
  readonly hour: number;
  readonly minute: number;
  readonly generation: number;
}

export type AlarmOperation =
  | {
      op: 'create_alarm';
      hour: number;
      minute: number;
      repeatDays: number;
      oneShotDate: string | null;
      label: string;
    }
  | {
      op: 'update_alarm';
      target: AlarmRef;
      hour: number;
      minute: number;
      repeatDays: number;
      oneShotDate: string | null;
      label: string;
    }
  | {op: 'toggle_alarm'; target: AlarmRef; enabled: boolean}
  | {op: 'delete_alarm'; target: AlarmRef};

export type AlarmIntentKind =
  | 'create_alarm'
  | 'update_alarm'
  | 'delete_alarm'
  | 'toggle_alarm';

export const ALARM_INTENTS: ReadonlySet<string> = new Set<AlarmIntentKind>([
  'create_alarm',
  'update_alarm',
  'delete_alarm',
  'toggle_alarm',
]);

/** The already-cleaned fields of one alarm request. */
export interface AlarmRequest {
  intent: AlarmIntentKind;
  title: string | null;
  targetTitle: string | null;
  newTitle: string | null;
  date: string | null;
  time: string | null;
  targetTime: string | null;
  /** RRULE body without the "RRULE:" prefix, or null. */
  recurrenceRule: string | null;
  alarmEnabled: boolean | null;
}

export interface AlarmDraft {
  heading: string;
  title: string;
  details: string[];
  assumptions: string[];
  warnings: string[];
  destructive: boolean;
  operation: AlarmOperation;
}

export type AlarmBuild =
  | {draft: AlarmDraft}
  | {
      result:
        | {status: 'clarify'; reply: string; candidates: []}
        | {status: 'invalid'; reply: string};
    };

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const LABEL_MAX = 60;

const timeOf = (hour: number, minute: number): string =>
  formatAlarmTime(hour, minute, false);

const parseClock = (value: string): {hour: number; minute: number} => ({
  hour: Number(value.slice(0, 2)),
  minute: Number(value.slice(3, 5)),
});

const friendlyDay = (dateKey: string): string => {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${WEEKDAY_NAMES[date.getDay()]}, ${MONTH_NAMES[m - 1]} ${d}`;
};

const clarify = (reply: string): AlarmBuild => ({
  result: {status: 'clarify', reply, candidates: []},
});
const invalid = (reply: string): AlarmBuild => ({
  result: {status: 'invalid', reply},
});

/** "Wake up", never "Alarm" or the bare word "my alarm". */
const cleanLabel = (value: string | null): string => {
  const text = (value || '')
    .replace(/\b(?:my|the|an?|alarms?)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  const label = text.charAt(0).toUpperCase() + text.slice(1);
  return label.length > LABEL_MAX ? label.slice(0, LABEL_MAX).trim() : label;
};

const describeAlarm = (alarm: {
  hour: number;
  minute: number;
  repeatDays: number;
  label: string;
}): string => {
  const parts = [describeRepeat(alarm.repeatDays), alarm.label].filter(Boolean);
  return `${timeOf(alarm.hour, alarm.minute)} (${parts.join(', ')})`;
};

/**
 * Repeat days for an alarm from the request's RRULE. Alarms repeat by
 * weekday; a weekly rule without days repeats on the requested day.
 */
const repeatFor = (
  rule: string | null,
  date: string | null,
  now: Date,
): {days: number; note: string | null} => {
  if (!rule) return {days: 0, note: null};
  const days = repeatDaysFromRule(rule);
  if (days) return {days, note: null};
  if (/FREQ=WEEKLY/i.test(rule)) {
    const [y, m, d] = (date || localDateKey(now)).split('-').map(Number);
    return {days: bitForDate(new Date(y, m - 1, d)), note: null};
  }
  return {
    days: 0,
    note: 'Alarms repeat on days of the week, so this one rings once.',
  };
};

const refOf = (alarm: Alarm): AlarmRef => ({
  id: alarm.id,
  label: alarm.label,
  hour: alarm.hour,
  minute: alarm.minute,
  generation: alarm.generation,
});

const sameClock = (alarm: Alarm, time: string): boolean => {
  const {hour, minute} = parseClock(time);
  return alarm.hour === hour && alarm.minute === minute;
};

const listing = (alarms: readonly Alarm[]): string =>
  alarms
    .slice(0, 5)
    .map(a => `${describeAlarm(a)}${a.enabled ? '' : ', off'}`)
    .join('; ');

/**
 * Finds the alarm a request means, by its time ("my 6 AM alarm") and/or its
 * label ("my gym alarm"). With no time or label, "my alarm" is the only alarm,
 * or the only one that the request would change.
 */
const resolveAlarm = (
  userId: string,
  req: AlarmRequest,
  example: string,
): {alarm: Alarm} | AlarmBuild => {
  const all = alarmsStore.list(userId);
  if (all.length === 0)
    return clarify(
      'You don’t have any alarms yet. Nothing was changed. Say “set an alarm for 6 AM” to add one.',
    );
  let pool = all;
  if (req.targetTime) {
    const target = req.targetTime;
    let byTime = pool.filter(a => sameClock(a, target));
    // A bare "6" was read as morning; the student may mean 6 PM.
    if (byTime.length === 0 && Number(target.slice(0, 2)) < 12) {
      const evening = `${String(Number(target.slice(0, 2)) + 12).padStart(
        2,
        '0',
      )}${target.slice(2)}`;
      byTime = pool.filter(a => sameClock(a, evening));
    }
    pool = byTime;
  }
  const label = cleanLabel(req.targetTitle).toLowerCase();
  if (label && pool.length > 0) {
    const byLabel = pool.filter(a => {
      const own = a.label.toLowerCase();
      return own && (own.includes(label) || label.includes(own));
    });
    // A time already narrowed it down; a label that matches nothing only
    // fails the request when it was the only thing named.
    if (byLabel.length > 0 || !req.targetTime) pool = byLabel;
  }
  if (
    !req.targetTime &&
    !label &&
    pool.length > 1 &&
    req.intent === 'toggle_alarm'
  ) {
    // "turn off my alarm" with exactly one alarm that is on.
    const changeable = pool.filter(a => a.enabled !== req.alarmEnabled);
    if (changeable.length === 1) pool = changeable;
  }
  if (pool.length === 1) return {alarm: pool[0]};
  if (pool.length === 0)
    return clarify(
      `I could not find that alarm. Your alarms: ${listing(
        all,
      )}. Nothing was changed.`,
    );
  return clarify(
    `Which alarm do you mean? ${listing(
      pool,
    )}. Say its time, for example “${example}”. Nothing was changed.`,
  );
};

const ringsLine = (
  timing: {
    hour: number;
    minute: number;
    repeatDays: number;
    oneShotDate: string | null;
  },
  now: Date,
): string | null => {
  const next = nextAlarmTrigger({...timing, enabled: true}, now);
  return next ? `Rings ${describeTimeUntil(next, now)}.` : null;
};

const oneShotFor = (
  hour: number,
  minute: number,
  date: string | null,
  now: Date,
  assumptions: string[],
): string | null => {
  if (date) {
    const [y, m, d] = date.split('-').map(Number);
    const at = new Date(y, m - 1, d, hour, minute, 0, 0);
    return at.getTime() > now.getTime() ? date : null;
  }
  const day = oneShotDateFor(hour, minute, now);
  if (day !== localDateKey(now))
    assumptions.push(
      `${timeOf(
        hour,
        minute,
      )} has already passed today, so it rings tomorrow (${friendlyDay(day)}).`,
    );
  return day;
};

const PASSED =
  'That time has already passed. Nothing was changed. Please say a later time.';

const buildCreate = (
  userId: string,
  req: AlarmRequest,
  now: Date,
): AlarmBuild => {
  if (!req.time)
    return invalid(
      'What time should the alarm ring? For example “set an alarm for 6 AM”. Nothing was changed.',
    );
  const {hour, minute} = parseClock(req.time);
  const existing = alarmsStore.list(userId);
  if (existing.length >= MAX_ALARMS_PER_OWNER)
    return invalid(
      `You already have ${MAX_ALARMS_PER_OWNER} alarms, the most LAFINA keeps. Delete one in Schedule → Alarms first. Nothing was changed.`,
    );
  const assumptions: string[] = [];
  const repeat = repeatFor(req.recurrenceRule, req.date, now);
  if (repeat.note) assumptions.push(repeat.note);
  let oneShotDate: string | null = null;
  if (repeat.days === 0) {
    oneShotDate = oneShotFor(hour, minute, req.date, now, assumptions);
    if (!oneShotDate) return invalid(PASSED);
  }
  const label = cleanLabel(req.title);
  const warnings: string[] = [];
  const twin = existing.find(
    a =>
      a.enabled &&
      a.hour === hour &&
      a.minute === minute &&
      a.repeatDays === repeat.days,
  );
  if (twin)
    warnings.push(
      `You already have an alarm at ${describeAlarm(twin)}. This adds another.`,
    );
  const timing = {hour, minute, repeatDays: repeat.days, oneShotDate};
  return {
    draft: {
      heading: 'Set alarm',
      title: label || 'Alarm',
      details: [
        `Time: ${timeOf(hour, minute)}.`,
        repeat.days
          ? `Repeats: ${describeRepeat(repeat.days)}.`
          : `Rings once: ${friendlyDay(oneShotDate as string)}.`,
        ringsLine(timing, now),
        'Snooze: 9 minutes. Rings even on silent.',
      ].filter((line): line is string => Boolean(line)),
      assumptions,
      warnings,
      destructive: false,
      operation: {op: 'create_alarm', ...timing, label},
    },
  };
};

const buildUpdate = (
  userId: string,
  req: AlarmRequest,
  now: Date,
): AlarmBuild => {
  const found = resolveAlarm(userId, req, 'change my 6 AM alarm to 6:30');
  if (!('alarm' in found)) return found;
  const alarm = found.alarm;
  const assumptions: string[] = [];
  const clock = req.time ? parseClock(req.time) : alarm;
  const repeat = req.recurrenceRule
    ? repeatFor(req.recurrenceRule, req.date, now)
    : {days: alarm.repeatDays, note: null};
  if (repeat.note) assumptions.push(repeat.note);
  let oneShotDate: string | null = null;
  if (repeat.days === 0) {
    const unchanged =
      !req.time && !req.date && !req.recurrenceRule && alarm.oneShotDate;
    oneShotDate = unchanged
      ? alarm.oneShotDate
      : oneShotFor(clock.hour, clock.minute, req.date, now, assumptions);
    if (!oneShotDate) return invalid(PASSED);
  }
  const label = req.newTitle !== null ? cleanLabel(req.newTitle) : alarm.label;
  const details = [
    clock.hour !== alarm.hour || clock.minute !== alarm.minute
      ? `Time: ${timeOf(alarm.hour, alarm.minute)} → ${timeOf(
          clock.hour,
          clock.minute,
        )}.`
      : `Time: ${timeOf(clock.hour, clock.minute)}.`,
    repeat.days !== alarm.repeatDays
      ? `Repeats: ${describeRepeat(alarm.repeatDays)} → ${describeRepeat(
          repeat.days,
        )}.`
      : `Repeats: ${describeRepeat(repeat.days)}.`,
  ];
  if (label !== alarm.label)
    details.push(`Label: ${alarm.label || '(none)'} → ${label || '(none)'}.`);
  if (!alarm.enabled)
    assumptions.push('The alarm is off; changing it turns it on.');
  const line = ringsLine(
    {
      hour: clock.hour,
      minute: clock.minute,
      repeatDays: repeat.days,
      oneShotDate,
    },
    now,
  );
  if (line) details.push(line);
  return {
    draft: {
      heading: 'Change alarm',
      title: alarm.label || 'Alarm',
      details,
      assumptions,
      warnings: [],
      destructive: false,
      operation: {
        op: 'update_alarm',
        target: refOf(alarm),
        hour: clock.hour,
        minute: clock.minute,
        repeatDays: repeat.days,
        oneShotDate,
        label,
      },
    },
  };
};

const buildToggle = (
  userId: string,
  req: AlarmRequest,
  now: Date,
): AlarmBuild => {
  const enabled = req.alarmEnabled === true;
  const found = resolveAlarm(
    userId,
    req,
    enabled ? 'turn on my 6 AM alarm' : 'turn off my 6 AM alarm',
  );
  if (!('alarm' in found)) return found;
  const alarm = found.alarm;
  if (alarm.enabled === enabled)
    return invalid(
      `Your ${describeAlarm(alarm)} alarm is already ${
        enabled ? 'on' : 'off'
      }. Nothing was changed.`,
    );
  const assumptions: string[] = [];
  const details = [`Alarm: ${describeAlarm(alarm)}.`];
  if (enabled) {
    const oneShotDate =
      alarm.repeatDays === 0
        ? oneShotDateFor(alarm.hour, alarm.minute, now)
        : null;
    if (oneShotDate && oneShotDate !== localDateKey(now))
      assumptions.push(`It rings next on ${friendlyDay(oneShotDate)}.`);
    const line = ringsLine({...alarm, oneShotDate}, now);
    if (line) details.push(line);
  } else if (alarm.repeatDays) {
    details.push('It stays off on every repeat day until you turn it back on.');
  }
  return {
    draft: {
      heading: enabled ? 'Turn on alarm' : 'Turn off alarm',
      title: alarm.label || 'Alarm',
      details,
      assumptions,
      warnings: [],
      destructive: false,
      operation: {op: 'toggle_alarm', target: refOf(alarm), enabled},
    },
  };
};

const buildDelete = (userId: string, req: AlarmRequest): AlarmBuild => {
  const found = resolveAlarm(userId, req, 'delete my 6 AM alarm');
  if (!('alarm' in found)) return found;
  const alarm = found.alarm;
  return {
    draft: {
      heading: 'Delete alarm',
      title: alarm.label || 'Alarm',
      details: [`Alarm: ${describeAlarm(alarm)}.`],
      assumptions: [],
      warnings: [],
      destructive: true,
      operation: {op: 'delete_alarm', target: refOf(alarm)},
    },
  };
};

export const buildAlarmDraft = (
  userId: string,
  req: AlarmRequest,
  now: Date,
): AlarmBuild => {
  switch (req.intent) {
    case 'create_alarm':
      return buildCreate(userId, req, now);
    case 'update_alarm':
      return buildUpdate(userId, req, now);
    case 'toggle_alarm':
      return buildToggle(userId, req, now);
    case 'delete_alarm':
      return buildDelete(userId, req);
  }
};

export type AlarmApplied =
  | {status: 'ok'; entityId: string; reply: string}
  | {status: 'stale'}
  | {status: 'expired'};

const isPastOneShot = (
  repeatDays: number,
  oneShotDate: string | null,
  hour: number,
  minute: number,
): boolean => {
  if (repeatDays || !oneShotDate) return false;
  const [y, m, d] = oneShotDate.split('-').map(Number);
  return new Date(y, m - 1, d, hour, minute).getTime() <= Date.now();
};

/** Writes one confirmed alarm change inside the review's transaction. */
export const applyAlarmOperation = (
  tx: DatabaseTransaction,
  ownerId: string,
  op: AlarmOperation,
): AlarmApplied => {
  if (op.op === 'create_alarm') {
    if (isPastOneShot(op.repeatDays, op.oneShotDate, op.hour, op.minute))
      return {status: 'expired'};
    const alarm = alarmsStore.create(
      ownerId,
      {
        hour: op.hour,
        minute: op.minute,
        repeatDays: op.repeatDays,
        oneShotDate: op.oneShotDate,
        label: op.label,
      },
      tx,
    );
    return {
      status: 'ok',
      entityId: alarm.id,
      reply: `Alarm set for ${describeAlarm(alarm)}.`,
    };
  }
  const current = alarmsStore.get(op.target.id, ownerId, tx);
  if (!current || current.generation !== op.target.generation)
    return {status: 'stale'};
  switch (op.op) {
    case 'update_alarm': {
      if (isPastOneShot(op.repeatDays, op.oneShotDate, op.hour, op.minute))
        return {status: 'expired'};
      const changed = alarmsStore.update(
        current.id,
        ownerId,
        {
          hour: op.hour,
          minute: op.minute,
          repeatDays: op.repeatDays,
          oneShotDate: op.oneShotDate,
          label: op.label,
          enabled: true,
        },
        tx,
      );
      return changed
        ? {
            status: 'ok',
            entityId: current.id,
            reply: `Alarm changed to ${describeAlarm(changed)}.`,
          }
        : {status: 'stale'};
    }
    case 'toggle_alarm': {
      const changed = alarmsStore.setEnabled(
        current.id,
        ownerId,
        op.enabled,
        tx,
      );
      return changed
        ? {
            status: 'ok',
            entityId: current.id,
            reply: `Turned ${op.enabled ? 'on' : 'off'} your ${describeAlarm(
              changed,
            )} alarm.`,
          }
        : {status: 'stale'};
    }
    case 'delete_alarm':
      return alarmsStore.remove(current.id, ownerId, tx)
        ? {
            status: 'ok',
            entityId: current.id,
            reply: `Deleted your ${describeAlarm(current)} alarm.`,
          }
        : {status: 'stale'};
  }
};

/** The local, read-only answer to "what alarms do I have?". */
export const describeAlarmsReply = (
  userId: string,
  now: Date = new Date(),
): string => {
  const alarms = alarmsStore.list(userId);
  if (alarms.length === 0)
    return 'You don’t have any alarms yet. Say “set an alarm for 6 AM”, or open Schedule → Alarms.';
  let next: {alarm: Alarm; at: Date} | null = null;
  for (const alarm of alarms) {
    const at = nextAlarmTrigger(alarm, now);
    if (at && (!next || at.getTime() < next.at.getTime())) next = {alarm, at};
  }
  const head = next
    ? `Your next alarm is ${describeAlarm(next.alarm)}, ${describeTimeUntil(
        next.at,
        now,
      )}.`
    : 'All your alarms are off.';
  if (alarms.length === 1) return head;
  const bulletLines = alarms.slice(0, 5).map(a => {
    const meta = [describeRepeat(a.repeatDays), a.label]
      .filter(Boolean)
      .join(', ');
    const status = a.enabled ? '' : ' — *Off*';
    return `• **${timeOf(a.hour, a.minute)}**${
      meta ? ` *(${meta})*` : ''
    }${status}`;
  });
  if (alarms.length > 5) {
    bulletLines.push(`• *+${alarms.length - 5} more*`);
  }
  return [
    next
      ? `> **Next alarm:** **${describeAlarm(
          next.alarm,
        )}**, ${describeTimeUntil(next.at, now)}`
      : '> All your alarms are off.',
    '',
    `### All Alarms (${alarms.length})`,
    ...bulletLines,
  ].join('\n');
};
