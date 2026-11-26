import React, {useCallback, useEffect, useState} from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  ArrowUpRight,
  BookOpen,
  MessageSquare,
  MessageSquarePlus,
  Trash2,
} from 'lucide-react-native';
import {useTheme} from '../contexts/ThemeContext';
import {Fonts, FontSize, Layout, Spacing} from '../theme';
import {
  quickChatController,
  type QuickChatHistorySession,
} from '../../ai/quickChat/quickChatController';
import {chatStore, type ChatSummary} from '../../storage/chatStore';

interface QuickChatHistoryViewProps {
  userId: string;
  activeSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onStartNewChat: () => void;
  onOpenAppChat: (sessionId: string) => void;
}

const MAX_APP_CHATS_SHOWN = 5;

const formatRelativeWhen = (iso: string, now = new Date()): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const diffMs = now.getTime() - date.getTime();
  if (diffMs >= 0 && diffMs < 60_000) return 'Just now';
  if (diffMs >= 0 && diffMs < 3_600_000) {
    return `${Math.max(1, Math.floor(diffMs / 60_000))}m ago`;
  }
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'});
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], {month: 'short', day: 'numeric'});
};

const safeListAppChats = (userId: string): ChatSummary[] => {
  try {
    return chatStore.listSessions(userId).slice(0, MAX_APP_CHATS_SHOWN);
  } catch {
    return [];
  }
};

/**
 * Floating LAFINA inline Chat History panel.
 *
 * Shows saved Quick Chat threads (tap to load & continue right inside Quick
 * Chat, delete one, or clear all) plus a compact jump list of recent LAFINA
 * Chat tab conversations.
 */
