import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {Fonts, useThemedStyles} from '../../theme';
import {useTheme} from '../../contexts/ThemeContext';
import type {ThemeColors} from '../../contexts/ThemeContext';

interface OnboardingProgressProps {
  step: number;
  totalSteps: number;
}

export const OnboardingProgress: React.FC<OnboardingProgressProps> = ({
  step,
  totalSteps,
}) => {
  const {colors, isModern, modernPalette} = useTheme();
  const themed = useThemedStyles(getThemedStyles);

  return (
    <View style={styles.progressContainer}>
      <View
        style={[
          styles.progressBarBg,
          themed.progressBarBg,
          isModern && {backgroundColor: modernPalette.surface},
        ]}
      >
        <View
          style={[
            styles.progressBarActive,
            {
              width: `${(step / totalSteps) * 100}%`,
              backgroundColor: isModern ? modernPalette.accent : colors.blue,
            },
          ]}
        />
      </View>
      <Text style={[styles.progressText, themed.progressText]}>
        Step {step} of {totalSteps}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  progressContainer: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
  },
  progressBarBg: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarActive: {
    height: '100%',
  },
  progressText: {
    fontFamily: Fonts.body,
    fontSize: 12,
    marginTop: 6,
    textAlign: 'right',
  },
});

const getThemedStyles = (colors: ThemeColors) => ({
  progressBarBg: {
    backgroundColor: colors.border,
  },
  progressText: {
    color: colors.textMuted,
  },
});
