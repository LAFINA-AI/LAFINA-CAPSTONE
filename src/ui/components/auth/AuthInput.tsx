import React, {useState} from 'react';
import {
  KeyboardTypeOptions,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import {Eye, EyeOff} from 'lucide-react-native';
import {Fonts} from '../../theme';
import {useTheme} from '../../contexts/ThemeContext';
import {IntroColors} from '../../screens/onboarding/intro/introTokens';

interface AuthInputProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoCorrect?: boolean;
  autoComplete?: TextInputProps['autoComplete'];
  textContentType?: TextInputProps['textContentType'];
  returnKeyType?: TextInputProps['returnKeyType'];
  onSubmitEditing?: TextInputProps['onSubmitEditing'];
  renderIcon?: (color: string) => React.ReactNode;
  icon?: React.ReactNode;
  showPasswordToggle?: boolean;
  showPassword?: boolean;
  onPasswordToggle?: () => void;
  containerStyle?: ViewStyle;
  testID?: string;
}

export const AuthInput: React.FC<AuthInputProps> = ({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  keyboardType = 'default',
  autoCapitalize = 'none',
  autoCorrect = false,
  autoComplete,
  textContentType,
  returnKeyType,
  onSubmitEditing,
  renderIcon,
  icon,
  showPasswordToggle = false,
  showPassword = false,
  onPasswordToggle,
  containerStyle,
  testID,
}) => {
  const [focused, setFocused] = useState(false);
  const {colors, isDarkMode} = useTheme();

  const labelColor = isDarkMode ? colors.textPrimary : '#26243B';
  const inputBg = isDarkMode ? colors.surface : focused ? '#F8F7FD' : '#F3F2F8';
  const borderColor = focused ? IntroColors.brand : 'transparent';
  const iconColor = focused
    ? IntroColors.brand
    : isDarkMode
    ? colors.textSecondary
    : '#7B7890';
  const textColor = isDarkMode ? colors.textPrimary : IntroColors.ink;
  const placeholderColor = isDarkMode ? colors.placeholder : '#8E8BA3';

  return (
    <View style={[styles.group, containerStyle]}>
      <Text style={[styles.fieldLabel, {color: labelColor}]}>{label}</Text>
      <View
        style={[styles.inputContainer, {backgroundColor: inputBg, borderColor}]}
      >
        {(renderIcon || icon) && (
          <View style={styles.inputIcon}>
            {renderIcon ? renderIcon(iconColor) : icon}
          </View>
        )}
        <TextInput
          style={[styles.input, {color: textColor}]}
          placeholder={placeholder}
          placeholderTextColor={placeholderColor}
          secureTextEntry={secureTextEntry}
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
          autoComplete={autoComplete}
          textContentType={textContentType}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          testID={testID}
        />
        {showPasswordToggle && onPasswordToggle && (
          <TouchableOpacity
            onPress={onPasswordToggle}
            style={styles.eyeIcon}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={
              showPassword ? 'Hide password' : 'Show password'
            }
            hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}
          >
            {showPassword ? (
              <Eye size={19} color={iconColor} />
            ) : (
              <EyeOff size={19} color={iconColor} />
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  group: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontFamily: Fonts.heading,
    fontSize: 13.5,
    fontWeight: '600',
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 52,
  },
  inputIcon: {
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    height: '100%',
    fontFamily: Fonts.body,
    fontSize: 15,
    paddingVertical: 0,
  },
  eyeIcon: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
