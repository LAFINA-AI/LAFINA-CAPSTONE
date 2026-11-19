import React, {useEffect, useRef, useState} from 'react';
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  BookOpen,
  Cake,
  Calendar as CalendarIcon,
  Check,
  ChevronRight,
  Download,
  Flag,
  FolderPlus,
  GraduationCap,
  Inbox,
  Layers,
  Maximize2,
  Minimize2,
  Plus,
  Upload,
  X,
} from 'lucide-react-native';
import {useTheme} from '../../../contexts/ThemeContext';
import {Fonts, Shadows} from '../../../theme';
import {
  BIRTHDAY_ACCENT_COLOR,
  BIRTHDAYS_GROUP_ID,
  CLASSES_GROUP_ID,
  type CustomScheduleGroup,
} from '../utils/calendarGroups';
import {HOLIDAY_CALENDAR_ID} from '../utils/philippineHolidays';
import {useSchedulePalette, scheduleCardShadow} from './schedulePalette';

export interface CalendarOptionsSidebarProps {
  visible: boolean;
  onClose: () => void;
  classCount: number;
  birthdayCount?: number;
  customGroups?: CustomScheduleGroup[];
  visibilityMap?: Record<string, boolean>;
  profileSummary?: string | null;
  hasUndated: boolean;
  onViewClasses: () => void;
  onAddClassSchedule: () => void;
  onGoToToday: () => void;
  onOpenLayers: () => void;
  onOpenUndated: () => void;
  onImportCalendar: () => void;
  onRemoveImportedCalendar: () => void;
  onExportCalendar: () => void;
  onToggleLayer?: (layerId: string, isVisible: boolean) => void;
  onOpenBirthdays?: () => void;
  onOpenHolidays?: () => void;
  onOpenCustomGroup?: (groupName?: string | null) => void;
}

/**
 * Chat-style slide-out sidebar for Schedule tools, COR/class management,
 * Google Calendar-style groups (Birthdays, Philippine Holidays, Custom Groups),
 * layer visibility, undated tasks, and .ics import/export.
 */
