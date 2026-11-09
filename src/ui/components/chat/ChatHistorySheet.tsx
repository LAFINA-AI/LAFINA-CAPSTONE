import React, {useCallback, useEffect, useState} from 'react';
import {
  Alert,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {MessageSquarePlus, Pencil, Search, X} from 'lucide-react-native';
import {Fonts, FontSize} from '../../theme';
import {useTheme} from '../../contexts/ThemeContext';
import {chatStore, MAX_CHAT_TITLE} from '../../../storage/chatStore';
import type {ChatSummary} from '../../../storage/chatStore';
import {removeAttachmentFiles} from './chatFiles';

interface ChatHistorySheetProps {
  visible: boolean;
  userId: string;
  currentSessionId: string;
  /** A reply is still being written: switching chats waits for it. */
  busy: boolean;
  onClose: () => void;
  /** The student opened another chat, started a new one, or deleted the open one. */
  onChanged: () => void;
}

const formatWhen = (iso: string, now = new Date()): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'});
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() === now.getFullYear() ? {} : {year: 'numeric'}),
  });
};

/** Every chat of this account on this phone, like a ChatGPT or Claude sidebar. */
export const ChatHistorySheet: React.FC<ChatHistorySheetProps> = ({
  visible,
  userId,
  currentSessionId,
  busy,
  onClose,
  onChanged,
}) => {
  const {colors} = useTheme();
  const [search, setSearch] = useState('');
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [renaming, setRenaming] = useState<{id: string; title: string} | null>(null);

  const reload = useCallback(() => {
    try {
      setChats(chatStore.listSessions(userId, search));
      setLoadError(false);
    } catch (error) {
      console.error('[ChatHistory] Could not list chats:', error);
      setLoadError(true);
    }
  }, [search, userId]);

  useEffect(() => {
    if (visible) reload();
  }, [visible, reload]);

  useEffect(() => {
    if (!visible) {
      setSearch('');
      setRenaming(null);
    }
  }, [visible]);

  const blockedWhileBusy = (): boolean => {
    if (!busy) return false;
    Alert.alert('One moment', 'Wait for LAFINA to finish this reply, then switch chats.');
    return true;
  };

  const openChat = (id: string) => {
    if (id === currentSessionId) {
      onClose();
      return;
    }
    if (blockedWhileBusy()) return;
    try {
      chatStore.openSession(userId, id);
    } catch (error) {
      console.error('[ChatHistory] Could not open chat:', error);
      Alert.alert('Could Not Open', 'That chat could not be opened. Nothing was changed.');
      return;
    }
    onChanged();
    onClose();
  };

  const startNewChat = () => {
    if (blockedWhileBusy()) return;
    try {
      chatStore.startNewChat(userId);
    } catch (error) {
      console.error('[ChatHistory] Could not start a chat:', error);
      Alert.alert('Could Not Start', 'A new chat could not be started right now.');
      return;
    }
    onChanged();
    onClose();
  };

  const saveRename = () => {
    if (!renaming) return;
    try {
      chatStore.renameSession(userId, renaming.id, renaming.title);
    } catch (error) {
      console.error('[ChatHistory] Could not rename chat:', error);
      Alert.alert('Not Renamed', 'The chat could not be renamed. Try again.');
      return;
    }
    setRenaming(null);
    reload();
  };

  const confirmDelete = (chat: ChatSummary) => {
    if (chat.id === currentSessionId && blockedWhileBusy()) return;
    Alert.alert(
      'Delete Chat',
      `Delete "${chat.title}"? Its messages and files are removed from this phone. Saved schedule items, notes and memories are kept.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            try {
              const {attachmentUris} = chatStore.deleteSession(userId, chat.id);
              void removeAttachmentFiles(attachmentUris);
            } catch (error) {
              console.error('[ChatHistory] Could not delete chat:', error);
              Alert.alert('Could Not Delete', 'The chat could not be deleted. Nothing was removed.');
              return;
            }
            reload();
            if (chat.id === currentSessionId) onChanged();
          },
        },
      ],
    );
  };

  const renderChat = ({item}: {item: ChatSummary}) => {
    const isOpen = item.id === currentSessionId;
    if (renaming?.id === item.id) {
      return (
        <View style={[styles.row, {borderColor: colors.border}]}>
          <TextInput
            value={renaming.title}
            onChangeText={title => setRenaming({id: item.id, title})}
            onSubmitEditing={saveRename}
            maxLength={MAX_CHAT_TITLE}
            autoFocus
            style={[styles.renameInput, {color: colors.textPrimary, borderColor: colors.primary}]}
            accessibilityLabel="Chat title"
            testID="chat-history-rename-input"
          />
          <TouchableOpacity
            onPress={saveRename}
            accessibilityRole="button"
            accessibilityLabel="Save chat title"
            testID="chat-history-rename-save"
            style={styles.textButton}
          >
            <Text style={[styles.textButtonLabel, {color: colors.primary}]}>Save</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View
        style={[
          styles.row,
          {borderColor: colors.border},
          isOpen && {backgroundColor: colors.primary + '14'},
        ]}
      >
        <TouchableOpacity
          style={styles.rowMain}
          onPress={() => openChat(item.id)}
          accessibilityRole="button"
          accessibilityLabel={`Open chat ${item.title}${isOpen ? ', open now' : ''}`}
          testID={`chat-history-item-${item.id}`}
        >
          <View style={styles.titleRow}>
            <Text style={[styles.title, {color: colors.textPrimary}]} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={[styles.when, {color: colors.textSecondary}]}>
              {formatWhen(item.lastMessageAt)}
            </Text>
          </View>
          <Text style={[styles.preview, {color: colors.textSecondary}]} numberOfLines={1}>
            {item.preview}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setRenaming({id: item.id, title: item.customTitle ? item.title : ''})}
          hitSlop={{top: 8, bottom: 8, left: 4, right: 4}}
          accessibilityRole="button"
          accessibilityLabel={`Rename chat ${item.title}`}
          testID={`chat-history-rename-${item.id}`}
          style={styles.iconButton}
        >
          <Pencil size={15} color={colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => confirmDelete(item)}
          hitSlop={{top: 8, bottom: 8, left: 4, right: 8}}
          accessibilityRole="button"
          accessibilityLabel={`Delete chat ${item.title}`}
          testID={`chat-history-delete-${item.id}`}
          style={styles.iconButton}
        >
          <X size={16} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View
          style={[styles.sheet, {backgroundColor: colors.background}]}
          testID="chat-history-sheet"
        >
          <View style={styles.header}>
            <Text style={[styles.heading, {color: colors.textPrimary}]}>Chats</Text>
            <TouchableOpacity
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close chats"
              testID="chat-history-close"
              hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
            >
              <X size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.newChat, {backgroundColor: colors.primary}]}
            onPress={startNewChat}
            accessibilityRole="button"
            accessibilityLabel="New chat"
            testID="chat-history-new"
          >
            <MessageSquarePlus size={16} color={colors.white} />
            <Text style={[styles.newChatText, {color: colors.white}]}>New chat</Text>
          </TouchableOpacity>

          <View style={[styles.searchBox, {borderColor: colors.border}]}>
            <Search size={14} color={colors.textSecondary} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search chats"
              placeholderTextColor={colors.textSecondary}
              style={[styles.searchInput, {color: colors.textPrimary}]}
              accessibilityLabel="Search chats"
              testID="chat-history-search"
            />
          </View>

          {loadError ? (
            <Text style={[styles.empty, {color: colors.textSecondary}]}>
              Your chats could not be loaded right now. Nothing was deleted.
            </Text>
          ) : (
            <FlatList
              data={chats}
              keyExtractor={chat => chat.id}
              renderItem={renderChat}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <Text style={[styles.empty, {color: colors.textSecondary}]} testID="chat-history-empty">
                  {search.trim() ? 'No chats match your search.' : 'No chats yet. Say hi to LAFINA!'}
                </Text>
              }
            />
          )}
          <Text style={[styles.footnote, {color: colors.textSecondary}]}>
            Chats are kept on this phone only.
          </Text>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '85%',
    minHeight: '50%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    gap: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heading: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.subtitle,
  },
  newChat: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 10,
  },
  newChatText: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.body,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
  },
  searchInput: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
    paddingVertical: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 8,
    gap: 4,
  },
  rowMain: {
    flex: 1,
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    flex: 1,
    fontFamily: Fonts.heading,
    fontSize: FontSize.body,
  },
  when: {
    fontFamily: Fonts.body,
    fontSize: FontSize.caption,
  },
  preview: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
  },
  iconButton: {
    padding: 6,
  },
  renameInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
  },
  textButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  textButtonLabel: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.body,
  },
  empty: {
    textAlign: 'center',
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    paddingVertical: 24,
  },
  footnote: {
    textAlign: 'center',
    fontFamily: Fonts.body,
    fontSize: FontSize.caption,
  },
});
