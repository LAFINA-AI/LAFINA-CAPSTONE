import React, {useRef} from 'react';
import {
  View,
  Text,
  Switch,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import {ChevronRight} from 'lucide-react-native';
import {Fonts, useThemedStyles} from '../../theme';
import {useTheme} from '../../contexts/ThemeContext';
import type {ThemeColors} from '../../contexts/ThemeContext';
import {mixColors} from '../../theme/colorMix';

export interface ToggleOrigin {
  x: number;
  y: number;
}

/** The soft colour behind a row's icon. */
export type SettingTone =
  | 'violet'
  | 'blue'
  | 'mint'
  | 'peach'
  | 'lilac'
  | 'cream'
  | 'danger';

type IconComponent = React.ComponentType<{size?: number; color?: string}>;

interface SettingItemProps {
  text: string;
  type?: 'toggle' | 'link' | 'value' | 'clickable';
  value?: boolean;
  onValueChange?: (val: boolean, origin: ToggleOrigin | null) => void;
  valueText?: string;
  onPress?: () => void;
  isDestructive?: boolean;
  /** A small picture on the left that says what the row is about. */
  icon?: IconComponent;
  tone?: SettingTone;
  /** One short line under the name, in plain words. */
  subtitle?: string;
  testID?: string;
}

/** The icon's ink and its soft background for a tone. */
export const useSettingTone = (
  tone: SettingTone,
): {ink: string; bg: string} => {
  const {colors, isModern, modernPalette: p} = useTheme();
  if (isModern) {
    switch (tone) {
      case 'blue':
        return {ink: p.blueInk, bg: p.blueSoft};
      case 'mint':
        return {ink: p.mintInk, bg: p.mint};
      case 'peach':
        return {ink: p.peachInk, bg: p.peach};
      case 'lilac':
        return {ink: p.lilacInk, bg: p.lilac};
      case 'cream':
        return {ink: p.creamInk, bg: p.cream};
      case 'danger':
        return {ink: p.danger, bg: p.dangerSoft};
      default:
        return {ink: p.accent, bg: p.softViolet};
    }
  }
  const ink =
    tone === 'blue'
      ? colors.blue
      : tone === 'mint'
      ? colors.success
      : tone === 'peach' || tone === 'cream'
      ? colors.warning
      : tone === 'danger'
      ? colors.error
      : colors.primary;
  return {ink, bg: mixColors(ink, colors.cardBg, 0.14)};
};

const IconTile: React.FC<{icon: IconComponent; tone: SettingTone}> = ({
  icon: Icon,
  tone,
}) => {
  const {ink, bg} = useSettingTone(tone);
  return (
    <View style={[styles.iconTile, {backgroundColor: bg}]}>
      <Icon size={17} color={ink} />
    </View>
  );
};

export const SettingItem: React.FC<SettingItemProps> = ({
  text,
  type = 'link',
  value,
  onValueChange,
  valueText,
  onPress,
  isDestructive = false,
  icon,
  tone = 'violet',
  subtitle,
  testID,
}) => {
  const {colors, isModern} = useTheme();
  const themed = useThemedStyles(getThemedStyles);
  const touchRef = useRef<ToggleOrigin | null>(null);

  const leading = icon ? <IconTile icon={icon} tone={tone} /> : null;
  const label = (
    <View style={styles.labelCol}>
      <Text
        style={[
          styles.settingText,
          icon && styles.settingTextWithIcon,
          themed.settingText,
          isDestructive && {color: colors.error, fontWeight: 'bold'},
        ]}
      >
        {text}
      </Text>
      {subtitle ? (
        <Text style={[styles.subtitle, themed.settingValue]} numberOfLines={2}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );

  if (type === 'toggle') {
    return (
      <View style={styles.settingItem} testID={testID}>
        {leading}
        {label}
        <View
          onTouchStart={event => {
            touchRef.current = {
              x: event.nativeEvent.pageX,
              y: event.nativeEvent.pageY,
            };
          }}
        >
          <Switch
            accessibilityLabel={text}
            value={value}
            onValueChange={next => {
              const origin = touchRef.current;
              touchRef.current = null;
              onValueChange?.(next, origin);
            }}
            trackColor={{false: colors.switchTrackOff, true: colors.red}}
            thumbColor={
              Platform.OS === 'android' ? colors.switchThumb : undefined
            }
          />
        </View>
      </View>
    );
  }

  if (type === 'value') {
    return (
      <TouchableOpacity
        style={styles.settingItem}
        onPress={onPress}
        disabled={!onPress}
        activeOpacity={onPress ? 0.7 : 1}
        testID={testID}
      >
        {leading}
        {label}
        <Text style={[styles.settingValue, themed.settingValue]}>
          {valueText}
        </Text>
      </TouchableOpacity>
    );
  }

  if (type === 'clickable') {
    return (
      <TouchableOpacity
        onPress={onPress}
        style={icon ? styles.settingItem : styles.settingItemClickable}
        activeOpacity={0.7}
        accessibilityRole="button"
        testID={testID}
      >
        {leading}
        {label}
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={styles.settingItem}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      testID={testID}
    >
      {leading}
      {label}
      {valueText ? (
        <Text
          style={[
            styles.linkValue,
            isModern && styles.modernLinkValue,
            themed.settingValue,
          ]}
          numberOfLines={1}
        >
          {valueText}
        </Text>
      ) : null}
      {isModern || icon ? (
        <ChevronRight size={16} color={colors.textMuted} />
      ) : (
        <Text style={[styles.linkArrow, themed.linkArrow]}>➔</Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 13,
  },
  settingItemClickable: {
    paddingVertical: 14,
  },
  iconTile: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  labelCol: {
    flex: 1,
    marginRight: 8,
  },
  settingText: {
    fontSize: 14,
    fontFamily: Fonts.body,
  },
  settingTextWithIcon: {
    fontSize: 14.5,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 12,
    fontFamily: Fonts.body,
    lineHeight: 16,
    marginTop: 2,
  },
  settingValue: {
    fontSize: 12,
  },
  linkValue: {
    fontSize: 11,
    marginLeft: 'auto',
    marginRight: 8,
    maxWidth: '40%',
  },
  modernLinkValue: {
    fontSize: 12.5,
    fontFamily: Fonts.body,
    maxWidth: '38%',
  },
  linkArrow: {
    fontSize: 12,
  },
});

const getThemedStyles = (colors: ThemeColors) => ({
  settingText: {
    color: colors.textPrimary,
  },
  settingValue: {
    color: colors.textSecondary,
  },
  linkArrow: {
    color: colors.textMuted,
  },
});
