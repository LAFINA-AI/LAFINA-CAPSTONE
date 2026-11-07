/**
 * Owner-bound, memory-only Chat composer drafts (AGY-PORT 05).
 *
 * The composer text survives tab switches, the tool sheets and the Voice-to-Chat
 * handoff because it lives here instead of inside a screen that unmounts. It is never
 * written to disk, synced or logged. An account switch or sign-out drops every
 * draft that does not belong to the account now shown (`retainOnly`).
 */
type Listener = (owner: string, text: string) => void;

const drafts = new Map<string, string>();
const listeners = new Set<Listener>();

const emit = (owner: string, text: string): void => {
  listeners.forEach(listener => {
    try {
      listener(owner, text);
    } catch (error) {
      console.warn('[chatDraftStore] Listener failed:', error);
    }
  });
};

export const chatDraftStore = {
  /** The unsent composer text for this owner, or ''. */
  get(owner: string): string {
    return drafts.get(owner) ?? '';
  },

  set(owner: string, text: string): void {
    if ((drafts.get(owner) ?? '') === text) return;
    if (text) drafts.set(owner, text);
    else drafts.delete(owner);
    emit(owner, text);
  },

  clear(owner: string): void {
    chatDraftStore.set(owner, '');
  },

  /** Drops every other owner's draft (account switch); `null` drops all (sign-out). */
  retainOnly(owner: string | null): void {
    Array.from(drafts.keys()).forEach(key => {
      if (key !== owner) chatDraftStore.set(key, '');
    });
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  /** Test-only reset. */
  resetForTests(): void {
    drafts.clear();
    listeners.clear();
  },
};
