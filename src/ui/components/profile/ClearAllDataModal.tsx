import React, {useEffect, useState} from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react-native';
import {useTheme} from '../../contexts/ThemeContext';
import {Fonts, Layout, ModernLayout, Shadows} from '../../theme';

export const CLEAR_DATA_CONFIRM_PHRASE = 'DELETE';

export interface ClearAllDataModalProps {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export type ClearDataResultStatus =
  | 'cleared'
  | 'partly_cleared'
  | 'not_cleared';

export interface ClearDataResultState {
  status: ClearDataResultStatus;
  title: 'Data Cleared' | 'Data Partly Cleared' | 'Not Cleared';
  message: string;
}

export interface ClearDataResultModalProps {
  result: ClearDataResultState | null;
  visible?: boolean;
  onClose: () => void;
}

function useClearDataModalTheme() {
  const {colors, isDarkMode, isModern, modernPalette, modernShadows} =
    useTheme();
  const {width, height} = useWindowDimensions();

  const safeWidth = width > 0 ? width : 360;
  const safeHeight = height > 0 ? height : 640;
  const isCompact = safeWidth < 360;

  return {
    colors,
    isDarkMode,
    isModern,
    modernPalette,
    modernShadows,
    isCompact,
    cardPadding: isCompact ? 15 : 18,
    iconBadgeSize: isCompact ? 38 : 42,
    titleFontSize: isCompact ? 18 : 20,
    bodyFontSize: isCompact ? 12 : 12.5,
    bodyLineHeight: isCompact ? 17 : 18,
    maxCardHeight: Math.min(safeHeight * 0.88, 680),
    buttonHeight: isCompact ? 42 : 46,
    inputHeight: isCompact ? 40 : 44,
    cardBg: isModern ? modernPalette.card : colors.cardBg,
    surfaceBg: isModern ? modernPalette.surface : colors.inputBg,
    borderColor: isModern ? modernPalette.border : colors.border,
    dividerColor: isModern ? modernPalette.border : colors.divider,
    textPrimary: isModern ? modernPalette.text : colors.textPrimary,
    textSecondary: isModern ? modernPalette.muted : colors.textSecondary,
    accentColor: isModern ? modernPalette.accent : colors.primary,
    dangerAccent: isModern ? modernPalette.danger : colors.error,
    dangerSoft: isModern ? modernPalette.dangerSoft : colors.bannerBg,
    dangerBorder: isModern ? `${modernPalette.danger}38` : `${colors.error}38`,
    dangerFill: isDarkMode
      ? '#E11D48'
      : isModern
      ? modernPalette.danger
      : colors.error,
    keptSurfaceBg: isModern ? modernPalette.softViolet : colors.inputBg,
    cardRadius: isModern
      ? ModernLayout.borderRadiusCard
      : Layout.borderRadiusCard,
    subCardRadius: isModern ? ModernLayout.borderRadiusSubCard : 12,
    inputRadius: isModern
      ? ModernLayout.borderRadiusInput
      : Layout.borderRadiusButton,
    buttonRadius: isModern ? 14 : Layout.borderRadiusButton,
  };
}

/**
 * Theme-adaptive destructive confirmation modal for Profile → Clear All Data.
 * Compactly fits on a single screen and requires typing DELETE before unlocking.
 */
export const ClearAllDataModal: React.FC<ClearAllDataModalProps> = ({
  visible,
  onCancel,
  onConfirm,
}) => {
  const theme = useClearDataModalTheme();
  const [confirmText, setConfirmText] = useState('');
  const [inputFocused, setInputFocused] = useState(false);

  useEffect(() => {
    setConfirmText('');
    setInputFocused(false);
  }, [visible]);

  const isConfirmed =
    confirmText.trim().toUpperCase() === CLEAR_DATA_CONFIRM_PHRASE;

  const handleConfirm = () => {
    if (!isConfirmed) {
      return;
    }
    onConfirm();
  };

  const inputBorderColor = isConfirmed
    ? theme.dangerFill
    : inputFocused
    ? theme.accentColor
    : theme.borderColor;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onCancel}
      testID="clear-data-warning-modal"
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[
          styles.backdrop,
          {
            backgroundColor: theme.colors.overlay,
            paddingHorizontal: theme.isCompact ? 12 : 18,
            paddingVertical: theme.isCompact ? 12 : 20,
          },
        ]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="Dismiss clear all data warning"
        />

