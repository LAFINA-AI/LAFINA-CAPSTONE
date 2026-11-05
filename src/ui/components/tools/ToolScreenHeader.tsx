import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import type { ThemeColors } from '../../contexts/ThemeContext';
import { useThemedStyles } from '../../theme/createThemedStyles';
import { Fonts, FontSize, Spacing } from '../../theme';

export interface ToolHeaderAction {
  key: string;
  label: string;
  icon: React.ComponentType<{ size: number; color: string }>;
  onPress: () => void;
  disabled?: boolean;
}

interface ToolScreenHeaderProps {
  title: string;
  subtitle?: string;
  onBack: () => void;
  actions?: ToolHeaderAction[];
}

export const ToolScreenHeader: React.FC<ToolScreenHeaderProps> = ({
  title,
  subtitle,
  onBack,
  actions,
}) => {
  const { colors } = useTheme();
  const themed = useThemedStyles(getThemedStyles);

  return (
    <View style={styles.header}>
      <TouchableOpacity
        style={[styles.iconButton, themed.iconButton]}
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={8}
      >
        <ArrowLeft size={20} color={colors.textPrimary} />
      </TouchableOpacity>
      <View style={styles.titleWrap}>
        <Text style={[styles.title, themed.title]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.subtitle, themed.subtitle]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={styles.actions}>
        {actions?.map((action) => {
          const Icon = action.icon;
          return (
            <TouchableOpacity
              key={action.key}
              style={[
                styles.iconButton,
                themed.iconButton,
                action.disabled && styles.disabled,
              ]}
              onPress={action.onPress}
              disabled={action.disabled}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              hitSlop={6}
            >
              <Icon size={18} color={colors.textPrimary} />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const getThemedStyles = (colors: ThemeColors) => ({
  title: {
    color: colors.textPrimary,
  },
  subtitle: {
    color: colors.textSecondary,
  },
  iconButton: {
    backgroundColor: colors.cardBg,
    borderColor: colors.border,
  },
});

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
    minHeight: 44,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: {
    flex: 1,
    marginHorizontal: Spacing.md,
  },
  title: {
    fontFamily: Fonts.heading,
    fontSize: 18,
    fontWeight: 'bold',
  },
  subtitle: {
    fontFamily: Fonts.body,
    fontSize: FontSize.caption,
    marginTop: 1,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  disabled: {
    opacity: 0.45,
  },
});
