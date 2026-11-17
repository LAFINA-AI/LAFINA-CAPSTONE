/**
 * Floating LAFINA (ADR-036): memory-only facts shared between the Quick Chat
 * root and the main app root, which run in the same JS runtime.
 *
 * - `isOpen()` is true while Quick Chat is the visible screen. `App.tsx` reads
 *   it so the foreground reminder poller and the pending native call are left
 *   to Android while Quick Chat is in front (FLOAT-00 Spike D, risk R-03).
 * - A "View in LAFINA" request waits here until the main app consumes it for
 *   the same owner. Nothing is written to disk or passed through intents.
 */
import type {CallNavigationTarget} from '../navigation/callNavigation';

type Listener = () => void;

let open = false;
let pendingNavigation: CallNavigationTarget | null = null;
const listeners = new Set<Listener>();

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
    notify();
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
    pendingNavigation = null;
    listeners.clear();
  },
};
