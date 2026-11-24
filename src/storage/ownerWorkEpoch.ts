import {getSessionGeneration, subscribeSessionChanges} from './sessionEpoch';

const revisions = new Map<string, number>();
const listeners = new Set<(owner: string | null) => void>();
const notify = (owner: string | null) => {
  for (const listener of [...listeners]) listener(owner);
};
subscribeSessionChanges(() => notify(null));

/** Navigation preserves work; replacing a sign-in or clearing its data retires it. */
export const captureOwnerWork = (owner: string): (() => boolean) => {
  const session = getSessionGeneration();
  const revision = revisions.get(owner) ?? 0;
  return () =>
    session === getSessionGeneration() &&
    revision === (revisions.get(owner) ?? 0);
};
export const invalidateOwnerWork = (owner: string): void => {
  revisions.set(owner, (revisions.get(owner) ?? 0) + 1);
  notify(owner);
};
export const subscribeOwnerWorkInvalidation = (
  listener: (owner: string | null) => void,
): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
