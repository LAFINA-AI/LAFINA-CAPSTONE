import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Alert,
  Animated,
  Easing,
  LayoutAnimation,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import {
  AlarmClock,
  BellRing,
  Grid,
  List,
  Plus,
  TriangleAlert,
} from 'lucide-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useTheme} from '../../../contexts/ThemeContext';
import {useReducedMotion} from '../../../hooks/useReducedMotion';
import {useSchedulePalette, scheduleCardShadow} from './schedulePalette';
import {alarmsStore, userStore} from '../../../../storage';
import type {Alarm, AlarmInput} from '../../../../storage';
import {
  bitForDate,
  describeRepeat,
  describeTimeUntil,
  formatAlarmTime,
  nextAlarmTrigger,
} from '../../../../scheduler/alarmSchedule';
import {getAlarmHealth, nextAlarm} from '../../../../scheduler/alarmService';
import type {AlarmHealth} from '../../../../scheduler/alarmService';
import {
  openExactAlarmSettings,
  openFullScreenIntentSettings,
  openNotificationSettings,
} from '../../../../scheduler/reminderAlarm';
import {AlarmEditorModal} from './AlarmEditorModal';
import {SkillFonts, useSkillsPalette} from '../../../theme/skills';

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  try {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  } catch {
    // Ignore when new architecture / Fabric handles layout animations natively.
  }
}

const animateAlarmListLayout = (reducedMotion: boolean) => {
  if (reducedMotion || Platform.OS === 'web') return;
  try {
    LayoutAnimation.configureNext({
      duration: 240,
      create: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
      },
      update: {
        type: LayoutAnimation.Types.spring,
        springDamping: 0.82,
      },
      delete: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
      },
    });
  } catch {
    // Ignore in environments without native LayoutAnimation.
  }
};

interface AlarmsViewProps {
  userId: string;
  refreshTrigger: number;
  onRefresh: () => void;
  /** When false (hosted inside the Tools header), suppresses the duplicate inner header. */
  showHeader?: boolean;
  /** Controlled grid/list view mode from parent; falls back to internal toggle when omitted. */
  isGridView?: boolean;
  /** Incrementing signal from the parent Tools header + button to open a new alarm. */
  createTrigger?: number;
  skillsPresentation?: boolean;
}

interface HealthIssue {
  key: string;
  text: string;
  action: string;
  onPress: () => void;
}

/**
 * Critical OS permission blockers that stop alarms from ringing or showing.
 * Battery-saver guidance is surfaced in Alarm & Reminder Health instead of
 * cluttering the Alarms tab feed.
 */
export const alarmHealthIssues = (
  health: AlarmHealth | null,
): HealthIssue[] => {
  if (!health || !health.available) return [];
  const issues: HealthIssue[] = [];
  if (!health.notificationsEnabled)
    issues.push({
      key: 'notifications',
      text: 'Notifications are off, so alarms can’t show.',
      action: 'Turn on',
      onPress: () => void openNotificationSettings(),
    });
  if (!health.canScheduleExactAlarms)
    issues.push({
      key: 'exact',
      text: 'Alarms may ring a few minutes late. Allow exact alarms.',
      action: 'Allow',
      onPress: () => void openExactAlarmSettings(),
    });
  if (!health.canUseFullScreenIntent)
    issues.push({
      key: 'fullscreen',
      text: 'The alarm screen can’t open over the lock screen.',
      action: 'Allow',
      onPress: () => void openFullScreenIntentSettings(),
    });
  return issues;
};

/** Alarm plan A2: the Alarms view, shown under Tools → Alarms. */
const SHORT_WEEKDAYS = [
  'Sun',
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
] as const;

const formatRelativeAlarmDay = (
  target: Date,
  now: Date = new Date(),
): string => {
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startTarget = new Date(
    target.getFullYear(),
    target.getMonth(),
    target.getDate(),
  );
  const diffDays = Math.round(
    (startTarget.getTime() - startToday.getTime()) / 86400000,
  );
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  return SHORT_WEEKDAYS[target.getDay()];
};

