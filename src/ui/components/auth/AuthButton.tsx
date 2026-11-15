import React from 'react';
import {
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import {
  Fonts,
  Layout,
  ModernLayout,
} from '../../theme';
import {useTheme} from '../../contexts/ThemeContext';

interface AuthButtonProps {
  title: string;
  onPress: () => void;
  loading: boolean;
  disabled?: boolean;
}

export const AuthButton: React.FC<AuthButtonProps> = ({
  title,
  onPress,
  loading,
  disabled = false,
}) => {
  const {colors, isModern, modernPalette, modernShadows} = useTheme();
  const isButtonDisabled = disabled || loading;

  return (
    <TouchableOpacity
      style={[
        styles.button,
        isModern && styles.modernButton,
        isModern && !isButtonDisabled && modernShadows.subtle,
        {
          backgroundColor: isButtonDisabled
            ? isModern
              ? modernPalette.surface
              : colors.textMuted
            : isModern
              ? modernPalette.accent
              : colors.blue,
        },
      ]}
      onPress={onPress}
      disabled={isButtonDisabled}
    >
      {loading ? (
        <ActivityIndicator color={colors.textOnPrimary} size="small" />
      ) : (
        <Text
          style={[
            styles.buttonText,
            {
              color:
                isModern && isButtonDisabled
                  ? modernPalette.muted
                  : colors.textOnPrimary,
            },
          ]}
        >
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    height: 48,
    borderRadius: Layout.borderRadiusButton,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  modernButton: {
    height: 50,
    borderRadius: ModernLayout.borderRadiusPill,
  },
  buttonText: {
    fontFamily: Fonts.body,
    fontWeight: 'bold',
    fontSize: 15,
  },
});
