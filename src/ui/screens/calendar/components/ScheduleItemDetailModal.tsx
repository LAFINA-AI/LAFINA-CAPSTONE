import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {reminderDescriptionText} from '../../../../utils/reminderDescription';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  BookOpen,
  Calendar as CalendarIcon,
  CheckCircle2,
  Circle,
  Clock,
  ExternalLink,
  FileText,
  Globe,
  Link2,
  MapPin,
  Pencil,
  Plus,
  Repeat,
  StickyNote,
  Tag,
  Trash2,
  User,
  Users,
  X,
} from 'lucide-react-native';
import type {
  ScheduleAttachedEntry,
  ScheduleEntryType,
  Task,
  TimeBlock,
} from '../../../../storage';
import {
  baseScheduleEntityId,
  deviceTimeZone,
  extractUrlsFromText,
  normalizeEntryUrl,
  parseClassBlockMetadata,
  resolveScheduleEntryTarget,
  scheduleEntriesStore,
} from '../../../../storage';
import type {ScheduleTimelineItem} from '../types';
import {
  formatLocalDate,
  formatRecurrenceSummary,
  reminderLocalDate,
} from '../utils/calendarHelpers';
import {
  formatBirthdayMonthDay,
  parseBirthdayEvent,
} from '../utils/calendarGroups';
import {groupClassBlocks} from '../utils/classScheduleHelpers';
import {describeHoliday} from '../utils/philippineHolidays';
import {
  USTP_ACADEMIC_YEAR,
  USTP_AUDIENCE_LABELS,
  USTP_CALENDAR_SOURCE_LABEL,
  USTP_CATEGORY_LABELS,
  USTP_TERM_LABELS,
  formatUstpDateRange,
} from '../utils/ustpAcademicCalendar';
import {scheduleCardShadow, useSchedulePalette} from './schedulePalette';

export interface ScheduleItemDetailModalProps {
  visible: boolean;
  userId: string;
  item: ScheduleTimelineItem | null;
  selectedDate: Date;
  allBlocks: TimeBlock[];
  onClose: () => void;
  onEditSchedule: (item: ScheduleTimelineItem) => void;
  onToggleTask?: (task: Task) => void;
  onEntriesChanged?: () => void;
}

interface DetailRow {
  key: string;
  label: string;
  value: string;
  icon: React.ReactNode;
}

