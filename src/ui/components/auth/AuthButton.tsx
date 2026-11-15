import React from 'react';
import {
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import {
  Colors,
  Fonts,
  Layout,
  ModernLayout,
  ModernShadows,
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
  const {isModern, modernPalette} = useTheme();
  const isButtonDisabled = disabled || loading;

  return (
    <TouchableOpacity
      style={[
        styles.button,
        isModern && styles.modernButton,
        isModern && !isButtonDisabled && ModernShadows.subtle,
        isModern && {
          backgroundColor: isButtonDisabled
            ? modernPalette.surface
            : modernPalette.accent,
        },
        !isModern && isButtonDisabled && styles.disabledButton,
      ]}
      onPress={onPress}
      disabled={isButtonDisabled}
    >
      {loading ? (
        <ActivityIndicator color="#FFFFFF" size="small" />
      ) : (
        <Text
          style={[
            styles.buttonText,
            isModern && isButtonDisabled && {color: modernPalette.muted},
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
    backgroundColor: Colors.blue,
    borderRadius: Layout.borderRadiusButton,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  modernButton: {
    height: 50,
    borderRadius: ModernLayout.borderRadiusPill,
  },
  disabledButton: {
    backgroundColor: Colors.textMutedLight,
  },
  buttonText: {
    fontFamily: Fonts.body,
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 15,
  },
});
