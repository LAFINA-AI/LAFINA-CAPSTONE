import React, {useEffect} from 'react';
import {
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {AlertCircle, ArrowLeft} from 'lucide-react-native';
import {Fonts} from '../../theme';
import {useTheme} from '../../contexts/ThemeContext';
import {IntroColors} from '../../screens/onboarding/intro/introTokens';
import {Sparkle} from '../../screens/onboarding/intro/introIcons';

export type AuthTab = 'login' | 'register';

interface AuthShellProps {
  activeTab: AuthTab;
  title: string;
  subtitle: string;
  onSelectTab: (tab: AuthTab) => void;
  onBack?: () => void;
  error?: string | null;
  children: React.ReactNode;
}

const HERO_BG_LIGHT = IntroColors.brand;
const HERO_BG_DARK = '#4332C8';

export const AuthShell: React.FC<AuthShellProps> = ({
  activeTab,
  title,
  subtitle,
  onSelectTab,
  onBack,
  error,
  children,
}) => {
  const insets = useSafeAreaInsets();
  const {colors, isDarkMode} = useTheme();

  useEffect(() => {
    if (!onBack) return undefined;
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        onBack();
        return true;
      },
    );
    return () => subscription.remove();
  }, [onBack]);

  const heroBg = isDarkMode ? HERO_BG_DARK : HERO_BG_LIGHT;
  const sheetBg = isDarkMode ? colors.cardBg : '#FFFFFF';
  const trackBg = isDarkMode ? colors.surface : '#F1EFF8';
  const activePillBg = isDarkMode ? colors.cardBg : '#FFFFFF';
  const activeText = isDarkMode ? colors.textPrimary : IntroColors.ink;
  const inactiveText = isDarkMode ? colors.textSecondary : IntroColors.muted;
  const errorBg = isDarkMode
    ? 'rgba(255, 59, 48, 0.14)'
    : 'rgba(201, 64, 53, 0.08)';
  const errorBorder = isDarkMode
    ? 'rgba(255, 59, 48, 0.34)'
    : 'rgba(201, 64, 53, 0.24)';

  return (
    <View style={[styles.root, {backgroundColor: heroBg}]}>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle="light-content"
      />

      {/* Top Purple Hero */}
      <View style={[styles.hero, {paddingTop: Math.max(insets.top, 12) + 8}]}>
        <View
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
          importantForAccessibility="no-hide-descendants"
        >
          <View style={styles.watermarkSparkle}>
            <Sparkle size={220} color="rgba(255, 255, 255, 0.07)" />
          </View>
          <View style={styles.accentSparkleTop}>
            <Sparkle size={14} color="rgba(255, 255, 255, 0.9)" />
          </View>
          <View style={styles.accentSparkleBottom}>
            <Sparkle size={10} color="rgba(255, 255, 255, 0.85)" />
          </View>
        </View>

        {onBack ? (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Back"
            testID="auth-back-button"
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
            style={({pressed}) => [
              styles.backButton,
              pressed && styles.backButtonPressed,
            ]}
          >
            <ArrowLeft size={20} color="#FFFFFF" />
          </Pressable>
        ) : (
          <View style={styles.backSpacer} />
        )}

        <View style={styles.brandRow}>
          <Sparkle size={16} color="#FFFFFF" />
          <Text style={styles.brandText}>LAFINA</Text>
        </View>

        <Text style={styles.heroTitle} accessibilityRole="header">
          {title}
        </Text>
        <Text style={styles.heroSubtitle}>{subtitle}</Text>
      </View>

      {/* Bottom White Sheet */}
      <View style={[styles.sheet, {backgroundColor: sheetBg}]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.flex}
        >
          <ScrollView
            contentContainerStyle={[
              styles.sheetContent,
              {paddingBottom: Math.max(insets.bottom, 24)},
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Segmented Mode Switcher */}
            <View
              style={[styles.segmentTrack, {backgroundColor: trackBg}]}
              accessibilityRole="tablist"
            >
              <Pressable
                onPress={() => {
                  if (activeTab !== 'login') onSelectTab('login');
                }}
                accessibilityRole="tab"
                accessibilityState={{selected: activeTab === 'login'}}
                testID="auth-tab-login"
                style={[
                  styles.segmentTab,
                  activeTab === 'login' && [
                    styles.segmentTabActive,
                    {backgroundColor: activePillBg},
                  ],
                ]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    {
                      color: activeTab === 'login' ? activeText : inactiveText,
                      fontWeight: activeTab === 'login' ? '700' : '500',
                    },
                  ]}
                >
                  Sign in
                </Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  if (activeTab !== 'register') onSelectTab('register');
                }}
                accessibilityRole="tab"
                accessibilityState={{selected: activeTab === 'register'}}
                testID="auth-tab-register"
                style={[
                  styles.segmentTab,
                  activeTab === 'register' && [
                    styles.segmentTabActive,
                    {backgroundColor: activePillBg},
                  ],
                ]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    {
                      color:
                        activeTab === 'register' ? activeText : inactiveText,
                      fontWeight: activeTab === 'register' ? '700' : '500',
                    },
                  ]}
                >
                  Create account
                </Text>
              </Pressable>
            </View>

            {error ? (
              <View
                style={[
                  styles.errorCard,
                  {backgroundColor: errorBg, borderColor: errorBorder},
                ]}
                accessibilityRole="alert"
              >
                <AlertCircle size={16} color={colors.error} />
                <Text style={[styles.errorText, {color: colors.error}]}>
                  {error}
                </Text>
              </View>
            ) : null}

            {children}
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  hero: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    position: 'relative',
    overflow: 'hidden',
  },
  watermarkSparkle: {
    position: 'absolute',
    right: -40,
    top: 24,
  },
  accentSparkleTop: {
    position: 'absolute',
    right: 128,
    top: '32%',
  },
  accentSparkleBottom: {
    position: 'absolute',
    right: 38,
    bottom: 22,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  backButtonPressed: {
    opacity: 0.78,
  },
  backSpacer: {
    height: 12,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  brandText: {
    fontFamily: Fonts.heading,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2.8,
    color: '#FFFFFF',
  },
  heroTitle: {
    fontFamily: Fonts.heading,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    letterSpacing: -0.5,
    color: '#FFFFFF',
  },
  heroSubtitle: {
    fontFamily: Fonts.body,
    fontSize: 15,
    lineHeight: 21,
    color: 'rgba(255, 255, 255, 0.88)',
    marginTop: 6,
  },
  sheet: {
    flex: 1,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    overflow: 'hidden',
  },
  sheetContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  segmentTrack: {
    flexDirection: 'row',
    borderRadius: 16,
    padding: 4,
    marginBottom: 22,
  },
  segmentTab: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentTabActive: {
    shadowColor: '#261C78',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  segmentText: {
    fontFamily: Fonts.heading,
    fontSize: 14.5,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 18,
  },
  errorText: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
});