const formatDisplayDate = (dateStr: string): string => {
  const parsed = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateStr;
  return parsed.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const resolveItemDateString = (
  item: ScheduleTimelineItem,
  selectedDate: Date,
): string => {
  if (item.rawHoliday?.date) return item.rawHoliday.date;
  if (item.rawUstpEvent?.date) return item.rawUstpEvent.date;
  if (item.rawEvent?.date) return item.rawEvent.date;
  if (item.rawBlock?.date) return item.rawBlock.date;
  if (item.rawTask?.dueDate) return item.rawTask.dueDate;
  if (item.rawReminder) {
    const remDate = reminderLocalDate(item.rawReminder);
    if (remDate) return remDate;
  }
  return formatLocalDate(selectedDate);
};

export const ScheduleItemDetailModal: React.FC<
  ScheduleItemDetailModalProps
> = ({
  visible,
  userId,
  item,
  selectedDate,
  allBlocks,
  onClose,
  onEditSchedule,
  onToggleTask,
  onEntriesChanged,
}) => {
  const palette = useSchedulePalette();
  const [entries, setEntries] = useState<ScheduleAttachedEntry[]>([]);
  const [composerMode, setComposerMode] = useState<ScheduleEntryType | null>(
    null,
  );
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [entryTitle, setEntryTitle] = useState('');
  const [entryContent, setEntryContent] = useState('');
  const [composerError, setComposerError] = useState<string | null>(null);

  const target = useMemo(
    () => (item ? resolveScheduleEntryTarget(item) : null),
    [item],
  );

  const loadEntries = useCallback(() => {
    if (!target) {
      setEntries([]);
      return;
    }
    setEntries(
      scheduleEntriesStore.getForTarget(
        userId,
        target.targetId,
        target.fallbackIds,
      ),
    );
  }, [userId, target]);

  useEffect(() => {
    if (!visible || !item) {
      setComposerMode(null);
      setEditingEntryId(null);
      setEntryTitle('');
      setEntryContent('');
      setComposerError(null);
      return;
    }
    loadEntries();
    setComposerMode(null);
    setEditingEntryId(null);
    setEntryTitle('');
    setEntryContent('');
    setComposerError(null);
  }, [visible, item, loadEntries]);

  const handleOpenUrl = useCallback(async (rawUrl: string) => {
    const normalized = normalizeEntryUrl(rawUrl);
    if (!normalized) return;
    if (!/^(https?|mailto|tel):/i.test(normalized)) {
      Alert.alert(
        'Unsupported Link',
        'Only http, https, mailto, or tel links can be opened.',
      );
      return;
    }
    try {
      await Linking.openURL(normalized);
    } catch {
      Alert.alert('Could Not Open Link', `Unable to open ${normalized}`);
    }
  }, []);

  const openAddComposer = (type: ScheduleEntryType) => {
    setComposerMode(type);
    setEditingEntryId(null);
    setEntryTitle('');
    setEntryContent('');
    setComposerError(null);
  };

  const openEditComposer = (entry: ScheduleAttachedEntry) => {
    setComposerMode(entry.entryType);
    setEditingEntryId(entry.id);
    setEntryTitle(entry.title);
    setEntryContent(entry.content);
    setComposerError(null);
  };

  const cancelComposer = () => {
    setComposerMode(null);
    setEditingEntryId(null);
    setEntryTitle('');
    setEntryContent('');
    setComposerError(null);
  };

  const handleSaveEntry = () => {
    if (!composerMode || !target) return;
    const trimmed = entryContent.trim();
    if (!trimmed) {
      setComposerError(
        composerMode === 'link'
          ? 'Please enter a link URL.'
          : 'Please enter a note.',
      );
      return;
    }
    if (composerMode === 'link') {
      const normalized = normalizeEntryUrl(trimmed);
      if (!/^(https?|mailto|tel):/i.test(normalized)) {
        setComposerError(
          'Enter a valid web URL (http:// or https://), mailto:, or tel: link.',
        );
        return;
      }
    }

    try {
      if (editingEntryId) {
        scheduleEntriesStore.updateEntry(userId, editingEntryId, {
          entryType: composerMode,
          title: entryTitle,
          content: trimmed,
        });
      } else {
        scheduleEntriesStore.addEntry({
          userId,
          targetKind: target.targetKind,
          targetId: target.targetId,
          entryType: composerMode,
          title: entryTitle,
          content: trimmed,
        });
      }
      loadEntries();
      onEntriesChanged?.();
      cancelComposer();
    } catch (error) {
      setComposerError(
        error instanceof Error ? error.message : 'Could not save entry.',
      );
    }
  };

  const handleDeleteEntry = (entryId: string) => {
    scheduleEntriesStore.deleteEntry(userId, entryId);
    if (editingEntryId === entryId) {
      cancelComposer();
    }
    loadEntries();
    onEntriesChanged?.();
  };

  const {detailRows, legacyNoteText} = useMemo(() => {
    if (!item) return {detailRows: [] as DetailRow[], legacyNoteText: null};

    const rows: DetailRow[] = [];
    let legacyNote: string | null = null;
    const iconColor = palette.muted;

    if (item.kind === 'block' && item.rawBlock) {
      const block = item.rawBlock;
      const isClass = block.category.trim().toLowerCase() === 'class';

      if (isClass) {
        const groups = groupClassBlocks(allBlocks);
        const baseId = baseScheduleEntityId(block.id);
        const group =
          groups.find(g =>
            g.blocks.some(b => baseScheduleEntityId(b.id) === baseId),
          ) ??
          groups.find(
            g =>
              g.displayTitle.trim().toLowerCase() ===
                block.title.trim().toLowerCase() &&
              g.startTime === block.startTime &&
              g.endTime === block.endTime,
          );
        const meta = parseClassBlockMetadata(block.notes);
        const code = group?.code || '';
        const room = meta.room && meta.room !== 'TBA' ? meta.room : '';
        const section = meta.section || '';
        const faculty =
          meta.faculty && meta.faculty !== 'TBA' ? meta.faculty : '';

        if (code) {
          rows.push({
            key: 'class-code',
            label: 'Course Code',
            value: code,
            icon: <BookOpen size={15} color={iconColor} />,
          });
        }
        if (group?.daysLabel) {
          rows.push({
            key: 'class-days',
            label: 'Class Days',
            value: group.daysLabel,
            icon: <CalendarIcon size={15} color={iconColor} />,
          });
        }
        if (room) {
          rows.push({
            key: 'class-room',
            label: 'Room',
            value: room,
            icon: <MapPin size={15} color={iconColor} />,
          });
        }
        if (section) {
          rows.push({
            key: 'class-section',
            label: 'Section',
            value: section,
            icon: <Users size={15} color={iconColor} />,
          });
        }
        if (faculty) {
          rows.push({
            key: 'class-faculty',
            label: 'Instructor',
            value: faculty,
            icon: <User size={15} color={iconColor} />,
          });
        }
        const recSummary = formatRecurrenceSummary(block.recurrenceRule);
        if (recSummary) {
          rows.push({
            key: 'class-recurrence',
            label: 'Schedule',
            value:
              group?.recurrenceMode === 'weekly'
                ? `Weekly (${recSummary})`
                : recSummary,
            icon: <Repeat size={15} color={iconColor} />,
          });
        }
      } else {
        if (block.category?.trim()) {
          rows.push({
            key: 'block-category',
            label: 'Category',
            value: block.category.trim(),
            icon: <Tag size={15} color={iconColor} />,
          });
        }
        const recSummary = formatRecurrenceSummary(block.recurrenceRule);
        if (recSummary) {
          rows.push({
            key: 'block-recurrence',
            label: 'Repeats',
            value: recSummary,
            icon: <Repeat size={15} color={iconColor} />,
          });
        }
        if (block.notes?.trim()) {
          legacyNote = block.notes.trim();
        }
      }
    } else if (item.kind === 'event' && item.rawEvent) {
      const ev = item.rawEvent;
      if (ev.location?.trim()) {
        rows.push({
          key: 'event-location',
          label: 'Location',
          value: ev.location.trim(),
          icon: <MapPin size={15} color={iconColor} />,
        });
      }
      const recSummary = formatRecurrenceSummary(ev.recurrenceRule);
      if (recSummary) {
        rows.push({
          key: 'event-recurrence',
          label: 'Repeats',
          value: recSummary,
          icon: <Repeat size={15} color={iconColor} />,
        });
      }
      const hereZone = deviceTimeZone();
      if (
        ev.timeZone?.trim() &&
        (!hereZone || ev.timeZone.trim() !== hereZone)
      ) {
        rows.push({
          key: 'event-timezone',
          label: 'Timezone',
          value: ev.timeZone.trim(),
          icon: <Globe size={15} color={iconColor} />,
        });
      }
    } else if (item.kind === 'task' && item.rawTask) {
      const task = item.rawTask;
      const todayStr = formatLocalDate(new Date());
      const isOverdue =
        !task.isCompleted &&
        Boolean(task.dueDate) &&
        (task.dueDate as string) < todayStr;
      rows.push({
        key: 'task-status',
        label: 'Status',
        value: task.isCompleted
          ? 'Completed'
          : isOverdue
          ? 'Overdue'
          : 'Pending',
        icon: <CheckCircle2 size={15} color={iconColor} />,
      });
      if (task.priority) {
        rows.push({
          key: 'task-priority',
          label: 'Priority',
          value: task.priority,
          icon: <Tag size={15} color={iconColor} />,
        });
      }
      if (task.category?.trim()) {
        rows.push({
          key: 'task-category',
          label: 'Category',
          value: task.category.trim(),
          icon: <Tag size={15} color={iconColor} />,
        });
      }
      const recSummary = formatRecurrenceSummary(task.recurrenceRule);
      if (recSummary) {
        rows.push({
          key: 'task-recurrence',
          label: 'Repeats',
          value: recSummary,
          icon: <Repeat size={15} color={iconColor} />,
        });
      }
      if (task.notes?.trim()) {
        legacyNote = task.notes.trim();
      }
    } else if (item.kind === 'birthday' && item.rawEvent) {
      const parsed = parseBirthdayEvent(item.rawEvent);
      if (parsed) {
        rows.push({
          key: 'bday-person',
          label: 'Person',
          value: parsed.personName,
          icon: <User size={15} color={iconColor} />,
        });
        rows.push({
          key: 'bday-date',
          label: 'Date',
          value: formatBirthdayMonthDay(parsed.month, parsed.day),
          icon: <CalendarIcon size={15} color={iconColor} />,
        });
        const targetYear = selectedDate.getFullYear();
        if (parsed.birthYear && targetYear > parsed.birthYear) {
          rows.push({
            key: 'bday-age',
            label: 'Turning',
            value: `${targetYear - parsed.birthYear} years old`,
            icon: <Clock size={15} color={iconColor} />,
          });
        }
        if (parsed.relation) {
          rows.push({
            key: 'bday-relation',
            label: 'Relation',
            value: parsed.relation,
            icon: <Users size={15} color={iconColor} />,
          });
        }
        if (parsed.notes) {
          legacyNote = parsed.notes;
        }
      }
    } else if (item.kind === 'holiday' && item.rawHoliday) {
      const lines = describeHoliday(item.rawHoliday).split('\n');
      if (lines[1]) {
        rows.push({
          key: 'holiday-kind',
          label: 'Holiday Type',
          value: lines[1],
          icon: <CalendarIcon size={15} color={iconColor} />,
        });
      }
    } else if (item.kind === 'ustp_event' && item.rawUstpEvent) {
      const ev = item.rawUstpEvent.event;
      rows.push({
        key: 'ustp-term',
        label: 'Academic Term',
        value: `${USTP_TERM_LABELS[ev.term]} · ${USTP_ACADEMIC_YEAR}`,
        icon: <BookOpen size={15} color={iconColor} />,
      });
      rows.push({
        key: 'ustp-dates',
        label: 'Scheduled Dates',
        value: formatUstpDateRange(ev.startDate, ev.endDate),
        icon: <CalendarIcon size={15} color={iconColor} />,
      });
      rows.push({
        key: 'ustp-audience',
        label: 'Audience',
        value: `${USTP_AUDIENCE_LABELS[ev.audience]} · ${
          USTP_CATEGORY_LABELS[ev.category]
        }`,
        icon: <Users size={15} color={iconColor} />,
      });
      rows.push({
        key: 'ustp-source',
        label: 'Source',
        value: `${USTP_CALENDAR_SOURCE_LABEL} (PDF p. ${ev.pdfPage})`,
        icon: <FileText size={15} color={iconColor} />,
      });
      const noteParts = [ev.description, ev.caveatNote].filter(Boolean);
      if (noteParts.length > 0) {
        legacyNote = noteParts.join('\n\n');
      }
    } else if (item.kind === 'reminder' && item.rawReminder) {
      const rem = item.rawReminder;
      if (rem.status) {
        rows.push({
          key: 'rem-status',
          label: 'Status',
          value: rem.status.charAt(0).toUpperCase() + rem.status.slice(1),
          icon: <Clock size={15} color={iconColor} />,
        });
      }
      const desc = reminderDescriptionText(rem.description);
      if (desc && desc !== 'Scheduled reminder') {
        legacyNote = desc;
      }
    }

    return {detailRows: rows, legacyNoteText: legacyNote};
  }, [item, allBlocks, palette.muted, selectedDate]);

  if (!visible || !item) {
    return null;
  }

  const badgeColor = item.accentColor || palette.accent;
  const dateLabel = formatDisplayDate(
    resolveItemDateString(item, selectedDate),
  );
  const isCompletedTask =
    item.kind === 'task' && Boolean(item.rawTask?.isCompleted);
  const editButtonLabel =
    item.kind === 'holiday'
      ? 'All Holidays'
      : item.kind === 'ustp_event'
      ? 'All USTP Dates'
      : item.kind === 'reminder'
      ? 'Delete'
      : 'Edit';
  const legacyNoteUrls = legacyNoteText
    ? extractUrlsFromText(legacyNoteText)
    : [];
  const hasGeneralDetails = detailRows.length > 0 || Boolean(legacyNoteText);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View
          testID="schedule-item-detail-modal"
          style={[
            styles.sheet,
            {
              backgroundColor: palette.bg,
              borderColor: palette.border,
            },
          ]}
        >
          {/* Header */}
          <View
            style={[
              styles.header,
              {
                backgroundColor: palette.card,
                borderBottomColor: palette.border,
              },
            ]}
          >
            <View
              style={[
                styles.categoryBadge,
                {backgroundColor: `${badgeColor}18`},
              ]}
            >
              <View
                style={[styles.categoryDot, {backgroundColor: badgeColor}]}
              />
              <Text
                numberOfLines={1}
                style={[styles.categoryBadgeText, {color: badgeColor}]}
              >
                {item.categoryLabel}
              </Text>
            </View>

            <View style={styles.headerActions}>
              <TouchableOpacity
                testID="schedule-detail-edit-button"
                onPress={() => onEditSchedule(item)}
                accessibilityRole="button"
                accessibilityLabel={
                  editButtonLabel === 'Edit' ? 'Edit schedule' : editButtonLabel
                }
                style={[
                  styles.editBtn,
                  {
                    backgroundColor:
                      item.kind === 'reminder'
                        ? palette.dangerSoft
                        : palette.surface,
                    borderColor: palette.border,
                  },
                ]}
              >
                {item.kind === 'reminder' ? (
                  <Trash2 size={14} color={palette.danger} />
                ) : (
                  <Pencil size={14} color={palette.text} />
                )}
                <Text
                  style={[
                    styles.editBtnText,
                    {
                      color:
                        item.kind === 'reminder'
                          ? palette.danger
                          : palette.text,
                    },
                  ]}
                >
                  {editButtonLabel}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                testID="schedule-detail-close-button"
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close schedule details"
                style={[styles.closeBtn, {backgroundColor: palette.surface}]}
              >
                <X size={18} color={palette.muted} />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Title & Time Hero */}
            <View style={styles.heroBlock}>
              <Text
                testID="schedule-detail-title"
                style={[
                  styles.heroTitle,
                  {
                    color: palette.text,
                    textDecorationLine: isCompletedTask
                      ? 'line-through'
                      : 'none',
                    opacity: isCompletedTask ? 0.72 : 1,
                  },
                ]}
              >
                {item.title}
              </Text>
              <View style={styles.heroMetaRow}>
                <Clock size={14} color={palette.muted} />
                <Text
                  testID="schedule-detail-datetime"
                  style={[styles.heroMetaText, {color: palette.muted}]}
                >
                  {`${dateLabel} · ${item.timeLabel}`}
                </Text>
              </View>

              {item.kind === 'task' && item.rawTask && onToggleTask && (
                <TouchableOpacity
                  testID="schedule-detail-toggle-task"
                  onPress={() => onToggleTask(item.rawTask!)}
                  activeOpacity={0.78}
                  style={[
                    styles.taskStatusPill,
                    {
                      backgroundColor: isCompletedTask
                        ? palette.mint
                        : palette.surface,
                      borderColor: isCompletedTask
                        ? palette.mintInk
                        : palette.border,
                    },
                  ]}
                >
                  {isCompletedTask ? (
                    <CheckCircle2 size={15} color={palette.mintInk} />
                  ) : (
                    <Circle size={15} color={palette.muted} />
                  )}
                  <Text
                    style={[
                      styles.taskStatusPillText,
                      {
                        color: isCompletedTask ? palette.mintInk : palette.text,
                      },
                    ]}
                  >
                    {isCompletedTask ? 'Completed' : 'Mark as Done'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* General Details Card (only rendered if this schedule has metadata) */}
            {hasGeneralDetails && (
              <View style={styles.sectionBlock}>
                <Text style={[styles.sectionLabel, {color: palette.muted}]}>
                  GENERAL DETAILS
                </Text>
                <View
                  testID="schedule-detail-general-card"
                  style={[
                    styles.card,
                    {
                      backgroundColor: palette.card,
                      borderColor: palette.border,
                    },
                    !palette.isDarkMode && scheduleCardShadow,
                  ]}
                >
                  {detailRows.map((row, idx) => (
                    <View
                      key={row.key}
                      style={[
                        styles.detailRow,
                        idx > 0 && {
                          borderTopWidth: StyleSheet.hairlineWidth,
                          borderTopColor: palette.border,
                        },
                      ]}
                    >
                      <View style={styles.detailRowLeft}>
                        {row.icon}
                        <Text
                          style={[
                            styles.detailRowLabel,
                            {color: palette.muted},
                          ]}
                        >
                          {row.label}
                        </Text>
                      </View>
                      <Text
                        style={[styles.detailRowValue, {color: palette.text}]}
                      >
                        {row.value}
                      </Text>
                    </View>
                  ))}

                  {legacyNoteText && (
                    <View
                      style={[
                        styles.legacyNoteBlock,
                        detailRows.length > 0 && {
                          borderTopWidth: StyleSheet.hairlineWidth,
                          borderTopColor: palette.border,
                        },
                      ]}
                    >
                      <View style={styles.legacyNoteHeader}>
                        <FileText size={14} color={palette.muted} />
                        <Text
                          style={[
                            styles.detailRowLabel,
                            {color: palette.muted},
                          ]}
                        >
                          Saved Note
                        </Text>
                      </View>
                      <Text
                        style={[styles.legacyNoteText, {color: palette.text}]}
                      >
                        {legacyNoteText}
                      </Text>
                      {legacyNoteUrls.length > 0 && (
                        <View style={styles.detectedLinksRow}>
                          {legacyNoteUrls.map(url => (
                            <TouchableOpacity
                              key={url}
                              onPress={() => void handleOpenUrl(url)}
                              style={[
                                styles.detectedLinkChip,
                                {
                                  backgroundColor: palette.surface,
                                  borderColor: palette.border,
                                },
                              ]}
                            >
                              <Link2 size={12} color={palette.accent} />
                              <Text
                                numberOfLines={1}
                                style={[
                                  styles.detectedLinkText,
                                  {color: palette.accent},
                                ]}
                              >
                                {url}
                              </Text>
                              <ExternalLink size={11} color={palette.accent} />
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* Attached Notes & Links Section */}
            <View
              testID="schedule-detail-entries-section"
              style={styles.sectionBlock}
            >
              <View style={styles.entriesHeaderRow}>
                <View>
                  <Text style={[styles.sectionLabel, {color: palette.muted}]}>
                    NOTES & LINKS
                  </Text>
                  {target?.isSharedAcrossSessions && (
                    <Text
                      style={[styles.sharedCaption, {color: palette.muted}]}
                    >
                      {target.targetKind === 'class_group'
                        ? 'Attached to all sessions of this class'
                        : 'Shared across recurring occurrences'}
                    </Text>
                  )}
                </View>
                <View style={styles.addButtonsRow}>
                  <TouchableOpacity
                    testID="schedule-detail-add-note-btn"
                    onPress={() => openAddComposer('note')}
                    style={[
                      styles.addChipBtn,
                      {
                        backgroundColor: palette.card,
                        borderColor: palette.border,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Add note to schedule"
                  >
                    <Plus size={13} color={palette.accent} />
                    <Text style={[styles.addChipText, {color: palette.text}]}>
                      Add Note
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID="schedule-detail-add-link-btn"
                    onPress={() => openAddComposer('link')}
                    style={[
                      styles.addChipBtn,
                      {
                        backgroundColor: palette.card,
                        borderColor: palette.border,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Add link to schedule"
                  >
                    <Link2 size={13} color={palette.accent} />
                    <Text style={[styles.addChipText, {color: palette.text}]}>
                      Add Link
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Inline Add / Edit Composer */}
              {composerMode && (
                <View
                  testID="schedule-entry-composer"
                  style={[
                    styles.card,
                    styles.composerCard,
                    {
                      backgroundColor: palette.card,
                      borderColor: palette.accent,
                    },
                    !palette.isDarkMode && scheduleCardShadow,
                  ]}
                >
                  <Text style={[styles.composerTitle, {color: palette.text}]}>
                    {editingEntryId
                      ? composerMode === 'link'
                        ? 'Edit Link'
                        : 'Edit Note'
                      : composerMode === 'link'
                      ? 'Attach Link'
                      : 'Attach Note'}
                  </Text>
                  <TextInput
                    testID="schedule-entry-title-input"
                    value={entryTitle}
                    onChangeText={val => {
                      setComposerError(null);
                      setEntryTitle(val);
                    }}
                    placeholder={
                      composerMode === 'link'
                        ? 'Label (e.g., Google Meet, Canvas)...'
                        : 'Title (optional)...'
                    }
                    placeholderTextColor={palette.muted}
                    style={[
                      styles.composerInput,
                      {
                        backgroundColor: palette.surface,
                        borderColor: palette.border,
                        color: palette.text,
                      },
                    ]}
                  />
                  <TextInput
                    testID="schedule-entry-content-input"
                    value={entryContent}
                    onChangeText={val => {
                      setComposerError(null);
                      setEntryContent(val);
                    }}
                    placeholder={
                      composerMode === 'link'
                        ? 'https://meet.google.com/...'
                        : 'Write a note or paste a link...'
                    }
                    placeholderTextColor={palette.muted}
                    multiline={composerMode === 'note'}
                    numberOfLines={composerMode === 'note' ? 3 : 1}
                    autoCapitalize={
                      composerMode === 'link' ? 'none' : 'sentences'
                    }
                    autoCorrect={composerMode === 'note'}
                    keyboardType={composerMode === 'link' ? 'url' : 'default'}
                    style={[
                      styles.composerInput,
                      composerMode === 'note' && styles.composerTextarea,
                      {
                        backgroundColor: palette.surface,
                        borderColor: palette.border,
                        color: palette.text,
                      },
                    ]}
                  />
                  {composerError && (
                    <Text
                      testID="schedule-entry-error"
                      style={[styles.errorText, {color: palette.danger}]}
                    >
                      {composerError}
                    </Text>
                  )}
                  <View style={styles.composerActions}>
                    <TouchableOpacity
                      testID="schedule-entry-cancel-btn"
                      onPress={cancelComposer}
                      style={[
                        styles.composerBtn,
                        {backgroundColor: palette.surface},
                      ]}
                    >
                      <Text
                        style={[styles.composerBtnText, {color: palette.text}]}
                      >
                        Cancel
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      testID="schedule-entry-save-btn"
                      onPress={handleSaveEntry}
                      style={[
                        styles.composerBtn,
                        {backgroundColor: palette.accent},
                      ]}
                    >
                      <Text
                        style={[styles.composerBtnText, {color: '#FFFFFF'}]}
                      >
                        Save
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Entries List */}
              {entries.length === 0 && !composerMode ? (
                <View
                  testID="schedule-detail-entries-empty"
                  style={[
                    styles.card,
                    styles.emptyCard,
                    {
                      backgroundColor: palette.card,
                      borderColor: palette.border,
                    },
                  ]}
                >
                  <Text style={[styles.emptyText, {color: palette.muted}]}>
                    No notes or links attached yet. Tap Add Note or Add Link to
                    attach resources to this schedule.
                  </Text>
                </View>
              ) : (
                <View style={styles.entriesList}>
                  {entries.map((entry, idx) => {
                    const isLink = entry.entryType === 'link';
                    const inlineUrls = !isLink
                      ? extractUrlsFromText(entry.content)
                      : [];
                    return (
                      <View
                        key={entry.id}
                        testID={`schedule-entry-card-${idx}`}
                        style={[
                          styles.card,
                          styles.entryCard,
                          {
                            backgroundColor: palette.card,
                            borderColor: palette.border,
                          },
                          !palette.isDarkMode && scheduleCardShadow,
                        ]}
                      >
                        {isLink ? (
                          <TouchableOpacity
                            testID={`schedule-entry-open-${idx}`}
                            onPress={() => void handleOpenUrl(entry.content)}
                            activeOpacity={0.75}
                            style={styles.entryBodyTouchable}
                          >
                            <View
                              style={[
                                styles.entryIconBadge,
                                {backgroundColor: `${palette.accent}18`},
                              ]}
                            >
                              <Link2 size={15} color={palette.accent} />
                            </View>
                            <View style={styles.entryTextCol}>
                              <View style={styles.entryLinkHeader}>
                                <Text
                                  numberOfLines={1}
                                  style={[
                                    styles.entryTitle,
                                    {color: palette.text},
                                  ]}
                                >
                                  {entry.title || 'Attached Link'}
                                </Text>
                                <ExternalLink
                                  size={13}
                                  color={palette.accent}
                                />
                              </View>
                              <Text
                                numberOfLines={2}
                                style={[
                                  styles.entryUrlText,
                                  {color: palette.accent},
                                ]}
                              >
                                {entry.content}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        ) : (
                          <View style={styles.entryBodyTouchable}>
                            <View
                              style={[
                                styles.entryIconBadge,
                                {backgroundColor: palette.surface},
                              ]}
                            >
                              <StickyNote size={15} color={palette.text} />
                            </View>
                            <View style={styles.entryTextCol}>
                              {entry.title ? (
                                <Text
                                  style={[
                                    styles.entryTitle,
                                    {color: palette.text},
                                  ]}
                                >
                                  {entry.title}
                                </Text>
                              ) : null}
                              <Text
                                style={[
                                  styles.entryNoteBody,
                                  {color: palette.text},
                                ]}
                              >
                                {entry.content}
                              </Text>
                              {inlineUrls.length > 0 && (
                                <View style={styles.detectedLinksRow}>
                                  {inlineUrls.map(url => (
                                    <TouchableOpacity
                                      key={url}
                                      onPress={() => void handleOpenUrl(url)}
                                      style={[
                                        styles.detectedLinkChip,
                                        {
                                          backgroundColor: palette.surface,
                                          borderColor: palette.border,
                                        },
                                      ]}
                                    >
                                      <Link2 size={12} color={palette.accent} />
                                      <Text
                                        numberOfLines={1}
                                        style={[
                                          styles.detectedLinkText,
                                          {color: palette.accent},
                                        ]}
                                      >
                                        {url}
                                      </Text>
                                      <ExternalLink
                                        size={11}
                                        color={palette.accent}
                                      />
                                    </TouchableOpacity>
                                  ))}
                                </View>
                              )}
                            </View>
                          </View>
                        )}

                        <View style={styles.entryActionCol}>
                          <TouchableOpacity
                            testID={`schedule-entry-edit-${idx}`}
                            onPress={() => openEditComposer(entry)}
                            accessibilityRole="button"
                            accessibilityLabel="Edit attached entry"
                            style={[
                              styles.entryIconBtn,
                              {backgroundColor: palette.surface},
                            ]}
                          >
                            <Pencil size={13} color={palette.text} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            testID={`schedule-entry-delete-${idx}`}
                            onPress={() => handleDeleteEntry(entry.id)}
                            accessibilityRole="button"
                            accessibilityLabel="Delete attached entry"
                            style={[
                              styles.entryIconBtn,
                              {backgroundColor: palette.dangerSoft},
                            ]}
                          >
                            <Trash2 size={13} color={palette.danger} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.46)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '88%',
    minHeight: '42%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    maxWidth: '52%',
  },
  categoryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  categoryBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  editBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 28,
    gap: 18,
  },
  heroBlock: {
    gap: 6,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
    lineHeight: 26,
  },
  heroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroMetaText: {
    fontSize: 13.5,
    fontWeight: '600',
    flexShrink: 1,
  },
  taskStatusPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1,
  },
  taskStatusPillText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  sectionBlock: {
    gap: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  sharedCaption: {
    fontSize: 11.5,
    fontWeight: '500',
    marginTop: 2,
  },
  card: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 12,
  },
  detailRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailRowLabel: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  detailRowValue: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
    flexShrink: 1,
  },
  legacyNoteBlock: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
  },
  legacyNoteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legacyNoteText: {
    fontSize: 13,
    lineHeight: 19,
  },
  entriesHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  addButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  addChipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  addChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  composerCard: {
    padding: 14,
    gap: 10,
    borderWidth: 1.5,
  },
  composerTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  composerInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13.5,
  },
  composerTextarea: {
    minHeight: 76,
    textAlignVertical: 'top',
  },
  errorText: {
    fontSize: 12,
    fontWeight: '600',
  },
  composerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  composerBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  composerBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  emptyCard: {
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  emptyText: {
    fontSize: 12.5,
    lineHeight: 18,
  },
  entriesList: {
    gap: 10,
  },
  entryCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    gap: 10,
  },
  entryBodyTouchable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  entryIconBadge: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  entryTextCol: {
    flex: 1,
    gap: 3,
  },
  entryLinkHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  entryTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    flexShrink: 1,
  },
  entryUrlText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  entryNoteBody: {
    fontSize: 13,
    lineHeight: 19,
  },
  detectedLinksRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  detectedLinkChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: '100%',
  },
  detectedLinkText: {
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },
  entryActionCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  entryIconBtn: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
