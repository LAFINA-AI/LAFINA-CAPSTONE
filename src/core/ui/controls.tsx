import {Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import type {KeyboardTypeOptions, TextInputProps} from 'react-native';
import {useTheme} from '../theme/ThemeContext';
import {dimensions, spacing, typography} from '../theme/theme';

export function Button({
  label,
  onPress,
  secondary = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  const {colors} = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{disabled}}
      disabled={disabled}
      onPress={onPress}
      style={({pressed}) => [
        styles.button,
        {
          backgroundColor: disabled
            ? colors.disabled
            : secondary
            ? colors.surface
            : colors.primary,
          borderColor: colors.border,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          {
            color: disabled
              ? colors.muted
              : secondary
              ? colors.text
              : colors.onPrimary,
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  keyboardType,
  ...props
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: KeyboardTypeOptions;
} & Pick<
  TextInputProps,
  'placeholder' | 'maxLength' | 'autoCapitalize' | 'editable'
>) {
  const {colors} = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, {color: colors.text}]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        autoCorrect={false}
        placeholderTextColor={colors.muted}
        style={[
          styles.input,
          {
            backgroundColor: colors.field,
            borderColor: colors.border,
            color: colors.text,
          },
        ]}
        {...props}
      />
    </View>
  );
}

export function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{
    value: T;
    label: string;
    accessibilityLabel?: string;
  }>;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  const {colors} = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, {color: colors.text}]}>{label}</Text>
      <View style={styles.choices}>
        {options.map(option => (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={
              option.accessibilityLabel ?? `${label}: ${option.label}`
            }
            accessibilityState={{checked: value === option.value, disabled}}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            style={[
              styles.choice,
              {
                backgroundColor:
                  value === option.value ? colors.selected : colors.surface,
                borderColor:
                  value === option.value ? colors.primary : colors.border,
              },
            ]}
          >
            <Text style={[styles.choiceText, {color: colors.text}]}>
              {value === option.value ? '● ' : '○ '}
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function Message({
  text,
  error = false,
}: {
  text: string;
  error?: boolean;
}) {
  const {colors} = useTheme();
  return (
    <Text
      accessibilityRole={error ? 'alert' : 'text'}
      accessibilityLiveRegion="polite"
      style={[styles.message, {color: error ? colors.danger : colors.muted}]}
    >
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: dimensions.control,
    borderRadius: dimensions.radius,
    borderWidth: dimensions.border,
    padding: spacing.md,
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  buttonText: {
    fontSize: typography.label,
    fontWeight: '600',
    textAlign: 'center',
  },
  field: {marginBottom: spacing.lg},
  label: {
    fontSize: typography.label,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  input: {
    minHeight: dimensions.control,
    borderWidth: dimensions.border,
    borderRadius: dimensions.radius,
    padding: spacing.md,
    fontSize: typography.body,
  },
  choices: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm},
  choice: {
    minHeight: dimensions.control,
    borderWidth: dimensions.border,
    borderRadius: dimensions.radius,
    padding: spacing.md,
    justifyContent: 'center',
  },
  choiceText: {fontSize: typography.body},
  message: {
    fontSize: typography.body,
    lineHeight: 24,
    marginBottom: spacing.md,
  },
});
