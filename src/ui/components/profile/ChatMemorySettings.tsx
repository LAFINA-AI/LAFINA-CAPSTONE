import React, {useCallback, useEffect, useState} from 'react';
import {Alert, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View} from 'react-native';
import {X} from 'lucide-react-native';
import {ToolSheet} from '../tools';
import {useTheme} from '../../contexts/ThemeContext';
import {Fonts, FontSize, Spacing} from '../../theme';
import {chatMemoryStore, MAX_MEMORY_TEXT} from '../../../storage/chatMemoryStore';
import type {ChatMemory} from '../../../storage/chatMemoryStore';

interface ChatMemorySettingsProps {
  userId: string;
  isGuest: boolean;
  visible: boolean;
  onClose: () => void;
  onChanged?: () => void;
}

/**
 * Profile → Memory: what LAFINA remembers about the student from online chats.
 * They can turn it off, read every memory, delete one, add one, or forget all.
 */
export const ChatMemorySettings: React.FC<ChatMemorySettingsProps> = ({
  userId,
  isGuest,
  visible,
  onClose,
  onChanged,
}) => {
  const {colors} = useTheme();
  const [enabled, setEnabled] = useState(() => chatMemoryStore.isEnabled(userId));
  const [memories, setMemories] = useState<ChatMemory[]>([]);
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState('');

  const reload = useCallback(() => {
    setEnabled(chatMemoryStore.isEnabled(userId));
    try {
      setMemories(chatMemoryStore.list(userId));
      setNotice('');
    } catch {
      setMemories([]);
      setNotice('Memories could not be read right now. Nothing was deleted.');
    }
  }, [userId]);

  useEffect(() => {
    if (visible) reload();
    else setDraft('');
  }, [visible, reload]);

  const changed = () => {
    reload();
    onChanged?.();
  };

  const toggle = (next: boolean) => {
    if (!chatMemoryStore.setEnabled(userId, next)) {
      setNotice('The setting could not be saved. Try again.');
      return;
    }
    changed();
  };

  const addMemory = () => {
    try {
      const saved = chatMemoryStore.add(userId, draft);
      if (!saved) {
        setNotice('That is empty or already remembered.');
        return;
      }
      setDraft('');
      changed();
    } catch {
      setNotice('The memory could not be saved. Try again.');
    }
  };

  const removeMemory = (memory: ChatMemory) => {
    try {
      chatMemoryStore.remove(userId, memory.id);
      changed();
    } catch {
      setNotice('The memory could not be deleted. Try again.');
    }
  };

  const forgetAll = () => {
    Alert.alert(
      'Forget Everything',
      'Delete every memory LAFINA has about you on this phone? Your chats are kept.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Forget',
          style: 'destructive',
          onPress: () => {
            try {
              chatMemoryStore.clear(userId);
              changed();
            } catch {
              setNotice('Memories could not be deleted. Try again.');
            }
          },
        },
      ],
    );
  };

  return (
    <ToolSheet visible={visible} title="Memory" onClose={onClose}>
      <Text style={[styles.note, {color: colors.textSecondary}]}>
        In Online Mode, LAFINA remembers useful things you tell it, like your program, routine or
        how you like answers, and uses them in later chats. You see each change under the reply
        and can undo it. Memories stay on this phone and are sent with your online chat messages
        to LAFINA's server and DeepSeek; they are not stored there. Passwords, codes and long
        numbers are never saved.
        {isGuest ? ' Sign in to use online chat and memory.' : ''}
      </Text>

      <View style={styles.switchRow}>
        <Text style={[styles.label, {color: colors.textPrimary}]}>Use memory in online chat</Text>
        <Switch
          value={enabled}
          onValueChange={toggle}
          accessibilityLabel="Use memory in online chat"
          testID="memory-enabled-switch"
          trackColor={{false: '#767577', true: colors.red}}
          thumbColor="#FFF"
        />
      </View>

      <View style={[styles.addRow, {borderColor: colors.border}]}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Add something LAFINA should remember"
          placeholderTextColor={colors.textSecondary}
          maxLength={MAX_MEMORY_TEXT}
          style={[styles.input, {color: colors.textPrimary}]}
          accessibilityLabel="New memory"
          testID="memory-add-input"
          onSubmitEditing={addMemory}
        />
        <TouchableOpacity
          onPress={addMemory}
          disabled={!draft.trim()}
          accessibilityRole="button"
          accessibilityLabel="Add memory"
          testID="memory-add-button"
          style={styles.textButton}
        >
          <Text
            style={[
              styles.textButtonLabel,
              {color: draft.trim() ? colors.primary : colors.textSecondary},
            ]}
          >
            Add
          </Text>
        </TouchableOpacity>
      </View>

      {notice ? (
        <Text style={[styles.notice, {color: colors.error}]} testID="memory-notice">
          {notice}
        </Text>
      ) : null}

      {memories.length === 0 ? (
        <Text style={[styles.empty, {color: colors.textSecondary}]} testID="memory-empty">
          Nothing remembered yet.
        </Text>
      ) : (
        memories.map(memory => (
          <View
            key={memory.id}
            style={[styles.memoryRow, {borderColor: colors.border}]}
            testID={`memory-item-${memory.id}`}
          >
            <Text style={[styles.memoryText, {color: colors.textPrimary}]}>{memory.text}</Text>
            <TouchableOpacity
              onPress={() => removeMemory(memory)}
              hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
              accessibilityRole="button"
              accessibilityLabel={`Delete memory: ${memory.text}`}
              testID={`memory-delete-${memory.id}`}
            >
              <X size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        ))
      )}

      {memories.length > 0 ? (
        <TouchableOpacity
          onPress={forgetAll}
          accessibilityRole="button"
          accessibilityLabel="Forget everything"
          testID="memory-forget-all"
          style={styles.forgetAll}
        >
          <Text style={[styles.textButtonLabel, {color: colors.error}]}>Forget everything</Text>
        </TouchableOpacity>
      ) : null}
    </ToolSheet>
  );
};

const styles = StyleSheet.create({
  note: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    lineHeight: 18,
    marginBottom: Spacing.md,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  label: {
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
    flex: 1,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingLeft: 10,
    marginBottom: Spacing.sm,
  },
  input: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
    paddingVertical: 8,
  },
  textButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  textButtonLabel: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.body,
  },
  notice: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    marginBottom: Spacing.sm,
  },
  empty: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    textAlign: 'center',
    paddingVertical: Spacing.md,
  },
  memoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
  },
  memoryText: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
  },
  forgetAll: {
    alignSelf: 'center',
    paddingVertical: Spacing.md,
  },
});
