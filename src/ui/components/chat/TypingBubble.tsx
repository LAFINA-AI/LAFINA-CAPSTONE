import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { Fonts, Shadows } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useThemedStyles } from '../../theme/createThemedStyles';
import type { ThemeColors } from '../../contexts/ThemeContext';

const CYCLE_MS = 1200;
const RISE_MS = 360;
const DOT_OFFSET_MS = 160;
const DOT_COUNT = 3;

interface TypingBubbleProps {
  label?: string | null;
}

export const TypingBubble: React.FC<TypingBubbleProps> = ({ label }) => {
  const { colors } = useTheme();
  const themed = useThemedStyles(getThemedStyles);
  const dots = useRef(Array.from({ length: DOT_COUNT }, () => new Animated.Value(0))).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (active) setReduceMotion(enabled);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) return undefined;
    const loops = dots.map((dot, index) =>
      Animated.sequence([
        Animated.delay(index * DOT_OFFSET_MS),
        Animated.loop(
          Animated.sequence([
            Animated.timing(dot, { toValue: 1, duration: RISE_MS, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            Animated.timing(dot, { toValue: 0, duration: RISE_MS, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            Animated.delay(CYCLE_MS - RISE_MS * 2),
          ]),
        ),
      ]),
    );
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [dots, reduceMotion]);

  return (
    <View
      style={[styles.bubble, themed.bubble]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? 'LAFINA is typing a reply'}
      accessibilityLiveRegion="polite"
      testID="typing-bubble"
    >
      <View style={styles.dots}>
        {dots.map((dot, index) => (
          <Animated.View
            key={index}
            style={[
              styles.dot,
              { backgroundColor: colors.textMuted },
              {
                opacity: dot.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }),
                transform: [{ translateY: dot.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }],
              },
            ]}
          />
        ))}
      </View>
      {label ? <Text style={[styles.label, themed.label]}>{label}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    maxWidth: '80%',
    borderWidth: 1,
    borderRadius: 18,
    borderBottomLeftRadius: 2,
    paddingHorizontal: 16,
    paddingVertical: 13,
    marginVertical: 6,
    ...Shadows.card,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 14,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginHorizontal: 2.5,
  },
  label: {
    fontFamily: Fonts.body,
    fontSize: 13,
    fontWeight: '500',
    marginLeft: 10,
  },
});

const getThemedStyles = (colors: ThemeColors) => ({
  bubble: {
    backgroundColor: colors.cardBg,
    borderColor: colors.border,
  },
  label: {
    color: colors.textSecondary,
  },
});
