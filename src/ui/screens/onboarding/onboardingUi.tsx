import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  Animated,
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import type {TextInputProps, ViewStyle} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useTheme} from '../../contexts/ThemeContext';
import {Fonts} from '../../theme';
import {useReducedMotion} from '../../hooks/useReducedMotion';

/**
 * Native building blocks for the redesigned first-use journey (approved v3
 * prototype): one focused topic per page, a stable bottom action, no page
 * scrolling at default text size. Colors come from the active theme
 * (Classic or Modern, light or dark); nothing here is a WebView.
 */

export interface OnboardingTokens {
  bg: string;
  paper: string;
  ink: string;
  muted: string;
  line: string;
  accent: string;
  onAccent: string;
  accentSoft: string;
  mark: string;
  markSoft: string;
  good: string;
  goodSoft: string;
  danger: string;
  dangerSoft: string;
  isDark: boolean;
}

export const useOnboardingTokens = (): OnboardingTokens => {
  const {colors, isModern, modernPalette, isDarkMode} = useTheme();
  return useMemo(() => {
    if (isModern) {
      return {
        bg: modernPalette.bg,
        paper: modernPalette.card,
        ink: modernPalette.text,
        muted: modernPalette.muted,
        line: modernPalette.border,
        accent: modernPalette.accent,
        onAccent: '#FFFFFF',
        accentSoft: modernPalette.softViolet,
        mark: modernPalette.accent,
        markSoft: modernPalette.softViolet,
        good: modernPalette.mintInk,
        goodSoft: modernPalette.mint,
        danger: modernPalette.danger,
        dangerSoft: modernPalette.dangerSoft,
        isDark: isDarkMode,
      };
    }
    return {
      bg: colors.background,
      paper: colors.cardBg,
      ink: colors.textPrimary,
      muted: colors.textSecondary,
      line: colors.border,
      accent: colors.blue,
      onAccent: colors.white,
      accentSoft: `${colors.blue}1A`,
      mark: colors.blue,
      markSoft: `${colors.blue}14`,
      good: colors.success,
      goodSoft: `${colors.success}22`,
      danger: colors.error,
      dangerSoft: `${colors.error}18`,
      isDark: isDarkMode,
    };
  }, [colors, isModern, modernPalette, isDarkMode]);
};

/** Keyboard visibility, so pages can compact and keep the action reachable. */
export const useKeyboardOpen = (): boolean => {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setOpen(true),
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setOpen(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return open;
};

/**
 * Large accessibility text (or a very short window) switches the page body
 * to the accessible fallback: the body may scroll instead of clipping.
 * At default text size on 640dp-tall phones the body never scrolls.
 */
export const useAccessibleFallback = (): boolean => {
  const {fontScale, height} = useWindowDimensions();
  return fontScale >= 1.3 || height < 560;
};

const useEnterAnimation = (key: string) => {
  const reduced = useReducedMotion();
  const value = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduced) {
      value.setValue(1);
      return;
    }
    value.setValue(0);
    const animation = Animated.timing(value, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [key, reduced, value]);
  return {
    opacity: value,
    transform: [
      {
        translateY: value.interpolate({
          inputRange: [0, 1],
          outputRange: [8, 0],
        }),
      },
    ],
  };
};

export interface PageAction {
  label: string;
  onPress: () => void;
  testID?: string;
  accessibilityHint?: string;
}

export interface OnboardingPageProps {
  /** Changes when the page changes, to replay the enter animation. */
  pageKey: string;
  headLabel: string;
  onBack?: () => void;
  backLabel?: string;
  topAction?: PageAction;
  progress?: {count: number; active: number};
  title: string;
  copy?: string;
  children?: React.ReactNode;
  error?: string | null;
  note?: string;
  primary: PageAction;
  secondary?: PageAction;
  scrollable?: boolean;
  testID?: string;
}