interface AlarmArrivalWrapperProps {
  isHighlighted: boolean;
  arrivalTick: number;
  reducedMotion: boolean;
  accentColor: string;
  radius: number;
  isGridView: boolean;
  children: React.ReactNode;
}

/**
 * Plays a spring entrance + soft accent halo glow + ringing-bell wiggle
 * when an alarm is newly created or saved, spotlighting where it landed.
 */
const AlarmArrivalWrapper: React.FC<AlarmArrivalWrapperProps> = ({
  isHighlighted,
  arrivalTick,
  reducedMotion,
  accentColor,
  radius,
  isGridView,
  children,
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const translateYAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;
  const haloAnim = useRef(new Animated.Value(0)).current;
  const bellWiggleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isHighlighted) {
      haloAnim.setValue(0);
      return;
    }
    if (reducedMotion) {
      haloAnim.setValue(0.8);
      const fade = Animated.timing(haloAnim, {
        toValue: 0,
        duration: 1100,
        useNativeDriver: true,
      });
      fade.start();
      return () => fade.stop();
    }

    scaleAnim.setValue(0.84);
    translateYAnim.setValue(20);
    opacityAnim.setValue(0);
    haloAnim.setValue(1);
    bellWiggleAnim.setValue(0);

    const entrance = Animated.parallel([
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 210,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 120,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.spring(translateYAnim, {
        toValue: 0,
        tension: 120,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(bellWiggleAnim, {
          toValue: 1,
          duration: 85,
          useNativeDriver: true,
        }),
        Animated.timing(bellWiggleAnim, {
          toValue: -1,
          duration: 85,
          useNativeDriver: true,
        }),
        Animated.timing(bellWiggleAnim, {
          toValue: 0.7,
          duration: 80,
          useNativeDriver: true,
        }),
        Animated.timing(bellWiggleAnim, {
          toValue: -0.7,
          duration: 80,
          useNativeDriver: true,
        }),
        Animated.timing(bellWiggleAnim, {
          toValue: 0,
          duration: 80,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(haloAnim, {
        toValue: 0,
        duration: 1650,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]);

    entrance.start();
    return () => entrance.stop();
  }, [
    isHighlighted,
    arrivalTick,
    reducedMotion,
    scaleAnim,
    translateYAnim,
    opacityAnim,
    haloAnim,
    bellWiggleAnim,
  ]);

  const bellRotate = bellWiggleAnim.interpolate({
    inputRange: [-1, 1],
    outputRange: ['-16deg', '16deg'],
  });

  return (
    <Animated.View
      style={[
        isGridView ? styles.gridItemSlot : styles.listItemSlot,
        {
          opacity: opacityAnim,
          transform: [{translateY: translateYAnim}, {scale: scaleAnim}],
        },
      ]}
    >
      {children}
      {isHighlighted && (
        <>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.arrivalHalo,
              {
                borderRadius: radius,
                borderColor: accentColor,
                opacity: haloAnim,
              },
            ]}
          />
          <Animated.View
            pointerEvents="none"
            style={[
              styles.arrivalBellBadge,
              {
                backgroundColor: accentColor,
                opacity: haloAnim,
                transform: [{rotate: bellRotate}],
              },
            ]}
          >
            <BellRing size={11} color="#FFFFFF" />
          </Animated.View>
        </>
      )}
    </Animated.View>
  );
};

export const AlarmsView: React.FC<AlarmsViewProps> = ({
  userId,
  refreshTrigger,
  onRefresh,
  showHeader = true,
  isGridView,
  createTrigger,
  skillsPresentation = false,
}) => {
  const {colors, modernPalette} = useTheme();
  const schedulePalette = useSchedulePalette();
  const skillsPalette = useSkillsPalette();
  const palette = skillsPresentation ? skillsPalette : schedulePalette;
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const reducedMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const scrollBottomPad = Math.max(insets.bottom, 16) + 96;
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [health, setHealth] = useState<AlarmHealth | null>(null);
  const [editing, setEditing] = useState<Alarm | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [recentAlarmId, setRecentAlarmId] = useState<string | null>(null);
  const [arrivalTick, setArrivalTick] = useState(0);
  const [localIsGridView, setLocalIsGridView] = useState(true);
  const effectiveIsGridView = isGridView ?? localIsGridView;
  const lastCreateTriggerRef = useRef(createTrigger ?? 0);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextPulseAnim = useRef(new Animated.Value(1)).current;
  const [use24h] = useState(() => {
    try {
      return userStore.get24HourFormat(userId);
    } catch {
      return false;
    }
  });

  useEffect(
    () => () => {
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (
      createTrigger !== undefined &&
      createTrigger !== lastCreateTriggerRef.current
    ) {
      lastCreateTriggerRef.current = createTrigger;
      setEditing(null);
      setEditorOpen(true);
    }
  }, [createTrigger]);

  const loadHealth = useCallback(async (isMounted?: () => boolean) => {
    const result = await getAlarmHealth();
    if (!isMounted || isMounted()) {
      setHealth(result);
    }
  }, []);

  const load = useCallback(() => {
    try {
      setAlarms(alarmsStore.list(userId));
    } catch (error) {
      console.warn('[AlarmsView] Could not read alarms:', error);
    }
  }, [userId]);

  useEffect(() => {
    load();
    let alive = true;
    void loadHealth(() => alive);
    return () => {
      alive = false;
    };
  }, [load, loadHealth, refreshTrigger]);

  const next = nextAlarm(userId);
  const issues = alarmHealthIssues(health);

  const triggerArrivalHighlight = useCallback((alarmId: string) => {
    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current);
    }
    setRecentAlarmId(alarmId);
    setArrivalTick(tick => tick + 1);
    highlightTimerRef.current = setTimeout(() => {
      setRecentAlarmId(null);
      highlightTimerRef.current = null;
    }, 2000);
  }, []);

  useEffect(() => {
    if (
      reducedMotion ||
      !recentAlarmId ||
      !next ||
      next.alarm.id !== recentAlarmId
    ) {
      return;
    }
    nextPulseAnim.setValue(0.97);
    const anim = Animated.spring(nextPulseAnim, {
      toValue: 1,
      tension: 140,
      friction: 7,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [arrivalTick, next, nextPulseAnim, recentAlarmId, reducedMotion]);

  const save = (input: AlarmInput): string | null => {
    try {
      animateAlarmListLayout(reducedMotion);
      if (editing) {
        const updated = alarmsStore.update(editing.id, userId, input);
        if (updated) triggerArrivalHighlight(updated.id);
      } else {
        const created = alarmsStore.create(userId, input);
        triggerArrivalHighlight(created.id);
      }
      setEditorOpen(false);
      load();
      onRefresh();
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'Could not save.';
    }
  };

  const toggle = (alarm: Alarm, enabled: boolean) => {
    try {
      animateAlarmListLayout(reducedMotion);
      alarmsStore.setEnabled(alarm.id, userId, enabled);
      load();
    } catch (error) {
      console.warn('[AlarmsView] Toggle failed:', error);
    }
  };

  const remove = (alarm: Alarm) => {
    Alert.alert(
      'Delete alarm?',
      `${formatAlarmTime(alarm.hour, alarm.minute, use24h)}${
        alarm.label ? ` · ${alarm.label}` : ''
      }`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            animateAlarmListLayout(reducedMotion);
            alarmsStore.remove(alarm.id, userId);
            setEditorOpen(false);
            load();
            onRefresh();
          },
        },
      ],
    );
  };

  const enabledCount = alarms.filter(alarm => alarm.enabled).length;
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekSunday = new Date(todayStart);
  weekSunday.setDate(todayStart.getDate() - todayStart.getDay());
  const weekColumns = SHORT_WEEKDAYS.map((dayLabel, offset) => {
    const dayDate = new Date(
      weekSunday.getFullYear(),
      weekSunday.getMonth(),
      weekSunday.getDate() + offset,
    );
    const isToday = dayDate.getTime() === todayStart.getTime();
    const dayBit = bitForDate(dayDate);
    const hasAlarm = alarms.some(alarm => {
      if (!alarm.enabled) return false;
      if (alarm.repeatDays > 0) return (alarm.repeatDays & dayBit) !== 0;
      const upcoming = nextAlarmTrigger(alarm);
      if (!upcoming) return false;
      return (
        upcoming.getFullYear() === dayDate.getFullYear() &&
        upcoming.getMonth() === dayDate.getMonth() &&
        upcoming.getDate() === dayDate.getDate()
      );
    });
    return {dayLabel, dayDate, isToday, hasAlarm};
  });

  const todayCircleBg = palette.isDarkMode ? palette.text : palette.darkInkBtn;
  const todayCircleIcon = palette.isDarkMode ? palette.bg : '#FFFFFF';
  const labelTileBg = palette.isDarkMode
    ? palette.surface
    : modernPalette.softViolet;
  const repeatTileBg = palette.isDarkMode ? palette.surface : palette.blueSoft;
  const repeatTileInk = palette.isDarkMode
    ? palette.accent
    : modernPalette.blueInk;
  const cardSurfaceStyle = [
    {
      backgroundColor: palette.card,
      borderColor: palette.isDarkMode ? palette.border : 'transparent',
      borderWidth: palette.isDarkMode ? 1 : 0,
    },
    !palette.isDarkMode && scheduleCardShadow,
  ];

  const renderAlarmItem = (alarm: Alarm) => {
    const repeatText = describeRepeat(alarm.repeatDays);
    const labelText = alarm.label?.trim() || '';
    const timeText = formatAlarmTime(alarm.hour, alarm.minute, use24h);
    const isHighlighted = alarm.id === recentAlarmId;
    const openEditor = () => {
      setEditing(alarm);
      setEditorOpen(true);
    };
    const rowLabel = `Alarm ${timeText}, ${repeatText}${
      labelText ? `, ${labelText}` : ''
    }, ${alarm.enabled ? 'on' : 'off'}. Edit`;
    const switchNode = (
      <Switch
        testID={`alarm-switch-${alarm.id}`}
        value={alarm.enabled}
        onValueChange={value => toggle(alarm, value)}
        trackColor={{
          false: palette.surface,
          true: palette.accent,
        }}
        thumbColor="#FFFFFF"
        accessibilityLabel={`Alarm ${timeText} on`}
      />
    );

    const cardNode = effectiveIsGridView ? (
      <View
        testID={`alarm-grid-card-${alarm.id}`}
        style={[styles.alarmGridCard, cardSurfaceStyle]}
      >
        <View style={styles.alarmGridTopRow}>
          <TouchableOpacity
            style={styles.alarmGridRepeatTouch}
            onPress={openEditor}
            onLongPress={() => remove(alarm)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.alarmGridRepeat,
                {color: alarm.enabled ? palette.accent : palette.muted},
              ]}
              numberOfLines={1}
            >
              {repeatText}
            </Text>
          </TouchableOpacity>
          {switchNode}
        </View>
        <TouchableOpacity
          testID={`alarm-row-${alarm.id}`}
          style={styles.alarmGridBody}
          onPress={openEditor}
          onLongPress={() => remove(alarm)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={rowLabel}
        >
          <Text
            style={[
              styles.alarmGridTime,
              {color: alarm.enabled ? palette.text : palette.muted},
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            {timeText}
          </Text>
          <Text
            style={[styles.alarmGridLabel, {color: palette.muted}]}
            numberOfLines={1}
          >
            {labelText || 'Alarm'}
          </Text>
        </TouchableOpacity>
      </View>
    ) : (
      <View
        style={[
          styles.alarmCard,
          cardSurfaceStyle,
          skillsPresentation && {
            backgroundColor: 'transparent',
            borderRadius: 0,
            borderWidth: 0,
            borderBottomWidth: 1,
            borderColor: palette.border,
            paddingHorizontal: 0,
            shadowOpacity: 0,
            elevation: 0,
          },
        ]}
      >
        <TouchableOpacity
          testID={`alarm-row-${alarm.id}`}
          style={styles.rowText}
          onPress={openEditor}
          onLongPress={() => remove(alarm)}
          accessibilityRole="button"
          accessibilityLabel={rowLabel}
        >
          <Text
            style={[
              styles.rowTime,
              {fontFamily: SkillFonts.semibold, fontSize: 30},
              {
                color: alarm.enabled ? palette.text : palette.muted,
              },
            ]}
          >
            {timeText}
          </Text>
          <Text style={styles.rowSub} numberOfLines={1}>
            <Text
              style={{
                color: alarm.enabled ? palette.accent : palette.muted,
                fontWeight: '600',
              }}
            >
              {repeatText}
            </Text>
            {labelText ? (
              <Text style={{color: palette.muted}}>{` · ${labelText}`}</Text>
            ) : null}
          </Text>
        </TouchableOpacity>
        {switchNode}
      </View>
    );

    return (
      <AlarmArrivalWrapper
        key={alarm.id}
        isHighlighted={isHighlighted}
        arrivalTick={arrivalTick}
        reducedMotion={reducedMotion}
        accentColor={palette.accent}
        radius={effectiveIsGridView ? 20 : 22}
        isGridView={effectiveIsGridView}
      >
        {cardNode}
      </AlarmArrivalWrapper>
    );
  };

  return (
    <View
      style={[styles.container, {backgroundColor: palette.bg}]}
      testID="alarms-view"
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          {paddingTop: showHeader ? 6 : 0, paddingBottom: scrollBottomPad},
        ]}
      >
        {showHeader && (
          <View style={styles.headerRow}>
            <View style={styles.headerTitleGroup}>
              <Text style={[styles.headerTitle, {color: palette.text}]}>
                Alarms
              </Text>
              <Text style={[styles.headerSubtitle, {color: palette.muted}]}>
                {`${enabledCount} active`}
              </Text>
            </View>
            <View style={styles.headerActions}>
              <TouchableOpacity
                testID="alarm-view-toggle"
                onPress={() => setLocalIsGridView(prev => !prev)}
                accessibilityRole="button"
                accessibilityLabel={
                  effectiveIsGridView
                    ? 'Switch to list view'
                    : 'Switch to grid view'
                }
                style={[
                  styles.circleToggleBtn,
                  {backgroundColor: palette.surface},
                ]}
              >
                {effectiveIsGridView ? (
                  <List size={17} color={palette.text} />
                ) : (
                  <Grid size={17} color={palette.text} />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                testID="alarm-add-button"
                onPress={() => {
                  setEditing(null);
                  setEditorOpen(true);
                }}
                accessibilityRole="button"
                accessibilityLabel="Add alarm"
                activeOpacity={0.85}
                style={[styles.circleAddBtn, {backgroundColor: palette.accent}]}
              >
                <Plus size={20} color="#FFFFFF" strokeWidth={2.4} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {skillsPresentation && (
          <>
            <View
              testID="skills-next-alarm"
              style={[styles.skillHero, {backgroundColor: palette.darkInkBtn}]}
            >
              <Text style={styles.skillHeroLabel}>NEXT ALARM</Text>
              <Text style={styles.skillHeroTime}>
                {next
                  ? formatAlarmTime(next.alarm.hour, next.alarm.minute, use24h)
                  : 'None on'}
              </Text>
              <Text style={styles.skillHeroMeta}>
                {next
                  ? `${formatRelativeAlarmDay(next.at)} · ${
                      next.alarm.label || 'Alarm'
                    } · ${describeTimeUntil(next.at)}`
                  : 'Add an alarm to start your day.'}
              </Text>
            </View>
            <View style={styles.skillWeek}>
              {weekColumns.map(col => (
                <TouchableOpacity
                  key={col.dayLabel}
                  accessibilityRole="button"
                  accessibilityState={{
                    selected: selectedDay === col.dayDate.getDay(),
                  }}
                  onPress={() =>
                    setSelectedDay(previous =>
                      previous === col.dayDate.getDay()
                        ? null
                        : col.dayDate.getDay(),
                    )
                  }
                  accessibilityLabel={`${col.dayLabel}${
                    col.isToday ? ', today' : ''
                  }${col.hasAlarm ? ', alarm scheduled' : ''}`}
                  style={[
                    styles.skillDay,
                    {
                      backgroundColor:
                        selectedDay === col.dayDate.getDay()
                          ? palette.accent
                          : palette.surface,
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontFamily: SkillFonts.medium,
                      fontSize: 12,
                      color:
                        selectedDay === col.dayDate.getDay()
                          ? skillsPalette.onAccent
                          : palette.muted,
                    }}
                  >
                    {col.dayLabel}
                  </Text>
                  <View
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: 3,
                      backgroundColor: col.hasAlarm
                        ? col.isToday
                          ? '#FFFFFF'
                          : palette.accent
                        : palette.border,
                    }}
                  />
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
        {!skillsPresentation && (
          <>
            <View style={[styles.weekCard, cardSurfaceStyle]}>
              {weekColumns.map(col => {
                const circleBg = col.isToday
                  ? todayCircleBg
                  : col.hasAlarm
                  ? palette.accent
                  : palette.surface;
                const iconColor = col.isToday
                  ? todayCircleIcon
                  : col.hasAlarm
                  ? '#FFFFFF'
                  : palette.muted;
                const pillState = col.isToday
                  ? 'today'
                  : col.hasAlarm
                  ? 'active'
                  : 'idle';

                return (
                  <View key={col.dayLabel} style={styles.weekCol}>
                    <Text
                      style={[
                        styles.weekDayText,
                        {
                          color: col.isToday ? palette.text : palette.muted,
                          fontWeight: col.isToday ? '700' : '500',
                        },
                      ]}
                    >
                      {col.dayLabel}
                    </Text>
                    <View
                      key={`alarm-day-${col.dayLabel}-${pillState}`}
                      collapsable={false}
                      style={[styles.weekCircle, {backgroundColor: circleBg}]}
                    >
                      <AlarmClock size={16} color={iconColor} />
                    </View>
                  </View>
                );
              })}
            </View>

            <Text style={[styles.sectionLabel, {color: palette.text}]}>
              Next Alarm
            </Text>

            {next ? (
              <Animated.View style={{transform: [{scale: nextPulseAnim}]}}>
                <TouchableOpacity
                  testID="alarms-next"
                  activeOpacity={0.85}
                  onPress={() => {
                    setEditing(next.alarm);
                    setEditorOpen(true);
                  }}
                  style={[
                    styles.nextCard,
                    {
                      backgroundColor: palette.card,
                      borderColor: palette.isDarkMode
                        ? palette.border
                        : 'transparent',
                      borderWidth: palette.isDarkMode ? 1 : 0,
                    },
                    !palette.isDarkMode && scheduleCardShadow,
                  ]}
                >
                  <View style={styles.nextTopRow}>
                    <View style={styles.nextLeft}>
                      <Text
                        style={[styles.nextDayLabel, {color: palette.accent}]}
                      >
                        {formatRelativeAlarmDay(next.at)}
                      </Text>
                      <Text
                        style={[styles.nextCountdown, {color: palette.muted}]}
                      >
                        {`Rings ${describeTimeUntil(next.at)}`}
                      </Text>
                    </View>
                    <Text style={[styles.nextBigTime, {color: palette.text}]}>
                      {formatAlarmTime(
                        next.alarm.hour,
                        next.alarm.minute,
                        use24h,
                      )}
                    </Text>
                  </View>
                  <View style={styles.nextTilesRow}>
                    <View
                      style={[styles.nextTile, {backgroundColor: labelTileBg}]}
                    >
                      <Text
                        style={[styles.nextTileLabel, {color: palette.accent}]}
                      >
                        LABEL
                      </Text>
                      <Text
                        style={[styles.nextTileValue, {color: palette.text}]}
                        numberOfLines={2}
                      >
                        {next.alarm.label?.trim() || 'Alarm'}
                      </Text>
                    </View>
                    <View
                      style={[styles.nextTile, {backgroundColor: repeatTileBg}]}
                    >
                      <Text
                        style={[styles.nextTileLabel, {color: repeatTileInk}]}
                      >
                        REPEAT
                      </Text>
                      <Text
                        style={[styles.nextTileValue, {color: palette.text}]}
                        numberOfLines={2}
                      >
                        {describeRepeat(next.alarm.repeatDays)}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              </Animated.View>
            ) : (
              <View
                testID="alarms-next"
                style={[
                  styles.nextEmptyCard,
                  {
                    backgroundColor: palette.card,
                    borderColor: palette.isDarkMode
                      ? palette.border
                      : 'transparent',
                    borderWidth: palette.isDarkMode ? 1 : 0,
                  },
                  !palette.isDarkMode && scheduleCardShadow,
                ]}
              >
                <AlarmClock size={20} color={palette.muted} />
                <Text style={[styles.nextEmptyText, {color: palette.muted}]}>
                  No alarm is on.
                </Text>
              </View>
            )}
          </>
        )}
        {issues.map(issue => (
          <View
            key={issue.key}
            accessibilityRole="alert"
            style={[
              styles.issue,
              {
                borderColor: colors.warning,
                backgroundColor: palette.card,
              },
            ]}
          >
            <TriangleAlert size={18} color={colors.warning} />
            <Text style={[styles.issueText, {color: palette.text}]}>
              {issue.text}
            </Text>
            <TouchableOpacity
              onPress={issue.onPress}
              accessibilityRole="button"
              accessibilityLabel={`${issue.action}: ${issue.text}`}
              style={[styles.issueButton, {borderColor: palette.border}]}
            >
              <Text style={[styles.issueAction, {color: palette.danger}]}>
                {issue.action}
              </Text>
            </TouchableOpacity>
          </View>
        ))}

        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionLabel, {color: palette.text}]}>
            {skillsPresentation && selectedDay !== null
              ? `${SHORT_WEEKDAYS[selectedDay]} alarms`
              : 'All alarms'}
          </Text>
          {!showHeader && (
            <Text style={[styles.headerSubtitle, {color: palette.muted}]}>
              {`${enabledCount} active`}
            </Text>
          )}
        </View>

        {alarms.length === 0 ? (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => {
              setEditing(null);
              setEditorOpen(true);
            }}
            style={[styles.emptyCard, cardSurfaceStyle]}
          >
            <Text style={[styles.empty, {color: palette.muted}]}>
              No alarms yet. Tap + to add one, or ask LAFINA: “wake me up at 6
              on weekdays”.
            </Text>
          </TouchableOpacity>
        ) : (
          <View
            testID="alarms-list"
            style={[
              effectiveIsGridView ? styles.alarmsGrid : styles.alarmsList,
              skillsPresentation &&
                !effectiveIsGridView && {
                  backgroundColor: palette.card,
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: palette.border,
                  paddingHorizontal: 16,
                },
            ]}
          >
            {alarms
              .filter(
                alarm =>
                  !skillsPresentation ||
                  selectedDay === null ||
                  (alarm.repeatDays > 0 &&
                    (alarm.repeatDays & (1 << (selectedDay + 6) % 7)) !== 0) ||
                  (alarm.repeatDays === 0 &&
                    new Date(`${alarm.oneShotDate}T12:00:00`).getDay() ===
                      selectedDay),
              )
              .map(renderAlarmItem)}
          </View>
        )}
      </ScrollView>

      <AlarmEditorModal
        visible={editorOpen}
        alarm={editing}
        use24h={use24h}
        onSave={save}
        onDelete={editing ? () => remove(editing) : undefined}
        onClose={() => setEditorOpen(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  skillHero: {
    borderRadius: 24,
    paddingVertical: 18,
    paddingHorizontal: 20,
    gap: 6,
  },
  skillHeroLabel: {
    fontFamily: SkillFonts.semibold,
    fontSize: 12,
    letterSpacing: 1.2,
    color: '#FFFFFF',
  },
  skillHeroTime: {
    fontFamily: SkillFonts.semibold,
    fontSize: 40,
    color: '#FFFFFF',
  },
  skillHeroMeta: {fontFamily: SkillFonts.body, fontSize: 14, color: '#FFFFFF'},
  skillWeek: {flexDirection: 'row', gap: 6, marginTop: 2},
  skillDay: {
    flex: 1,
    minHeight: 58,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  container: {
    flex: 1,
  },
  content: {
    paddingTop: 6,
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  headerSubtitle: {
    fontSize: 13,
    fontWeight: '500',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  circleToggleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleAddBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  weekCard: {
    borderRadius: 22,
    paddingVertical: 14,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  weekCol: {
    flex: 1,
    alignItems: 'center',
  },
  weekDayText: {
    fontSize: 12,
    marginBottom: 8,
  },
  weekCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionLabel: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
    marginTop: 4,
  },
  nextCard: {
    borderRadius: 24,
    padding: 18,
  },
  nextTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  nextLeft: {
    flex: 1,
    marginRight: 12,
  },
  nextDayLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  nextCountdown: {
    fontSize: 13,
    marginTop: 3,
  },
  nextBigTime: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  nextTilesRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  nextTile: {
    flex: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  nextTileLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  nextTileValue: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
  nextEmptyCard: {
    borderRadius: 22,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  nextEmptyText: {
    fontSize: 14,
    fontWeight: '500',
  },
  issue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
  },
  issueText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  issueButton: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
  },
  issueAction: {
    fontSize: 13,
    fontWeight: '700',
  },
  emptyCard: {
    borderRadius: 22,
    paddingVertical: 28,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  empty: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  alarmsList: {
    gap: 12,
  },
  alarmsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  gridItemSlot: {
    width: '48.3%',
    position: 'relative',
  },
  listItemSlot: {
    width: '100%',
    position: 'relative',
  },
  arrivalHalo: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderWidth: 2,
  },
  arrivalBellBadge: {
    position: 'absolute',
    top: -6,
    right: -4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  alarmCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 22,
  },
  alarmGridCard: {
    width: '100%',
    borderRadius: 20,
    padding: 14,
    justifyContent: 'space-between',
    minHeight: 118,
  },
  alarmGridTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: 10,
  },
  alarmGridRepeatTouch: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  alarmGridRepeat: {
    fontSize: 12,
    fontWeight: '600',
  },
  alarmGridBody: {
    gap: 2,
  },
  alarmGridTime: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  alarmGridLabel: {
    fontSize: 12.5,
    fontWeight: '500',
  },
  rowText: {
    flex: 1,
    paddingRight: 12,
  },
  rowTime: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  rowSub: {
    fontSize: 13,
    marginTop: 3,
  },
});
