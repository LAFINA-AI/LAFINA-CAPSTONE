import {deliveryStore} from '../storage/deliveryStore';
import type {DeliveryJob} from '../storage/deliveryStore';
import {
  cancelReminderAlarm,
  getNativeDeliveryModule,
  isNativeReminderDeliveryAvailable,
  scheduleReminderAlarm,
} from './reminderAlarm';
import type {NativeDeliveryRegistration} from './reminderAlarm';

/**
 * AGY-PORT 03: the single authoritative reminder engine.
 *
 * Android AlarmManager (LafinaReminderModule) owns registration and dispatch.
 * This reconciler makes the native registry match the active owner's armed
 * jobs: it registers missing or outdated generations, cancels registrations of
 * other owners, retired jobs and superseded generations, and leaves matching
 * live registrations alone. Other owners' jobs stay in SQLite, suppressed, and
 * are registered again when that owner becomes active.
 *
 * The JS poller only dispatches work the native engine does not hold (see
 * `shouldDispatchInJs`), so the two can never ring the same generation.
 */

export interface DeliveryReconcileSummary {
  nativeAvailable: boolean;
  registered: number;
  kept: number;
  cancelled: number;
  failed: number;
  receipts: number;
  /** Set when the pass stopped early (for example, storage unavailable). */
  error?: string;
}

const emptySummary = (nativeAvailable: boolean): DeliveryReconcileSummary => ({
  nativeAvailable,
  registered: 0,
  kept: 0,
  cancelled: 0,
  failed: 0,
  receipts: 0,
});

let chain: Promise<unknown> = Promise.resolve();

/**
 * Codex audit A4: every native call in a pass is bounded. Passes are
 * serialized, so one bridge call that never answers would otherwise block
 * every later pass in this process (including the background-entry pass). A
 * call that times out counts as failed for this pass; the next pass retries.
 */
export const NATIVE_CALL_TIMEOUT_MS = 5000;

