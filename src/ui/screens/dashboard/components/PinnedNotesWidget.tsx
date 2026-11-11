import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {CheckSquare, ChevronRight, FileText, Pin} from 'lucide-react-native';
import type {NoteSnapshot} from '../../../../storage';
import {
  checklistStats,
  noteBlocksToPlainText,
  noteBodyToMarkdown,
  parseNoteBlocks,
} from '../../../../utils';
import {useTheme} from '../../../contexts/ThemeContext';
import type {ThemeColors} from '../../../contexts/ThemeContext';
import {Fonts, FontSize, Layout, Shadows, Spacing} from '../../../theme';
import {getCategoryColor} from '../../../theme/categoryColors';
import {useThemedStyles} from '../../../theme/createThemedStyles';

interface PinnedNotesWidgetProps {
  notes: readonly NoteSnapshot[];
  hasPinnedNotes: boolean;
  onPressNote: (noteId: string) => void;
  onOpenAllNotes: () => void;
}

const getNotePreviewText = (body: string): string => {
  if (!body) return '';
  const plain = noteBlocksToPlainText(
    parseNoteBlocks(noteBodyToMarkdown(body.slice(0, 1200))),
  )
    .replace(/\s+/g, ' ')
    .trim();
  return plain;
};

export const PinnedNotesWidget: React.FC<PinnedNotesWidgetProps> = ({
  notes,
  hasPinnedNotes,
  onPressNote,
  onOpenAllNotes,
}) => {
  const {colors} = useTheme();
  const themed = useThemedStyles(getThemedStyles);

  return (
    <View
      style={[styles.card, themed.card, Shadows.card]}
      testID="dashboard-widget-pinned-notes"
    >
      <View style={styles.headerRow}>
        <View style={styles.headerTitleWrap}>
          {hasPinnedNotes ? (
            <Pin size={16} color={colors.red} />
          ) : (
            <FileText size={17} color={colors.blue} />
          )}
          <Text style={[styles.headerTitle, themed.primaryText]}>
            {hasPinnedNotes ? 'Pinned Notes' : 'Recent Notes'}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.viewAllBtn}
          onPress={onOpenAllNotes}
          activeOpacity={0.7}
        >
          <Text style={[styles.viewAllText, {color: colors.primary}]}>
            All notes
          </Text>
          <ChevronRight size={14} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {notes.length === 0 ? (
        <View style={[styles.emptyBox, themed.emptyBox]}>
          <Text style={[styles.emptyText, themed.secondaryText]}>
            No notes saved yet. Capture lecture notes or checklists in the Notes
            tab.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {notes.map(note => {
            const hasCategory = Boolean(
              note.category &&
                note.category !== 'None' &&
                note.category.trim().length > 0,
            );
            const categoryColor = hasCategory
              ? getCategoryColor(note.category)
              : colors.border;
            const preview = getNotePreviewText(note.body);
            const checklist = checklistStats(note.body);

            return (
              <TouchableOpacity
                key={note.id}
                style={[styles.noteCard, themed.noteCard]}
                onPress={() => onPressNote(note.id)}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={`Open note ${note.title}`}
                testID={`dashboard-note-item-${note.id}`}
              >
                <View
                  style={[
                    styles.categoryStrip,
                    {backgroundColor: categoryColor},
                  ]}
                />
                <View style={styles.noteContent}>
                  <View style={styles.noteTitleRow}>
                    <Text
                      style={[styles.noteTitle, themed.primaryText]}
                      numberOfLines={1}
                    >
                      {note.title || 'Untitled Note'}
                    </Text>
                    {note.isPinned && (
                      <Pin
                        size={12}
                        color={colors.red}
                        style={{transform: [{rotate: '45deg'}]}}
                      />
                    )}
                  </View>

                  {preview.length > 0 && (
                    <Text
                      style={[styles.notePreview, themed.secondaryText]}
                      numberOfLines={2}
                    >
                      {preview}
                    </Text>
                  )}

                  {(hasCategory || checklist.total > 0) && (
                    <View style={styles.noteMetaRow}>
                      {hasCategory && (
                        <Text
                          style={[styles.categoryLabel, {color: categoryColor}]}
                        >
                          {note.category}
                        </Text>
                      )}
                      {checklist.total > 0 && (
                        <View style={styles.checklistTag}>
                          <CheckSquare
                            size={11}
                            color={
                              checklist.done === checklist.total
                                ? colors.success
                                : colors.textMuted
                            }
                          />
                          <Text
                            style={[styles.checklistText, themed.secondaryText]}
                          >
                            {checklist.done}/{checklist.total}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
};

const getThemedStyles = (colors: ThemeColors) => ({
  card: {
    backgroundColor: colors.cardBg,
    borderColor: colors.border,
  },
  primaryText: {color: colors.textPrimary},
  secondaryText: {color: colors.textSecondary},
  noteCard: {
    backgroundColor: colors.inputBg,
    borderColor: colors.border,
  },
  emptyBox: {
    backgroundColor: colors.inputBg,
    borderColor: colors.border,
  },
});

const styles = StyleSheet.create({
  card: {
    borderRadius: Layout.borderRadiusCard,
    borderWidth: 1,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.bodyLarge,
    fontWeight: '700',
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  viewAllText: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.small,
    fontWeight: '600',
  },
  list: {
    gap: Spacing.sm,
  },
  noteCard: {
    flexDirection: 'row',
    borderRadius: Layout.borderRadiusButton,
    borderWidth: 1,
    overflow: 'hidden',
  },
  categoryStrip: {
    width: 4,
  },
  noteContent: {
    flex: 1,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    gap: 4,
  },
  noteTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  noteTitle: {
    flex: 1,
    fontFamily: Fonts.heading,
    fontSize: FontSize.body,
    fontWeight: '600',
  },
  notePreview: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    lineHeight: 17,
  },
  noteMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 2,
  },
  categoryLabel: {
    fontFamily: Fonts.heading,
    fontSize: 11,
    fontWeight: '600',
  },
  checklistTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  checklistText: {
    fontFamily: Fonts.body,
    fontSize: 11,
  },
  emptyBox: {
    borderRadius: Layout.borderRadiusButton,
    borderWidth: 1,
    padding: Spacing.md,
  },
  emptyText: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    lineHeight: 19,
  },
});