        <View
          testID="clear-data-modal-card"
          style={[
            styles.card,
            theme.isModern ? theme.modernShadows.floating : Shadows.card,
            {
              backgroundColor: theme.cardBg,
              borderColor: theme.borderColor,
              borderRadius: theme.cardRadius,
              maxHeight: theme.maxCardHeight,
            },
          ]}
        >
          <View
            style={[styles.topAccentBar, {backgroundColor: theme.dangerFill}]}
          />

          <ScrollView
            style={styles.scrollBody}
            contentContainerStyle={[
              styles.scrollContent,
              {
                paddingHorizontal: theme.cardPadding,
                paddingTop: theme.isCompact ? 14 : 16,
                paddingBottom: theme.isCompact ? 12 : 14,
              },
            ]}
            keyboardShouldPersistTaps="handled"
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
                    borderRadius: theme.iconBadgeSize / 2,
                    backgroundColor: theme.dangerSoft,
                    borderColor: theme.dangerBorder,
                  },
                ]}
              >
                <AlertTriangle
                  size={theme.isCompact ? 18 : 20}
                  color={theme.dangerAccent}
                  strokeWidth={2.2}
                />
              </View>

              <View style={styles.headerTitleCol}>
                <View
                  style={[
                    styles.statusBadge,
                    {
                      backgroundColor: theme.dangerSoft,
                      borderColor: theme.dangerBorder,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusBadgeText,
                      {color: theme.dangerAccent},
                    ]}
                  >
                    PERMANENT ACTION
                  </Text>
                </View>

                <Text
                  testID="clear-data-modal-title"
                  style={[
                    styles.title,
                    {color: theme.textPrimary, fontSize: theme.titleFontSize},
                  ]}
                  numberOfLines={1}
                >
                  Clear All Data
                </Text>
              </View>

              <TouchableOpacity
                onPress={onCancel}
                accessibilityRole="button"
                accessibilityLabel="Close clear all data dialog"
                hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
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
              testID="clear-data-modal-message"
              style={[
                styles.message,
                {
                  color: theme.textSecondary,
                  fontSize: theme.bodyFontSize,
                  lineHeight: theme.bodyLineHeight,
                },
              ]}
            >
              This will delete all your notes, tasks, events, reminders,
              calendar blocks, chat history and saved event defaults. Device
              settings such as the offline voice, theme and time format are
              kept; Offline Voice has its own Reset. This action cannot be
              undone.
            </Text>

            <View style={styles.breakdownStack}>
              <View
                testID="clear-data-deleted-list"
                style={[
                  styles.breakdownCard,
                  {
                    backgroundColor: theme.dangerSoft,
                    borderColor: theme.dangerBorder,
                    borderRadius: theme.subCardRadius,
                    padding: theme.isCompact ? 10 : 12,
                  },
                ]}
              >
                <View
                  style={[
                    styles.breakdownIconBox,
                    {
                      backgroundColor: theme.cardBg,
                      borderColor: theme.dangerBorder,
                    },
                  ]}
                >
                  <Trash2 size={14} color={theme.dangerAccent} />
                </View>
                <View style={styles.breakdownBody}>
                  <Text
                    style={[styles.breakdownTitle, {color: theme.dangerAccent}]}
                  >
                    What will be permanently deleted
                  </Text>
                  <Text
                    style={[
                      styles.breakdownSummary,
                      {color: theme.textPrimary},
                    ]}
                  >
                    Notes, tasks, events, reminders, blocks, chats &amp; event
                    defaults
                  </Text>
                </View>
              </View>

              <View
                testID="clear-data-kept-list"
                style={[
                  styles.breakdownCard,
                  {
                    backgroundColor: theme.keptSurfaceBg,
                    borderColor: theme.borderColor,
                    borderRadius: theme.subCardRadius,
                    padding: theme.isCompact ? 10 : 12,
                  },
                ]}
              >
                <View
                  style={[
                    styles.breakdownIconBox,
                    {
                      backgroundColor: theme.cardBg,
                      borderColor: theme.borderColor,
                    },
                  ]}
                >
                  <ShieldCheck size={14} color={theme.accentColor} />
                </View>
                <View style={styles.breakdownBody}>
                  <Text
                    style={[styles.breakdownTitle, {color: theme.accentColor}]}
                  >
                    Kept on this device
                  </Text>
                  <Text
                    style={[
                      styles.breakdownSummary,
                      {color: theme.textSecondary},
                    ]}
                  >
                    Offline voice (has its own Reset), color theme &amp; time
                    format
                  </Text>
                </View>
              </View>
            </View>

            <View
              style={[
                styles.confirmSection,
                {borderTopColor: theme.dividerColor},
              ]}
            >
              <View style={styles.confirmPromptRow}>
                <Text style={[styles.confirmLabel, {color: theme.textPrimary}]}>
                  Type{' '}
                  <Text
                    style={[styles.confirmPhrase, {color: theme.dangerAccent}]}
                  >
                    {CLEAR_DATA_CONFIRM_PHRASE}
                  </Text>{' '}
                  to confirm
                </Text>
                {isConfirmed && (
                  <View
                    style={[
                      styles.confirmedPill,
                      {
                        backgroundColor: theme.dangerSoft,
                        borderColor: theme.dangerBorder,
                      },
                    ]}
                  >
                    <Check
                      size={11}
                      color={theme.dangerAccent}
                      strokeWidth={3}
                    />
                    <Text
                      style={[
                        styles.confirmedPillText,
                        {color: theme.dangerAccent},
                      ]}
                    >
                      Unlocked
                    </Text>
                  </View>
                )}
              </View>

              <TextInput
                testID="clear-data-confirm-input"
                value={confirmText}
                onChangeText={setConfirmText}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                placeholder={`Type ${CLEAR_DATA_CONFIRM_PHRASE}`}
                placeholderTextColor={theme.colors.placeholder}
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="done"
                accessibilityLabel={`Type ${CLEAR_DATA_CONFIRM_PHRASE} to confirm clearing all data`}
                style={[
                  styles.confirmInput,
                  {
                    height: theme.inputHeight,
                    backgroundColor: theme.surfaceBg,
                    color: theme.textPrimary,
                    borderColor: inputBorderColor,
                    borderRadius: theme.inputRadius,
                  },
                ]}
              />
            </View>
          </ScrollView>

          <View
            style={[
              styles.footer,
              {
                borderTopColor: theme.dividerColor,
                paddingHorizontal: theme.cardPadding,
                paddingTop: theme.isCompact ? 10 : 12,
                paddingBottom: theme.isCompact ? 12 : 16,
              },
            ]}
          >
            <View style={styles.buttonRow}>
              <TouchableOpacity
                testID="clear-data-cancel-btn"
                onPress={onCancel}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                style={[
                  styles.actionBtn,
                  styles.cancelBtn,
                  {
                    height: theme.buttonHeight,
                    backgroundColor: theme.surfaceBg,
                    borderColor: theme.borderColor,
                    borderRadius: theme.buttonRadius,
                  },
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={[styles.actionBtnText, {color: theme.textPrimary}]}
                >
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                testID="clear-data-confirm-btn"
                onPress={handleConfirm}
                disabled={!isConfirmed}
                activeOpacity={0.82}
                accessibilityRole="button"
                accessibilityLabel="Delete Everything"
                accessibilityState={{disabled: !isConfirmed}}
                style={[
                  styles.actionBtn,
                  styles.confirmBtn,
                  {
                    height: theme.buttonHeight,
                    borderRadius: theme.buttonRadius,
                    paddingHorizontal: theme.isCompact ? 10 : 14,
                    backgroundColor: isConfirmed
                      ? theme.dangerFill
                      : theme.surfaceBg,
                    borderColor: isConfirmed
                      ? theme.dangerFill
                      : theme.borderColor,
                  },
                ]}
              >
                <View
                  testID="clear-data-confirm-btn-content"
                  style={[
                    styles.confirmBtnContent,
                    {opacity: isConfirmed ? 1 : 0.72},
                  ]}
                >
                  <Trash2
                    size={15}
                    color={isConfirmed ? '#FFFFFF' : theme.textSecondary}
                  />
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.85}
                    style={[
                      styles.actionBtnText,
                      {color: isConfirmed ? '#FFFFFF' : theme.textSecondary},
                    ]}
                  >
                    Delete Everything
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

/**
 * Theme-adaptive outcome card replacing the plain native Alert after Clear All Data.
 */
export const ClearDataResultModal: React.FC<ClearDataResultModalProps> = ({
  result,
  visible,
  onClose,
}) => {
  const theme = useClearDataModalTheme();
  const isOpen = Boolean(result) && visible !== false;

  if (!result || !isOpen) {
    return (
      <Modal
        visible={false}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={onClose}
        testID="clear-data-result-modal"
      />
    );
  }

  const isCleared = result.status === 'cleared';
  const statusAccent = isCleared
    ? theme.isModern
      ? theme.modernPalette.mintInk
      : theme.colors.success
    : theme.isModern
    ? theme.modernPalette.danger
    : theme.colors.warning;
  const statusSoft = isCleared
    ? theme.isModern
      ? theme.modernPalette.mint
      : theme.isDarkMode
      ? '#143326'
      : '#ECFDF5'
    : theme.isModern
    ? theme.modernPalette.dangerSoft
    : theme.colors.bannerBg;
  const statusBorder = isCleared
    ? `${statusAccent}38`
    : theme.isModern
    ? `${theme.modernPalette.danger}38`
    : `${theme.colors.warning}38`;
  const statusBadgeLabel =
    result.status === 'cleared'
      ? 'RESET COMPLETE'
      : result.status === 'partly_cleared'
      ? 'PARTIAL RESET'
      : 'NO CHANGES MADE';

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
      testID="clear-data-result-modal"
    >
      <View
        style={[
          styles.backdrop,
          {
            backgroundColor: theme.colors.overlay,
            paddingHorizontal: theme.isCompact ? 12 : 18,
            paddingVertical: theme.isCompact ? 12 : 20,
          },
        ]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss data clear summary"
        />

        <View
          testID="clear-data-result-card"
          style={[
            styles.card,
            theme.isModern ? theme.modernShadows.floating : Shadows.card,
            {
              backgroundColor: theme.cardBg,
              borderColor: theme.borderColor,
              borderRadius: theme.cardRadius,
              maxHeight: theme.maxCardHeight,
            },
          ]}
        >
          <View
            style={[styles.topAccentBar, {backgroundColor: statusAccent}]}
          />

          <ScrollView
            style={styles.scrollBody}
            contentContainerStyle={[
              styles.scrollContent,
              {
                paddingHorizontal: theme.cardPadding,
                paddingTop: theme.isCompact ? 14 : 16,
                paddingBottom: theme.isCompact ? 12 : 14,
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
                    borderRadius: theme.iconBadgeSize / 2,
                    backgroundColor: statusSoft,
                    borderColor: statusBorder,
                  },
                ]}
              >
                {isCleared ? (
                  <CheckCircle2
                    size={theme.isCompact ? 18 : 20}
                    color={statusAccent}
                    strokeWidth={2.2}
                  />
                ) : (
                  <AlertTriangle
                    size={theme.isCompact ? 18 : 20}
                    color={statusAccent}
                    strokeWidth={2.2}
                  />
                )}
              </View>

              <View style={styles.headerTitleCol}>
                <View
                  style={[
                    styles.statusBadge,
                    {
                      backgroundColor: statusSoft,
                      borderColor: statusBorder,
                    },
                  ]}
                >
                  <Text style={[styles.statusBadgeText, {color: statusAccent}]}>
                    {statusBadgeLabel}
                  </Text>
                </View>

                <Text
                  testID="clear-data-result-title"
                  style={[
                    styles.title,
                    {color: theme.textPrimary, fontSize: theme.titleFontSize},
                  ]}
                  numberOfLines={1}
                >
                  {result.title}
                </Text>
              </View>

              <TouchableOpacity
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close result dialog"
                hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
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
              testID="clear-data-result-message"
              style={[
                styles.message,
                {
                  color: theme.textSecondary,
                  fontSize: theme.bodyFontSize,
                  lineHeight: theme.bodyLineHeight,
                },
              ]}
            >
              {result.message}
            </Text>

            {isCleared && (
              <View style={styles.breakdownStack}>
                <View
                  testID="clear-data-result-cleared-card"
                  style={[
                    styles.breakdownCard,
                    {
                      backgroundColor: statusSoft,
                      borderColor: statusBorder,
                      borderRadius: theme.subCardRadius,
                      padding: theme.isCompact ? 10 : 12,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.breakdownIconBox,
                      {
                        backgroundColor: theme.cardBg,
                        borderColor: statusBorder,
                      },
                    ]}
                  >
                    <CheckCircle2 size={14} color={statusAccent} />
                  </View>
                  <View style={styles.breakdownBody}>
                    <Text
                      style={[styles.breakdownTitle, {color: statusAccent}]}
                    >
                      Removed from this account
                    </Text>
                    <Text
                      style={[
                        styles.breakdownSummary,
                        {color: theme.textPrimary},
                      ]}
                    >
                      Notes, tasks, events, reminders, blocks, chats &amp; event
                      defaults
                    </Text>
                  </View>
                </View>

                <View
                  testID="clear-data-result-kept-card"
                  style={[
                    styles.breakdownCard,
                    {
                      backgroundColor: theme.keptSurfaceBg,
                      borderColor: theme.borderColor,
                      borderRadius: theme.subCardRadius,
                      padding: theme.isCompact ? 10 : 12,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.breakdownIconBox,
                      {
                        backgroundColor: theme.cardBg,
                        borderColor: theme.borderColor,
                      },
                    ]}
                  >
                    <ShieldCheck size={14} color={theme.accentColor} />
                  </View>
                  <View style={styles.breakdownBody}>
                    <Text
                      style={[
                        styles.breakdownTitle,
                        {color: theme.accentColor},
                      ]}
                    >
                      Kept on this device
                    </Text>
                    <Text
                      style={[
                        styles.breakdownSummary,
                        {color: theme.textSecondary},
                      ]}
                    >
                      Offline voice, color theme, interface &amp; time format
                    </Text>
                  </View>
                </View>
              </View>
            )}
          </ScrollView>

          <View
            style={[
              styles.footer,
              {
                borderTopColor: theme.dividerColor,
                paddingHorizontal: theme.cardPadding,
                paddingTop: theme.isCompact ? 10 : 12,
                paddingBottom: theme.isCompact ? 12 : 16,
              },
            ]}
          >
            <TouchableOpacity
              testID="clear-data-result-done-btn"
              onPress={onClose}
              activeOpacity={0.82}
              accessibilityRole="button"
              accessibilityLabel="Done"
              style={[
                styles.actionBtn,
                styles.resultDoneBtn,
                {
                  height: theme.buttonHeight,
                  borderRadius: theme.buttonRadius,
                  backgroundColor: theme.accentColor,
                },
              ]}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.actionBtnText,
                  {color: theme.colors.textOnPrimary},
                ]}
              >
                Done
              </Text>
            </TouchableOpacity>
          </View>
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
    width: '100%',
    maxWidth: 440,
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
    flexGrow: 0,
  },
  scrollContent: {
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
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
    gap: 3,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontFamily: Fonts.heading,
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.7,
    includeFontPadding: false,
  },
  title: {
    fontFamily: Fonts.heading,
    fontWeight: '800',
    letterSpacing: -0.3,
    includeFontPadding: false,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  message: {
    fontFamily: Fonts.body,
    textAlign: 'left',
  },
  breakdownStack: {
    gap: 8,
  },
  breakdownCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
  },
  breakdownIconBox: {
    width: 28,
    height: 28,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  breakdownBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  breakdownTitle: {
    fontFamily: Fonts.heading,
    fontSize: 12.5,
    fontWeight: '700',
    includeFontPadding: false,
  },
  breakdownSummary: {
    fontFamily: Fonts.body,
    fontSize: 11.5,
    lineHeight: 16,
  },
  confirmSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    gap: 7,
  },
  confirmPromptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  confirmLabel: {
    fontFamily: Fonts.heading,
    fontSize: 12.5,
    fontWeight: '600',
    flexShrink: 1,
  },
  confirmPhrase: {
    fontFamily: Fonts.heading,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  confirmedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 999,
    borderWidth: 1,
  },
  confirmedPillText: {
    fontFamily: Fonts.heading,
    fontSize: 10.5,
    fontWeight: '700',
    includeFontPadding: false,
  },
  confirmInput: {
    borderWidth: 1.5,
    paddingHorizontal: 13,
    paddingVertical: 0,
    fontFamily: Fonts.heading,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1.2,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actionBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtn: {
    flex: 0.9,
    borderWidth: 1,
    paddingHorizontal: 12,
  },
  confirmBtn: {
    flex: 1.45,
    borderWidth: 1,
  },
  confirmBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  resultDoneBtn: {
    width: '100%',
    paddingHorizontal: 16,
  },
  actionBtnText: {
    fontFamily: Fonts.heading,
    fontSize: 13.5,
    fontWeight: '700',
    lineHeight: 18,
    textAlign: 'center',
    includeFontPadding: false,
  },
});