export const OnboardingPage: React.FC<OnboardingPageProps> = ({
  pageKey,
  headLabel,
  onBack,
  backLabel = 'Back',
  topAction,
  progress,
  title,
  copy,
  children,
  error,
  note,
  primary,
  secondary,
  scrollable,
  testID,
}) => {
  const t = useOnboardingTokens();
  const insets = useSafeAreaInsets();
  const keyboardOpen = useKeyboardOpen();
  const fallback = useAccessibleFallback();
  const enter = useEnterAnimation(pageKey);
  const useScroll = Boolean(scrollable || keyboardOpen || fallback);
  const Body: React.ComponentType<any> = useScroll ? ScrollView : View;
  const bodyProps = useScroll
    ? {
        contentContainerStyle: styles.bodyScrollContent,
        keyboardShouldPersistTaps: 'handled',
        showsVerticalScrollIndicator: true,
        style: styles.body,
      }
    : {style: styles.body};

  return (
    <View
      style={[
        styles.page,
        {
          backgroundColor: t.bg,
          paddingTop: insets.top,
          paddingBottom: Math.max(insets.bottom, 8),
        },
      ]}
      testID={testID ?? `onboarding-page-${pageKey}`}
    >
      <View style={styles.top}>
        {onBack ? (
          <TouchableOpacity
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel={backLabel}
            style={styles.topButton}
            testID="onboarding-back"
          >
            <Text style={[styles.topButtonText, {color: t.ink}]}>←</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.topButton} />
        )}
        <Text
          style={[styles.headLabel, {color: t.muted}]}
          numberOfLines={1}
          accessibilityRole="header"
        >
          {headLabel}
        </Text>
        {topAction ? (
          <TouchableOpacity
            onPress={topAction.onPress}
            accessibilityRole="button"
            accessibilityLabel={topAction.label}
            style={[styles.topButton, styles.topActionButton]}
            testID={topAction.testID}
          >
            <Text
              style={[styles.topActionText, {color: t.accent}]}
              numberOfLines={1}
            >
              {topAction.label}
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.topButton} />
        )}
      </View>
      {progress ? (
        <View
          style={styles.progress}
          accessibilityLabel={`Step ${progress.active + 1} of ${
            progress.count
          }`}
        >
          {Array.from({length: progress.count}, (_, i) => (
            <View
              key={i}
              style={[
                styles.progressSegment,
                {backgroundColor: i <= progress.active ? t.accent : t.line},
              ]}
            />
          ))}
        </View>
      ) : null}
      <Body {...bodyProps}>
        <Animated.View
          style={[styles.main, useScroll && styles.mainScroll, enter]}
        >
          <Text
            style={[
              styles.title,
              keyboardOpen && styles.titleCompact,
              {color: t.ink},
            ]}
            accessibilityRole="header"
          >
            {title}
          </Text>
          {copy && !keyboardOpen ? (
            <Text style={[styles.copy, {color: t.muted}]}>{copy}</Text>
          ) : null}
          <View style={styles.fields}>
            {children}
            {error ? (
              <View
                style={[
                  styles.error,
                  {backgroundColor: t.dangerSoft, borderColor: t.danger},
                ]}
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
                testID="onboarding-error"
              >
                <Text style={[styles.errorText, {color: t.danger}]}>
                  {error}
                </Text>
              </View>
            ) : null}
          </View>
          {note && !keyboardOpen ? (
            <View style={styles.note}>
              <Text style={[styles.noteMark, {color: t.mark}]}>◇</Text>
              <Text style={[styles.noteText, {color: t.muted}]}>{note}</Text>
            </View>
          ) : null}
        </Animated.View>
      </Body>
      <View style={[styles.footer, keyboardOpen && styles.footerCompact]}>
        <PrimaryButton action={primary} />
        {secondary && !keyboardOpen ? <LinkButton action={secondary} /> : null}
      </View>
    </View>
  );
};

export const PrimaryButton: React.FC<{
  action: PageAction;
  style?: ViewStyle;
}> = ({action, style}) => {
  const t = useOnboardingTokens();
  return (
    <TouchableOpacity
      onPress={action.onPress}
      accessibilityRole="button"
      accessibilityLabel={action.label}
      accessibilityHint={action.accessibilityHint}
      style={[styles.primary, {backgroundColor: t.accent}, style]}
      testID={action.testID ?? 'onboarding-primary'}
      activeOpacity={0.85}
    >
      <Text style={[styles.primaryText, {color: t.onAccent}]} numberOfLines={2}>
        {action.label}
      </Text>
      <Text
        style={[styles.primaryArrow, {color: t.onAccent}]}
        importantForAccessibility="no"
      >
        →
      </Text>
    </TouchableOpacity>
  );
};

export const LinkButton: React.FC<{action: PageAction; emphasis?: string}> = ({
  action,
  emphasis,
}) => {
  const t = useOnboardingTokens();
  return (
    <TouchableOpacity
      onPress={action.onPress}
      accessibilityRole="button"
      accessibilityLabel={
        emphasis ? `${action.label} ${emphasis}` : action.label
      }
      style={styles.link}
      testID={action.testID ?? 'onboarding-secondary'}
    >
      <Text style={[styles.linkText, {color: t.muted}]} numberOfLines={2}>
        {action.label}
        {emphasis ? (
          <Text style={[styles.linkStrong, {color: t.ink}]}> {emphasis}</Text>
        ) : null}
      </Text>
    </TouchableOpacity>
  );
};

