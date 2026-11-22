import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  Alert,
  DeviceEventEmitter,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {Check, Pencil, Pin, Search, X} from 'lucide-react-native';
import {ToolSheet} from '../tools';
import {useTheme} from '../../contexts/ThemeContext';
import {Fonts, FontSize, Layout, Spacing} from '../../theme';
import {mixColors} from '../../theme/colorMix';
import {
  chatMemoryStore,
  MAX_MEMORY_TEXT,
} from '../../../storage/chatMemoryStore';
import type {
  ChatMemory,
  MemoryCategory,
  MemoryGrowthStats,
} from '../../../storage/chatMemoryStore';
import {
  reconcileClearedMemories,
  reconcileDeletedMemory,
} from '../../../storage/onboardingMemory';
import {
  getConfirmedAcademicProfile,
  isUstpSchoolEnabled,
} from '../../../storage/ustpEligibility';
import {
  getAdaptiveGrowthInsights,
  type AdaptiveGrowthInsights,
} from '../../../ai/ml/timingAdvisor';
import {CHAT_MEMORY_CHANGED_EVENT} from '../../../cloud/chatMemoryService';

interface ChatMemorySettingsProps {
  userId: string;
  isGuest: boolean;
  visible: boolean;
  onClose: () => void;
  onChanged?: () => void;
  onUpdateCor?: () => void;
}

const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  identity: 'Identity',
  academic: 'Academic',
  study: 'Study',
  goal: 'Goal',
  routine: 'Routine',
  general: 'General',
};

const TIER_LABELS: Record<ChatMemory['tier'], string> = {
  core: 'Core',
  preference: 'Preference',
  episodic: 'Learned',
};

/**
 * Profile → Memory: what LAFINA remembers about the student across sessions,
 * plus a transparent "How LAFINA Has Grown With You" summary of pinned core facts,
 * preferences, academic COR status, and adaptive reminder timing progress.
 */
