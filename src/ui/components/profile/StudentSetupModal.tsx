import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {CheckCircle2, FileText, X} from 'lucide-react-native';
import type {StudentSetupState} from '../../../storage/studentSetupStore';
import {useTheme} from '../../contexts/ThemeContext';
import type {ThemeColors} from '../../contexts/ThemeContext';
import {Fonts, FontSize, Layout, Spacing, useThemedStyles} from '../../theme';

interface StudentSetupModalProps {
  visible: boolean;
  setup: StudentSetupState;
  eligible: boolean;
  onClose: () => void;
  onUploadCor: () => void;
  onSwitchMode: () => void;
}

/** Presentation only: COR review and mode changes stay with the profile flow. */
export const StudentSetupModal: React.FC<StudentSetupModalProps> = ({
  visible,
  setup,
  eligible,
  onClose,
  onUploadCor,
  onSwitchMode,
}) => {
  const {colors} = useTheme();
  const themed = useThemedStyles(getThemedStyles);
  const insets = useSafeAreaInsets();
  const isUstp = setup.affiliation === 'ustp';
  const needsReview = isUstp && setup.corStatus === 'needs_review';
  const status = eligible
    ? 'USTP features are on'
    : needsReview
    ? 'Your COR needs review'
    : isUstp
    ? 'Your COR is not added yet'
    : 'Scheduling mode';
  const action = eligible
    ? 'Replace COR'
    : needsReview
    ? 'Review COR'
    : isUstp
    ? 'Set up COR'
    : "I'm a USTP student";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      testID="student-setup-modal"
    >
      <View
        style={[
          styles.backdrop,
          themed.backdrop,
          {
            paddingTop: Math.max(insets.top, Spacing.xl),
            paddingBottom: Math.max(insets.bottom, Spacing.xl),
          },
        ]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessible={false}
          importantForAccessibility="no"
          testID="student-setup-backdrop"
        />
        <View
          style={[styles.card, themed.card]}
          accessibilityViewIsModal
          testID="student-setup-card"
        >
          <View style={[styles.header, themed.divider]}>
            <Text
              accessibilityRole="header"
              style={[styles.title, themed.text]}
            >
              Student setup
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close student setup"
              onPress={onClose}
              style={({pressed}) => [styles.close, pressed && themed.pressed]}
            >
              <X size={20} color={colors.textPrimary} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
          >
            <View style={styles.statusRow}>
              <View style={[styles.documentIcon, themed.surface]}>
                {eligible ? (
                  <CheckCircle2 size={24} color={colors.textPrimary} />
                ) : (
                  <FileText size={24} color={colors.textPrimary} />
                )}
              </View>
              <View style={styles.statusCopy}>
                <Text style={[styles.label, themed.secondary]}>
                  Current setup
                </Text>
                <Text style={[styles.status, themed.text]}>{status}</Text>
              </View>
            </View>

            <Text style={[styles.body, themed.secondary]}>
              {eligible
                ? 'Your reviewed Certificate of Registration (COR) enables USTP handbook answers and school details.'
                : 'Your calendar, tasks and reminders work in scheduling mode. Review and confirm your USTP Certificate of Registration (COR) to enable handbook answers and school details.'}
            </Text>

            <View style={[styles.note, themed.surface]}>
              <Text style={[styles.noteTitle, themed.text]}>
                {eligible ? 'Reviewed by you' : 'You review before saving'}
              </Text>
              <Text style={[styles.body, themed.secondary]}>
                {eligible
                  ? 'This is your personal setup in LAFINA, not official verification by USTP.'
                  : 'Check your school details and classes before confirming. Nothing is added to your calendar until you confirm.'}
              </Text>
            </View>

            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                onPress={onUploadCor}
                testID="student-setup-cor-action"
                style={({pressed}) => [
                  styles.button,
                  themed.primaryButton,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.buttonText, themed.primaryText]}>
                  {action}
                </Text>
              </Pressable>
              {isUstp && (
                <Pressable
                  accessibilityRole="button"
                  onPress={onSwitchMode}
                  testID="student-setup-switch-mode"
                  style={({pressed}) => [
                    styles.button,
                    themed.secondaryButton,
                    pressed && themed.pressed,
                  ]}
                >
                  <Text style={[styles.buttonText, themed.text]}>
                    I'm not a USTP student
                  </Text>
                </Pressable>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const getThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    backdrop: {backgroundColor: colors.overlay},
    card: {backgroundColor: colors.cardBg, borderColor: colors.border},
    divider: {borderBottomColor: colors.divider},
    surface: {backgroundColor: colors.inputBg},
    text: {color: colors.textPrimary},
    secondary: {color: colors.textSecondary},
    primaryButton: {backgroundColor: colors.primary},
    primaryText: {color: colors.textOnPrimary},
    secondaryButton: {borderWidth: 1, borderColor: colors.border},
    pressed: {backgroundColor: colors.inputBg},
  });

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '100%',
    flexShrink: 1,
    borderWidth: 1,
    borderRadius: Layout.borderRadiusCard,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingStart: Spacing.xl,
    paddingEnd: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.sm,
  },
  title: {
    flex: 1,
    fontFamily: Fonts.heading,
    fontSize: FontSize.subtitle,
  },
  close: {
    minHeight: 48,
    minWidth: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Layout.borderRadiusButton,
  },
  scroll: {flexShrink: 1},
  content: {padding: Spacing.xl, gap: Spacing.xl},
  statusRow: {flexDirection: 'row', alignItems: 'center', gap: Spacing.md},
  documentIcon: {
    padding: Spacing.md,
    borderRadius: Layout.borderRadiusButton,
  },
  statusCopy: {flex: 1, gap: Spacing.xs},
  label: {fontFamily: Fonts.body, fontSize: FontSize.small},
  status: {fontFamily: Fonts.heading, fontSize: FontSize.subtitle},
  body: {fontFamily: Fonts.body, fontSize: FontSize.body, lineHeight: 22},
  note: {
    padding: Spacing.lg,
    gap: Spacing.xs,
    borderRadius: Layout.borderRadiusButton,
  },
  noteTitle: {fontFamily: Fonts.heading, fontSize: FontSize.body},
  actions: {gap: Spacing.sm},
  button: {
    minHeight: 48,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: Layout.borderRadiusButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.bodyLarge,
    textAlign: 'center',
  },
  pressed: {opacity: 0.8},
});
