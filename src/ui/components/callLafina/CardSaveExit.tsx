/**
 * The exit of a card the student just saved in Call Lafina (CALLFIX-02).
 *
 * The saved card stays a moment with its check and "Saved", then shrinks and
 * fades away. It is a visual echo only: the save already happened and the
 * card itself is retired, so nothing here can be pressed. With Reduce Motion
 * on, the card shows "Saved" briefly and then disappears without movement.
 */
import React, {useEffect, useRef} from 'react';
import {Animated, Easing} from 'react-native';
import {useReducedMotion} from '../../hooks/useReducedMotion';

/** How long the saved card holds before it leaves. */
export const SAVED_HOLD_MS = 700;
/** How long the shrink and fade takes. */
export const SAVED_EXIT_MS = 250;
/** With Reduce Motion: how long "Saved" shows before the card is removed. */
export const SAVED_REDUCED_MS = 600;

export const CardSaveExit: React.FC<{
  children: React.ReactNode;
  onDone: () => void;
  holdMs?: number;
  testID?: string;
}> = ({
  children,
  onDone,
  holdMs = SAVED_HOLD_MS,
  testID = 'call-card-saved-exit',
}) => {
  const reduced = useReducedMotion();
  const fade = useRef(new Animated.Value(1)).current;
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      doneRef.current();
    };
    if (reduced) {
      const timer = setTimeout(finish, Math.max(SAVED_REDUCED_MS, holdMs));
      return () => clearTimeout(timer);
    }
    const anim = Animated.sequence([
      Animated.delay(holdMs),
      Animated.timing(fade, {
        toValue: 0,
        duration: SAVED_EXIT_MS,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]);
    anim.start(() => finish());
    // The card always leaves, even if an animation callback never comes.
    const fallback = setTimeout(finish, holdMs + SAVED_EXIT_MS + 400);
    return () => {
      anim.stop();
      clearTimeout(fallback);
    };
  }, [reduced, holdMs, fade]);

  return (
    <Animated.View
      pointerEvents="none"
      testID={testID}
      style={{
        opacity: fade,
        transform: [
          {
            scale: fade.interpolate({
              inputRange: [0, 1],
              outputRange: [0.94, 1],
            }),
          },
          {
            translateY: fade.interpolate({
              inputRange: [0, 1],
              outputRange: [-8, 0],
            }),
          },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
};
