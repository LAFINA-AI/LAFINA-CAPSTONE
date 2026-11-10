import {db} from './database';

/**
 * AGY-PORT 09: owner-scoped reminder delivery evidence, read from the
 * device-local delivery tables (schema 19). Everything here is a count of what
 * this device recorded. A registration means Android accepted an alarm; it is
 * never evidence that the reminder rang or that the student saw it.
 */

export interface DeliveryEvidenceItem {
  event: string;
  label: string;
  origin: 'js' | 'native';
  at: string;
}

export interface LocalReminderHealth {
  /** Upcoming reminders this device should deliver (pending or snoozed). */
  armed: number;
  /** Reminders currently ringing (a simulated call or alert is showing). */
  ringing: number;
  /** Armed, and Android accepted the alarm for its current time. */
  registered: number;
  /** Of those, Android's latest receipt says the alarm is inexact (may be late). */
  inexact: number;
  /** Armed, not yet registered for its current time (waiting for the next pass). */
  queued: number;
  /** Armed, and the last registration attempt failed. */
  blocked: number;
  /** Armed, but held back because the item is already done or acknowledged. */
  suppressed: number;
  /** Newest recorded delivery events for this owner, at most RECENT_LIMIT. */
  recent: DeliveryEvidenceItem[];
}

export const RECENT_LIMIT = 20;

/** Plain-language meaning of each recorded event; codes only, never reminder text. */
const EVENT_LABELS: Record<string, string> = {
  registered: 'Alarm accepted by Android',
  registered_inexact: 'Alarm accepted as inexact (may be late)',
  registration_failed: 'Alarm registration failed',
  registration_rejected: 'Alarm registration refused',
  cancelled: 'Alarm cancelled',
  superseded: 'Alarm replaced by a newer one',
  suppressed: 'Held back: already done or acknowledged',
  suppressed_inactive_owner: 'Held back: another account is signed in',
  fired: 'Alarm went off on Android',
  posted: 'Notification shown',
  post_denied: 'Notification blocked by Android',
  js_dispatched: 'Due time reached while the app was open',
  call_admitted: 'Reminder call shown',
  call_rejected: 'Reminder call refused (no longer current)',
  action_rejected: 'Answer refused (no longer current)',
  foreground_claimed: 'Opened from the app',
  foreground_already_claimed: 'Already opened',
  foreground_stale: 'Ignored: no longer current',
  duplicate_ignored: 'Ignored: duplicate',
  stale_ignored: 'Ignored: no longer current',
  expired: 'Expired before it could ring',
  restore_rejected: 'Not restored after a restart',
  legacy_adopted: 'Older alarm record adopted',
  legacy_unreadable: 'Older alarm record unreadable',
  legacy_trigger_ignored: 'Older alarm ignored',
};

export const deliveryEventLabel = (event: string): string =>
  EVENT_LABELS[event] ?? 'Other delivery event';

/**
 * The account changed under a retained screen when a signed-in session names
 * someone else (the AGY-PORT 07 owner rule). `strict` additionally requires a
 * session row naming this owner, for actions that change native alarms.
 */
const sessionOwner = (): string | null => {
  const value = db.executeSync('SELECT user_id FROM active_session LIMIT 1').rows?.[0]
    ?.user_id;
  return value == null ? null : String(value);
};

export const reminderHealthStore = {
  isActive: (userId: string, strict = false): boolean => {
    if (!userId) return false;
    const owner = sessionOwner();
    return owner === null ? !strict : owner === userId;
  },

  /** Throws on a missing owner, another signed-in account or a read failure. */
  read: (userId: string): LocalReminderHealth => {
    if (!userId) throw new Error('Reminder owner required.');
    if (!reminderHealthStore.isActive(userId)) {
      throw new Error('Account changed. Reopen reminder health.');
    }
    const row = db.executeSync(
      `SELECT
         COALESCE(SUM(j.state = 'armed'), 0) AS armed,
         COALESCE(SUM(j.state = 'ringing'), 0) AS ringing,
         COALESCE(SUM(j.state = 'armed' AND j.registration_state = 'registered'
                      AND j.registered_generation = j.generation), 0) AS registered,
         COALESCE(SUM(j.state = 'armed' AND j.registration_state = 'registered'
                      AND j.registered_generation = j.generation
                      AND (SELECT e.event FROM reminder_delivery_events e
                            WHERE e.reminder_id = j.reminder_id AND e.user_id = j.user_id
                              AND e.generation = j.generation AND e.origin = 'native'
                              AND e.event IN ('registered', 'registered_inexact')
                            ORDER BY e.id DESC LIMIT 1) = 'registered_inexact'), 0) AS inexact,
         COALESCE(SUM(j.state = 'armed' AND (j.registration_state IN ('unregistered', 'idle')
                      OR (j.registration_state = 'registered'
                          AND j.registered_generation <> j.generation))), 0) AS queued,
         COALESCE(SUM(j.state = 'armed' AND j.registration_state = 'failed'), 0) AS blocked,
         COALESCE(SUM(j.state = 'armed' AND j.registration_state = 'suppressed'), 0) AS suppressed
       FROM reminder_delivery_jobs j
       WHERE j.user_id = ?`,
      [userId],
    ).rows?.[0];
    const recent = (db.executeSync(
      `SELECT event, origin, occurred_at FROM reminder_delivery_events
        WHERE user_id = ? ORDER BY id DESC LIMIT ${RECENT_LIMIT}`,
      [userId],
    ).rows ?? []) as Array<Record<string, unknown>>;
    const count = (key: string): number => {
      const value = Number(row?.[key] ?? 0);
      return Number.isFinite(value) ? value : 0;
    };
    return {
      armed: count('armed'),
      ringing: count('ringing'),
      registered: count('registered'),
      inexact: count('inexact'),
      queued: count('queued'),
      blocked: count('blocked'),
      suppressed: count('suppressed'),
      recent: recent.map(item => ({
        event: String(item.event),
        label: deliveryEventLabel(String(item.event)),
        origin: item.origin === 'native' ? 'native' : 'js',
        at: String(item.occurred_at),
      })),
    };
  },
};
