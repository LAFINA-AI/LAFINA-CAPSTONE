import React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import type { ThemeColors } from '../../contexts/ThemeContext';
import { useThemedStyles } from '../../theme/createThemedStyles';
import { Fonts, FontSize, Layout, Spacing } from '../../theme';

interface ToolSheetProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export const ToolSheet: React.FC<ToolSheetProps> = ({
  visible,
  title,
  onClose,
  footer,
  children,
}) => {
  const { colors } = useTheme();
  const themed = useThemedStyles(getThemedStyles);
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable
          style={styles.dismissArea}
          onPress={onClose}
          accessibilityLabel="Close sheet"
        />
        <View
          style={[
            styles.sheet,
            themed.sheet,
            { paddingBottom: Math.max(insets.bottom, Spacing.lg) },
          ]}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={[styles.title, themed.title]} numberOfLines={1}>
              {title}
            </Text>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={8}
            >
              <X size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
          {footer ? <View style={[styles.footer, themed.footer]}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const getThemedStyles = (colors: ThemeColors) => ({
  sheet: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  title: {
    color: colors.textPrimary,
  },
  footer: {
    borderTopColor: colors.divider,
  },
});

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  dismissArea: {
    flex: 1,
  },
  sheet: {
    maxHeight: '88%',
    borderTopLeftRadius: Layout.borderRadiusCard,
    borderTopRightRadius: Layout.borderRadiusCard,
    borderTopWidth: 1,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(128,128,128,0.4)',
    marginBottom: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  title: {
    flex: 1,
    fontFamily: Fonts.heading,
    fontSize: FontSize.subtitle,
    fontWeight: 'bold',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flexShrink: 1,
  },
  bodyContent: {
    paddingBottom: Spacing.md,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.md,
  },
});
