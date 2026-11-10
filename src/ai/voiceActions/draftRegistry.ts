/**
 * Active Draft Registry, Referent Resolver & Idempotency Manager (PHASE 10, F-040, F-041, F-042, F-048, F-073).
 *
 * Coordinates transient, multi-turn drafts across conversational turns with:
 * - Stable cardId / session / owner / revision tracking (P10-01).
 * - Spoken bounded corrections ("Actually Friday", "make that 4 PM", "thirty minutes") (P10-02).
 * - Ambiguity detection without guessing targets (P10-03, P10-09).
 * - Automatic re-evaluation of schedule conflicts on revision (P10-04).
 * - Independent draft cancellation without ending the live call (P10-05).
 * - Strict revision token concurrency check & idempotent re-confirmation (P10-06).
 * - Interruption resistance & session isolation (P10-07, P10-08).
 * - Explicit expiration policy (REVIEW_TTL_MS, 5 minutes) (P10-10).
 */

import {parseDateAndTime, parseNumberWordOrDigits} from '../nlu/fastPathParser';
import {checkScheduleConflict} from './conflictChecker';
import {containsPromptInjection} from './actionSecurity';

export const DRAFT_TTL_MS = 5 * 60 * 1000; // 5 minutes

export type DraftKind = 'task' | 'reminder' | 'time_block' | 'note' | 'memory';

export type DraftStatus = 'pending' | 'applied' | 'cancelled' | 'expired';

export interface TransientDraft {
  cardId: string;
  sessionId: string;
  ownerId: string;
  revision: number;
  kind: DraftKind;
  title: string;
  date?: string; // YYYY-MM-DD
  time?: string; // HH:mm (24-hour)
  endTime?: string; // HH:mm (24-hour)
  durationMinutes?: number;
  body?: string;
  category?: string;
  details: string[];
  assumptions: string[];
  warnings: string[];
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  status: DraftStatus;
  receipt?: Record<string, unknown>;
}

export type ReviseDraftResult =
  | {success: true; draft: TransientDraft; message: string}
  | {
      success: false;
      error: 'not_found' | 'stale_revision' | 'expired' | 'cancelled' | 'invalid_delta' | 'unauthorized';
      message: string;
    };

export type ConfirmDraftResult =
  | {success: true; status: 'applied' | 'already_applied'; draft: TransientDraft; receipt?: Record<string, unknown>}
  | {
      success: false;
      error: 'not_found' | 'stale_revision' | 'expired' | 'cancelled' | 'unauthorized';
      message: string;
    };

export type CancelDraftResult =
  | {success: true; status: 'cancelled'; draft: TransientDraft; message: string}
  | {
      success: false;
      error: 'not_found' | 'already_finalized' | 'unauthorized';
      message: string;
    };

export type ResolveTargetResult =
  | {status: 'found'; draft: TransientDraft}
  | {status: 'none'; message: string}
  | {status: 'ambiguous'; candidates: TransientDraft[]; message: string};

class DraftRegistry {
  private drafts = new Map<string, TransientDraft>();

  registerDraft(
    data: Omit<TransientDraft, 'createdAt' | 'updatedAt' | 'expiresAt' | 'status'> & {
      expiresAt?: number;
    },
  ): TransientDraft {
    const now = Date.now();
    const draft: TransientDraft = {
      ...data,
      createdAt: now,
      updatedAt: now,
      expiresAt: data.expiresAt ?? now + DRAFT_TTL_MS,
      status: 'pending',
    };
    this.drafts.set(draft.cardId, draft);
    return draft;
  }

  getDraft(cardId: string): TransientDraft | undefined {
    const draft = this.drafts.get(cardId);
    if (!draft) return undefined;
    if (draft.status === 'pending' && Date.now() >= draft.expiresAt) {
      draft.status = 'expired';
    }
    return draft;
  }

  getActiveDrafts(ownerId: string): TransientDraft[] {
    const now = Date.now();
    const active: TransientDraft[] = [];
    for (const draft of this.drafts.values()) {
      if (draft.ownerId === ownerId) {
        if (draft.status === 'pending') {
          if (now >= draft.expiresAt) {
            draft.status = 'expired';
          } else {
            active.push(draft);
          }
        }
      }
    }
    return active;
  }

  resolveTargetDraft(ownerId: string, cardId?: string): ResolveTargetResult {
    if (cardId) {
      const draft = this.getDraft(cardId);
      if (!draft || draft.ownerId !== ownerId) {
        return {status: 'none', message: `No active draft found with ID "${cardId}".`};
      }
      if (draft.status !== 'pending') {
        return {status: 'none', message: `Draft "${draft.title}" is already ${draft.status}.`};
      }
      return {status: 'found', draft};
    }

    const candidates = this.getActiveDrafts(ownerId);
    if (candidates.length === 0) {
      return {status: 'none', message: 'There is no active draft to modify or cancel.'};
    }
    if (candidates.length === 1) {
      return {status: 'found', draft: candidates[0]};
    }

    const titles = candidates.map(c => `"${c.title}" (${c.kind})`).join(' and ');
    return {
      status: 'ambiguous',
      candidates,
      message: `Which draft did you mean? You have ${titles} currently open.`,
    };
  }

