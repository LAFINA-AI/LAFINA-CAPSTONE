import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  AlertTriangle,
  CloudOff,
  LogOut,
  ShieldCheck,
  UserPlus,
  X,
} from 'lucide-react-native';
import {useTheme} from '../../contexts/ThemeContext';
import {Fonts, Layout, ModernLayout, Shadows} from '../../theme';

export interface SignOutModalProps {
  visible: boolean;
  isGuest: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onCreateAccount?: () => void;
}

function useSignOutModalLayout() {
  const {colors, isDarkMode, isModern, modernPalette, modernShadows} =
    useTheme();
  const {width, height} = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const safeWidth = width > 0 ? width : 360;
  const safeHeight = height > 0 ? height : 640;
  const isCompact = safeWidth < 360 || safeHeight < 640;
  const isVeryNarrow = safeWidth < 330;
  const isTablet = safeWidth >= 600;

  const horizontalPadding = isCompact ? 14 : isTablet ? 28 : 20;
  const verticalInset = Math.max(insets.top, 16) + Math.max(insets.bottom, 16);
  const maxCardWidth = Math.min(safeWidth - horizontalPadding * 2, isTablet ? 480 : 440);
  const maxCardHeight = Math.max(280, Math.min(safeHeight - verticalInset - 24, 620));

  return {
    colors,
    isDarkMode,
    isModern,
    modernPalette,
    modernShadows,
    insets,
    isCompact,
    isVeryNarrow,
    horizontalPadding,
    maxCardWidth,
    maxCardHeight,
    cardPadding: isCompact ? 15 : 19,
    iconBadgeSize: isCompact ? 40 : 44,
    titleFontSize: isCompact ? 18 : 20,
    bodyFontSize: isCompact ? 12.5 : 13,
    bodyLineHeight: isCompact ? 18 : 19,
    buttonHeight: isCompact ? 44 : 48,
    cardBg: isModern ? modernPalette.card : colors.cardBg,
    surfaceBg: isModern ? modernPalette.surface : colors.inputBg,
    borderColor: isModern ? modernPalette.border : colors.border,
    textPrimary: isModern ? modernPalette.text : colors.textPrimary,
    textSecondary: isModern ? modernPalette.muted : colors.textSecondary,
    accentColor: isModern ? modernPalette.accent : colors.primary,
    dangerInk: isModern ? modernPalette.danger : colors.error,
    dangerSoftBg: isModern
      ? modernPalette.dangerSoft
      : isDarkMode
      ? '#3A1D24'
      : '#FDECEC',
    dangerBorder: isModern
      ? `${modernPalette.danger}38`
      : `${colors.error}38`,
    dangerFill: isDarkMode
      ? '#E11D48'
      : isModern
      ? modernPalette.danger
      : colors.error,
    safeInk: isModern ? modernPalette.mintInk : colors.success,
    safeSoftBg: isModern
      ? modernPalette.mint
      : isDarkMode
      ? '#143326'
      : '#ECFDF5',
    safeBorder: isModern
      ? `${modernPalette.mintInk}30`
      : `${colors.success}34`,
    cardRadius: isModern
      ? ModernLayout.borderRadiusCard
      : Layout.borderRadiusCard,
    subCardRadius: isModern ? ModernLayout.borderRadiusSubCard : 12,
    buttonRadius: isModern ? 15 : Layout.borderRadiusButton,
  };
}

/**
 * Scalable, theme-adaptive confirmation modal for Profile → Sign Out / Dismiss Guest.
 * Adapts layout, spacing, and scroll bounds across compact phones, tablets, landscape,
 * large font scales, Classic Light/Dark, and all Modern color themes.
 */
