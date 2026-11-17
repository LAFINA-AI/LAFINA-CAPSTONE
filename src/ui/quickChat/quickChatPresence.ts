/**
 * Floating LAFINA (ADR-036): memory-only facts shared between the Quick Chat
 * root and the main app root, which run in the same JS runtime.
 *
 * - `isOpen()` is true while Quick Chat is the visible screen. `App.tsx` reads
 *   it so the foreground reminder poller and the pending native call are left
 *   to Android while Quick Chat is in front (FLOAT-00 Spike D, risk R-03).
 * - A "View in LAFINA" request waits here until the main app consumes it for
 *   the same owner. Nothing is written to disk or passed through intents.
 * - Opening Quick Chat resumes the shared React host, so the hidden main
 *   screen's "back in front" work would compete with the panel for the one
 *   JS thread (measured on device: about half a second). `deferWhileOpening`
 *   holds that work until the panel has appeared.
 */
import type {CallNavigationTarget} from '../navigation/callNavigation';

type Listener = () => void;

/** Deferred work runs by then even if the panel never reports it appeared. */
export const QUICK_CHAT_SETTLE_FALLBACK_MS = 1500;

interface DeferredTask {
  task: () => void;
  timer: ReturnType<typeof setTimeout>;
}

let open = false;
let panelShown = false;
let pendingNavigation: CallNavigationTarget | null = null;
const listeners = new Set<Listener>();
const deferred = new Set<DeferredTask>();

const runDeferred = (entry: DeferredTask): void => {
  if (!deferred.delete(entry)) return;
  clearTimeout(entry.timer);
  try {
    entry.task();
  } catch (error) {
    console.warn('[quickChatPresence] Deferred task failed:', error);
  }
};

const dropDeferred = (): void => {
  deferred.forEach(entry => clearTimeout(entry.timer));
  deferred.clear();
};

const notify = (): void => {
  listeners.forEach(listener => {
    try {
      listener();
    } catch (error) {
      console.warn('[quickChatPresence] Listener failed:', error);
    }
  });
};

export const quickChatPresence = {
  setOpen(value: boolean): void {
    if (open === value) return;
    open = value;
    panelShown = false;
    // Closed before it appeared: the screen that comes next (the main
    // screen's own "active", or the background handler) does that work.
    if (!value) dropDeferred();
    notify();
  },

  /** The panel finished its open animation; held work may run now. */
  markPanelShown(): void {
    if (!open) return;
    panelShown = true;
    Array.from(deferred).forEach(runDeferred);
  },

  /**
   * Runs `task` now, unless Quick Chat is opening: then after the panel has
   * appeared (or `QUICK_CHAT_SETTLE_FALLBACK_MS` at the latest). Dropped if
   * Quick Chat closes first. Returns a cancel function.
   */
  deferWhileOpening(task: () => void): () => void {
    if (!open || panelShown) {
      task();
      return () => undefined;
    }
    const entry: DeferredTask = {
      task,
      timer: setTimeout(
        () => runDeferred(entry),
        QUICK_CHAT_SETTLE_FALLBACK_MS,
      ),
    };
    deferred.add(entry);
    return () => {
      if (deferred.delete(entry)) clearTimeout(entry.timer);
    };
  },

  /** True while Quick Chat is the visible screen. */
  isOpen(): boolean {
    return open;
  },

  /** Replaces any earlier unconsumed request. */
  requestNavigation(target: CallNavigationTarget): void {
    pendingNavigation = {...target};
    notify();
  },

  /**
   * Returns the waiting request once, only for its owner. A request for any
   * other owner is discarded, never shown to the wrong account.
   */
  consumeNavigation(ownerId: string | null): CallNavigationTarget | null {
    const target = pendingNavigation;
    if (!target) return null;
    pendingNavigation = null;
    if (!ownerId || target.ownerId !== ownerId) return null;
    return target;
  },

  hasPendingNavigation(): boolean {
    return pendingNavigation !== null;
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  /** Test-only reset. */
  resetForTests(): void {
    open = false;
    panelShown = false;
    pendingNavigation = null;
    listeners.clear();
    dropDeferred();
  },
};