export const SecondaryButton: React.FC<{
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
  style?: ViewStyle;
  accessibilityLabel?: string;
}> = ({label, onPress, disabled, testID, style, accessibilityLabel}) => {
  const t = useOnboardingTokens();
  return (
    <TouchableOpacity
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{disabled: Boolean(disabled)}}
      style={[
        styles.secondary,
        {borderColor: t.line, backgroundColor: t.paper},
        disabled && styles.disabled,
        style,
      ]}
      testID={testID}
    >
      <Text style={[styles.secondaryText, {color: t.ink}]} numberOfLines={2}>
        {label}
      </Text>
    </TouchableOpacity>
  );
};

export const ChoiceButton: React.FC<{
  label: string;
  selected: boolean;
  onPress: () => void;
  testID?: string;
  accessibilityLabel?: string;
  compact?: boolean;
  style?: ViewStyle;
}> = ({
  label,
  selected,
  onPress,
  testID,
  accessibilityLabel,
  compact,
  style,
}) => {
  const t = useOnboardingTokens();
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{selected}}
      style={[
        styles.choice,
        compact && styles.choiceCompact,
        {
          borderColor: selected ? t.accent : t.line,
          backgroundColor: selected ? t.accentSoft : t.paper,
        },
        style,
      ]}
      testID={testID}
    >
      <Text
        style={[styles.choiceText, {color: selected ? t.accent : t.ink}]}
        numberOfLines={2}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
};

export const OptionRow: React.FC<{
  title: string;
  detail: string;
  symbol?: string;
  selected: boolean;
  onPress: () => void;
  testID?: string;
}> = ({title, detail, symbol, selected, onPress, testID}) => {
  const t = useOnboardingTokens();
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={`${title}. ${detail}`}
      accessibilityState={{selected, checked: selected}}
      style={[
        styles.option,
        {
          borderColor: selected ? t.accent : t.line,
          backgroundColor: selected ? t.accentSoft : t.paper,
        },
      ]}
      testID={testID}
    >
      {symbol ? (
        <View style={[styles.optionSymbol, {backgroundColor: t.markSoft}]}>
          <Text style={[styles.optionSymbolText, {color: t.mark}]}>
            {symbol}
          </Text>
        </View>
      ) : null}
      <View style={styles.optionTextWrap}>
        <Text style={[styles.optionTitle, {color: t.ink}]} numberOfLines={2}>
          {title}
        </Text>
        <Text style={[styles.optionDetail, {color: t.muted}]} numberOfLines={2}>
          {detail}
        </Text>
      </View>
      <View style={[styles.radio, {borderColor: selected ? t.accent : t.line}]}>
        {selected ? (
          <View style={[styles.radioDot, {backgroundColor: t.accent}]} />
        ) : null}
      </View>
    </TouchableOpacity>
  );
};

export const Field: React.FC<
  {label: string; testID?: string} & Pick<
    TextInputProps,
    | 'value'
    | 'onChangeText'
    | 'maxLength'
    | 'keyboardType'
    | 'autoCapitalize'
    | 'placeholder'
    | 'onSubmitEditing'
    | 'returnKeyType'
  >
> = ({label, testID, ...input}) => {
  const t = useOnboardingTokens();
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.fieldWrap}>
      <Text style={[styles.label, {color: t.ink}]}>{label}</Text>
      <TextInput
        {...input}
        accessibilityLabel={label}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholderTextColor={t.muted}
        autoCorrect={false}
        style={[
          styles.input,
          {
            color: t.ink,
            backgroundColor: t.paper,
            borderColor: focused ? t.accent : t.line,
          },
        ]}
        testID={testID}
      />
    </View>
  );
};

export const ReadonlyValue: React.FC<{
  label: string;
  value: string;
  testID?: string;
}> = ({label, value, testID}) => {
  const t = useOnboardingTokens();
  const missing = !value.trim();
  return (
    <View style={styles.fieldWrap} testID={testID}>
      <Text style={[styles.label, {color: t.ink}]}>{label}</Text>
      <View
        style={[
          styles.readonly,
          {backgroundColor: t.markSoft, borderColor: t.line},
        ]}
        accessibilityLabel={`${label}: ${
          missing ? 'not detected, replace the COR' : value
        }`}
      >
        <Text
          style={[styles.readonlyText, {color: missing ? t.danger : t.ink}]}
          numberOfLines={2}
        >
          {missing ? 'Not detected · replace COR' : value}
        </Text>
      </View>
    </View>
  );
};

