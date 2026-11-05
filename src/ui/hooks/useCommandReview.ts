import {useCallback, useEffect, useRef, useState} from 'react';
import {chatOrchestrator} from '../../ai/chatOrchestrator';
import type {ReviewDecisionResult} from '../../ai/chatOrchestrator';
import {
  cancelReviewedCommand,
  latestPendingReview,
} from '../../ai/nlu/commandReview';
import type {
  CommandProposal,
  PrepareResult,
  ReviewSurface,
} from '../../ai/nlu/commandReview';

export interface CommandReviewState {
  /** The proposal on the card, or null. Always the active owner's. */
  proposal: CommandProposal | null;
  /** The proposal ran out of time. Nothing was saved; the card offers Dismiss only. */
  expired: boolean;
  /** Confirm or Cancel is in flight; the card's buttons are disabled. */
  busy: boolean;
  /** Shows a new proposal from `processMessage(...).review`. Other results leave the card alone. */
  present: (review: PrepareResult | null | undefined) => void;
  /** Applies the proposal once. A second tap while busy does nothing. */
  confirm: (options?: {
    speakReply?: boolean;
  }) => Promise<ReviewDecisionResult | null>;
  /** Discards the proposal. `silent` skips the transcript line (used when a sheet closes). */
  cancel: (options?: {silent?: boolean}) => ReviewDecisionResult | null;
  /** Hides an expired card. */
  dismiss: () => void;
}

/**
 * Review-card state for Chat and the voice sheet (AGY-PORT 04).
 *
 * The card never confirms itself: not on unmount, backgrounding, expiry or a
 * repeated tap. A proposal still pending for this owner is shown again after a
 * remount (for example after switching tabs); another owner's never is.
 */
export const useCommandReview = (
  userId: string,
  surface: ReviewSurface,
): CommandReviewState => {
  const [proposal, setProposal] = useState<CommandProposal | null>(() =>
    latestPendingReview(userId, surface),
  );
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const ownerRef = useRef(userId);
  ownerRef.current = userId;

  useEffect(() => {
    setProposal(latestPendingReview(userId, surface));
    setExpired(false);
  }, [userId, surface]);

  useEffect(() => {
    if (!proposal || expired) return undefined;
    const timer = setTimeout(
      () => setExpired(true),
      Math.max(0, proposal.expiresAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [proposal, expired]);

  const present = useCallback((review: PrepareResult | null | undefined) => {
    if (
      review?.status !== 'proposal' ||
      review.proposal.ownerId !== ownerRef.current
    )
      return;
    setProposal(review.proposal);
    setExpired(false);
  }, []);

  const confirm = useCallback(
    async (options?: {
      speakReply?: boolean;
    }): Promise<ReviewDecisionResult | null> => {
      const current = proposal;
      if (!current || expired || busyRef.current) return null;
      busyRef.current = true;
      setBusy(true);
      try {
        const decision = await chatOrchestrator.confirmReview(
          current.ownerId,
          current.operationId,
          options,
        );
        const outcome = decision.outcome;
        // A failed write keeps the card so the student can try again; anything
        // else (applied, stale, expired, cancelled) retires it.
        const retry =
          outcome?.status === 'refused' && outcome.reason === 'failed';
        if (!retry && ownerRef.current === current.ownerId) {
          setProposal(shown =>
            shown?.operationId === current.operationId ? null : shown,
          );
        }
        return decision;
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [proposal, expired],
  );

  const cancel = useCallback(
    (options?: {silent?: boolean}): ReviewDecisionResult | null => {
      const current = proposal;
      if (!current || busyRef.current) return null;
      setProposal(null);
      setExpired(false);
      if (options?.silent) {
        cancelReviewedCommand(current.ownerId, current.operationId);
        return null;
      }
      return chatOrchestrator.cancelReview(
        current.ownerId,
        current.operationId,
      );
    },
    [proposal],
  );

  const dismiss = useCallback(() => {
    setProposal(null);
    setExpired(false);
  }, []);

  return {proposal, expired, busy, present, confirm, cancel, dismiss};
};
