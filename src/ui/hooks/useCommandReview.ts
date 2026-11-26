import {useCallback, useEffect, useRef, useState} from 'react';
import {chatOrchestrator} from '../../ai/chatOrchestrator';
import type {ReviewDecisionResult} from '../../ai/chatOrchestrator';
import {
  cancelReviewedCommand,
  editReviewedCommand,
  latestPendingReview,
  setReviewReminderDelivery,
} from '../../ai/nlu/commandReview';
import type {ReminderDeliveryStyle} from '../../storage/reminderDeliveryStyleStore';
import type {
  CommandProposal,
  PrepareResult,
  ReviewEditPatch,
  ReviewSurface,
} from '../../ai/nlu/commandReview';

export interface CommandReviewState {
  /** The proposal on the card, or null. Always the active owner's. */
  proposal: CommandProposal | null;
  /** The proposal ran out of time. Nothing was saved; the card offers Dismiss only. */
  expired: boolean;
  /** Confirm or Cancel is in flight; the card's buttons are disabled. */
  busy: boolean;
  /** Inline validation message shown when an edit cannot be applied. */
  editError?: string | null;
  /** Shows a new proposal from `processMessage(...).review`. Other results leave the card alone. */
  present: (review: PrepareResult | null | undefined) => void;
  /** Updates fields on the current pending proposal before Confirm. */
  edit?: (patch: ReviewEditPatch) => PrepareResult | null;
  /** "Call me" or "Notify only" for the reminder this card creates. Saves nothing. */
  setDelivery?: (style: ReminderDeliveryStyle) => void;
  /** Applies the proposal once. A second tap while busy does nothing. */
  confirm: (options?: {
    speakReply?: boolean;
    temporaryChat?: boolean;
    /**
     * The card to apply when it may be newer than the one rendered (a spoken
     * change just replaced it). Defaults to the card on screen.
     */
    operationId?: string;
  }) => Promise<ReviewDecisionResult | null>;
  /** Discards the proposal. `silent` skips the transcript line (used when a sheet closes). */
  cancel: (options?: {
    silent?: boolean;
    temporaryChat?: boolean;
  }) => ReviewDecisionResult | null;
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
  const [editError, setEditError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const inFlightRef = useRef<{
    operationId: string;
    done: Promise<ReviewDecisionResult | null>;
  } | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const ownerRef = useRef(userId);
  ownerRef.current = userId;

  useEffect(() => {
    setProposal(latestPendingReview(userId, surface));
    setExpired(false);
    setEditError(null);
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
    setEditError(null);
  }, []);

  const edit = useCallback(
    (patch: ReviewEditPatch): PrepareResult | null => {
      const current = proposal;
      if (!current || expired || busyRef.current) return null;
      const result = editReviewedCommand(
        current.ownerId,
        current.operationId,
        patch,
      );
      if (
        result.status === 'proposal' &&
        result.proposal.ownerId === ownerRef.current
      ) {
        setProposal(result.proposal);
        setExpired(false);
        setEditError(null);
      } else {
        setEditError(result.reply);
      }
      return result;
    },
    [proposal, expired],
  );

  const setDelivery = useCallback(
    (style: ReminderDeliveryStyle): void => {
      const current = proposal;
      if (!current || expired || busyRef.current) return;
      const result = setReviewReminderDelivery(
        current.ownerId,
        current.operationId,
        style,
      );
      if (
        result.status === 'proposal' &&
        result.proposal.ownerId === ownerRef.current
      ) {
        setProposal(result.proposal);
        setEditError(null);
      } else if (result.status !== 'proposal') {
        setEditError(result.reply);
      }
    },
    [proposal, expired],
  );

  const confirm = useCallback(
    async (options?: {
      speakReply?: boolean;
      temporaryChat?: boolean;
      operationId?: string;
    }): Promise<ReviewDecisionResult | null> => {
      const shown = proposal;
      const targetId = options?.operationId ?? shown?.operationId;
      if (!targetId) return null;
      if (busyRef.current) {
        // The same card is already being saved (a tap and a spoken "save it"
        // together): share that save's answer instead of "no draft found".
        const running = inFlightRef.current;
        return running && running.operationId === targetId
          ? running.done
          : null;
      }
      if (!options?.operationId && expired) return null;
      const current = {
        ownerId: shown?.ownerId ?? ownerRef.current,
        operationId: targetId,
      };
      busyRef.current = true;
      setBusy(true);
      let finish: (value: ReviewDecisionResult | null) => void = () => {};
      inFlightRef.current = {
        operationId: targetId,
        done: new Promise(resolve => {
          finish = resolve;
        }),
      };
      let result: ReviewDecisionResult | null = null;
      try {
        const decision = await chatOrchestrator.confirmReview(
          current.ownerId,
          current.operationId,
          {
            speakReply: options?.speakReply,
            temporaryChat: options?.temporaryChat,
          },
        );
        const outcome = decision.outcome;
        // A failed write keeps the card so the student can try again; anything
        // else (applied, stale, expired, cancelled) retires it.
        const retry =
          outcome?.status === 'refused' && outcome.reason === 'failed';
        if (!retry && mountedRef.current && ownerRef.current === current.ownerId) {
          // An older version of the applied card still rendered goes too
          // (there is one open card per surface).
          setProposal(onScreen =>
            onScreen?.operationId === current.operationId ||
            (options?.operationId !== undefined &&
              onScreen?.operationId === shown?.operationId)
              ? null
              : onScreen,
          );
          setEditError(null);
        }
        result = decision;
        return decision;
      } finally {
        busyRef.current = false;
        inFlightRef.current = null;
        if (mountedRef.current) {
          setBusy(false);
        }
        finish(result);
      }
    },
    [proposal, expired],
  );

  const cancel = useCallback(
    (options?: {
      silent?: boolean;
      temporaryChat?: boolean;
    }): ReviewDecisionResult | null => {
      const current = proposal;
      if (!current || busyRef.current) return null;
      setProposal(null);
      setExpired(false);
      setEditError(null);
      if (options?.silent) {
        cancelReviewedCommand(current.ownerId, current.operationId);
        return null;
      }
      return chatOrchestrator.cancelReview(
        current.ownerId,
        current.operationId,
        options?.temporaryChat ? {temporaryChat: true} : undefined,
      );
    },
    [proposal],
  );

  const dismiss = useCallback(() => {
    setProposal(null);
    setExpired(false);
    setEditError(null);
  }, []);

  return {
    proposal,
    expired,
    busy,
    editError,
    present,
    edit,
    setDelivery,
    confirm,
    cancel,
    dismiss,
  };
};
