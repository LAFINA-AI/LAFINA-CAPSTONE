import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  ViewStyle,
} from 'react-native';
import {Fonts} from '../../theme';
import {useTheme} from '../../contexts/ThemeContext';
import {IntroColors} from '../../screens/onboarding/intro/introTokens';

interface AuthButtonProps {
  title: string;
  onPress: () => void;
  loading: boolean;
  disabled?: boolean;
  muted?: boolean;
  style?: ViewStyle;
  testID?: string;
}

export const AuthButton: React.FC<AuthButtonProps> = ({
  title,
  onPress,
  loading,
  disabled = false,
  muted = false,
  style,
  testID,
}) => {
  const {isDarkMode} = useTheme();
  const isButtonDisabled = disabled || loading;
  const isSoftAppearance = isButtonDisabled || muted;

  const backgroundColor = isSoftAppearance
    ? isDarkMode
      ? 'rgba(124, 107, 255, 0.42)'
      : '#A49AF5'
    : isDarkMode
    ? '#6B58F5'
    : IntroColors.brand;

  return (
    <TouchableOpacity
      style={[
        styles.button,
        {backgroundColor},
        !isSoftAppearance && styles.activeShadow,
        style,
      ]}
      onPress={onPress}
      disabled={isButtonDisabled}
      activeOpacity={0.86}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{disabled: isSoftAppearance, busy: loading}}
      testID={testID}
    >
      {loading ? (
        <ActivityIndicator color="#FFFFFF" size="small" />
      ) : (
        <Text style={styles.buttonText}>{title}</Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    height: 54,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeShadow: {
    shadowColor: IntroColors.brand,
    shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.24,
    shadowRadius: 12,
    elevation: 4,
  },
  buttonText: {
    fontFamily: Fonts.heading,
    fontWeight: '700',
    fontSize: 16,
    color: '#FFFFFF',
    letterSpacing: 0.1,
  },
});
