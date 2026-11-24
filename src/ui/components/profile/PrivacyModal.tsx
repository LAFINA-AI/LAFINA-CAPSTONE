import React from 'react';
import {
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  AlertTriangle,
  Cloud,
  Database,
  EyeOff,
  GraduationCap,
  Lock,
  Mail,
  Mic,
  MicOff,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Trash2,
  Users,
  WifiOff,
} from 'lucide-react-native';
import {APP_VERSION} from '../../../appVersion';
import {useTheme} from '../../contexts/ThemeContext';
import type {ThemeColors} from '../../contexts/ThemeContext';
import {
  Fonts,
  Layout,
  ModernLayout,
  Shadows,
  Spacing,
  useThemedStyles,
} from '../../theme';
import {
  PRIVACY_HIGHLIGHTS,
  PRIVACY_POLICY_EFFECTIVE_DATE,
  PRIVACY_SECTIONS,
  type PrivacyHighlight,
  type PrivacySectionIconKey,
} from './privacyPolicyContent';

interface PrivacyModalProps {
  visible: boolean;
  onClose: () => void;
}

const renderSectionIcon = (
  icon: PrivacySectionIconKey,
  color: string,
  size: number = 17,
) => {
  switch (icon) {
    case 'database':
      return <Database size={size} color={color} strokeWidth={2} />;
    case 'mic':
      return <Mic size={size} color={color} strokeWidth={2} />;
    case 'cloud':
      return <Cloud size={size} color={color} strokeWidth={2} />;
    case 'sparkles':
      return <Sparkles size={size} color={color} strokeWidth={2} />;
    case 'users':
      return <Users size={size} color={color} strokeWidth={2} />;
    case 'smartphone':
      return <Smartphone size={size} color={color} strokeWidth={2} />;
    case 'lock':
      return <Lock size={size} color={color} strokeWidth={2} />;
    case 'trash':
      return <Trash2 size={size} color={color} strokeWidth={2} />;
    case 'alert':
      return <AlertTriangle size={size} color={color} strokeWidth={2} />;
    case 'graduation':
      return <GraduationCap size={size} color={color} strokeWidth={2} />;
    case 'mail':
      return <Mail size={size} color={color} strokeWidth={2} />;
  }
};

const renderHighlightIcon = (
  icon: PrivacyHighlight['icon'],
  color: string,
  size: number = 15,
) => {
  switch (icon) {
    case 'wifiOff':
      return <WifiOff size={size} color={color} strokeWidth={2.1} />;
    case 'eyeOff':
      return <EyeOff size={size} color={color} strokeWidth={2.1} />;
    case 'micOff':
      return <MicOff size={size} color={color} strokeWidth={2.1} />;
    case 'sliders':
      return <SlidersHorizontal size={size} color={color} strokeWidth={2.1} />;
  }
};

