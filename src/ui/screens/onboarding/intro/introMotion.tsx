import React, {createContext, useContext, useEffect, useRef} from 'react';
import {Animated, Easing} from 'react-native';
import type {StyleProp, ViewProps, ViewStyle} from 'react-native';

/**
 * A small keyframe engine that reproduces the prototype's CSS animations
 * with React Native's built-in Animated API.
 *
 * - Each animated property has its own value and keyframe stops, like a CSS
 *   property inside @keyframes (stops are [offset 0..1, value]).
 * - The easing applies to every segment between two stops, as CSS
 *   `animation-timing-function` does.
 * - `animation-delay` applies once, before the first run; loops then repeat
 *   without it.
 * - Entry animations (`fill-mode: both`) hold their first frame during the
 *   delay; looping ones (`fill-mode: none`) show the resting style.
 * - With reduce motion on, entry animations show their last frame and loops
 *   show the resting style (the prototype's `prefers-reduced-motion` rule).
 */

export type Stop = readonly [number, number];
type EasingFn = (value: number) => number;

/** CSS cubic-bezier(.2,.8,.2,1) */
export const EASE_SPRING = Easing.bezier(0.2, 0.8, 0.2, 1);
/** CSS `ease` (React Native's Easing.ease is a different curve). */
export const EASE = Easing.bezier(0.25, 0.1, 0.25, 1);
/** CSS `ease-in-out` */
export const EASE_IN_OUT = Easing.bezier(0.42, 0, 0.58, 1);
/** CSS `ease-out` */
export const EASE_OUT = Easing.bezier(0, 0, 0.58, 1);
export const LINEAR = Easing.linear;

export const ReducedMotionContext = createContext(false);
export const useIntroReducedMotion = (): boolean =>
  useContext(ReducedMotionContext);

export interface Timeline {
  /** ms */
  duration: number;
  easing: EasingFn;
  /** ms, first run only */
  delay?: number;
  loop?: boolean;
  native?: boolean;
}

const run = (
  value: Animated.Value,
  toValue: number,
  duration: number,
  timeline: Timeline,
  delay = 0,
): Animated.CompositeAnimation =>
  Animated.timing(value, {
    toValue,
    duration,
    delay,
    easing: timeline.easing,
    useNativeDriver: timeline.native ?? true,
    // Looping decorations must never hold up InteractionManager.
    isInteraction: false,
  });

const segments = (
  value: Animated.Value,
  stops: readonly Stop[],
  timeline: Timeline,
  firstDelay = 0,
): Animated.CompositeAnimation[] =>
  stops
    .slice(1)
    .map((stop, index) =>
      run(
        value,
        stop[1],
        (stop[0] - stops[index][0]) * timeline.duration,
        timeline,
        index === 0 ? firstDelay : 0,
      ),
    );

const trackAnimation = (
  value: Animated.Value,
  stops: readonly Stop[],
  timeline: Timeline,
): Animated.CompositeAnimation => {
  const delay = timeline.delay ?? 0;
  if (!timeline.loop) {
    return Animated.sequence(segments(value, stops, timeline, delay));
  }
  // Each pass starts by snapping to the first stop (CSS restarts every
  // iteration from 0%), so the loop never needs Animated's own reset.
  const pass = (passDelay: number) =>
    Animated.sequence([
      run(value, stops[0][1], 0, timeline, passDelay),
      ...segments(value, stops, timeline),
    ]);
  const loop = Animated.loop(pass(0), {resetBeforeIteration: false});
  return delay > 0 ? Animated.sequence([pass(delay), loop]) : loop;
};

/** Starting value before any animation has run. */
const initialValue = (
  stops: readonly Stop[],
  timeline: Timeline,
  base: number,
  reduced: boolean,
): number => {
  if (timeline.loop) return base;
  return reduced ? stops[stops.length - 1][1] : stops[0][1];
};

