/**
 * Per-owner pending USTP citation slot for Call LAFINA turns (ADR-047).
 *
 * Online calls run `search_ustp_sources` via `actionService` before the model
 * finishes speaking; offline calls run `searchUstpSourcesForVoice` before
 * `OfflineCallController` persists the spoken reply. Recording the matched
 * sources here lets both persistence hooks attach `handbookNote` and
 * `sourcePassageIds` to the saved Chat message without changing
 * `ConversationPersistence`'s interface or leaking citations across turns.
 */
import {
  replyDisclaimsHandbook,
  type LocalHandbookSource,
} from '../../handbook';
import {
  handbookPassageIds,
  handbookSourceLabel,
} from '../../skills/onlineChatSkill';

const MAX_CITATION_AGE_MS = 60_000;

const pendingByOwner = new Map<
  string,
  {sources: LocalHandbookSource[]; recordedAt: number}
>();

export function recordCallUstpSources(
  userId: string,
  sources: readonly LocalHandbookSource[],
): void {
  if (!userId || sources.length === 0) return;
  pendingByOwner.set(userId, {
    sources: [...sources],
    recordedAt: Date.now(),
  });
}

export function clearCallUstpSources(userId: string): void {
  if (!userId) return;
  pendingByOwner.delete(userId);
}

export function consumeCallUstpCitation(
  userId: string,
  replyText: string,
): {handbookNote: string; sourcePassageIds: string[]} | null {
  if (!userId) return null;
  const entry = pendingByOwner.get(userId);
  pendingByOwner.delete(userId);
  if (!entry) return null;
  if (Date.now() - entry.recordedAt > MAX_CITATION_AGE_MS) return null;
  if (replyDisclaimsHandbook(replyText)) return null;
  const handbookNote = handbookSourceLabel(entry.sources);
  if (!handbookNote) return null;
  return {
    handbookNote,
    sourcePassageIds: handbookPassageIds(entry.sources),
  };
}