export const PrivacyModal: React.FC<PrivacyModalProps> = ({
  visible,
  onClose,
}) => {
  const {colors, isModern, isDarkMode, modernPalette, modernShadows} =
    useTheme();
  const themed = useThemedStyles(getThemedStyles);
  const insets = useSafeAreaInsets();

  const topInset = Math.max(
    insets.top,
    Platform.OS === 'android' ? StatusBar.currentHeight || 28 : 0,
  );
  const bottomInset = Math.max(insets.bottom, 16);

  const screenBg = isModern ? modernPalette.bg : colors.background;
  const headerBg = isModern ? modernPalette.card : colors.surface;
  const cardBg = isModern ? modernPalette.card : colors.cardBg;
  const surfaceBg = isModern ? modernPalette.surface : colors.inputBg;
  const borderColor = isModern ? modernPalette.border : colors.border;
  const textPrimary = isModern ? modernPalette.text : colors.textPrimary;
  const textSecondary = isModern ? modernPalette.muted : colors.textSecondary;
  const accentColor = isModern ? modernPalette.accent : colors.primary;
  const accentSoftBg = isModern
    ? modernPalette.softViolet
    : isDarkMode
    ? `${colors.primary}26`
    : `${colors.primary}14`;
  const accentBorder = `${accentColor}30`;
  const warningBg = isModern
    ? modernPalette.peach
    : isDarkMode
    ? `${colors.warning}22`
    : `${colors.warning}16`;
  const warningInk = isModern ? modernPalette.peachInk : colors.warning;
  const warningBorder = `${warningInk}36`;

  const cardRadius = isModern
    ? ModernLayout.borderRadiusSubCard
    : Layout.borderRadiusCard;
  const heroRadius = isModern
    ? ModernLayout.borderRadiusCard
    : Layout.borderRadiusCard;
  const cardShadow = isModern ? modernShadows.subtle : Shadows.card;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      statusBarTranslucent
      onRequestClose={onClose}
      testID="privacy-policy-modal"
    >
      <StatusBar
        barStyle={colors.statusBarStyle}
        backgroundColor="transparent"
        translucent
      />
      <View
        style={[
          styles.container,
          themed.container,
          {backgroundColor: screenBg},
        ]}
      >
        {/* Sticky Top Header */}
        <View
          testID="privacy-modal-header"
          style={[
            styles.header,
            {
              backgroundColor: headerBg,
              borderBottomColor: borderColor,
              paddingTop: topInset + 12,
            },
          ]}
        >
          <View style={styles.headerLeft}>
            <View
              style={[
                styles.headerIconBadge,
                {
                  backgroundColor: accentSoftBg,
                  borderColor: accentBorder,
                },
              ]}
            >
              <ShieldCheck size={19} color={accentColor} strokeWidth={2.2} />
            </View>
            <View style={styles.headerTextCol}>
              <Text
                accessibilityRole="header"
                style={[styles.headerTitle, {color: textPrimary}]}
                numberOfLines={1}
              >
                Privacy Policy
              </Text>
              <Text
                style={[styles.headerSubtitle, {color: textSecondary}]}
                numberOfLines={1}
              >
                How LAFINA handles &amp; protects your data
              </Text>
            </View>
          </View>

          <TouchableOpacity
            onPress={onClose}
            activeOpacity={0.78}
            accessibilityRole="button"
            accessibilityLabel="Close Privacy Policy"
            testID="privacy-modal-close-btn"
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
            style={[
              styles.closeBtn,
              {
                backgroundColor: surfaceBg,
                borderColor,
              },
            ]}
          >
            <Text style={[styles.closeBtnText, {color: textPrimary}]}>
              Close
            </Text>
          </TouchableOpacity>
        </View>

        {/* Scrollable Content */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Overview Hero Card */}
          <View
            testID="privacy-hero-card"
            style={[
              styles.heroCard,
              cardShadow,
              {
                backgroundColor: cardBg,
                borderColor,
                borderRadius: heroRadius,
              },
            ]}
          >
            <View style={styles.badgeRow}>
              <View
                style={[
                  styles.metaBadge,
                  {
                    backgroundColor: accentSoftBg,
                    borderColor: accentBorder,
                  },
                ]}
              >
                <Text style={[styles.metaBadgeText, {color: accentColor}]}>
                  Effective {PRIVACY_POLICY_EFFECTIVE_DATE}
                </Text>
              </View>
              <View
                style={[
                  styles.metaBadge,
                  {
                    backgroundColor: surfaceBg,
                    borderColor,
                  },
                ]}
              >
                <Text style={[styles.metaBadgeText, {color: textSecondary}]}>
                  App v{APP_VERSION}
                </Text>
              </View>
              <View
                style={[
                  styles.metaBadge,
                  {
                    backgroundColor: surfaceBg,
                    borderColor,
                  },
                ]}
              >
                <Text style={[styles.metaBadgeText, {color: textSecondary}]}>
                  RA 10173 Aligned
                </Text>
              </View>
            </View>

            <Text style={[styles.heroIntro, {color: textSecondary}]}>
              LAFINA is an offline-first academic AI secretary built for
              students. Your schedules, tasks, and notes live on your phone
              first; optional cloud and AI tools send only what is needed over
              encrypted HTTPS.
            </Text>

            <View style={styles.highlightsGrid}>
              {PRIVACY_HIGHLIGHTS.map(item => (
                <View
                  key={item.id}
                  style={[
                    styles.highlightTile,
                    {
                      backgroundColor: surfaceBg,
                      borderColor,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.highlightIconBox,
                      {
                        backgroundColor: accentSoftBg,
                      },
                    ]}
                  >
                    {renderHighlightIcon(item.icon, accentColor)}
                  </View>
                  <Text
                    style={[styles.highlightTitle, {color: textPrimary}]}
                    numberOfLines={1}
                  >
                    {item.title}
                  </Text>
                  <Text
                    style={[styles.highlightSubtitle, {color: textSecondary}]}
                  >
                    {item.subtitle}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* Policy Section Cards */}
          {PRIVACY_SECTIONS.map(section => {
            const isAlertSection = section.icon === 'alert';
            const sectionIconColor = isAlertSection ? warningInk : accentColor;
            const sectionIconBg = isAlertSection ? warningBg : accentSoftBg;

            return (
              <View
                key={section.id}
                testID={`privacy-section-${section.id}`}
                style={[
                  styles.sectionCard,
                  cardShadow,
                  {
                    backgroundColor: cardBg,
                    borderColor,
                    borderRadius: cardRadius,
                  },
                ]}
              >
                <View style={styles.sectionHeaderRow}>
                  <View
                    style={[
                      styles.sectionIconBadge,
                      {backgroundColor: sectionIconBg},
                    ]}
                  >
                    {renderSectionIcon(section.icon, sectionIconColor)}
                  </View>
                  <Text style={[styles.sectionTitle, {color: textPrimary}]}>
                    {section.title}
                  </Text>
                </View>

                <Text style={[styles.bodyText, {color: textSecondary}]}>
                  {section.summary}
                </Text>

                {section.bullets && section.bullets.length > 0 && (
                  <View style={styles.bulletList}>
                    {section.bullets.map(bullet => (
                      <View key={bullet.label} style={styles.bulletRow}>
                        <View
                          style={[
                            styles.bulletDot,
                            {backgroundColor: sectionIconColor},
                          ]}
                        />
                        <Text
                          style={[styles.bulletText, {color: textSecondary}]}
                        >
                          <Text
                            style={[styles.bulletLabel, {color: textPrimary}]}
                          >
                            {bullet.label}{' '}
                          </Text>
                          {bullet.text}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                {section.callout && (
                  <View
                    style={[
                      styles.calloutBox,
                      {
                        backgroundColor:
                          section.callout.tone === 'warning'
                            ? warningBg
                            : accentSoftBg,
                        borderColor:
                          section.callout.tone === 'warning'
                            ? warningBorder
                            : accentBorder,
                      },
                    ]}
                  >
                    <View style={styles.calloutHeader}>
                      {section.callout.tone === 'warning' ? (
                        <AlertTriangle
                          size={15}
                          color={warningInk}
                          strokeWidth={2.2}
                        />
                      ) : (
                        <ShieldCheck
                          size={15}
                          color={accentColor}
                          strokeWidth={2.2}
                        />
                      )}
                      <Text
                        style={[
                          styles.calloutTitle,
                          {
                            color:
                              section.callout.tone === 'warning'
                                ? warningInk
                                : accentColor,
                          },
                        ]}
                      >
                        {section.callout.title}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.calloutBody,
                        {
                          color: textPrimary,
                        },
                      ]}
                    >
                      {section.callout.text}
                    </Text>
                  </View>
                )}
              </View>
            );
          })}

          <Text style={[styles.scrollFootnote, {color: textSecondary}]}>
            LAFINA Capstone · USTP Cagayan de Oro · v{APP_VERSION}
          </Text>
        </ScrollView>

        {/* Sticky Bottom Footer */}
        <View
          style={[
            styles.footer,
            {
              backgroundColor: headerBg,
              borderTopColor: borderColor,
              paddingBottom: bottomInset + 8,
            },
          ]}
        >
          <TouchableOpacity
            onPress={onClose}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Acknowledge Privacy Policy"
            testID="privacy-modal-acknowledge-btn"
            style={[
              styles.footerBtn,
              {
                backgroundColor: accentColor,
                borderRadius: isModern
                  ? ModernLayout.borderRadiusButton
                  : Layout.borderRadiusButton,
              },
            ]}
          >
            <Text style={[styles.footerBtnText, {color: colors.textOnPrimary}]}>
              I Understand
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextCol: {
    flex: 1,
  },
  headerTitle: {
    fontFamily: Fonts.heading,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontFamily: Fonts.body,
    fontSize: 12,
    marginTop: 1,
  },
  closeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  closeBtnText: {
    fontFamily: Fonts.body,
    fontSize: 13,
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xxl,
    gap: 12,
  },
  heroCard: {
    borderWidth: 1,
    padding: Spacing.lg,
    gap: 12,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  metaBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  metaBadgeText: {
    fontFamily: Fonts.body,
    fontSize: 11,
    fontWeight: '600',
  },
  heroIntro: {
    fontFamily: Fonts.body,
    fontSize: 13.5,
    lineHeight: 20,
  },
  highlightsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
    marginTop: 2,
  },
  highlightTile: {
    width: '48.5%',
    borderRadius: 14,
    borderWidth: 1,
    padding: 11,
    gap: 4,
  },
  highlightIconBox: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  highlightTitle: {
    fontFamily: Fonts.heading,
    fontSize: 12.5,
    fontWeight: '700',
  },
  highlightSubtitle: {
    fontFamily: Fonts.body,
    fontSize: 11.5,
    lineHeight: 15.5,
  },
  sectionCard: {
    borderWidth: 1,
    padding: Spacing.lg,
    gap: 10,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sectionIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    flex: 1,
    fontFamily: Fonts.heading,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
    letterSpacing: -0.2,
  },
  bodyText: {
    fontFamily: Fonts.body,
    fontSize: 13.5,
    lineHeight: 20.5,
  },
  bulletList: {
    gap: 8,
    marginTop: 2,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 7,
  },
  bulletText: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: 13,
    lineHeight: 19.5,
  },
  bulletLabel: {
    fontFamily: Fonts.body,
    fontWeight: '700',
  },
  calloutBox: {
    borderWidth: 1,
    borderRadius: 13,
    padding: 12,
    gap: 5,
    marginTop: 4,
  },
  calloutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  calloutTitle: {
    fontFamily: Fonts.heading,
    fontSize: 12.5,
    fontWeight: '700',
  },
  calloutBody: {
    fontFamily: Fonts.body,
    fontSize: 12.5,
    lineHeight: 18.5,
  },
  scrollFootnote: {
    fontFamily: Fonts.body,
    fontSize: 11.5,
    textAlign: 'center',
    marginTop: 4,
  },
  footer: {
    borderTopWidth: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: 12,
  },
  footerBtn: {
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerBtnText: {
    fontFamily: Fonts.heading,
    fontSize: 15,
    fontWeight: '700',
  },
});

const getThemedStyles = (colors: ThemeColors) => ({
  container: {
    backgroundColor: colors.background,
  },
});