export const SignOutModal: React.FC<SignOutModalProps> = ({
  visible,
  isGuest,
  busy = false,
  onCancel,
  onConfirm,
  onCreateAccount,
}) => {
  const theme = useSignOutModalLayout();

  if (!visible) {
    return null;
  }

  const title = isGuest ? 'Dismiss Guest Session' : 'Sign Out';
  const badgeLabel = isGuest ? 'GUEST SESSION' : 'ACCOUNT SESSION';
  const summaryText = isGuest
    ? 'Your temporary data will be cleared when you sign out. Create an account to keep it.'
    : 'Are you sure you want to sign out of this device?';
  const confirmLabel = busy
    ? 'Signing out…'
    : isGuest
    ? 'Dismiss Guest'
    : 'Sign Out';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        if (!busy) {
          onCancel();
        }
      }}
      testID="sign-out-modal"
    >
      <View
        style={[
          styles.backdrop,
          {
            backgroundColor: theme.colors.overlay,
            paddingHorizontal: theme.horizontalPadding,
            paddingTop: Math.max(theme.insets.top, 16),
            paddingBottom: Math.max(theme.insets.bottom, 16),
          },
        ]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => {
            if (!busy) {
              onCancel();
            }
          }}
          accessibilityRole="button"
          accessibilityLabel="Cancel sign out"
          testID="sign-out-backdrop"
        />

        <View
          accessibilityViewIsModal
          testID="sign-out-modal-card"
          style={[
            styles.card,
            theme.isModern ? theme.modernShadows.floating : Shadows.card,
            {
              width: '100%',
              maxWidth: theme.maxCardWidth,
              maxHeight: theme.maxCardHeight,
              backgroundColor: theme.cardBg,
              borderColor: theme.borderColor,
              borderRadius: theme.cardRadius,
            },
          ]}
        >
          <View
            testID="sign-out-accent-bar"
            style={[styles.topAccentBar, {backgroundColor: theme.dangerFill}]}
          />

          <ScrollView
            style={styles.scrollBody}
            contentContainerStyle={[
              styles.scrollContent,
              {
                paddingHorizontal: theme.cardPadding,
                paddingTop: theme.isCompact ? 15 : 18,
                paddingBottom: theme.isCompact ? 15 : 18,
              },
            ]}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <View style={styles.headerRow}>
              <View
                style={[
                  styles.iconHalo,
                  {
                    width: theme.iconBadgeSize,
                    height: theme.iconBadgeSize,
                    borderRadius: theme.isCompact ? 14 : 16,
                    backgroundColor: theme.dangerSoftBg,
                    borderColor: theme.dangerBorder,
                  },
                ]}
              >
                {isGuest ? (
                  <AlertTriangle
                    size={theme.isCompact ? 19 : 21}
                    color={theme.dangerInk}
                    strokeWidth={2.2}
                  />
                ) : (
                  <LogOut
                    size={theme.isCompact ? 19 : 21}
                    color={theme.dangerInk}
                    strokeWidth={2.2}
                  />
                )}
              </View>

              <View style={styles.headerTitleCol}>
                <View
                  style={[
                    styles.statusBadge,
                    {
                      backgroundColor: theme.dangerSoftBg,
                      borderColor: theme.dangerBorder,
                    },
                  ]}
                >
                  <Text
                    style={[styles.statusBadgeText, {color: theme.dangerInk}]}
                    numberOfLines={1}
                  >
                    {badgeLabel}
                  </Text>
                </View>

                <Text
                  testID="sign-out-modal-title"
                  accessibilityRole="header"
                  style={[
                    styles.title,
                    {
                      color: theme.textPrimary,
                      fontSize: theme.titleFontSize,
                    },
                  ]}
                >
                  {title}
                </Text>
              </View>

              <TouchableOpacity
                testID="sign-out-close-btn"
                accessibilityRole="button"
                accessibilityLabel="Close sign out dialog"
                disabled={busy}
                activeOpacity={0.78}
                onPress={onCancel}
                style={[
                  styles.closeBtn,
                  {
                    backgroundColor: theme.surfaceBg,
                    borderColor: theme.borderColor,
                  },
                ]}
              >
                <X size={16} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text
              testID="sign-out-modal-message"
              style={[
                styles.summaryText,
                {
                  color: theme.textSecondary,
                  fontSize: theme.bodyFontSize,
                  lineHeight: theme.bodyLineHeight,
                },
              ]}
            >
              {summaryText}
            </Text>

            <View style={styles.infoStack}>
              <View
                style={[
                  styles.infoRow,
                  {
                    backgroundColor: theme.dangerSoftBg,
                    borderColor: theme.dangerBorder,
                    borderRadius: theme.subCardRadius,
                    padding: theme.isCompact ? 11 : 13,
                  },
                ]}
              >
                <View
                  style={[
                    styles.infoIconWrap,
                    {backgroundColor: theme.cardBg},
                  ]}
                >
                  <CloudOff size={15} color={theme.dangerInk} />
                </View>
                <View style={styles.infoCopy}>
                  <Text
                    style={[styles.infoTitle, {color: theme.textPrimary}]}
                  >
                    {isGuest ? 'Temporary data cleared' : 'Sync pauses on device'}
                  </Text>
                  <Text
                    style={[
                      styles.infoBody,
                      {
                        color: theme.textSecondary,
                        fontSize: theme.isCompact ? 11.5 : 12,
                      },
                    ]}
                  >
                    {isGuest
                      ? 'Unsaved guest tasks, events, reminders, and notes will be dismissed.'
                      : 'Active session ends here and cloud sync pauses until you sign in again.'}
                  </Text>
                </View>
              </View>

              <View
                style={[
                  styles.infoRow,
                  {
                    backgroundColor: theme.safeSoftBg,
                    borderColor: theme.safeBorder,
                    borderRadius: theme.subCardRadius,
                    padding: theme.isCompact ? 11 : 13,
                  },
                ]}
              >
                <View
                  style={[
                    styles.infoIconWrap,
                    {backgroundColor: theme.cardBg},
                  ]}
                >
                  {isGuest ? (
                    <UserPlus size={15} color={theme.safeInk} />
                  ) : (
                    <ShieldCheck size={15} color={theme.safeInk} />
                  )}
                </View>
                <View style={styles.infoCopy}>
                  <Text
                    style={[styles.infoTitle, {color: theme.textPrimary}]}
                  >
                    {isGuest ? 'Save with an account' : 'Your account stays safe'}
                  </Text>
                  <Text
                    style={[
                      styles.infoBody,
                      {
                        color: theme.textSecondary,
                        fontSize: theme.isCompact ? 11.5 : 12,
                      },
                    ]}
                  >
                    {isGuest
                      ? 'Create a student account first if you want to keep your schedule and notes.'
                      : 'Your synced schedule, tasks, and notes stay stored safely in your account.'}
                  </Text>
                </View>
              </View>
            </View>

            {isGuest && onCreateAccount ? (
              <TouchableOpacity
                testID="sign-out-create-account-btn"
                accessibilityRole="button"
                accessibilityLabel="Create account instead"
                disabled={busy}
                activeOpacity={0.84}
                onPress={onCreateAccount}
                style={[
                  styles.createAccountBtn,
                  {
                    minHeight: theme.buttonHeight - 2,
                    borderRadius: theme.buttonRadius,
                    backgroundColor: theme.accentColor,
                  },
                ]}
              >
                <UserPlus size={16} color="#FFFFFF" />
                <Text style={styles.createAccountText}>
                  Create Account to Keep Data
                </Text>
              </TouchableOpacity>
            ) : null}

            <View
              style={[
                styles.actionsRow,
                theme.isVeryNarrow && styles.actionsRowStacked,
              ]}
            >
              <TouchableOpacity
                testID="sign-out-cancel-btn"
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                disabled={busy}
                activeOpacity={0.8}
                onPress={onCancel}
                style={[
                  styles.actionBtn,
                  !theme.isVeryNarrow && styles.actionBtnFlex,
                  {
                    minHeight: theme.buttonHeight,
                    borderRadius: theme.buttonRadius,
                    backgroundColor: theme.surfaceBg,
                    borderColor: theme.borderColor,
                  },
                ]}
              >
                <Text
                  style={[styles.cancelBtnText, {color: theme.textPrimary}]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                >
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                testID="sign-out-confirm-btn"
                accessibilityRole="button"
                accessibilityLabel={title}
                accessibilityState={{busy, disabled: busy}}
                disabled={busy}
                activeOpacity={0.84}
                onPress={onConfirm}
                style={[
                  styles.actionBtn,
                  !theme.isVeryNarrow && styles.actionBtnFlex,
                  styles.confirmBtn,
                  {
                    minHeight: theme.buttonHeight,
                    borderRadius: theme.buttonRadius,
                    backgroundColor: theme.dangerFill,
                    opacity: busy ? 0.72 : 1,
                  },
                ]}
              >
                <LogOut size={16} color="#FFFFFF" />
                <Text
                  style={styles.confirmBtnText}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                >
                  {confirmLabel}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    borderWidth: 1,
    overflow: 'hidden',
    flexShrink: 1,
  },
  topAccentBar: {
    height: 4,
    width: '100%',
  },
  scrollBody: {
    flexShrink: 1,
  },
  scrollContent: {
    gap: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconHalo: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerTitleCol: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  statusBadgeText: {
    fontFamily: Fonts.heading,
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  title: {
    fontFamily: Fonts.heading,
    fontWeight: '700',
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  summaryText: {
    fontFamily: Fonts.body,
  },
  infoStack: {
    gap: 9,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
  },
  infoIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  infoCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  infoTitle: {
    fontFamily: Fonts.heading,
    fontSize: 13,
    fontWeight: '700',
  },
  infoBody: {
    fontFamily: Fonts.body,
    lineHeight: 16.5,
  },
  createAccountBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  createAccountText: {
    fontFamily: Fonts.heading,
    fontSize: 13.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 2,
  },
  actionsRowStacked: {
    flexDirection: 'column-reverse',
    alignItems: 'stretch',
  },
  actionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnFlex: {
    flex: 1,
  },
  confirmBtn: {
    flexDirection: 'row',
    gap: 7,
    borderWidth: 0,
  },
  cancelBtnText: {
    fontFamily: Fonts.heading,
    fontSize: 14,
    fontWeight: '700',
  },
  confirmBtnText: {
    fontFamily: Fonts.heading,
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