/** Drives several tracks on one timeline; returns one value per track. */
export const useKeyframeTracks = <K extends string>(
  tracks: Readonly<Record<K, readonly Stop[]>>,
  bases: Readonly<Record<K, number>>,
  timeline: Timeline,
): Record<K, Animated.Value> => {
  const reduced = useIntroReducedMotion();
  const values = useRef<Record<K, Animated.Value> | null>(null);
  if (values.current === null) {
    const created = {} as Record<K, Animated.Value>;
    (Object.keys(tracks) as K[]).forEach(key => {
      created[key] = new Animated.Value(
        initialValue(tracks[key], timeline, bases[key], reduced),
      );
    });
    values.current = created;
  }
  const current = values.current;

  useEffect(() => {
    const keys = Object.keys(tracks) as K[];
    if (reduced) {
      keys.forEach(key => {
        current[key].stopAnimation();
        current[key].setValue(
          timeline.loop ? bases[key] : tracks[key][tracks[key].length - 1][1],
        );
      });
      return;
    }
    const animation = Animated.parallel(
      keys.map(key => trackAnimation(current[key], tracks[key], timeline)),
    );
    animation.start();
    return () => animation.stop();
    // Tracks and timeline are fixed for an element's lifetime; replaying is
    // done by remounting (each slide is keyed by its screen).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  return current;
};

/** One keyframed number (used for SVG strokes, widths and similar). */
export const useKeyframeValue = (
  stops: readonly Stop[],
  timeline: Timeline,
  base = stops[0][1],
): Animated.Value => useKeyframeTracks({v: stops}, {v: base}, timeline).v;

type MotionProp =
  | 'opacity'
  | 'translateY'
  | 'scale'
  | 'scaleX'
  | 'scaleY'
  | 'rotate';

interface MotionSpec {
  duration: number;
  easing: EasingFn;
  loop?: boolean;
  /** seconds; the class's own delay, overridden by an inline delay */
  delay?: number;
  tracks: Partial<Record<MotionProp, readonly Stop[]>>;
}

const BASE: Record<MotionProp, number> = {
  opacity: 1,
  translateY: 0,
  scale: 1,
  scaleX: 1,
  scaleY: 1,
  rotate: 0,
};

const fadeIn: readonly Stop[] = [
  [0, 0],
  [1, 1],
];

/** The prototype's animation classes (see its <style> block). */
export const MOTION = {
  up: {
    duration: 550,
    easing: EASE_SPRING,
    tracks: {
      opacity: fadeIn,
      translateY: [
        [0, 14],
        [1, 0],
      ],
    },
  },
  pop: {
    duration: 500,
    easing: EASE_SPRING,
    tracks: {
      opacity: [
        [0, 0],
        [0.6, 1],
        [1, 1],
      ],
      scale: [
        [0, 0.85],
        [0.6, 1.03],
        [1, 1],
      ],
    },
  },
  fade: {duration: 500, easing: EASE, tracks: {opacity: fadeIn}},
  word: {duration: 300, easing: EASE, tracks: {opacity: fadeIn}},
  drop: {
    duration: 800,
    easing: EASE_SPRING,
    tracks: {
      opacity: [
        [0, 0],
        [0.65, 1],
        [1, 1],
      ],
      translateY: [
        [0, -110],
        [0.65, 8],
        [0.82, -3],
        [1, 0],
      ],
    },
  },
  slideup: {
    duration: 600,
    easing: EASE_SPRING,
    tracks: {
      opacity: fadeIn,
      translateY: [
        [0, 40],
        [1, 0],
      ],
    },
  },
  growY: {duration: 700, easing: EASE_SPRING, tracks: {scaleY: fadeIn}},
  growX: {duration: 600, easing: EASE_SPRING, tracks: {scaleX: fadeIn}},
  float: {
    duration: 3400,
    easing: EASE_IN_OUT,
    loop: true,
    tracks: {
      translateY: [
        [0, 0],
        [0.5, -6],
        [1, 0],
      ],
    },
  },
  ring: {
    duration: 2600,
    easing: EASE_IN_OUT,
    loop: true,
    delay: 1.6,
    tracks: {
      rotate: [
        [0, 0],
        [0.1, 16],
        [0.2, -14],
        [0.3, 9],
        [0.4, -6],
        [0.48, 3],
        [0.55, 0],
        [1, 0],
      ],
    },
  },
  pulse: {
    duration: 1800,
    easing: EASE_OUT,
    loop: true,
    tracks: {
      scale: [
        [0, 1],
        [1, 2.4],
      ],
      opacity: [
        [0, 0.6],
        [1, 0],
      ],
    },
  },
  bar: {
    duration: 900,
    easing: EASE_IN_OUT,
    loop: true,
    tracks: {
      scaleY: [
        [0, 0.3],
        [0.5, 1],
        [1, 0.3],
      ],
    },
  },
  scan: {
    duration: 2400,
    easing: EASE_IN_OUT,
    loop: true,
    delay: 0.4,
    tracks: {
      translateY: [
        [0, 0],
        [1, 130],
      ],
      opacity: [
        [0, 0],
        [0.12, 1],
        [0.88, 1],
        [1, 0],
      ],
    },
  },
  spin: {
    duration: 2400,
    easing: LINEAR,
    loop: true,
    tracks: {
      rotate: [
        [0, 0],
        [1, 360],
      ],
    },
  },
  orbit: {
    duration: 26000,
    easing: LINEAR,
    loop: true,
    tracks: {
      rotate: [
        [0, 0],
        [1, 360],
      ],
    },
  },
  orbitRev: {
    duration: 26000,
    easing: LINEAR,
    loop: true,
    tracks: {
      rotate: [
        [0, 0],
        [1, -360],
      ],
    },
  },
  twinkle: {
    duration: 2200,
    easing: EASE_IN_OUT,
    loop: true,
    tracks: {
      opacity: [
        [0, 0.25],
        [0.5, 1],
        [1, 0.25],
      ],
      scale: [
        [0, 0.6],
        [0.5, 1],
        [1, 0.6],
      ],
    },
  },
  starIn: {
    duration: 1000,
    easing: EASE_SPRING,
    delay: 0.15,
    tracks: {
      opacity: [
        [0, 0],
        [0.7, 1],
        [1, 1],
      ],
      scale: [
        [0, 0.2],
        [0.7, 1.08],
        [1, 1],
      ],
      rotate: [
        [0, -120],
        [0.7, 8],
        [1, 0],
      ],
    },
  },
  breathe: {
    duration: 3200,
    easing: EASE_IN_OUT,
    loop: true,
    delay: 1.2,
    tracks: {
      scale: [
        [0, 1],
        [0.5, 1.06],
        [1, 1],
      ],
    },
  },
} satisfies Record<string, MotionSpec>;

export type MotionKind = keyof typeof MOTION;

const TRANSFORM_ORDER: MotionProp[] = [
  'translateY',
  'scale',
  'scaleX',
  'scaleY',
  'rotate',
];

/** Animated style for one prototype animation class. */
export const useMotionStyle = (kind: MotionKind, delay?: number) => {
  const spec: MotionSpec = MOTION[kind];
  const tracks = spec.tracks as Record<MotionProp, readonly Stop[]>;
  const values = useKeyframeTracks(tracks, BASE, {
    duration: spec.duration,
    easing: spec.easing,
    loop: spec.loop,
    delay: (delay ?? spec.delay ?? 0) * 1000,
  });
  const style: {
    opacity?: Animated.Value;
    transform?: Array<
      Record<string, Animated.Value | Animated.AnimatedInterpolation<string>>
    >;
  } = {};
  if (values.opacity) style.opacity = values.opacity;
  const transform = TRANSFORM_ORDER.filter(prop => values[prop]).map(prop =>
    prop === 'rotate'
      ? {
          rotate: values.rotate.interpolate({
            inputRange: [0, 360],
            outputRange: ['0deg', '360deg'],
            extrapolate: 'extend',
          }),
        }
      : {[prop]: values[prop]},
  );
  if (transform.length) style.transform = transform;
  return style as Animated.WithAnimatedValue<ViewStyle>;
};

export interface MotionProps extends ViewProps {
  kind: MotionKind;
  /** seconds, as the prototype's inline animation-delay */
  delay?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/** A View that plays one of the prototype's animation classes. */
export const Motion: React.FC<MotionProps> = ({
  kind,
  delay,
  style,
  children,
  ...rest
}) => {
  const motion = useMotionStyle(kind, delay);
  return (
    <Animated.View {...rest} style={[style, motion]}>
      {children}
    </Animated.View>
  );
};
