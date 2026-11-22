import {useSyncExternalStore} from 'react';
import {AccessibilityInfo} from 'react-native';

let currentReduced = false;
let initialized = false;
let nativeSub: {remove?: () => void} | null = null;
const listeners = new Set<() => void>();

const ensureSubscribed = () => {
  if (initialized) return;
  initialized = true;
  AccessibilityInfo.isReduceMotionEnabled?.()
    .then(value => {
      const next = Boolean(value);
      if (next !== currentReduced) {
        currentReduced = next;
        listeners.forEach(listener => listener());
      }
    })
    .catch(() => undefined);
  nativeSub =
    AccessibilityInfo.addEventListener?.('reduceMotionChanged', value => {
      const next = Boolean(value);
      if (next !== currentReduced) {
        currentReduced = next;
        listeners.forEach(listener => listener());
      }
    }) ?? null;
};

const subscribe = (listener: () => void): (() => void) => {
  ensureSubscribed();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && nativeSub) {
      nativeSub.remove?.();
      nativeSub = null;
      initialized = false;
    }
  };
};

const getSnapshot = (): boolean => currentReduced;

/** True when the phone asks apps to reduce motion. */
export const useReducedMotion = (): boolean =>
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
