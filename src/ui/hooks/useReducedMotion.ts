import {useEffect, useState} from 'react';
import {AccessibilityInfo} from 'react-native';

/** True when the phone asks apps to reduce motion. */
export const useReducedMotion = (): boolean => {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then(value => {
        if (active) setReduced(Boolean(value));
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener?.(
      'reduceMotionChanged',
      value => setReduced(Boolean(value)),
    );
    return () => {
      active = false;
      subscription?.remove?.();
    };
  }, []);
  return reduced;
};
