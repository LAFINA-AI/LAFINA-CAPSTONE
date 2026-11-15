import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import {
  Fonts,
  Layout,
  ModernLayout,
  ModernShadows,
  useThemedStyles,
} from '../../theme';
import {useTheme} from '../../contexts/ThemeContext';
import type {ThemeColors} from '../../contexts/ThemeContext';

interface OnboardingNavigationProps {
  step: number;
  totalSteps: number;
  onBack: () => void;
  onNext: () => void;
}

export const OnboardingNavigation: React.FC<OnboardingNavigationProps> = ({
  step,
  totalSteps,
  onBack,
  onNext,
}) => {
  const {isModern, modernPalette} = useTheme();
  const themed = useThemedStyles(getThemedStyles);

  return (
    <View
      style={[
        styles.navigation,
        themed.navigation,
        isModern && {
          backgroundColor: modernPalette.bg,
          borderTopColor: modernPalette.border,
        },
      ]}
    >
      {step > 1 ? (
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={[styles.backButtonText, themed.backButtonText]}>Back</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.backSpacer} />
      )}

      <TouchableOpacity
        style={[
          styles.nextButton,
          themed.nextButton,
          isModern && styles.modernNextButton,
          isModern && ModernShadows.subtle,
          isModern && {backgroundColor: modernPalette.accent},
        ]}
        onPress={onNext}
      >
        <Text style={[styles.nextButtonText, themed.nextButtonText]}>
          {step === totalSteps ? 'Get Started' : 'Continue'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  navigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderTopWidth: 1,
  },
  backButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  backSpacer: {
    width: 80,
  },
  backButtonText: {
    fontFamily: Fonts.body,
    fontSize: 15,
    fontWeight: '600',
  },
  nextButton: {
    borderRadius: Layout.borderRadiusButton,
    paddingVertical: 12,
    paddingHorizontal: 24,
    minWidth: 120,
    alignItems: 'center',
  },
  modernNextButton: {
    borderRadius: ModernLayout.borderRadiusPill,
    paddingVertical: 13,
    paddingHorizontal: 26,
  },
  nextButtonText: {
    fontFamily: Fonts.body,
    fontSize: 15,
    fontWeight: 'bold',
  },
});

const getThemedStyles = (colors: ThemeColors) => ({
  navigation: {
    borderTopColor: colors.border,
  },
  backButtonText: {
    color: colors.textSecondary,
  },
  nextButton: {
    backgroundColor: colors.blue,
  },
  nextButtonText: {
    color: colors.textOnPrimary,
  },
});
