import React from 'react';
import {
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Colors, Fonts, Layout } from '../../theme';

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
  const isButtonDisabled = disabled || loading;

  return (
    <TouchableOpacity
      style={[styles.button, isButtonDisabled && styles.disabledButton]}
      onPress={onPress}
      disabled={isButtonDisabled}
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
    height: 48,
    backgroundColor: Colors.blue,
    borderRadius: Layout.borderRadiusButton,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
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