const boundedNative = <T>(work: Promise<T>, what: string): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${what} did not answer within ${NATIVE_CALL_TIMEOUT_MS} ms`)),
      NATIVE_CALL_TIMEOUT_MS,
    );
    work.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });

/** Runs reconcile passes one at a time; overlapping callers queue. */
const serialized = <T>(work: () => Promise<T>): Promise<T> => {
  const next = chain.then(work, work);
  chain = next.catch(() => undefined);
  return next;
};

/** Copies redacted native receipts (fired, stale, duplicate...) into SQLite. */
export const drainNativeDeliveryReceipts = async (): Promise<number> => {
  const module = getNativeDeliveryModule();
  if (!module?.drainDeliveryReceipts) return 0;
  let receipts;
  try {
    receipts = await boundedNative(Promise.resolve(module.drainDeliveryReceipts()), 'Receipt drain');
  } catch (error) {
    console.warn('[DeliveryReconciler] Could not read native receipts:', error);
    return 0;
  }
  let recorded = 0;
  for (const receipt of receipts || []) {
    if (!receipt || typeof receipt.reminderId !== 'string') continue;
    try {
      deliveryStore.recordEvent({
        reminderId: receipt.reminderId,
        userId: typeof receipt.ownerId === 'string' ? receipt.ownerId : '',
        generation: Number(receipt.generation),
        event: String(receipt.event),
        origin: 'native',
        occurredAt: Number.isFinite(receipt.atMs)
          ? new Date(receipt.atMs).toISOString()
          : undefined,
      });
      recorded += 1;
    } catch (error) {
      console.warn('[DeliveryReconciler] Could not record receipt:', error);
    }
  }
  return recorded;
};

const isDesired = (
  job: DeliveryJob,
  activeUserId: string | null,
  now: number,
): boolean =>
  activeUserId !== null &&
  job.userId === activeUserId &&
  job.state === 'armed' &&
  Date.parse(job.triggerAt) > now;

/**
 * A native registration is kept only when it is the job's exact identity and
 * instant, Android still holds it, and the job's receipt says this generation
 * is registered. Any other receipt state ('unregistered' after a text-only
 * edit or sync update, 'failed', 'suppressed') re-registers through
 * scheduleExactAlarm, which refreshes the native task text in place.
 */
const matches = (
  registration: NativeDeliveryRegistration,
  job: DeliveryJob,
): boolean =>
  registration.ownerId === job.userId &&
  Number(registration.generation) === job.generation &&
  Number(registration.triggerAtMs) === Date.parse(job.triggerAt) &&
  registration.armed !== false &&
  job.registrationState === 'registered' &&
  job.registeredGeneration === job.generation;

const reconcile = async (
  activeUserId: string | null,
): Promise<DeliveryReconcileSummary> => {
  const module = getNativeDeliveryModule();
  if (!module) return emptySummary(false);
  const summary = emptySummary(true);
  const owner = activeUserId && activeUserId.length > 0 ? activeUserId : null;

  if (module.setDeliveryOwner) {
    try {
      await boundedNative(Promise.resolve(module.setDeliveryOwner(owner ?? '')), 'Delivery owner');
    } catch (error) {
      console.warn('[DeliveryReconciler] Could not set delivery owner:', error);
    }
  }
  summary.receipts = await drainNativeDeliveryReceipts();

  const now = Date.now();
  const jobs = deliveryStore.listWithTask();
  const byId = new Map(jobs.map(job => [job.reminderId, job]));
  const covered = new Set<string>();

  let registrations: NativeDeliveryRegistration[] | null = null;
  if (module.listDeliveryRegistrations) {
    try {
      registrations = await boundedNative(
        Promise.resolve(module.listDeliveryRegistrations()),
        'Registration listing',
      );
    } catch (error) {
      console.warn('[DeliveryReconciler] Could not list registrations:', error);
    }
  }

  if (registrations) {
    for (const registration of registrations) {
      const job = byId.get(registration.reminderId);
      if (job && isDesired(job, owner, now) && matches(registration, job)) {
        covered.add(job.reminderId);
        summary.kept += 1;
        continue;
      }
      if (job && isDesired(job, owner, now)) {
        // Outdated identity for wanted work: re-registering below replaces it.
        continue;
      }
      try {
        await boundedNative(cancelReminderAlarm(registration.reminderId), 'Cancel');
        summary.cancelled += 1;
        if (job) {
          deliveryStore.recordEvent({
            reminderId: job.reminderId,
            userId: job.userId,
            generation: Number(registration.generation),
            event: 'cancelled',
            code:
              job.userId !== owner
                ? 'inactive_owner'
                : job.state !== 'armed'
                ? `job_${job.state}`
                : 'superseded',
          });
        }
      } catch (error) {
        console.warn(
          '[DeliveryReconciler] Could not cancel registration:',
          error,
        );
      }
    }
  }

  for (const job of jobs) {
    if (!isDesired(job, owner, now) || covered.has(job.reminderId)) continue;
    if (
      registrations === null &&
      job.registrationState === 'registered' &&
      job.registeredGeneration === job.generation
    ) {
      // An older native build cannot list; trust the receipt for this generation.
      summary.kept += 1;
      continue;
    }
    try {
      await boundedNative(
        Promise.resolve(scheduleReminderAlarm(job.reminderId, job.task, job.triggerAt)),
        'Registration',
      );
      summary.registered += 1;
    } catch (error) {
      summary.failed += 1;
      console.warn(
        '[DeliveryReconciler] Registration failed; kept for retry:',
        job.reminderId,
        error,
      );
    }
  }

  try {
    deliveryStore.markSuppressed(owner);
  } catch (error) {
    console.warn('[DeliveryReconciler] Could not mark suppressed jobs:', error);
  }
  return summary;
};

/**
 * Brings native registrations in line with the active owner's armed jobs.
 * Pass null after logout: every owned registration is cancelled, while jobs
 * stay in SQLite for that owner's return.
 */
export const reconcileReminderDelivery = (
  activeUserId: string | null,
): Promise<DeliveryReconcileSummary> =>
  serialized(async () => {
    try {
      return await reconcile(activeUserId);
    } catch (error) {
      // Never an unhandled rejection from lifecycle callers; work stays in
      // SQLite and the next pass retries.
      console.error('[DeliveryReconciler] Reconcile pass failed:', error);
      return {
        ...emptySummary(isNativeReminderDeliveryAvailable()),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

/**
 * True when the foreground JS poller may dispatch this reminder: the native
 * engine is absent, or it does not hold a registration for the job's current
 * generation (never registered, or registration failed). Exactly one engine
 * owns each generation.
 */
export const shouldDispatchInJs = (
  reminderId: string,
  liveRegistrations?: NativeRegistrationSnapshot,
): boolean => {
  if (!isNativeReminderDeliveryAvailable()) return true;
  // Conservative: if native state cannot be read, native stays the engine.
  if (liveRegistrations === 'unreadable') return false;
  if (liveRegistrations && liveRegistrations.has(reminderId)) return false;
  let job: DeliveryJob | null = null;
  try {
    job = deliveryStore.get(reminderId);
  } catch {
    return true;
  }
  if (!job) return true;
  return !(
    job.registrationState === 'registered' &&
    job.registeredGeneration === job.generation
  );
};

/**
 * Live native registrations by reminder ID (Android still holds the alarm),
 * `'unreadable'` when the listing failed, or `undefined` when this native
 * build cannot list (receipts alone decide).
 */
export type NativeRegistrationSnapshot =
  | Map<string, NativeDeliveryRegistration>
  | 'unreadable'
  | undefined;

/**
 * Asks the native registry for this generation right before the JS fallback
 * rings. The native alarm receiver consumes the same entry under the same lock
 * and remembers every claim, so a native ring in the gap after the poller's
 * listing makes this return false, and a foreground claim makes a later native
 * broadcast inert. True without native delivery (nothing else can ring) or on
 * a native build without the method; false when the claim fails, because the
 * native engine then stays in charge, matching the unreadable-listing rule.
 */
export const claimForegroundRing = async (
  reminderId: string,
  ownerId: string,
  generation: number | null | undefined,
): Promise<boolean> => {
  if (!isNativeReminderDeliveryAvailable()) return true;
  const module = getNativeDeliveryModule();
  if (!module?.claimForegroundDelivery) return true;
  try {
    const outcome = await module.claimForegroundDelivery(
      reminderId,
      ownerId,
      typeof generation === 'number' && Number.isSafeInteger(generation)
        ? generation
        : 0,
    );
    return outcome === 'claimed';
  } catch (error) {
    console.warn('[DeliveryReconciler] Foreground claim failed:', error);
    return false;
  }
};

let lastDeliveryFingerprint: {owner: string; value: string} | null = null;

/**
 * Reconciles when this owner's delivery jobs changed since the last pass made
 * here (create, edit, snooze, acknowledge, delete, sync). Called by the
 * foreground poller, so a writer that did not cancel its own alarm is
 * corrected within one poll interval instead of at the next app start.
 */
export const reconcileIfDeliveryChanged = async (
  ownerId: string,
): Promise<DeliveryReconcileSummary | null> => {
  let before: string;
  try {
    before = deliveryStore.changeFingerprint(ownerId);
  } catch {
    return null;
  }
  if (
    lastDeliveryFingerprint?.owner === ownerId &&
    lastDeliveryFingerprint.value === before
  ) {
    return null;
  }
  const summary = await reconcileReminderDelivery(ownerId);
  try {
    lastDeliveryFingerprint = {
      owner: ownerId,
      value: deliveryStore.changeFingerprint(ownerId),
    };
  } catch {
    lastDeliveryFingerprint = null;
  }
  return summary;
};

/** One listing per poll pass, used to keep JS from ringing what native holds. */
export const readLiveNativeRegistrations =
  async (): Promise<NativeRegistrationSnapshot> => {
    const module = getNativeDeliveryModule();
    if (!module?.listDeliveryRegistrations) return undefined;
    try {
      const registrations = await module.listDeliveryRegistrations();
      return new Map(
        (registrations || [])
          .filter(registration => registration && registration.armed !== false)
          .map(registration => [registration.reminderId, registration]),
      );
    } catch (error) {
      console.warn('[DeliveryReconciler] Could not list registrations:', error);
      return 'unreadable';
    }
  };
