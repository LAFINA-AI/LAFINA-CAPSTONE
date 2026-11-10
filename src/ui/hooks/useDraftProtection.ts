import {useCallback, useEffect, useRef, useState} from 'react';
import type {DraftDialogRequest} from '../components/DraftDecisionDialog';

/** Wording for the replace prompt. The default describes a speech draft, which never sends. */
export interface ReplaceDraftCopy {
  title: string;
  message: string;
}

/** Wording for the discard prompt. */
export interface DiscardDraftCopy {
  title: string;
  message: string;
  confirmLabel?: string;
}

const SPEECH_REPLACE_COPY: ReplaceDraftCopy = {
  title: 'Replace your draft?',
  message:
    'Keep your current text, or replace it with what you just said. Nothing will be sent.',
};

const DISCARD_COPY: DiscardDraftCopy = {
  title: 'Discard unsent draft?',
  message:
    'Your draft and any change waiting for Confirm will be discarded. Items you already saved are kept.',
};

export interface DraftProtection {
  /** Runs `proceed` at once when nothing is unsent; otherwise asks first (default: keep). */
  requestLeave: (proceed: () => void, copy?: DiscardDraftCopy) => void;
  /**
   * Offers `next` as the draft. With different unsent text already present the student
   * chooses Keep (default, also back/outside) or Replace. `done(true)` only after replace.
   */
  offerText: (
    next: string,
    done?: (accepted: boolean) => void,
    copy?: ReplaceDraftCopy,
  ) => void;
  hasDraft: () => boolean;
  /** The open decision, rendered by `DraftDecisionDialog`. */
  dialog: DraftDialogRequest | null;
}

/**
 * Keeps unsent text unless an explicit, still-current discard or replace decision is
 * accepted (AGY-PORT 05). Adapted from the LAFINA donor `useDraftProtection.ts`
 * (blob 400dc944), using AGY's themed dialog instead of `Alert`.
 *
 * Any change of owner, text or review state retires an open decision's version, so a
 * late tap can never discard or overwrite newer text or another account's draft.
 */
export const useDraftProtection = (
  owner: string,
  text: string,
  reviewPending: boolean,
  onDiscard: () => void,
  onReplace: (text: string) => void,
): DraftProtection => {
  const [dialog, setDialog] = useState<DraftDialogRequest | null>(null);
  const state = useRef({
    owner,
    text,
    reviewPending,
    onDiscard,
    onReplace,
    version: 0,
    alive: true,
  });
  if (
    owner !== state.current.owner ||
    text !== state.current.text ||
    reviewPending !== state.current.reviewPending
  ) {
    state.current.version += 1;
  }
  Object.assign(state.current, {
    owner,
    text,
    reviewPending,
    onDiscard,
    onReplace,
  });

  useEffect(() => {
    const current = state.current;
    current.alive = true;
    return () => {
      current.alive = false;
      current.version += 1;
    };
  }, []);

  // A different account never sees, or answers, the previous account's prompt.
  useEffect(() => {
    setDialog(null);
  }, [owner]);

  const hasDraft = useCallback(
    () => !!state.current.text.trim() || state.current.reviewPending,
    [],
  );

  const requestLeave = useCallback(
    (proceed: () => void, copy: DiscardDraftCopy = DISCARD_COPY): void => {
      if (!state.current.alive) return;
      if (!state.current.text.trim() && !state.current.reviewPending) {
        proceed();
        return;
      }
      const version = state.current.version;
      setDialog({
        title: copy.title,
        message: copy.message,
        keepLabel: 'Keep editing',
        confirmLabel: copy.confirmLabel ?? 'Discard',
        destructive: true,
        onKeep: () => setDialog(null),
        onConfirm: () => {
          setDialog(null);
          if (state.current.alive && state.current.version === version) {
            state.current.onDiscard();
            proceed();
          }
        },
      });
    },
    [],
  );

  const offerText = useCallback(
    (
      next: string,
      done: (accepted: boolean) => void = () => undefined,
      copy: ReplaceDraftCopy = SPEECH_REPLACE_COPY,
    ): void => {
      if (!state.current.alive || !next.trim()) {
        done(false);
        return;
      }
      const version = state.current.version;
      const current = state.current.text;
      if (!current.trim() || current === next) {
        state.current.onReplace(next);
        done(true);
        return;
      }
      setDialog({
        title: copy.title,
        message: copy.message,
        keepLabel: 'Keep current text',
        confirmLabel: 'Replace',
        onKeep: () => {
          setDialog(null);
          done(false);
        },
        onConfirm: () => {
          setDialog(null);
          if (!state.current.alive || state.current.version !== version) {
            done(false);
            return;
          }
          state.current.onReplace(next);
          done(true);
        },
      });
    },
    [],
  );

  return {requestLeave, offerText, hasDraft, dialog};
};
