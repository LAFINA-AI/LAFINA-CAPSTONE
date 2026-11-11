/**
 * Call Lafina 2.0 Note Search Result Card (F-035, F-036, P08-03).
 *
 * Displays a note found via speech query during a live voice call.
 * Shows title, excerpt, category, and provides an "Open Note" action
 * to view the full note in the app without terminating the call.
 */

import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {FileText, ExternalLink} from 'lucide-react-native';
import {Fonts, FontSize, Layout, Spacing} from '../../../theme';
import {useTheme} from '../../../contexts/ThemeContext';
import {useThemedStyles} from '../../../theme/createThemedStyles';
import type {ThemeColors} from '../../../contexts/ThemeContext';

export interface NoteResultCardData {
  noteId: string;
  title: string;
  excerpt: string;
  category?: string;
  updatedAt?: string;
}

export interface NoteResultCardProps {
  data: NoteResultCardData;
  onOpenNote?: (noteId: string) => void;
  onDismiss: () => void;
  testIDPrefix?: string;
}

export const NoteResultCard: React.FC<NoteResultCardProps> = ({
  data,
  onOpenNote,
  onDismiss,
  testIDPrefix = 'note-result',
}) => {
  const {colors} = useTheme();
  const themed = useThemedStyles(getThemedStyles);

  return (
    <View
      style={[styles.card, themed.card, {borderColor: colors.primary}]}
      accessibilityLabel={`Note result: ${data.title}`}
      testID="note-result-card"
    >
      <View style={styles.headerRow}>
        <FileText size={16} color={colors.primary} />
        <Text
          style={[styles.kicker, {color: colors.primary}]}
          accessibilityRole="header"
        >
          Note Found
        </Text>
        {data.category ? (
          <Text style={[styles.categoryText, themed.secondaryText]}>
            {data.category}
          </Text>
        ) : null}
      </View>

      <Text
        style={[styles.title, themed.primaryText]}
        testID={`${testIDPrefix}-title`}
      >
        {data.title}
      </Text>

      <Text
        style={[styles.excerpt, themed.secondaryText]}
        numberOfLines={4}
        testID={`${testIDPrefix}-excerpt`}
      >
        {data.excerpt}
      </Text>

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.button, themed.secondaryButton]}
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss note result"
          testID={`${testIDPrefix}-dismiss`}
        >
          <Text style={[styles.buttonText, themed.primaryText]}>Dismiss</Text>
        </TouchableOpacity>

        {onOpenNote ? (
          <TouchableOpacity
            style={[styles.button, {backgroundColor: colors.primary}]}
            onPress={() => onOpenNote(data.noteId)}
            accessibilityRole="button"
            accessibilityLabel={`Open note: ${data.title}`}
            testID={`${testIDPrefix}-open-note`}
          >
            <View style={styles.openRow}>
              <ExternalLink size={14} color={colors.textOnPrimary} />
              <Text
                style={[styles.buttonText, {color: colors.textOnPrimary}]}
              >
                Open Note
              </Text>
            </View>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
};

const getThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
    },
    primaryText: {
      color: colors.textPrimary,
    },
    secondaryText: {
      color: colors.textSecondary,
    },
    secondaryButton: {
      backgroundColor: colors.inputBg,
      borderColor: colors.border,
      borderWidth: 1,
    },
  });

const styles = StyleSheet.create({
  card: {
    marginVertical: Spacing.xs,
    padding: Spacing.md,
    borderRadius: Layout.borderRadiusCard,
    borderWidth: 1.5,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  kicker: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.small,
    textTransform: 'uppercase',
  },
  categoryText: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    marginLeft: 'auto',
  },
  title: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.bodyLarge,
    marginBottom: Spacing.xs,
  },
  excerpt: {
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
    lineHeight: 20,
    marginBottom: Spacing.sm,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  openRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  button: {
    minHeight: 44,
    minWidth: 88,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Layout.borderRadiusButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.body,
  },
});