export const CalendarOptionsSidebar: React.FC<CalendarOptionsSidebarProps> = ({
  visible,
  onClose,
  classCount,
  birthdayCount = 0,
  customGroups = [],
  visibilityMap = {},
  profileSummary,
  hasUndated,
  onViewClasses,
  onAddClassSchedule,
  onGoToToday,
  onOpenLayers,
  onOpenUndated,
  onImportCalendar,
  onRemoveImportedCalendar,
  onExportCalendar,
  onToggleLayer,
  onOpenBirthdays,
  onOpenHolidays,
  onOpenCustomGroup,
}) => {
  const {colors, isModern, modernPalette} = useTheme();
  const palette = useSchedulePalette();
  const insets = useSafeAreaInsets();
  const {width: windowWidth} = useWindowDimensions();
  const safeWindowWidth = Math.max(windowWidth || 360, 320);
  const sidebarWidth = Math.min(Math.round(safeWindowWidth * 0.85), 360);

  const [isFullScreen, setIsFullScreen] = useState(false);
  const isTestEnv = process.env.NODE_ENV === 'test';
  const slideAnim = useRef(new Animated.Value(0)).current;
  const expandAnim = useRef(new Animated.Value(0)).current;

  const softViolet = isModern
    ? modernPalette.softViolet
    : colors.primary + '16';

  useEffect(() => {
    if (!visible) {
      setIsFullScreen(false);
      slideAnim.setValue(0);
      expandAnim.setValue(0);
      return;
    }
    if (isTestEnv) {
      slideAnim.setValue(1);
      return;
    }
    const anim = Animated.timing(slideAnim, {
      toValue: 1,
      duration: 180,
      useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
  }, [visible, isTestEnv, slideAnim, expandAnim]);

  useEffect(() => {
    if (!visible) return;
    if (isTestEnv) {
      expandAnim.setValue(isFullScreen ? 1 : 0);
      return;
    }
    const anim = Animated.timing(expandAnim, {
      toValue: isFullScreen ? 1 : 0,
      duration: 180,
      useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
  }, [isFullScreen, visible, isTestEnv, expandAnim]);

  const handleRequestClose = () => {
    if (isFullScreen) {
      setIsFullScreen(false);
      return;
    }
    onClose();
  };

  const translateX = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [sidebarWidth, 0],
  });
  const drawerWidth = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [sidebarWidth, safeWindowWidth],
  });
  const drawerRadius = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [20, 0],
  });
  const backdropOpacity = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.42],
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleRequestClose}
    >
      <View style={styles.overlayRoot}>
        <Animated.View
          style={[styles.backdrop, {opacity: backdropOpacity}]}
          pointerEvents={isFullScreen ? 'none' : 'auto'}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close calendar options"
            testID="calendar-options-backdrop"
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.drawer,
            {
              backgroundColor: palette.card,
              borderLeftColor: palette.border,
              borderLeftWidth: isFullScreen ? 0 : StyleSheet.hairlineWidth,
              width: drawerWidth,
              borderTopLeftRadius: drawerRadius,
              borderBottomLeftRadius: drawerRadius,
              transform: [{translateX}],
              paddingTop: Math.max(insets.top, 14),
              paddingBottom: Math.max(insets.bottom, 14),
            },
          ]}
          testID="calendar-options-sidebar"
        >
          {/* Sidebar Header */}
          <View style={styles.header}>
            <Text style={[styles.heading, {color: palette.text}]}>
              Calendar Options
            </Text>
            <View style={styles.headerActions}>
              <TouchableOpacity
                onPress={() => setIsFullScreen(prev => !prev)}
                accessibilityRole="button"
                accessibilityLabel={
                  isFullScreen ? 'Collapse to sidebar' : 'Expand to full screen'
                }
                accessibilityState={{expanded: isFullScreen}}
                testID="calendar-options-expand"
                style={[
                  styles.headerActionBtn,
                  {
                    backgroundColor: palette.surface,
                    borderColor: palette.border,
                  },
                ]}
                hitSlop={{top: 8, bottom: 8, left: 4, right: 4}}
              >
                {isFullScreen ? (
                  <Minimize2 size={16} color={palette.text} />
                ) : (
                  <Maximize2 size={16} color={palette.text} />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close calendar options"
                testID="calendar-options-close"
                style={[
                  styles.headerActionBtn,
                  {
                    backgroundColor: palette.surface,
                    borderColor: palette.border,
                  },
                ]}
                hitSlop={{top: 8, bottom: 8, left: 4, right: 8}}
              >
                <X size={17} color={palette.muted} />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView
            style={styles.scrollBody}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Compact Academic / Class Summary Banner */}
            {(classCount > 0 || Boolean(profileSummary)) && (
              <TouchableOpacity
                style={[
                  styles.summaryBanner,
                  {
                    backgroundColor: palette.isDarkMode
                      ? palette.surface
                      : softViolet,
                    borderColor: palette.border,
                  },
                ]}
                onPress={() => {
                  onClose();
                  onViewClasses();
                }}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="View repeating classes"
              >
                <View style={styles.summaryTextCol}>
                  <Text style={[styles.summaryTitle, {color: palette.accent}]}>
                    {classCount > 0
                      ? `${classCount} repeating class${
                          classCount === 1 ? '' : 'es'
                        } scheduled`
                      : 'COR profile saved'}
                  </Text>
                  {profileSummary ? (
                    <Text
                      style={[styles.summarySub, {color: palette.muted}]}
                      numberOfLines={1}
                    >
                      {profileSummary}
                    </Text>
                  ) : null}
                </View>
                <ChevronRight size={16} color={palette.accent} />
              </TouchableOpacity>
            )}

            {/* Section: Classes & COR */}
            <Text style={[styles.sectionLabel, {color: palette.muted}]}>
              CLASSES & COR
            </Text>

            <View
              style={[
                styles.sectionCard,
                {
                  backgroundColor: palette.isDarkMode
                    ? palette.surface
                    : palette.card,
                  borderColor: palette.border,
                },
                !palette.isDarkMode && scheduleCardShadow,
              ]}
            >
              <TouchableOpacity
                testID="calendar-view-classes-button"
                style={[
                  styles.menuItem,
                  {borderBottomColor: palette.border},
                ]}
                onPress={() => {
                  onClose();
                  onViewClasses();
                }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="View classes"
              >
                <View
                  style={[
                    styles.menuIconWrap,
                    {backgroundColor: softViolet},
                  ]}
                >
                  <BookOpen size={17} color={palette.accent} />
                </View>
                <View style={styles.menuTextCol}>
                  <View style={styles.menuTitleRow}>
                    <Text style={[styles.menuTitle, {color: palette.text}]}>
                      View Classes
                    </Text>
                    {classCount > 0 && (
                      <View
                        style={[
                          styles.badgePill,
                          {backgroundColor: palette.accent + '1E'},
                        ]}
                      >
                        <Text
                          style={[
                            styles.badgePillText,
                            {color: palette.accent},
                          ]}
                        >
                          {classCount}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.menuDesc, {color: palette.muted}]}>
                    Inspect, edit, or remove repeating COR classes
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                testID="calendar-add-cor-schedule-button"
                style={[styles.menuItem, styles.menuItemLast]}
                onPress={() => {
                  onClose();
                  onAddClassSchedule();
                }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Add COR or class schedule"
              >
                <View
                  style={[
                    styles.menuIconWrap,
                    {backgroundColor: palette.blueSoft},
                  ]}
                >
                  <GraduationCap size={17} color={colors.blue} />
                </View>
                <View style={styles.menuTextCol}>
                  <Text style={[styles.menuTitle, {color: palette.text}]}>
                    Add COR / Class Schedule
                  </Text>
                  <Text style={[styles.menuDesc, {color: palette.muted}]}>
                    Manually enter classes or scan a USTP COR / schedule
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Section: Calendar Groups (Google Calendar-style layers & managers) */}
            <Text style={[styles.sectionLabel, {color: palette.muted}]}>
              CALENDAR GROUPS
            </Text>

            <View
              style={[
                styles.sectionCard,
                {
                  backgroundColor: palette.isDarkMode
                    ? palette.surface
                    : palette.card,
                  borderColor: palette.border,
                },
                !palette.isDarkMode && scheduleCardShadow,
              ]}
            >
              {/* Classes Layer */}
              {(() => {
                const classesVisible = visibilityMap[CLASSES_GROUP_ID] !== false;
                return (
                  <View
                    style={[
                      styles.groupRow,
                      {borderBottomColor: palette.border},
                    ]}
                  >
                    <TouchableOpacity
                      testID="sidebar-layer-toggle-classes"
                      hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
                      onPress={() =>
                        onToggleLayer?.(CLASSES_GROUP_ID, !classesVisible)
                      }
                      style={[
                        styles.groupCheckbox,
                        {borderColor: palette.accent},
                        classesVisible && {backgroundColor: palette.accent},
                      ]}
                      accessibilityRole="checkbox"
                      accessibilityState={{checked: classesVisible}}
                      accessibilityLabel="Toggle Classes visibility"
                    >
                      {classesVisible && (
                        <Check size={12} color="#FFFFFF" strokeWidth={3} />
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.groupBody}
                      onPress={() => {
                        onClose();
                        onViewClasses();
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={styles.menuTextCol}>
                        <View style={styles.menuTitleRow}>
                          <Text
                            style={[styles.menuTitle, {color: palette.text}]}
                          >
                            Classes
                          </Text>
                          {classCount > 0 && (
                            <View
                              style={[
                                styles.badgePill,
                                {backgroundColor: palette.accent + '1E'},
                              ]}
                            >
                              <Text
                                style={[
                                  styles.badgePillText,
                                  {color: palette.accent},
                                ]}
                              >
                                {classCount}
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text style={[styles.menuDesc, {color: palette.muted}]}>
                          Repeating class subjects
                        </Text>
                      </View>
                      <ChevronRight size={15} color={palette.muted} />
                    </TouchableOpacity>
                  </View>
                );
              })()}

              {/* Birthdays Group */}
              {(() => {
                const bdayVisible = visibilityMap[BIRTHDAYS_GROUP_ID] !== false;
                return (
                  <View
                    style={[
                      styles.groupRow,
                      {borderBottomColor: palette.border},
                    ]}
                  >
                    <TouchableOpacity
                      testID="sidebar-layer-toggle-birthdays"
                      hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
                      onPress={() =>
                        onToggleLayer?.(BIRTHDAYS_GROUP_ID, !bdayVisible)
                      }
                      style={[
                        styles.groupCheckbox,
                        {borderColor: BIRTHDAY_ACCENT_COLOR},
                        bdayVisible && {
                          backgroundColor: BIRTHDAY_ACCENT_COLOR,
                        },
                      ]}
                      accessibilityRole="checkbox"
                      accessibilityState={{checked: bdayVisible}}
                      accessibilityLabel="Toggle Birthdays visibility"
                    >
                      {bdayVisible && (
                        <Check size={12} color="#FFFFFF" strokeWidth={3} />
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      testID="calendar-birthdays-group-button"
                      style={styles.groupBody}
                      onPress={() => {
                        onClose();
                        onOpenBirthdays?.();
                      }}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel="Birthdays group"
                    >
                      <View style={styles.menuTextCol}>
                        <View style={styles.menuTitleRow}>
                          <Cake size={14} color={BIRTHDAY_ACCENT_COLOR} />
                          <Text
                            style={[styles.menuTitle, {color: palette.text}]}
                          >
                            Birthdays
                          </Text>
                          {birthdayCount > 0 && (
                            <View
                              style={[
                                styles.badgePill,
                                {
                                  backgroundColor:
                                    BIRTHDAY_ACCENT_COLOR + '1E',
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.badgePillText,
                                  {color: BIRTHDAY_ACCENT_COLOR},
                                ]}
                              >
                                {birthdayCount}
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text style={[styles.menuDesc, {color: palette.muted}]}>
                          Yearly birthdays & anniversaries
                        </Text>
                      </View>
                      <ChevronRight size={15} color={palette.muted} />
                    </TouchableOpacity>
                  </View>
                );
              })()}

              {/* Holidays in the Philippines */}
              {(() => {
                const holidaysVisible =
                  visibilityMap[HOLIDAY_CALENDAR_ID] !== false;
                return (
                  <View
                    style={[
                      styles.groupRow,
                      {borderBottomColor: palette.border},
                    ]}
                  >
                    <TouchableOpacity
                      testID="sidebar-layer-toggle-holidays"
                      hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
                      onPress={() =>
                        onToggleLayer?.(HOLIDAY_CALENDAR_ID, !holidaysVisible)
                      }
                      style={[
                        styles.groupCheckbox,
                        {borderColor: '#0B8043'},
                        holidaysVisible && {backgroundColor: '#0B8043'},
                      ]}
                      accessibilityRole="checkbox"
                      accessibilityState={{checked: holidaysVisible}}
                      accessibilityLabel="Toggle Holidays in the Philippines visibility"
                    >
                      {holidaysVisible && (
                        <Check size={12} color="#FFFFFF" strokeWidth={3} />
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      testID="calendar-holidays-group-button"
                      style={styles.groupBody}
                      onPress={() => {
                        onClose();
                        onOpenHolidays?.();
                      }}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel="Holidays in the Philippines"
                    >
                      <View style={styles.menuTextCol}>
                        <View style={styles.menuTitleRow}>
                          <Flag size={14} color="#0B8043" />
                          <Text
                            style={[styles.menuTitle, {color: palette.text}]}
                          >
                            Philippine Holidays
                          </Text>
                        </View>
                        <Text style={[styles.menuDesc, {color: palette.muted}]}>
                          Regular & special non-working days
                        </Text>
                      </View>
                      <ChevronRight size={15} color={palette.muted} />
                    </TouchableOpacity>
                  </View>
                );
              })()}

              {/* User Custom Groups */}
              {customGroups.map(group => {
                const isVis = visibilityMap[group.layerId] !== false;
                return (
                  <View
                    key={group.layerId}
                    style={[
                      styles.groupRow,
                      {borderBottomColor: palette.border},
                    ]}
                  >
                    <TouchableOpacity
                      testID={`sidebar-layer-toggle-custom-${group.name}`}
                      hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
                      onPress={() => onToggleLayer?.(group.layerId, !isVis)}
                      style={[
                        styles.groupCheckbox,
                        {borderColor: group.color},
                        isVis && {backgroundColor: group.color},
                      ]}
                      accessibilityRole="checkbox"
                      accessibilityState={{checked: isVis}}
                      accessibilityLabel={`Toggle ${group.name} visibility`}
                    >
                      {isVis && (
                        <Check size={12} color="#FFFFFF" strokeWidth={3} />
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      testID={`calendar-custom-group-${group.name}`}
                      style={styles.groupBody}
                      onPress={() => {
                        onClose();
                        onOpenCustomGroup?.(group.name);
                      }}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={`${group.name} group`}
                    >
                      <View style={styles.menuTextCol}>
                        <View style={styles.menuTitleRow}>
                          <Text
                            style={[styles.menuTitle, {color: palette.text}]}
                            numberOfLines={1}
                          >
                            {group.name}
                          </Text>
                          {group.items.length > 0 && (
                            <View
                              style={[
                                styles.badgePill,
                                {backgroundColor: group.color + '1E'},
                              ]}
                            >
                              <Text
                                style={[
                                  styles.badgePillText,
                                  {color: group.color},
                                ]}
                              >
                                {group.items.length}
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text style={[styles.menuDesc, {color: palette.muted}]}>
                          Custom schedule group
                        </Text>
                      </View>
                      <ChevronRight size={15} color={palette.muted} />
                    </TouchableOpacity>
                  </View>
                );
              })}

              {/* Add New Group */}
              <TouchableOpacity
                testID="calendar-add-custom-group-button"
                style={[styles.menuItem, styles.menuItemLast]}
                onPress={() => {
                  onClose();
                  onOpenCustomGroup?.(null);
                }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Add schedule group"
              >
                <View
                  style={[
                    styles.menuIconWrap,
                    {backgroundColor: palette.accent + '16'},
                  ]}
                >
                  <FolderPlus size={17} color={palette.accent} />
                </View>
                <View style={styles.menuTextCol}>
                  <View style={styles.menuTitleRow}>
                    <Plus size={14} color={palette.accent} strokeWidth={2.5} />
                    <Text style={[styles.menuTitle, {color: palette.accent}]}>
                      Add Schedule Group
                    </Text>
                  </View>
                  <Text style={[styles.menuDesc, {color: palette.muted}]}>
                    Create Exams, Org, Gym, or custom layers
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Section: Schedule Tools */}
            <Text style={[styles.sectionLabel, {color: palette.muted}]}>
              SCHEDULE TOOLS
            </Text>

            <View
              style={[
                styles.sectionCard,
                {
                  backgroundColor: palette.isDarkMode
                    ? palette.surface
                    : palette.card,
                  borderColor: palette.border,
                },
                !palette.isDarkMode && scheduleCardShadow,
              ]}
            >
              <TouchableOpacity
                style={[
                  styles.menuItem,
                  {borderBottomColor: palette.border},
                ]}
                onPress={() => {
                  onClose();
                  onGoToToday();
                }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Go to today"
              >
                <View
                  style={[
                    styles.menuIconWrap,
                    {backgroundColor: palette.surface},
                  ]}
                >
                  <CalendarIcon size={17} color={palette.accent} />
                </View>
                <View style={styles.menuTextCol}>
                  <Text style={[styles.menuTitle, {color: palette.text}]}>
                    Go to Today
                  </Text>
                  <Text style={[styles.menuDesc, {color: palette.muted}]}>
                    Jump back to today’s date on the schedule
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.menuItem,
                  {borderBottomColor: palette.border},
                ]}
                onPress={() => {
                  onClose();
                  onOpenLayers();
                }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Manage calendars and visibility"
              >
                <View
                  style={[
                    styles.menuIconWrap,
                    {backgroundColor: palette.surface},
                  ]}
                >
                  <Layers size={17} color={colors.blue} />
                </View>
                <View style={styles.menuTextCol}>
                  <Text style={[styles.menuTitle, {color: palette.text}]}>
                    Calendars & Visibility
                  </Text>
                  <Text style={[styles.menuDesc, {color: palette.muted}]}>
                    Manage active subjects, schedules, and holidays
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                testID="calendar-undated-button"
                style={[
                  styles.menuItem,
                  {borderBottomColor: palette.border},
                ]}
                onPress={() => {
                  onClose();
                  onOpenUndated();
                }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Undated tasks"
              >
                <View
                  style={[
                    styles.menuIconWrap,
                    {backgroundColor: palette.dangerSoft},
                  ]}
                >
                  <Inbox size={17} color={palette.danger} />
                </View>
                <View style={styles.menuTextCol}>
                  <View style={styles.menuTitleRow}>
                    <Text style={[styles.menuTitle, {color: palette.text}]}>
                      Undated Tasks
                    </Text>
                    {hasUndated && (
                      <View
                        style={[
                          styles.badgePill,
                          {backgroundColor: palette.danger + '22'},
                        ]}
                      >
                        <Text
                          style={[
                            styles.badgePillText,
                            {color: palette.danger},
                          ]}
                        >
                          Backlog
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.menuDesc, {color: palette.muted}]}>
                    Open tasks and assignments without a due date
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.menuItem,
                  {borderBottomColor: palette.border},
                ]}
                onPress={() => {
                  onClose();
                  onImportCalendar();
                }}
                onLongPress={() => {
                  onClose();
                  onRemoveImportedCalendar();
                }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Import calendar"
                accessibilityHint="Imports an .ics file. Long press to remove imported calendar."
              >
                <View
                  style={[
                    styles.menuIconWrap,
                    {backgroundColor: palette.mint},
                  ]}
                >
                  <Upload size={17} color={palette.mintInk} />
                </View>
                <View style={styles.menuTextCol}>
                  <Text style={[styles.menuTitle, {color: palette.text}]}>
                    Import Calendar (.ics)
                  </Text>
                  <Text style={[styles.menuDesc, {color: palette.muted}]}>
                    Import external schedule file (Hold to remove)
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.menuItem, styles.menuItemLast]}
                onPress={() => {
                  onClose();
                  onExportCalendar();
                }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Export calendar"
                accessibilityHint="Exports the visible local calendar"
              >
                <View
                  style={[
                    styles.menuIconWrap,
                    {backgroundColor: palette.surface},
                  ]}
                >
                  <Download size={17} color={palette.accent} />
                </View>
                <View style={styles.menuTextCol}>
                  <Text style={[styles.menuTitle, {color: palette.text}]}>
                    Export Calendar (.ics)
                  </Text>
                  <Text style={[styles.menuDesc, {color: palette.muted}]}>
                    Export your schedule and classes to an .ics file
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </ScrollView>

          <TouchableOpacity
            style={[styles.doneBtn, {backgroundColor: palette.surface}]}
            onPress={onClose}
            activeOpacity={0.8}
            accessibilityRole="button"
          >
            <Text style={[styles.doneBtnText, {color: palette.text}]}>
              Done
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlayRoot: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#000000',
  },
  drawer: {
    height: '100%',
    paddingHorizontal: 14,
    gap: 10,
    ...Shadows.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 4,
  },
  heading: {
    fontFamily: Fonts.heading,
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  headerActionBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollBody: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 14,
    gap: 10,
  },
  summaryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  summaryTextCol: {
    flex: 1,
    marginRight: 8,
  },
  summaryTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  summarySub: {
    fontSize: 12,
    marginTop: 2,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.7,
    marginTop: 4,
    paddingHorizontal: 4,
  },
  sectionCard: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  groupCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  groupBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  menuItemLast: {
    borderBottomWidth: 0,
  },
  menuIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  menuTextCol: {
    flex: 1,
  },
  menuTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  menuTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  menuDesc: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  badgePill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  badgePillText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  doneBtn: {
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