export const Tag: React.FC<{
  label: string;
  tone?: 'neutral' | 'good' | 'attention';
}> = ({label, tone = 'neutral'}) => {
  const t = useOnboardingTokens();
  const color =
    tone === 'good' ? t.good : tone === 'attention' ? t.danger : t.mark;
  const bg =
    tone === 'good'
      ? t.goodSoft
      : tone === 'attention'
      ? t.dangerSoft
      : t.markSoft;
  return (
    <View style={[styles.tag, {backgroundColor: bg}]}>
      <Text style={[styles.tagText, {color}]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
};

export const TagRow: React.FC<{children: React.ReactNode}> = ({children}) => (
  <View style={styles.tagRow}>{children}</View>
);

export const SlimRow: React.FC<{
  label: string;
  value: string;
  onPress?: () => void;
  testID?: string;
}> = ({label, value, onPress, testID}) => {
  const t = useOnboardingTokens();
  const content = (
    <>
      <Text style={[styles.slimLabel, {color: t.ink}]} numberOfLines={2}>
        {label}
      </Text>
      <Text style={[styles.slimValue, {color: t.muted}]} numberOfLines={2}>
        {value}
        {onPress ? ' ↗' : ''}
      </Text>
    </>
  );
  return onPress ? (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}. Edit`}
      style={[styles.slimRow, {borderColor: t.line}]}
      testID={testID}
    >
      {content}
    </TouchableOpacity>
  ) : (
    <View
      style={[styles.slimRow, {borderColor: t.line}]}
      accessibilityLabel={`${label}: ${value}`}
      testID={testID}
    >
      {content}
    </View>
  );
};

export const Notice: React.FC<{text: string; testID?: string}> = ({
  text,
  testID,
}) => {
  const t = useOnboardingTokens();
  return (
    <View
      style={[styles.notice, {backgroundColor: t.markSoft}]}
      testID={testID}
    >
      <Text style={[styles.noticeText, {color: t.ink}]}>{text}</Text>
    </View>
  );
};

export const Card: React.FC<{
  children: React.ReactNode;
  testID?: string;
  style?: ViewStyle;
}> = ({children, testID, style}) => {
  const t = useOnboardingTokens();
  return (
    <View
      style={[styles.card, {backgroundColor: t.paper, borderColor: t.line}, style]}
      testID={testID}
    >
      {children}
    </View>
  );
};

export const CheckRow: React.FC<{
  label: string;
  detail?: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
  testID?: string;
}> = ({label, detail, checked, disabled, onToggle, testID}) => {
  const t = useOnboardingTokens();
  return (
    <TouchableOpacity
      onPress={disabled ? undefined : onToggle}
      accessibilityRole="checkbox"
      accessibilityLabel={detail ? `${label}. ${detail}` : label}
      accessibilityState={{checked, disabled: Boolean(disabled)}}
      style={[styles.checkRow, disabled && styles.disabled]}
      testID={testID}
    >
      <View
        style={[
          styles.checkBox,
          {
            borderColor: checked ? t.accent : t.line,
            backgroundColor: checked ? t.accent : t.paper,
          },
        ]}
      >
        {checked ? (
          <Text style={[styles.checkMark, {color: t.onAccent}]}>✓</Text>
        ) : null}
      </View>
      <View style={styles.checkTextWrap}>
        <Text style={[styles.checkLabel, {color: t.ink}]} numberOfLines={2}>
          {label}
        </Text>
        {detail ? (
          <Text
            style={[styles.checkDetail, {color: t.muted}]}
            numberOfLines={2}
          >
            {detail}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
};

export const InlineActions: React.FC<{children: React.ReactNode}> = ({
  children,
}) => <View style={styles.inlineActions}>{children}</View>;

export const onboardingStyles = StyleSheet.create({
  rowGap: {flexDirection: 'row', gap: 10},
  flex1: {flex: 1},
  small: {fontFamily: Fonts.body, fontSize: 12, lineHeight: 17},
  body: {fontFamily: Fonts.body, fontSize: 14, lineHeight: 20},
  strong: {fontFamily: Fonts.heading, fontSize: 14, fontWeight: '600'},
  excerpt: {fontFamily: 'monospace', fontSize: 12, lineHeight: 17},
});

const styles = StyleSheet.create({
  page: {flex: 1},
  top: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  topButton: {
    minWidth: 48,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topButtonText: {fontSize: 22, fontFamily: Fonts.body},
  topActionButton: {paddingHorizontal: 6},
  topActionText: {fontFamily: Fonts.heading, fontSize: 13, fontWeight: '600'},
  headLabel: {
    flex: 1,
    textAlign: 'center',
    fontFamily: Fonts.body,
    fontSize: 12,
  },
  progress: {flexDirection: 'row', gap: 5, paddingHorizontal: 24, height: 4},
  progressSegment: {flex: 1, height: 3, borderRadius: 3},
  body: {flex: 1, minHeight: 0},
  bodyScrollContent: {flexGrow: 1, paddingBottom: 12},
  main: {flex: 1, paddingTop: 18, paddingHorizontal: 24},
  mainScroll: {flex: 0, flexGrow: 0, paddingBottom: 16},
  title: {
    fontFamily: Fonts.heading,
    fontSize: 26,
    lineHeight: 31,
    fontWeight: '600',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  titleCompact: {fontSize: 21, lineHeight: 26, marginBottom: 4},
  copy: {
    fontFamily: Fonts.body,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
  },
  fields: {gap: 10},
  error: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  errorText: {fontFamily: Fonts.body, fontSize: 13, lineHeight: 18},
  note: {flexDirection: 'row', gap: 8, marginTop: 12},
  noteMark: {fontSize: 12, lineHeight: 18},
  noteText: {flex: 1, fontFamily: Fonts.body, fontSize: 12, lineHeight: 18},
  footer: {paddingHorizontal: 24, paddingTop: 12, gap: 4},
  footerCompact: {paddingTop: 6},
  primary: {
    minHeight: 50,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    flex: 1,
    textAlign: 'center',
    fontFamily: Fonts.heading,
    fontSize: 15,
    fontWeight: '600',
  },
  primaryArrow: {fontSize: 16, marginLeft: 8},
  link: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  linkText: {fontFamily: Fonts.body, fontSize: 13, textAlign: 'center'},
  linkStrong: {fontFamily: Fonts.heading, fontWeight: '600'},
  secondary: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 12,
    paddingVertical: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryText: {
    fontFamily: Fonts.body,
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  choice: {
    flex: 1,
    minHeight: 50,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  choiceCompact: {minHeight: 46, flexGrow: 0, flexBasis: '47%'},
  choiceText: {fontFamily: Fonts.body, fontSize: 14, textAlign: 'center'},
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 16,
    padding: 13,
    minHeight: 68,
  },
  optionSymbol: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionSymbolText: {
    fontFamily: Fonts.heading,
    fontSize: 14,
    fontWeight: '600',
  },
  optionTextWrap: {flex: 1, gap: 3},
  optionTitle: {fontFamily: Fonts.heading, fontSize: 14, fontWeight: '600'},
  optionDetail: {fontFamily: Fonts.body, fontSize: 12, lineHeight: 16},
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {width: 10, height: 10, borderRadius: 5},
  fieldWrap: {gap: 6},
  label: {fontFamily: Fonts.heading, fontSize: 13, fontWeight: '600'},
  input: {
    height: 50,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    fontFamily: Fonts.body,
    fontSize: 16,
  },
  readonly: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  readonlyText: {fontFamily: Fonts.body, fontSize: 15},
  tagRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 6},
  tag: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    maxWidth: '100%',
  },
  tagText: {fontFamily: Fonts.heading, fontSize: 11, fontWeight: '600'},
  slimRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
  },
  slimLabel: {flex: 1, fontFamily: Fonts.body, fontSize: 14},
  slimValue: {
    flexShrink: 1,
    maxWidth: '55%',
    textAlign: 'right',
    fontFamily: Fonts.body,
    fontSize: 13,
  },
  notice: {borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10},
  noticeText: {fontFamily: Fonts.body, fontSize: 13, lineHeight: 18},
  card: {borderWidth: 1, borderRadius: 16, padding: 14, gap: 8},
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
  },
  disabled: {opacity: 0.5},
  checkBox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: {fontSize: 14, fontWeight: '700'},
  checkTextWrap: {flex: 1},
  checkLabel: {fontFamily: Fonts.heading, fontSize: 14, fontWeight: '600'},
  checkDetail: {fontFamily: Fonts.body, fontSize: 12, lineHeight: 16},
  inlineActions: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
});
