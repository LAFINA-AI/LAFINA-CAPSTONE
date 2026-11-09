import React from 'react';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import {Brain} from 'lucide-react-native';
import {Fonts} from '../../theme';
import {useTheme} from '../../contexts/ThemeContext';
import type {ChatMemoryChanges} from '../../../storage/chatMemoryStore';

interface MemoryNoteProps {
  messageId: string;
  changes: ChatMemoryChanges;
  onUndo?: () => void;
}

/**
 * Under a reply: what LAFINA saved to (or dropped from) its memory after that
 * exchange, with Undo. After Undo it says so and offers nothing else.
 */
export const MemoryNote: React.FC<MemoryNoteProps> = ({messageId, changes, onUndo}) => {
  const {colors} = useTheme();
  const lines = [
    ...changes.added.map(memory => `Remembered: ${memory.text}`),
    ...changes.removed.map(memory => `Forgot: ${memory.text}`),
  ];
  return (
    <View
      style={[styles.box, {borderColor: colors.border, backgroundColor: colors.background}]}
      testID={`chat-memory-note-${messageId}`}
    >
      <View style={styles.header}>
        <Brain size={12} color={colors.primary} />
        <Text style={[styles.title, {color: colors.textSecondary}]}>
          {changes.undone ? 'Memory change undone' : 'Memory updated'}
        </Text>
        {!changes.undone && onUndo ? (
          <TouchableOpacity
            onPress={onUndo}
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
            accessibilityRole="button"
            accessibilityLabel="Undo this memory change"
            testID={`chat-memory-undo-${messageId}`}
          >
            <Text style={[styles.undo, {color: colors.primary}]}>Undo</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {changes.undone
        ? null
        : lines.map(line => (
            <Text key={line} style={[styles.line, {color: colors.textSecondary}]}>
              {line}
            </Text>
          ))}
    </View>
  );
};

const styles = StyleSheet.create({
  box: {
    marginTop: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    flex: 1,
    fontFamily: Fonts.heading,
    fontSize: 11,
  },
  undo: {
    fontFamily: Fonts.heading,
    fontSize: 11,
  },
  line: {
    fontFamily: Fonts.body,
    fontSize: 11,
  },
});
