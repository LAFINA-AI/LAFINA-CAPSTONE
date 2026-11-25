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
import {
  BellRing,
  Brain,
  Check,
  GraduationCap,
  Pencil,
  Pin,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react-native';
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
  reconcileEditedMemory,
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
  identity: 'About you',
  academic: 'School',
  study: 'Studying',
  goal: 'Goal',
  routine: 'Routine',
  general: 'Other',
};

const TIER_LABELS: Record<ChatMemory['tier'], string> = {
  core: 'Important',
  preference: 'Preference',
  episodic: 'From chats',
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
  const {colors, isModern, modernPalette} = useTheme();
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
        'COR added'
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
      reconcileEditedMemory(userId, updated);
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

  const CATEGORY_TONES: Record<MemoryCategory, string> = isModern
    ? {
        identity: modernPalette.accent,
        academic: modernPalette.blueInk,
        study: modernPalette.mintInk,
        goal: modernPalette.peachInk,
        routine: modernPalette.lilacInk,
        general: modernPalette.muted,
      }
    : {
        identity: colors.primary,
        academic: colors.blue,
        study: colors.success,
        goal: colors.warning,
        routine: colors.primary,
        general: colors.textSecondary,
      };
  const accent = isModern ? modernPalette.accent : colors.primary;
  const softAccent = isModern
    ? modernPalette.softViolet
    : mixColors(colors.primary, colors.cardBg, 0.1);
  const cardBg = isModern ? modernPalette.card : colors.cardBg;
  const surfaceBg = isModern ? modernPalette.surface : colors.inputBg;
  const borderInk = isModern ? modernPalette.border : colors.border;
  const ink = isModern ? modernPalette.text : colors.textPrimary;
  const muted = isModern ? modernPalette.muted : colors.textSecondary;

  const pinnedList = filteredMemories.filter(m => m.isPinned);
  const otherList = filteredMemories.filter(m => !m.isPinned);
  const learnedProgress =
    insights.samplesRequired > 0
      ? Math.min(1, insights.totalSamples / insights.samplesRequired)
      : 0;

  const renderMemory = (memory: ChatMemory) => {
    const isEditing = editingId === memory.id;
    const tone = CATEGORY_TONES[memory.category];
    return (
      <View
        key={memory.id}
        style={[
          styles.memoryCard,
          {
            backgroundColor: cardBg,
            borderColor: memory.isPinned ? accent : borderInk,
          },
        ]}
        testID={`memory-item-${memory.id}`}
      >
        <View style={styles.memoryTopRow}>
          <View
            style={[
              styles.categoryChip,
              {backgroundColor: mixColors(tone, cardBg, 0.14)},
            ]}
          >
            <Text style={[styles.categoryChipText, {color: tone}]}>
              {CATEGORY_LABELS[memory.category]}
            </Text>
          </View>
          {memory.isPinned ? (
            <View style={styles.pinnedTag}>
              <Pin size={11} color={accent} />
              <Text style={[styles.pinnedTagText, {color: accent}]}>
                Pinned
              </Text>
            </View>
          ) : null}
          {!isEditing ? (
            <View style={styles.rowActions}>
              <TouchableOpacity
                onPress={() => togglePin(memory)}
                hitSlop={{top: 8, bottom: 8, left: 6, right: 6}}
                accessibilityRole="button"
                accessibilityLabel={
                  memory.isPinned
                    ? `Unpin memory: ${memory.text}`
                    : `Pin memory: ${memory.text}`
                }
                testID={`memory-pin-${memory.id}`}
                style={[styles.iconButton, {backgroundColor: surfaceBg}]}
              >
                <Pin size={14} color={memory.isPinned ? accent : muted} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => startEdit(memory)}
                hitSlop={{top: 8, bottom: 8, left: 6, right: 6}}
                accessibilityRole="button"
                accessibilityLabel={`Edit memory: ${memory.text}`}
                testID={`memory-edit-${memory.id}`}
                style={[styles.iconButton, {backgroundColor: surfaceBg}]}
              >
                <Pencil size={14} color={muted} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => removeMemory(memory)}
                hitSlop={{top: 8, bottom: 8, left: 6, right: 6}}
                accessibilityRole="button"
                accessibilityLabel={`Delete memory: ${memory.text}`}
                testID={`memory-delete-${memory.id}`}
                style={[styles.iconButton, {backgroundColor: surfaceBg}]}
              >
                <Trash2 size={14} color={colors.error} />
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        {isEditing ? (
          <View style={styles.editRow}>
            <TextInput
              value={editingDraft}
              onChangeText={setEditingDraft}
              maxLength={MAX_MEMORY_TEXT}
              multiline
              style={[
                styles.editInput,
                {color: ink, borderColor: accent, backgroundColor: surfaceBg},
              ]}
              testID={`memory-edit-input-${memory.id}`}
              onSubmitEditing={() => saveEdit(memory)}
            />
            <View style={styles.editButtons}>
              <TouchableOpacity
                onPress={() => {
                  setEditingId(null);
                  setEditingDraft('');
                }}
                accessibilityRole="button"
                accessibilityLabel="Cancel editing"
                style={[styles.smallButton, {borderColor: borderInk}]}
              >
                <Text style={[styles.smallButtonText, {color: muted}]}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => saveEdit(memory)}
                accessibilityRole="button"
                accessibilityLabel={`Save memory: ${memory.text}`}
                testID={`memory-edit-save-${memory.id}`}
                style={[
                  styles.smallButton,
                  {backgroundColor: accent, borderColor: accent},
                ]}
              >
                <Check size={14} color="#FFFFFF" />
                <Text style={[styles.smallButtonText, {color: '#FFFFFF'}]}>
                  Save
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <Text style={[styles.memoryText, {color: ink}]}>{memory.text}</Text>
        )}
      </View>
    );
  };

  return (
    <ToolSheet
      visible={visible}
      title="What LAFINA remembers"
      onClose={onClose}
    >
      <View
        style={[
          styles.introCard,
          {backgroundColor: softAccent, borderColor: borderInk},
        ]}
      >
        <View style={[styles.introIcon, {backgroundColor: cardBg}]}>
          <Brain size={20} color={accent} />
        </View>
        <View style={styles.flex}>
          <Text style={[styles.introTitle, {color: ink}]}>
            LAFINA remembers helpful things you share
          </Text>
          <Text style={[styles.introBody, {color: muted}]}>
            Like your course, your routine or how you like answers.
          </Text>
          <View style={styles.introPoint}>
            <ShieldCheck size={13} color={accent} />
            <Text style={[styles.introPointText, {color: muted}]}>
              Passwords and codes are never saved.
            </Text>
          </View>
          <View style={styles.introPoint}>
            <Pencil size={13} color={accent} />
            <Text style={[styles.introPointText, {color: muted}]}>
              You can edit or delete anything below.
            </Text>
          </View>
          {isGuest ? (
            <Text style={[styles.introGuest, {color: accent}]}>
              Sign in to use this in online chat.
            </Text>
          ) : null}
        </View>
      </View>

      <View
        style={[
          styles.switchCard,
          {backgroundColor: cardBg, borderColor: borderInk},
        ]}
      >
        <View style={styles.flex}>
          <Text style={[styles.label, {color: ink}]}>
            Remember things from chats
          </Text>
          <Text style={[styles.switchHint, {color: muted}]}>
            Works when you chat online
          </Text>
        </View>
        <Switch
          value={enabled}
          onValueChange={toggle}
          accessibilityLabel="Remember things from chats"
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
            {borderColor: borderInk, backgroundColor: cardBg},
          ]}
        >
          <Text style={[styles.sectionTitle, {color: ink}]}>
            What LAFINA has learned
          </Text>
          <View style={styles.statRow}>
            <StatTile
              value={stats.total}
              label="Saved"
              ink={ink}
              muted={muted}
              bg={surfaceBg}
            />
            <StatTile
              value={stats.pinned}
              label="Pinned"
              ink={ink}
              muted={muted}
              bg={surfaceBg}
            />
            <StatTile
              value={stats.byTier.episodic}
              label="From chats"
              ink={ink}
              muted={muted}
              bg={surfaceBg}
            />
          </View>

          <View style={styles.habitBlock}>
            <View style={styles.habitHeader}>
              <BellRing size={14} color={accent} />
              <Text style={[styles.habitTitle, {color: ink}]}>
                Your reminder habits
              </Text>
            </View>
            {insights.mlReady ? (
              <>
                <Text style={[styles.habitLine, {color: muted}]}>
                  You answer{' '}
                  <Text style={[styles.bold, {color: ink}]}>
                    {Math.round(insights.recentAckRate * 100)}%
                  </Text>{' '}
                  of recent reminders.
                </Text>
                <Text style={[styles.habitLine, {color: muted}]}>
                  You respond best to{' '}
                  <Text style={[styles.bold, {color: ink}]}>
                    {insights.preferredChannel === 'call'
                      ? 'calls'
                      : 'notifications'}
                  </Text>
                  {insights.bestResponseWindow ? (
                    <>
                      , mostly in the{' '}
                      <Text style={[styles.bold, {color: ink}]}>
                        {insights.bestResponseWindow}
                      </Text>
                    </>
                  ) : null}
                  .
                </Text>
              </>
            ) : (
              <>
                <Text style={[styles.habitLine, {color: muted}]}>
                  Still learning:{' '}
                  <Text style={[styles.bold, {color: ink}]}>
                    {insights.totalSamples} of {insights.samplesRequired}
                  </Text>{' '}
                  reminders answered so far.
                </Text>
                <View
                  style={[styles.progressTrack, {backgroundColor: surfaceBg}]}
                >
                  <View
                    style={[
                      styles.progressFill,
                      {
                        backgroundColor: accent,
                        width: `${Math.round(learnedProgress * 100)}%`,
                      },
                    ]}
                  />
                </View>
              </>
            )}
          </View>

          {academicTerm ? (
            <View style={[styles.termRow, {borderTopColor: borderInk}]}>
              <GraduationCap size={14} color={accent} />
              <Text style={[styles.habitLine, styles.flex, {color: muted}]}>
                Using your COR:{' '}
                <Text style={[styles.bold, {color: ink}]}>{academicTerm}</Text>
              </Text>
              {onUpdateCor ? (
                <TouchableOpacity
                  onPress={onUpdateCor}
                  testID="memory-update-cor"
                  accessibilityRole="button"
                >
                  <Text style={[styles.updateCorLink, {color: accent}]}>
                    Update COR
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      <Text style={[styles.sectionTitle, {color: ink}]}>Add something</Text>
      <View
        style={[
          styles.addRow,
          {borderColor: borderInk, backgroundColor: cardBg},
        ]}
      >
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="e.g. I prefer short answers"
          placeholderTextColor={muted}
          maxLength={MAX_MEMORY_TEXT}
          style={[styles.input, {color: ink}]}
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
          style={[
            styles.addButton,
            {backgroundColor: draft.trim() ? accent : surfaceBg},
          ]}
        >
          <Plus size={18} color={draft.trim() ? '#FFFFFF' : muted} />
        </TouchableOpacity>
      </View>

      {notice ? (
        <Text
          style={[styles.notice, {color: colors.error}]}
          testID="memory-notice"
        >
          {notice}
        </Text>
      ) : null}

      <View style={styles.listHeader}>
        <Text style={[styles.sectionTitle, styles.flex, {color: ink}]}>
          Saved memories
        </Text>
        {memories.length > 0 ? (
          <Text style={[styles.countText, {color: muted}]}>
            {memories.length}
          </Text>
        ) : null}
      </View>

      {memories.length >= 4 || searchQuery.length > 0 ? (
        <View
          style={[
            styles.searchRow,
            {borderColor: borderInk, backgroundColor: surfaceBg},
          ]}
        >
          <Search size={15} color={muted} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search memories"
            placeholderTextColor={muted}
            style={[styles.searchInput, {color: ink}]}
            testID="memory-search-input"
          />
          {searchQuery ? (
            <TouchableOpacity
              onPress={() => setSearchQuery('')}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <X size={15} color={muted} />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {memories.length === 0 ? (
        <View
          style={[styles.emptyCard, {borderColor: borderInk}]}
          testID="memory-empty"
        >
          <Brain size={22} color={muted} />
          <Text style={[styles.emptyTitle, {color: ink}]}>
            Nothing remembered yet
          </Text>
          <Text style={[styles.empty, {color: muted}]}>
            Add something above, or just chat with LAFINA.
          </Text>
        </View>
      ) : filteredMemories.length === 0 ? (
        <Text style={[styles.empty, {color: muted}]}>
          Nothing matches "{searchQuery}".
        </Text>
      ) : (
        <View style={styles.memoryList}>
          {pinnedList.map(renderMemory)}
          {otherList.map(renderMemory)}
        </View>
      )}

      {memories.length > 0 ? (
        <TouchableOpacity
          onPress={forgetAll}
          accessibilityRole="button"
          accessibilityLabel="Forget everything"
          testID="memory-forget-all"
          style={[styles.forgetAll, {borderColor: colors.error}]}
        >
          <Trash2 size={15} color={colors.error} />
          <Text style={[styles.forgetAllText, {color: colors.error}]}>
            Forget everything
          </Text>
        </TouchableOpacity>
      ) : null}
    </ToolSheet>
  );
};

const StatTile: React.FC<{
  value: number;
  label: string;
  ink: string;
  muted: string;
  bg: string;
}> = ({value, label, ink, muted, bg}) => (
  <View style={[styles.statTile, {backgroundColor: bg}]}>
    <Text style={[styles.statValue, {color: ink}]}>{value}</Text>
    <Text style={[styles.statLabel, {color: muted}]}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  flex: {flex: 1},
  bold: {fontWeight: '700'},
  introCard: {
    flexDirection: 'row',
    gap: 12,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: Spacing.md,
  },
  introIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  introTitle: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.body,
    fontWeight: '700',
    marginBottom: 2,
  },
  introBody: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    lineHeight: 18,
    marginBottom: 8,
  },
  introPoint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  introPointText: {
    fontFamily: Fonts.body,
    fontSize: 12.5,
    flex: 1,
  },
  introGuest: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.small,
    fontWeight: '700',
    marginTop: 8,
  },
  switchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: Spacing.md,
  },
  label: {
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
    fontWeight: '600',
  },
  switchHint: {
    fontFamily: Fonts.body,
    fontSize: 12.5,
    marginTop: 2,
  },
  sectionTitle: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.body,
    fontWeight: '700',
    marginBottom: 8,
  },
  growthCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: Spacing.lg,
  },
  statRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statTile: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  statValue: {
    fontFamily: Fonts.heading,
    fontSize: 20,
    fontWeight: '700',
  },
  statLabel: {
    fontFamily: Fonts.body,
    fontSize: 12,
    marginTop: 2,
  },
  habitBlock: {
    marginTop: 14,
    gap: 4,
  },
  habitHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  habitTitle: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.small,
    fontWeight: '700',
  },
  habitLine: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    lineHeight: 19,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 6,
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
  },
  termRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
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
    borderRadius: 14,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 4,
    marginBottom: Spacing.md,
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
    paddingVertical: 8,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  countText: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    marginBottom: 8,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    gap: 8,
    marginBottom: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    paddingVertical: 8,
  },
  notice: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    marginBottom: Spacing.sm,
  },
  emptyCard: {
    alignItems: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 14,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.md,
    gap: 4,
  },
  emptyTitle: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.body,
    fontWeight: '700',
    marginTop: 4,
  },
  empty: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    textAlign: 'center',
    paddingVertical: 4,
  },
  memoryList: {
    gap: 10,
  },
  memoryCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  memoryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: Layout.borderRadiusPill,
  },
  categoryChipText: {
    fontFamily: Fonts.body,
    fontSize: 11.5,
    fontWeight: '700',
  },
  pinnedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  pinnedTagText: {
    fontFamily: Fonts.body,
    fontSize: 11.5,
    fontWeight: '700',
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 'auto',
  },
  iconButton: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memoryText: {
    fontFamily: Fonts.body,
    fontSize: 15,
    lineHeight: 21,
  },
  editRow: {
    gap: 8,
  },
  editInput: {
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 44,
  },
  editButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  smallButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  smallButtonText: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.small,
    fontWeight: '700',
  },
  forgetAll: {
    flexDirection: 'row',
    alignSelf: 'center',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 9,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  forgetAllText: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.small,
    fontWeight: '700',
  },
});
