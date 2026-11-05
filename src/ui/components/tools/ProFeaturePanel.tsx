import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Sparkles } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import type { ThemeColors } from '../../contexts/ThemeContext';
import { useThemedStyles } from '../../theme/createThemedStyles';
import { Fonts, FontSize, Layout, Shadows, Spacing } from '../../theme';

interface ProFeaturePanelProps {
  feature: string;
  description: string;
}

export const ProFeaturePanel: React.FC<ProFeaturePanelProps> = ({
  feature,
  description,
}) => {
  const { colors } = useTheme();
  const themed = useThemedStyles(getThemedStyles);

  return (
    <View style={styles.wrap}>
      <View style={[styles.card, Shadows.card, themed.card]}>
        <View style={[styles.badge, themed.badge]}>
          <Sparkles size={14} color={colors.red} />
          <Text style={[styles.badgeText, themed.badgeText]}>Student Pro</Text>
        </View>
        <Text style={[styles.title, themed.title]}>
          {feature} is part of Student Pro
        </Text>
        <Text style={[styles.body, themed.body]}>{description}</Text>
      </View>
    </View>
  );
};

const getThemedStyles = (colors: ThemeColors) => ({
  card: {
    backgroundColor: colors.cardBg,
    borderColor: colors.border,
  },
  badge: {
    backgroundColor: colors.bannerBg,
  },
  badgeText: {
    color: colors.red,
  },
  title: {
    color: colors.textPrimary,
  },
  body: {
    color: colors.textSecondary,
  },
});

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  card: {
    borderWidth: 1,
    borderRadius: Layout.borderRadiusCard,
    padding: Spacing.xl,
  },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Layout.borderRadiusPill,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    marginBottom: Spacing.md,
  },
  badgeText: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.caption,
    fontWeight: 'bold',
    marginLeft: Spacing.xs,
  },
  title: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.subtitle,
    fontWeight: 'bold',
    marginBottom: Spacing.sm,
  },
  body: {
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
    lineHeight: 20,
    marginBottom: Spacing.sm,
  },
});