export const ChatMemorySettings: React.FC<ChatMemorySettingsProps> = ({
  userId,
  isGuest,
  visible,
  onClose,
  onChanged,
  onUpdateCor,
}) => {
  const {colors} = useTheme();
  const [enabled, setEnabled] = useState(() =>
    chatMemoryStore.isEnabled(userId),
  );
  const [memories, setMemories] = useState<ChatMemory[]>([]);
  const [stats, setStats] = useState<MemoryGrowthStats>(() =>
    chatMemoryStore.stats(userId),
  );
  const [insights, setInsights] = useState<AdaptiveGrowthInsights>(() =>
    getAdaptiveGrowthInsights(userId),
  );
  const [draft, setDraft] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState('');
  const [notice, setNotice] = useState('');

  const academicTerm = useMemo(() => {
    if (!visible) return null;
    try {
      if (!isUstpSchoolEnabled(userId)) return null;
      const profile = getConfirmedAcademicProfile(userId);
      if (!profile) return null;
      return (
        profile.academicTerm ||
        profile.academicYearTerm ||
        profile.program ||
        'COR confirmed'
      );
    } catch {
      return null;
    }
  }, [userId, visible]);

  const reload = useCallback(() => {
    setEnabled(chatMemoryStore.isEnabled(userId));
    try {
      const next = chatMemoryStore.list(userId);
      setMemories(next);
      setStats(chatMemoryStore.stats(userId));
      setInsights(getAdaptiveGrowthInsights(userId));
      setNotice('');
    } catch {
      setMemories([]);
      setNotice('Memories could not be read right now. Nothing was deleted.');
    }
  }, [userId]);

  useEffect(() => {
    if (visible) {
      reload();
    } else {
      setDraft('');
      setSearchQuery('');
      setEditingId(null);
      setEditingDraft('');
    }
  }, [visible, reload]);

  useEffect(() => {
    if (!visible) return undefined;
    const sub = DeviceEventEmitter.addListener(
      CHAT_MEMORY_CHANGED_EVENT,
      (event: {userId?: string} | undefined) => {
        if (!event?.userId || event.userId === userId) {
          reload();
          onChanged?.();
        }
      },
    );
    return () => sub.remove();
  }, [visible, userId, reload, onChanged]);

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

  const startEdit = (memory: ChatMemory) => {
    setEditingId(memory.id);
    setEditingDraft(memory.text);
    setNotice('');
  };

  const saveEdit = (memory: ChatMemory) => {
    try {
      const updated = chatMemoryStore.update(userId, memory.id, {
        text: editingDraft,
      });
      if (!updated) {
        setNotice('Memory text cannot be empty.');
        return;
      }
      setEditingId(null);
      setEditingDraft('');
      changed();
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'The memory could not be updated. Try again.',
      );
    }
  };

  const togglePin = (memory: ChatMemory) => {
    try {
      const nextPinned = !memory.isPinned;
      chatMemoryStore.update(userId, memory.id, {
        isPinned: nextPinned,
        tier: nextPinned && memory.tier === 'episodic' ? 'core' : memory.tier,
      });
      changed();
    } catch {
      setNotice('The memory could not be updated. Try again.');
    }
  };

  const removeMemory = (memory: ChatMemory) => {
    try {
      chatMemoryStore.remove(userId, memory.id);
      reconcileDeletedMemory(userId, memory.id);
      if (editingId === memory.id) {
        setEditingId(null);
        setEditingDraft('');
      }
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
              reconcileClearedMemories(userId);
              setEditingId(null);
              setEditingDraft('');
              changed();
            } catch {
              setNotice('Memories could not be deleted. Try again.');
            }
          },
        },
      ],
    );
  };

  const filteredMemories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const sorted = [...memories].sort(
      (a, b) => Number(b.isPinned) - Number(a.isPinned),
    );
    if (!q) return sorted;
    return sorted.filter(
      m =>
        m.text.toLowerCase().includes(q) ||
        CATEGORY_LABELS[m.category].toLowerCase().includes(q) ||
        TIER_LABELS[m.tier].toLowerCase().includes(q),
    );
  }, [memories, searchQuery]);

  const showGrowthCard =
    stats.total > 0 || insights.totalSamples > 0 || Boolean(academicTerm);

  return (
    <ToolSheet visible={visible} title="Memory" onClose={onClose}>
      <Text style={[styles.note, {color: colors.textSecondary}]}>
        In Online Mode, LAFINA remembers useful things you tell it, like your
        program, routine or how you like answers, and uses them in later chats.
        You see each change under the reply and can undo it. Pinned & core facts
        stay protected as new memories are learned. Passwords, codes and long
        numbers are never saved.
        {isGuest ? ' Sign in to use online chat and memory.' : ''}
      </Text>

      <View style={styles.switchRow}>
        <Text style={[styles.label, {color: colors.textPrimary}]}>
          Use memory in online chat
        </Text>
        <Switch
          value={enabled}
          onValueChange={toggle}
          accessibilityLabel="Use memory in online chat"
          testID="memory-enabled-switch"
          trackColor={{false: colors.switchTrackOff, true: colors.red}}
          thumbColor={colors.switchThumb}
        />
      </View>

      {showGrowthCard ? (
        <View
          testID="memory-growth-summary"
          style={[
            styles.growthCard,
            {
              borderColor: colors.border,
              backgroundColor: mixColors(colors.blue, colors.cardBg, 0.06),
            },
          ]}
        >
          <Text style={[styles.growthTitle, {color: colors.textPrimary}]}>
            How LAFINA Has Grown With You
          </Text>
          <Text style={[styles.growthLine, {color: colors.textSecondary}]}>
            {`${stats.total} active ${
              stats.total === 1 ? 'memory' : 'memories'
            } (${stats.pinned} pinned · ${stats.byTier.core} core · ${
              stats.byTier.preference
            } preferences · ${stats.byTier.episodic} learned)`}
          </Text>
          <Text style={[styles.growthLine, {color: colors.textSecondary}]}>
            {insights.mlReady
              ? `Adaptive timing active: ${
                  insights.totalSamples
                } reminder signals · ${Math.round(
                  insights.recentAckRate * 100,
                )}% recent response rate · prefers ${
                  insights.preferredChannel === 'call' ? 'Call' : 'Notification'
                }${
                  insights.bestResponseWindow
                    ? ` · sharpest in ${insights.bestResponseWindow}`
                    : ''
                }`
              : `Reminder rhythm: ${insights.totalSamples}/${insights.samplesRequired} responses recorded before adaptive scheduling activates`}
          </Text>
          {academicTerm ? (
            <View style={styles.termRow}>
              <Text
                style={[
                  styles.growthLine,
                  {color: colors.textPrimary, flex: 1},
                ]}
              >
                Academic context: {academicTerm}
              </Text>
              {onUpdateCor ? (
                <TouchableOpacity
                  onPress={onUpdateCor}
                  testID="memory-update-cor"
                  accessibilityRole="button"
                >
                  <Text style={[styles.updateCorLink, {color: colors.blue}]}>
                    Update COR
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

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

      {memories.length >= 4 || searchQuery.length > 0 ? (
        <View style={[styles.searchRow, {borderColor: colors.border}]}>
          <Search size={14} color={colors.textSecondary} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Filter memories or categories"
            placeholderTextColor={colors.textSecondary}
            style={[styles.searchInput, {color: colors.textPrimary}]}
            testID="memory-search-input"
          />
          {searchQuery ? (
            <TouchableOpacity
              onPress={() => setSearchQuery('')}
              accessibilityRole="button"
              accessibilityLabel="Clear filter"
            >
              <X size={14} color={colors.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {notice ? (
        <Text
          style={[styles.notice, {color: colors.error}]}
          testID="memory-notice"
        >
          {notice}
        </Text>
      ) : null}

      {memories.length === 0 ? (
        <Text
          style={[styles.empty, {color: colors.textSecondary}]}
          testID="memory-empty"
        >
          Nothing remembered yet.
        </Text>
      ) : filteredMemories.length === 0 ? (
        <Text style={[styles.empty, {color: colors.textSecondary}]}>
          No memories match "{searchQuery}".
        </Text>
      ) : (
        filteredMemories.map(memory => {
          const isEditing = editingId === memory.id;
          return (
            <View
              key={memory.id}
              style={[styles.memoryRow, {borderColor: colors.border}]}
              testID={`memory-item-${memory.id}`}
            >
              <View style={styles.memoryMain}>
                <View style={styles.badgeRow}>
                  <View
                    style={[
                      styles.metaBadge,
                      {
                        backgroundColor: memory.isPinned
                          ? mixColors(colors.blue, colors.cardBg, 0.16)
                          : mixColors(
                              colors.textSecondary,
                              colors.cardBg,
                              0.12,
                            ),
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.metaBadgeText,
                        {
                          color: memory.isPinned
                            ? colors.blue
                            : colors.textSecondary,
                        },
                      ]}
                    >
                      {memory.isPinned ? 'Pinned' : TIER_LABELS[memory.tier]} ·{' '}
                      {CATEGORY_LABELS[memory.category]}
                    </Text>
                  </View>
                </View>

                {isEditing ? (
                  <View style={styles.editRow}>
                    <TextInput
                      value={editingDraft}
                      onChangeText={setEditingDraft}
                      maxLength={MAX_MEMORY_TEXT}
                      style={[
                        styles.editInput,
                        {
                          color: colors.textPrimary,
                          borderColor: colors.border,
                        },
                      ]}
                      testID={`memory-edit-input-${memory.id}`}
                      onSubmitEditing={() => saveEdit(memory)}
                    />
                    <TouchableOpacity
                      onPress={() => saveEdit(memory)}
                      hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                      accessibilityRole="button"
                      accessibilityLabel={`Save memory: ${memory.text}`}
                      testID={`memory-edit-save-${memory.id}`}
                    >
                      <Check size={16} color={colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        setEditingId(null);
                        setEditingDraft('');
                      }}
                      hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                      accessibilityRole="button"
                      accessibilityLabel="Cancel editing"
                    >
                      <X size={16} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text
                    style={[styles.memoryText, {color: colors.textPrimary}]}
                  >
                    {memory.text}
                  </Text>
                )}
              </View>

              {!isEditing ? (
                <View style={styles.rowActions}>
                  <TouchableOpacity
                    onPress={() => togglePin(memory)}
                    hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                    accessibilityRole="button"
                    accessibilityLabel={
                      memory.isPinned
                        ? `Unpin memory: ${memory.text}`
                        : `Pin memory: ${memory.text}`
                    }
                    testID={`memory-pin-${memory.id}`}
                  >
                    <Pin
                      size={15}
                      color={
                        memory.isPinned ? colors.blue : colors.textSecondary
                      }
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => startEdit(memory)}
                    hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit memory: ${memory.text}`}
                    testID={`memory-edit-${memory.id}`}
                  >
                    <Pencil size={15} color={colors.textSecondary} />
                  </TouchableOpacity>
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
              ) : null}
            </View>
          );
        })
      )}

      {memories.length > 0 ? (
        <TouchableOpacity
          onPress={forgetAll}
          accessibilityRole="button"
          accessibilityLabel="Forget everything"
          testID="memory-forget-all"
          style={styles.forgetAll}
        >
          <Text style={[styles.textButtonLabel, {color: colors.error}]}>
            Forget everything
          </Text>
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
  growthCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: Spacing.md,
    gap: 4,
  },
  growthTitle: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.body,
    fontWeight: '700',
  },
  growthLine: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    lineHeight: 17,
  },
  termRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 2,
  },
  updateCorLink: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.small,
    fontWeight: '700',
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingLeft: 10,
    marginBottom: Spacing.sm,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    gap: 6,
    marginBottom: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    paddingVertical: 6,
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
    alignItems: 'flex-start',
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
  },
  memoryMain: {
    flex: 1,
    gap: 4,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: Layout.borderRadiusPill,
  },
  metaBadgeText: {
    fontFamily: Fonts.body,
    fontSize: 11,
    fontWeight: '600',
  },
  memoryText: {
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  editInput: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 4,
  },
  forgetAll: {
    alignSelf: 'center',
    paddingVertical: Spacing.md,
  },
});
