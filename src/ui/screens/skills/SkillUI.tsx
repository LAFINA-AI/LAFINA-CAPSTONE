import React, {useEffect, useRef} from 'react';
import {
  Animated,
  Easing,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type {TextInputProps, ViewStyle, StyleProp} from 'react-native';
import {ArrowLeft} from 'lucide-react-native';
import {SkillFonts, SkillMotion, useSkillsPalette} from '../../theme/skills';
import {useReducedMotion} from '../../hooks/useReducedMotion';

export function Entry({
  children,
  delay = 0,
  style,
}: React.PropsWithChildren<{delay?: number; style?: StyleProp<ViewStyle>}>) {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduced) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: SkillMotion.entry,
      delay,
      easing: Easing.bezier(0.2, 0.8, 0.2, 1),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, reduced, delay]);
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [12, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
export function SkillText({
  children,
  muted = false,
  size = 14,
  strong = false,
  center = false,
}: React.PropsWithChildren<{
  muted?: boolean;
  size?: number;
  strong?: boolean;
  center?: boolean;
}>) {
  const p = useSkillsPalette();
  return (
    <Text
      style={{
        color: muted ? p.muted : p.text,
        fontFamily: strong ? SkillFonts.semibold : SkillFonts.body,
        fontSize: size,
        lineHeight: size * 1.45,
        textAlign: center ? 'center' : 'left',
      }}
    >
      {children}
    </Text>
  );
}
export function SkillButton({
  label,
  onPress,
  secondary = false,
  disabled = false,
  testID,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  testID?: string;
}) {
  const p = useSkillsPalette();
  return (
    <TouchableOpacity
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{disabled}}
      disabled={disabled}
      onPress={onPress}
      style={[
        ui.button,
        {
          backgroundColor: secondary ? p.card : p.accent,
          borderColor: p.border,
          borderWidth: secondary ? 1 : 0,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <Text
        style={{
          fontFamily: SkillFonts.semibold,
          fontSize: 15,
          color: secondary ? p.text : '#FFFFFF',
          textAlign: 'center',
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}
export function SkillCard({
  children,
  style,
}: React.PropsWithChildren<{style?: StyleProp<ViewStyle>}>) {
  const p = useSkillsPalette();
  return (
    <View
      style={[ui.card, {backgroundColor: p.card, borderColor: p.border}, style]}
    >
      {children}
    </View>
  );
}
export function SkillInput({
  label,
  ...props
}: TextInputProps & {label: string}) {
  const p = useSkillsPalette();
  return (
    <View style={ui.field}>
      <SkillText size={13} strong>
        {label}
      </SkillText>
      <TextInput
        {...props}
        accessibilityLabel={label}
        placeholderTextColor={p.muted}
        style={[
          ui.input,
          {color: p.text, backgroundColor: p.card, borderColor: p.border},
          props.style,
        ]}
      />
    </View>
  );
}
export function Choices<T extends string>({
  label,
  values,
  value,
  onChange,
}: {
  label: string;
  values: readonly T[];
  value: T;
  onChange: (value: T) => void;
}) {
  const p = useSkillsPalette();
  return (
    <View style={ui.field}>
      <SkillText strong size={13}>
        {label}
      </SkillText>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        style={[ui.choices, {backgroundColor: p.surface}]}
      >
        {values.map(item => (
          <TouchableOpacity
            key={item}
            accessibilityRole="radio"
            accessibilityLabel={item}
            accessibilityState={{checked: item === value}}
            onPress={() => onChange(item)}
            style={[
              ui.choice,
              {backgroundColor: item === value ? p.card : 'transparent'},
            ]}
          >
            <Text
              style={{
                fontFamily:
                  item === value ? SkillFonts.semibold : SkillFonts.body,
                color: item === value ? p.text : p.muted,
                fontSize: 13,
                textAlign: 'center',
              }}
            >
              {item}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}
export function SkillPage({
  title,
  onBack,
  children,
  action,
}: React.PropsWithChildren<{
  title: string;
  onBack: () => void;
  action?: React.ReactNode;
}>) {
  const p = useSkillsPalette();
  return (
    <View style={[ui.fill, {backgroundColor: p.bg}]}>
      <View style={ui.header}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Back to Skills"
          onPress={onBack}
          style={ui.icon}
        >
          <ArrowLeft size={24} color={p.text} />
        </TouchableOpacity>
        <Text
          accessibilityRole="header"
          style={[ui.pageTitle, {color: p.text}]}
        >
          {title}
        </Text>
        {action}
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={ui.content}
      >
        <Entry>{children}</Entry>
      </ScrollView>
    </View>
  );
}
export const ui = StyleSheet.create({
  fill: {flex: 1},
  header: {
    minHeight: 64,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  icon: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageTitle: {flex: 1, fontFamily: SkillFonts.semibold, fontSize: 20},
  content: {paddingHorizontal: 20, paddingBottom: 140},
  card: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    marginVertical: 8,
    gap: 10,
  },
  button: {
    minHeight: 52,
    borderRadius: 16,
    padding: 14,
    justifyContent: 'center',
    marginVertical: 6,
  },
  row: {flexDirection: 'row', alignItems: 'center', gap: 10},
  between: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  field: {gap: 8, marginVertical: 10},
  input: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: SkillFonts.body,
    fontSize: 15,
  },
  choices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 4,
    borderRadius: 14,
    gap: 4,
  },
  choice: {
    flex: 1,
    minWidth: 70,
    minHeight: 44,
    borderRadius: 10,
    justifyContent: 'center',
    padding: 6,
  },
  section: {marginTop: 20, marginBottom: 10},
  gap: {height: 20},
  center: {alignItems: 'center'},
});
