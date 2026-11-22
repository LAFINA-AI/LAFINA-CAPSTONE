import React, {useEffect, useRef} from 'react';
import {Animated, Easing, View} from 'react-native';
import Svg, {Circle} from 'react-native-svg';
import {useSkillsPalette} from '../../theme/skills';
import {useReducedMotion} from '../../hooks/useReducedMotion';
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
export function SkillRing({
  progress,
  children,
  size = 260,
  animateOnMount = false,
  color,
}: {
  progress: number;
  children: React.ReactNode;
  size?: number;
  animateOnMount?: boolean;
  color?: string;
}) {
  const p = useSkillsPalette();
  const reduced = useReducedMotion();
  const clamped = Math.max(
    0,
    Math.min(1, Number.isFinite(progress) ? progress : 0),
  );
  const initialValue = animateOnMount && !reduced ? 0 : clamped;
  const value = useRef(new Animated.Value(initialValue)).current;
  const prevProgress = useRef(initialValue);
  useEffect(() => {
    const jump = Math.abs(clamped - prevProgress.current);
    prevProgress.current = clamped;
    if (reduced || (!animateOnMount && jump > 0.1)) {
      value.setValue(clamped);
      return;
    }
    const a = Animated.timing(value, {
      toValue: clamped,
      duration: animateOnMount ? 650 : 200,
      easing: animateOnMount ? Easing.out(Easing.cubic) : Easing.linear,
      useNativeDriver: false,
    });
    a.start();
    return () => a.stop();
  }, [animateOnMount, clamped, reduced, value]);
  const r = (size - 40) / 2;
  const circumference = 2 * Math.PI * r;
  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Svg
        width={size}
        height={size}
        style={{position: 'absolute'}}
        accessible={false}
      >
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={p.surface}
          strokeWidth={14}
        />
        {clamped > 0 && (
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color ?? p.accent}
            strokeWidth={14}
            strokeLinecap="round"
            strokeDasharray={`${circumference}`}
            strokeDashoffset={value.interpolate({
              inputRange: [0, 1],
              outputRange: [circumference, 0],
              extrapolate: 'clamp',
            })}
            rotation={-90}
            origin={`${size / 2},${size / 2}`}
          />
        )}
      </Svg>
      {children}
    </View>
  );
}