export const QuickChatHistoryView: React.FC<QuickChatHistoryViewProps> = ({
  userId,
  activeSessionId,
  onSelectSession,
  onStartNewChat,
  onOpenAppChat,
}) => {
  const {colors, isModern, modernPalette} = useTheme();
  const [sessions, setSessions] = useState<QuickChatHistorySession[]>(() =>
    quickChatController.getHistory(userId),
  );
  const [appChats, setAppChats] = useState<ChatSummary[]>(() =>
    safeListAppChats(userId),
  );
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const reload = useCallback(() => {
    setSessions(quickChatController.getHistory(userId));
    setAppChats(safeListAppChats(userId));
  }, [userId]);

  useEffect(() => {
    reload();
    return quickChatController.subscribe(reload);
  }, [reload]);

  const activeBg = isModern ? modernPalette.softViolet : colors.primary + '16';

  const handleDelete = (sessionId: string) => {
    setConfirmClearAll(false);
    quickChatController.deleteHistorySession(userId, sessionId);
  };

  const handleClearAll = () => {
    setConfirmClearAll(false);
    quickChatController.clearHistory(userId);
  };

  return (
    <View style={styles.container} testID="quick-chat-history-view">
      <View style={styles.toolbar}>
        <TouchableOpacity
          onPress={onStartNewChat}
          accessibilityRole="button"
          accessibilityLabel="New chat"
          testID="quick-history-new"
          style={[styles.newButton, {backgroundColor: colors.primary}]}
        >
          <MessageSquarePlus size={15} color={colors.textOnPrimary} />
          <Text style={[styles.newLabel, {color: colors.textOnPrimary}]}>
            New chat
          </Text>
        </TouchableOpacity>

        {sessions.length > 0 ? (
          confirmClearAll ? (
            <View style={styles.confirmRow}>
              <TouchableOpacity
                onPress={handleClearAll}
                accessibilityRole="button"
                accessibilityLabel="Confirm clear all history"
                testID="quick-history-clear-confirm"
                style={[styles.confirmBtn, {backgroundColor: colors.error}]}
              >
                <Text
                  style={[styles.confirmText, {color: colors.textOnPrimary}]}
                >
                  Clear all
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setConfirmClearAll(false)}
                accessibilityRole="button"
                accessibilityLabel="Cancel clear all history"
                testID="quick-history-clear-cancel"
                style={styles.cancelBtn}
              >
                <Text
                  style={[styles.cancelText, {color: colors.textSecondary}]}
                >
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => setConfirmClearAll(true)}
              accessibilityRole="button"
              accessibilityLabel="Clear all floating chat history"
              testID="quick-history-clear-all"
              style={styles.clearAllBtn}
            >
              <Text style={[styles.clearAllText, {color: colors.error}]}>
                Clear all
              </Text>
            </TouchableOpacity>
          )
        ) : null}
      </View>

      {sessions.length === 0 && appChats.length === 0 ? (
        <View style={styles.emptyBox} testID="quick-history-empty">
          <Text style={[styles.emptyTitle, {color: colors.textPrimary}]}>
            No chat history yet
          </Text>
          <Text style={[styles.emptyHint, {color: colors.textSecondary}]}>
            Your Quick Chat conversations will appear here so you can reopen or
            continue them anytime.
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          testID="quick-history-list"
        >
          {sessions.length > 0 ? (
            <>
              <Text
                style={[styles.sectionLabel, {color: colors.textSecondary}]}
              >
                Floating chats
              </Text>
              {sessions.map(session => {
                const isActive = session.id === activeSessionId;
                return (
                  <View
                    key={session.id}
                    style={[
                      styles.row,
                      {borderColor: colors.divider},
                      isActive && {backgroundColor: activeBg},
                    ]}
                  >
                    <TouchableOpacity
                      onPress={() => onSelectSession(session.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Open floating chat ${session.title}`}
                      testID={`quick-history-item-${session.id}`}
                      style={styles.rowMain}
                    >
                      <View style={styles.rowHeader}>
                        <MessageSquare
                          size={14}
                          color={
                            isActive ? colors.primary : colors.textSecondary
                          }
                        />
                        <Text
                          style={[
                            styles.rowTitle,
                            {color: colors.textPrimary},
                            isActive && {color: colors.primary},
                          ]}
                          numberOfLines={1}
                        >
                          {session.title}
                        </Text>
                        <Text
                          style={[
                            styles.rowWhen,
                            {color: colors.textSecondary},
                          ]}
                        >
                          {formatRelativeWhen(session.updatedAt)}
                        </Text>
                      </View>
                      {session.preview ? (
                        <Text
                          style={[
                            styles.rowPreview,
                            {color: colors.textSecondary},
                          ]}
                          numberOfLines={1}
                        >
                          {session.preview}
                        </Text>
                      ) : null}
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDelete(session.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${session.title}`}
                      testID={`quick-history-delete-${session.id}`}
                      hitSlop={{top: 8, bottom: 8, left: 6, right: 6}}
                      style={styles.deleteBtn}
                    >
                      <Trash2 size={15} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </>
          ) : null}

          {appChats.length > 0 ? (
            <>
              <Text
                style={[
                  styles.sectionLabel,
                  sessions.length > 0 && styles.sectionSpaced,
                  {color: colors.textSecondary},
                ]}
              >
                In LAFINA Chat
              </Text>
              {appChats.map(item => (
                <TouchableOpacity
                  key={item.id}
                  onPress={() => onOpenAppChat(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${item.title} in LAFINA`}
                  testID={`quick-history-app-${item.id}`}
                  style={[styles.row, {borderColor: colors.divider}]}
                >
                  <View style={styles.rowMain}>
                    <View style={styles.rowHeader}>
                      {item.kind === 'ustp' ? (
                        <BookOpen size={14} color={colors.primary} />
                      ) : (
                        <MessageSquare size={14} color={colors.textSecondary} />
                      )}
                      <Text
                        style={[styles.rowTitle, {color: colors.textPrimary}]}
                        numberOfLines={1}
                      >
                        {item.title}
                      </Text>
                      <Text
                        style={[styles.rowWhen, {color: colors.textSecondary}]}
                      >
                        {formatRelativeWhen(item.lastMessageAt)}
                      </Text>
                    </View>
                    {item.preview ? (
                      <Text
                        style={[
                          styles.rowPreview,
                          {color: colors.textSecondary},
                        ]}
                        numberOfLines={1}
                      >
                        {item.preview}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.deleteBtn}>
                    <ArrowUpRight size={15} color={colors.textSecondary} />
                  </View>
                </TouchableOpacity>
              ))}
            </>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flexShrink: 1},
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  newButton: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 36,
    borderRadius: Layout.borderRadiusPill,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  newLabel: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.small,
    marginLeft: Spacing.xs,
  },
  clearAllBtn: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
  },
  clearAllText: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.small,
  },
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  confirmBtn: {
    minHeight: 32,
    borderRadius: Layout.borderRadiusPill,
    paddingHorizontal: Spacing.sm,
    justifyContent: 'center',
  },
  confirmText: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.small,
  },
  cancelBtn: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
  },
  cancelText: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
  },
  emptyBox: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
  emptyTitle: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.body,
    marginBottom: Spacing.xs,
  },
  emptyHint: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    textAlign: 'center',
  },
  list: {flexGrow: 0, flexShrink: 1},
  listContent: {paddingBottom: Spacing.xs},
  sectionLabel: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.small,
    marginBottom: Spacing.xs,
  },
  sectionSpaced: {
    marginTop: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: Spacing.xs,
    paddingLeft: Spacing.sm,
    paddingRight: Spacing.xs,
    paddingVertical: Spacing.xs,
  },
  rowMain: {
    flex: 1,
    paddingVertical: 2,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowTitle: {
    flex: 1,
    fontFamily: Fonts.heading,
    fontSize: FontSize.body,
    marginLeft: Spacing.xs,
    marginRight: Spacing.xs,
  },
  rowWhen: {
    fontFamily: Fonts.body,
    fontSize: FontSize.caption,
  },
  rowPreview: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    marginTop: 2,
    marginLeft: 20,
  },
  deleteBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
