import React, {useEffect, useRef} from 'react';
import {Animated, Easing, View} from 'react-native';
import Svg, {Path} from 'react-native-svg';
import {useReducedMotion} from '../../hooks/useReducedMotion';
import {useSkillsPalette} from '../../theme/skills';
const AnimatedPath = Animated.createAnimatedComponent(Path);
export function SkillCheck() {
  const reduced = useReducedMotion();
  const p = useSkillsPalette();
  const offset = useRef(new Animated.Value(24)).current;
  useEffect(() => {
    if (reduced) {
      offset.setValue(0);
      return;
    }
    offset.setValue(24);
    const a = Animated.timing(offset, {
      toValue: 0,
      duration: 350,
      delay: 50,
      easing: Easing.ease,
      useNativeDriver: false,
    });
    a.start();
    return () => a.stop();
  }, [offset, reduced]);
  return (
    <View
      accessible={false}
      style={{
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: p.mintInk,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Svg width={16} height={16} viewBox="0 0 24 24">
        <AnimatedPath
          d="M5 12.5l4.5 4.5L19 7.5"
          fill="none"
          stroke={p.isDarkMode ? '#14142B' : '#FFFFFF'}
          strokeWidth={3.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="24"
          strokeDashoffset={offset}
        />
      </Svg>
    </View>
  );
}
export function SkillHalo({
  children,
  active = true,
}: {
  children: React.ReactNode;
  active?: boolean;
}) {
  const p = useSkillsPalette();
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced || !active) {
      progress.setValue(0);
      return;
    }
    const a = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 2200,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    );
    a.start();
    return () => a.stop();
  }, [reduced, active, progress]);
  return (
    <View style={{alignItems: 'center', justifyContent: 'center'}}>
      {active && !reduced && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: 80,
            height: 80,
            borderRadius: 40,
            backgroundColor: p.accent,
            opacity: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [0.4, 0],
            }),
            transform: [
              {
                scale: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 1.7],
                }),
              },
            ],
          }}
        />
      )}
      {children}
    </View>
  );
}
