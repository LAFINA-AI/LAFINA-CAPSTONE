import type {TraceSnapshot} from './requestTrace';

/** Most recent chat timings kept in memory (never written to disk). */
export const MAX_CHAT_TIMINGS = 50;

export interface ChatTimingEntry {
  /** Assistant message the timing belongs to, when one was produced. */
  messageId: string | null;
  snapshot: TraceSnapshot;
}

let entries: ChatTimingEntry[] = [];
const listeners = new Set<() => void>();

const emit = () => {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // Listeners never break recording.
    }
  }
};

/**
 * Developer-only, in-memory record of recent chat request timings. It holds
 * structured timings only: no prompt or reply text.
 */
export const chatTimingStore = {
  record(messageId: string | null, snapshot: TraceSnapshot): void {
    entries = [{messageId, snapshot}, ...entries].slice(0, MAX_CHAT_TIMINGS);
    emit();
  },
  forMessage(messageId: string): TraceSnapshot | null {
    return entries.find(e => e.messageId === messageId)?.snapshot ?? null;
  },
  list(): readonly ChatTimingEntry[] {
    return entries;
  },
  clear(): void {
    entries = [];
    emit();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
