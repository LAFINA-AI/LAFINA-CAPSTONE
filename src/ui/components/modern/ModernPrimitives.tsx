import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {useTheme} from '../../contexts/ThemeContext';
import {
  ModernLayout,
  ModernShadows,
  ModernTypography,
  type ModernPalette,
} from '../../theme/modern';

export type ModernCardTone =
  | 'default'
  | 'surface'
  | 'softViolet'
  | 'mint'
  | 'blueSoft'
  | 'peach'
  | 'lilac'
  | 'cream'
  | 'hero';

export const resolveModernToneSurface = (
  palette: ModernPalette,
  tone: ModernCardTone,
): {bg: string; ink: string; borderColor?: string} => {
  switch (tone) {
    case 'surface':
      return {
        bg: palette.surface,
        ink: palette.text,
        borderColor: palette.border,
      };
    case 'softViolet':
      return {bg: palette.softViolet, ink: palette.accent};
    case 'mint':
      return {bg: palette.mint, ink: palette.mintInk};
    case 'blueSoft':
      return {bg: palette.blueSoft, ink: palette.blueInk};
    case 'peach':
      return {bg: palette.peach, ink: palette.peachInk};
    case 'lilac':
      return {bg: palette.lilac, ink: palette.lilacInk};
    case 'cream':
      return {bg: palette.cream, ink: palette.creamInk};
    case 'hero':
      return {bg: palette.heroCardBg, ink: palette.heroText};
    case 'default':
    default:
      return {bg: palette.card, ink: palette.text, borderColor: palette.border};
  }
};

interface ModernCardProps {
  children: React.ReactNode;
  tone?: ModernCardTone;
  padded?: boolean;
  bordered?: boolean;
  elevated?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export const ModernCard: React.FC<ModernCardProps> = ({
  children,
  tone = 'default',
  padded = true,
  bordered = true,
  elevated = true,
  style,
  testID,
}) => {
  const {modernPalette} = useTheme();
  const resolved = resolveModernToneSurface(modernPalette, tone);

  return (
    <View
      testID={testID}
      style={[
        styles.card,
        {backgroundColor: resolved.bg},
        padded && styles.cardPadded,
        bordered &&
          tone === 'default' && {
            borderWidth: 1,
            borderColor: modernPalette.border,
          },
        elevated && tone !== 'surface' && ModernShadows.card,
        style,
      ]}
    >
      {children}
    </View>
  );
};

interface ModernSectionHeaderProps {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onActionPress?: () => void;
  actionTestID?: string;
}

export const ModernSectionHeader: React.FC<ModernSectionHeaderProps> = ({
  title,
  subtitle,
  actionLabel,
  onActionPress,
  actionTestID,
}) => {
  const {modernPalette} = useTheme();

  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderText}>
        <Text
          style={[ModernTypography.sectionTitle, {color: modernPalette.text}]}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={[
              ModernTypography.caption,
              {color: modernPalette.muted, marginTop: 2},
            ]}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {actionLabel && onActionPress ? (
        <TouchableOpacity
          testID={actionTestID}
          onPress={onActionPress}
          activeOpacity={0.75}
          style={[
            styles.sectionActionPill,
            {backgroundColor: modernPalette.softViolet},
          ]}
        >
          <Text
            style={[styles.sectionActionText, {color: modernPalette.accent}]}
          >
            {actionLabel}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

interface ModernPillChipProps {
  label: string;
  active?: boolean;
  tone?: Exclude<ModernCardTone, 'hero'>;
  onPress?: () => void;
  testID?: string;
  icon?: React.ReactNode;
}

export const ModernPillChip: React.FC<ModernPillChipProps> = ({
  label,
  active = false,
  tone = 'surface',
  onPress,
  testID,
  icon,
}) => {
  const {modernPalette} = useTheme();
  const resolved = resolveModernToneSurface(modernPalette, tone);
  const bg = active ? modernPalette.darkInkBtn : resolved.bg;
  const textColor = active
    ? '#FFFFFF'
    : tone === 'surface'
    ? modernPalette.muted
    : resolved.ink;

  const content = (
    <View
      style={[
        styles.pillChip,
        {backgroundColor: bg},
        !active &&
          tone === 'default' && {
            borderWidth: 1,
            borderColor: modernPalette.border,
          },
      ]}
    >
      {icon}
      <Text style={[styles.pillChipText, {color: textColor}]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );

  if (!onPress) {
    return <View testID={testID}>{content}</View>;
  }

  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityState={{selected: active}}
    >
      {content}
    </TouchableOpacity>
  );
};

interface ModernIconButtonProps {
  onPress: () => void;
  accessibilityLabel: string;
  testID?: string;
  tone?: 'card' | 'surface' | 'softViolet' | 'accent';
  size?: number;
  children: React.ReactNode;
}

export const ModernIconButton: React.FC<ModernIconButtonProps> = ({
  onPress,
  accessibilityLabel,
  testID,
  tone = 'surface',
  size = 40,
  children,
}) => {
  const {modernPalette} = useTheme();
  const bg =
    tone === 'accent'
      ? modernPalette.accent
      : tone === 'softViolet'
      ? modernPalette.softViolet
      : tone === 'card'
      ? modernPalette.card
      : modernPalette.surface;

  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      activeOpacity={0.78}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.iconButton,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bg,
          borderColor: tone === 'accent' ? 'transparent' : modernPalette.border,
          borderWidth: tone === 'accent' ? 0 : 1,
        },
      ]}
    >
      {children}
    </TouchableOpacity>
  );
};

interface ModernBadgeProps {
  label: string;
  tone?: Exclude<ModernCardTone, 'hero' | 'default'>;
  testID?: string;
}

export const ModernBadge: React.FC<ModernBadgeProps> = ({
  label,
  tone = 'softViolet',
  testID,
}) => {
  const {modernPalette} = useTheme();
  const resolved = resolveModernToneSurface(modernPalette, tone);
  const ink = tone === 'surface' ? modernPalette.muted : resolved.ink;

  return (
    <View
      testID={testID}
      style={[styles.badge, {backgroundColor: resolved.bg}]}
    >
      <Text style={[styles.badgeText, {color: ink}]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: ModernLayout.borderRadiusCard,
  },
  cardPadded: {
    padding: ModernLayout.cardPadding,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  sectionHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  sectionActionPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: ModernLayout.borderRadiusPill,
  },
  sectionActionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  pillChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: ModernLayout.borderRadiusPill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  pillChipText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  iconButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    borderRadius: ModernLayout.borderRadiusPill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
});