  reviseDraft(
    ownerId: string,
    cardId: string,
    revision: number,
    instruction: string,
    referenceDate: Date = new Date(),
  ): ReviseDraftResult {
    const draft = this.getDraft(cardId);
    if (!draft) {
      return {success: false, error: 'not_found', message: `Draft "${cardId}" not found.`};
    }
    if (draft.ownerId !== ownerId) {
      return {success: false, error: 'unauthorized', message: 'Unauthorized: draft owner mismatch.'};
    }
    if (draft.status === 'expired') {
      return {success: false, error: 'expired', message: 'This draft has expired. Please create a new one.'};
    }
    if (draft.status === 'cancelled') {
      return {success: false, error: 'cancelled', message: 'This draft has already been cancelled.'};
    }
    if (draft.status === 'applied') {
      return {success: false, error: 'invalid_delta', message: 'This draft has already been confirmed and saved.'};
    }

    // Strict revision token check (P10-06)
    if (draft.revision !== revision) {
      return {
        success: false,
        error: 'stale_revision',
        message: 'The draft has been updated since this request. Please review the updated card.',
      };
    }

    if (containsPromptInjection(instruction)) {
      return {
        success: false,
        error: 'invalid_delta',
        message: 'The requested change contains invalid or prohibited tokens.',
      };
    }

    const parsed = parseDateAndTime(instruction, referenceDate);
    let modified = false;
    const appliedChanges: string[] = [];

    // 1. Title revision: "change title to X", "call it X", "rename to X"
    const titleMatch = instruction.match(
      /(?:change|update|make)\s+(?:the\s+)?title\s+(?:to\s+)?['"“]?([^'"”\n]+)['"”]?|(?:call it|rename it to)\s+['"“]?([^'"”\n]+)['"”]?/i,
    );
    if (titleMatch) {
      const newTitle = (titleMatch[1] || titleMatch[2]).trim();
      if (newTitle.length >= 2 && !containsPromptInjection(newTitle)) {
        draft.title = newTitle;
        modified = true;
        appliedChanges.push(`title to "${newTitle}"`);
      }
    }

    // 2. Date revision
    if (parsed.date) {
      draft.date = parsed.date;
      modified = true;
      appliedChanges.push(`date to ${parsed.date}`);
    }

    // 3. Time revision
    if (parsed.time) {
      draft.time = parsed.time;
      modified = true;
      appliedChanges.push(`time to ${parsed.time}`);
      if (draft.durationMinutes) {
        const [h, m] = draft.time.split(':').map(Number);
        const endTotal = h * 60 + m + draft.durationMinutes;
        const endH = Math.floor(endTotal / 60) % 24;
        const endM = endTotal % 60;
        draft.endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
      }
    }

    // 4. Duration / end time revision: e.g. "make it 30 minutes", "for 1 hour", "thirty minutes"
    const durMatch = instruction.match(
      /(?:for|make it|set duration to|duration:?)?\s*(\d+|one|two|three|four|five|ten|fifteen|twenty|thirty|forty|fifty|sixty)\s*(hours?|hrs?|minutes?|mins?)/i,
    );
    if (durMatch) {
      const numRaw = durMatch[1];
      const unit = durMatch[2].toLowerCase();
      const num = parseNumberWordOrDigits(numRaw) ?? Number(numRaw);
      if (num && Number.isFinite(num)) {
        const mins = unit.startsWith('h') ? num * 60 : num;
        draft.durationMinutes = mins;
        modified = true;
        appliedChanges.push(`duration to ${mins} mins`);
        if (draft.time) {
          const [h, m] = draft.time.split(':').map(Number);
          const endTotal = h * 60 + m + mins;
          const endH = Math.floor(endTotal / 60) % 24;
          const endM = endTotal % 60;
          draft.endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
        }
      }
    } else if (parsed.durationMinutes) {
      draft.durationMinutes = parsed.durationMinutes;
      modified = true;
      appliedChanges.push(`duration to ${parsed.durationMinutes} mins`);
      if (draft.time) {
        const [h, m] = draft.time.split(':').map(Number);
        const endTotal = h * 60 + m + parsed.durationMinutes;
        const endH = Math.floor(endTotal / 60) % 24;
        const endM = endTotal % 60;
        draft.endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
      }
    } else if (parsed.endTime) {
      draft.endTime = parsed.endTime;
      modified = true;
      appliedChanges.push(`end time to ${parsed.endTime}`);
    }

    // 5. Note / body revision
    const bodyMatch = instruction.match(/(?:change|update)\s+(?:the\s+)?(?:body|notes?|content)\s+(?:to\s+)?['"“]?([^'"”\n]+)['"”]?/i);
    if (bodyMatch && draft.kind === 'note') {
      const newBody = bodyMatch[1].trim();
      if (newBody && !containsPromptInjection(newBody)) {
        draft.body = newBody;
        modified = true;
        appliedChanges.push('note content updated');
      }
    }

    if (!modified) {
      return {
        success: false,
        error: 'invalid_delta',
        message: 'Could not extract date, time, duration, or title changes from your instruction.',
      };
    }

    // Re-run schedule collision checks (P10-04)
    if (draft.date && draft.time) {
      const startTime = draft.time;
      const endTime =
        draft.endTime ||
        `${String((Number(draft.time.split(':')[0]) + 1) % 24).padStart(2, '0')}:${draft.time.split(':')[1]}`;
      const conflict = checkScheduleConflict(
        ownerId,
        draft.date,
        startTime,
        endTime,
      );
      if (conflict.hasConflict) {
        draft.warnings = [conflict.warningMessage || 'Time slot overlaps with an existing schedule item.'];
        if (conflict.alternatives.length > 0) {
          draft.assumptions = [`Suggested free slot: ${conflict.alternatives[0]}`];
        }
      } else {
        draft.warnings = [];
      }
    }

    draft.revision += 1;
    draft.updatedAt = Date.now();

    const changeSummary = appliedChanges.join(', ');
    return {
      success: true,
      draft,
      message: `Updated draft ${changeSummary}. Please review the updated card.`,
    };
  }

