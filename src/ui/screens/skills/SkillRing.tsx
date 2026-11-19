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
}: {
  progress: number;
  children: React.ReactNode;
  size?: number;
}) {
  const p = useSkillsPalette();
  const reduced = useReducedMotion();
  const value = useRef(new Animated.Value(progress)).current;
  useEffect(() => {
    if (reduced) {
      value.setValue(progress);
      return;
    }
    const a = Animated.timing(value, {
      toValue: progress,
      duration: 1000,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    a.start();
    return () => a.stop();
  }, [progress, reduced, value]);
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
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={p.accent}
          strokeWidth={14}
          strokeLinecap="round"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={value.interpolate({
            inputRange: [0, 1],
            outputRange: [circumference, 0],
          })}
          rotation={-90}
          origin={`${size / 2},${size / 2}`}
        />
      </Svg>
      {children}
    </View>
  );
}
