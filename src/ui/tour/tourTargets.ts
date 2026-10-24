import type { TourAnchor } from './tourSteps';

export interface ScreenRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Measurable {
  measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => void;
}

const targets = new Map<TourAnchor, Measurable>();
const refCallbacks = new Map<TourAnchor, (node: Measurable | null) => void>();

export const tourTargetRef = (anchor: TourAnchor): ((node: Measurable | null) => void) => {
  let callback = refCallbacks.get(anchor);
  if (!callback) {
    callback = (node) => {
      if (node) targets.set(anchor, node);
      else targets.delete(anchor);
    };
    refCallbacks.set(anchor, callback);
  }
  return callback;
};

export const measureInWindow = (node: Measurable | null | undefined): Promise<ScreenRect | null> =>
  new Promise((resolve) => {
    if (!node) {
      resolve(null);
      return;
    }
    try {
      node.measureInWindow((x, y, width, height) =>
        resolve(width > 0 && height > 0 ? { x, y, width, height } : null),
      );
    } catch {
      resolve(null);
    }
  });

export const measureTourTarget = (anchor: TourAnchor): Promise<ScreenRect | null> =>
  measureInWindow(targets.get(anchor));