  confirmDraft(ownerId: string, cardId: string, revision: number): ConfirmDraftResult {
    const draft = this.getDraft(cardId);
    if (!draft) {
      return {success: false, error: 'not_found', message: `Draft "${cardId}" not found.`};
    }
    if (draft.ownerId !== ownerId) {
      return {success: false, error: 'unauthorized', message: 'Unauthorized: draft owner mismatch.'};
    }

    // Idempotent re-confirmation (P10-06, P10-48)
    if (draft.status === 'applied') {
      return {
        success: true,
        status: 'already_applied',
        draft,
        receipt: draft.receipt,
      };
    }

    if (draft.status === 'cancelled') {
      return {success: false, error: 'cancelled', message: 'Cannot confirm a cancelled draft.'};
    }
    if (draft.status === 'expired') {
      return {success: false, error: 'expired', message: 'Draft has expired and cannot be confirmed.'};
    }

    // Concurrency / revision token check
    if (draft.revision !== revision) {
      return {
        success: false,
        error: 'stale_revision',
        message: `Stale confirmation rejected: expected revision ${draft.revision}, got ${revision}.`,
      };
    }

    draft.status = 'applied';
    draft.updatedAt = Date.now();
    draft.receipt = {
      cardId: draft.cardId,
      ownerId: draft.ownerId,
      confirmedAt: draft.updatedAt,
      title: draft.title,
      kind: draft.kind,
    };

    return {
      success: true,
      status: 'applied',
      draft,
      receipt: draft.receipt,
    };
  }

  cancelDraft(ownerId: string, cardId: string): CancelDraftResult {
    const draft = this.getDraft(cardId);
    if (!draft) {
      return {success: false, error: 'not_found', message: `Draft "${cardId}" not found.`};
    }
    if (draft.ownerId !== ownerId) {
      return {success: false, error: 'unauthorized', message: 'Unauthorized: draft owner mismatch.'};
    }
    if (draft.status === 'applied') {
      return {
        success: false,
        error: 'already_finalized',
        message: 'Cannot cancel an already-confirmed draft.',
      };
    }

    draft.status = 'cancelled';
    draft.updatedAt = Date.now();
    return {
      success: true,
      status: 'cancelled',
      draft,
      message: `Draft "${draft.title}" was cancelled. Nothing was saved.`,
    };
  }

  handleCancelSpokenCommand(
    ownerId: string,
    targetCardId?: string,
  ): {
    status: 'cancelled' | 'none' | 'ambiguous';
    message: string;
    cancelledDraft?: TransientDraft;
    candidates?: TransientDraft[];
  } {
    const resolution = this.resolveTargetDraft(ownerId, targetCardId);
    if (resolution.status === 'none') {
      return {status: 'none', message: resolution.message};
    }
    if (resolution.status === 'ambiguous') {
      return {
        status: 'ambiguous',
        message: resolution.message,
        candidates: resolution.candidates,
      };
    }

    const cancelRes = this.cancelDraft(ownerId, resolution.draft.cardId);
    if (cancelRes.success) {
      return {
        status: 'cancelled',
        message: cancelRes.message,
        cancelledDraft: cancelRes.draft,
      };
    }
    return {status: 'none', message: cancelRes.message};
  }

  clearSessionDrafts(sessionId: string): void {
    for (const [id, draft] of this.drafts.entries()) {
      if (draft.sessionId === sessionId) {
        draft.status = 'cancelled';
        this.drafts.delete(id);
      }
    }
  }

  clearAll(): void {
    this.drafts.clear();
  }
}

export const draftRegistry = new DraftRegistry();
