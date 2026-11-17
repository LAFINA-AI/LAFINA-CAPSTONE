import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  AlarmClock,
  Moon,
  Sparkles,
  Sun,
  Sunrise,
  Sunset,
  Trash2,
  Vibrate,
  X,
} from 'lucide-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useTheme} from '../../../contexts/ThemeContext';
import {useReducedMotion} from '../../../hooks/useReducedMotion';
import {Fonts, ModernLayout, Spacing} from '../../../theme';
import type {Alarm, AlarmInput} from '../../../../storage';
import {
  DAY_BITS,
  DAY_ORDER,
  DAY_SHORT,
  EVERY_DAY,
  WEEKDAYS,
  WEEKEND,
  describeRepeat,
  describeTimeUntil,
  formatAlarmTime,
  nextAlarmTrigger,
} from '../../../../scheduler/alarmSchedule';
import {ScrollWheelPicker, type ScrollWheelOption} from './ScrollWheelPicker';
import {scheduleCardShadow, useSchedulePalette} from './schedulePalette';

const SNOOZE_CHOICES = [5, 9, 10, 15] as const;
const QUICK_LABEL_SUGGESTIONS = [
  'Wake up',
  'Class',
  'Study',
  'Quiz',
  'Lab',
] as const;
const WHEEL_ITEM_HEIGHT = 42;
const WHEEL_VISIBLE_COUNT = 5;

const pad2 = (n: number): string => String(n).padStart(2, '0');

const HOURS_12_OPTIONS: ReadonlyArray<ScrollWheelOption<number>> = Array.from(
  {length: 12},
  (_, idx) => {
    const h = idx + 1;
    return {value: h, label: String(h), accessibilityLabel: `${h} o'clock`};
  },
);

const HOURS_24_OPTIONS: ReadonlyArray<ScrollWheelOption<number>> = Array.from(
  {length: 24},
  (_, h) => ({
    value: h,
    label: pad2(h),
    accessibilityLabel: `${pad2(h)} hours`,
  }),
);

const MINUTE_OPTIONS: ReadonlyArray<ScrollWheelOption<number>> = Array.from(
  {length: 60},
  (_, m) => ({
    value: m,
    label: pad2(m),
    accessibilityLabel: `${pad2(m)} minutes`,
  }),
);

const PERIOD_OPTIONS: ReadonlyArray<ScrollWheelOption<'AM' | 'PM'>> = [
  {value: 'AM', label: 'AM', accessibilityLabel: 'AM'},
  {value: 'PM', label: 'PM', accessibilityLabel: 'PM'},
];

const getTimeOfDayMeta = (
  hour: number,
): {label: string; kind: 'sunrise' | 'sun' | 'sunset' | 'moon'} => {
  if (hour >= 5 && hour < 10) return {label: 'Morning', kind: 'sunrise'};
  if (hour >= 10 && hour < 17) return {label: 'Daytime', kind: 'sun'};
  if (hour >= 17 && hour < 20) return {label: 'Evening', kind: 'sunset'};
  return {label: 'Night', kind: 'moon'};
};

const formatPreviewDay = (target: Date, now: Date): string => {
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
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][target.getDay()];
};

interface DayCircleButtonProps {
  dayKey: (typeof DAY_ORDER)[number];
  selected: boolean;
  labelShort: string;
  accentColor: string;
  surfaceColor: string;
  borderColor: string;
  textColor: string;
  reducedMotion: boolean;
  onToggle: () => void;
}

const DayCircleButton: React.FC<DayCircleButtonProps> = ({
  dayKey,
  selected,
  labelShort,
  accentColor,
  surfaceColor,
  borderColor,
  textColor,
  reducedMotion,
  onToggle,
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    if (!reducedMotion) {
      scaleAnim.setValue(0.88);
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 6,
        tension: 260,
        useNativeDriver: true,
      }).start();
    }
    onToggle();
  };

  return (
    <Animated.View style={{transform: [{scale: scaleAnim}]}}>
      <TouchableOpacity
        testID={`alarm-day-${dayKey}`}
        onPress={handlePress}
        activeOpacity={0.8}
        accessibilityRole="checkbox"
        accessibilityLabel={labelShort}
        accessibilityState={{checked: selected}}
        style={[
          styles.dayCircle,
          {
            backgroundColor: selected ? accentColor : surfaceColor,
            borderColor: selected ? accentColor : borderColor,
          },
        ]}
      >
        <Text
          style={[
            styles.dayCircleText,
            {
              color: selected ? '#FFFFFF' : textColor,
              fontWeight: selected ? '700' : '600',
            },
          ]}
        >
          {labelShort[0]}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
};

interface AlarmEditorModalProps {
  visible: boolean;
  /** null = a new alarm. */
  alarm: Alarm | null;
  use24h: boolean;
  onSave: (input: AlarmInput) => string | null;
  onDelete?: () => void;
  onClose: () => void;
}

/**
 * Alarm plan A2 + UI/UX overhaul: spring-animated bottom sheet with an
 * un-nested virtualized scroll-wheel time picker (zero JS-thread scroll lag),
 * live countdown badge, quick time presets, tactile day circles, and theme-aware cards.
 */
export const AlarmEditorModal: React.FC<AlarmEditorModalProps> = ({
  visible,
  alarm,
  use24h,
  onSave,
  onDelete,
  onClose,
}) => {
  const {colors, isModern, modernPalette, modernShadows} = useTheme();
  const palette = useSchedulePalette();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();

  const [hour, setHour] = useState(alarm?.hour ?? 6);
  const [minute, setMinute] = useState(alarm?.minute ?? 0);
  const [repeatDays, setRepeatDays] = useState(alarm?.repeatDays ?? 0);
  const [label, setLabel] = useState(alarm?.label ?? '');
  const [snoozeMinutes, setSnoozeMinutes] = useState(alarm?.snoozeMinutes ?? 9);
  const [vibrate, setVibrate] = useState(alarm?.vibrate ?? true);
  const [briefing, setBriefing] = useState(alarm?.briefing ?? false);
  const [error, setError] = useState<string | null>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  const backdropAnim = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(48)).current;
  const dragY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      setKeyboardOpen(false);
      return;
    }
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setKeyboardOpen(true),
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardOpen(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    setHour(alarm?.hour ?? 6);
    setMinute(alarm?.minute ?? 0);
    setRepeatDays(alarm?.repeatDays ?? 0);
    setLabel(alarm?.label ?? '');
    setSnoozeMinutes(alarm?.snoozeMinutes ?? 9);
    setVibrate(alarm?.vibrate ?? true);
    setBriefing(alarm?.briefing ?? false);
    setError(null);
    dragY.setValue(0);

    if (reducedMotion) {
      backdropAnim.setValue(1);
      sheetTranslateY.setValue(0);
      return;
    }

    backdropAnim.setValue(0);
    sheetTranslateY.setValue(48);
    const anim = Animated.parallel([
      Animated.timing(backdropAnim, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(sheetTranslateY, {
        toValue: 0,
        tension: 240,
        friction: 24,
        useNativeDriver: true,
      }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [visible, alarm, reducedMotion, backdropAnim, sheetTranslateY, dragY]);

  const handleCloseAnimated = useCallback(() => {
    if (reducedMotion) {
      onClose();
      return;
    }
    Animated.parallel([
      Animated.timing(backdropAnim, {
        toValue: 0,
        duration: 140,
        useNativeDriver: true,
      }),
      Animated.timing(sheetTranslateY, {
        toValue: 64,
        duration: 140,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      dragY.setValue(0);
      onClose();
    });
  }, [backdropAnim, dragY, onClose, reducedMotion, sheetTranslateY]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_evt, gesture) =>
          gesture.dy > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.2,
        onPanResponderMove: (_evt, gesture) => {
          const next = Math.max(0, gesture.dy);
          dragY.setValue(next);
          backdropAnim.setValue(Math.max(0.25, 1 - next / 280));
        },
        onPanResponderRelease: (_evt, gesture) => {
          if (gesture.dy > 88 || gesture.vy > 0.65) {
            Animated.parallel([
              Animated.timing(dragY, {
                toValue: 320,
                duration: 140,
                useNativeDriver: true,
              }),
              Animated.timing(backdropAnim, {
                toValue: 0,
                duration: 140,
                useNativeDriver: true,
              }),
            ]).start(() => {
              dragY.setValue(0);
              onClose();
            });
          } else {
            Animated.parallel([
              Animated.spring(dragY, {
                toValue: 0,
                tension: 240,
                friction: 24,
                useNativeDriver: true,
              }),
              Animated.timing(backdropAnim, {
                toValue: 1,
                duration: 140,
                useNativeDriver: true,
              }),
            ]).start();
          }
        },
      }),
    [backdropAnim, dragY, onClose],
  );

  const handleHourChange = useCallback(
    (nextHourValue: number) => {
      if (use24h) {
        setHour(nextHourValue);
        return;
      }
      setHour(prevHour => {
        const currentPeriod: 'AM' | 'PM' = prevHour >= 12 ? 'PM' : 'AM';
        return currentPeriod === 'AM'
          ? nextHourValue === 12
            ? 0
            : nextHourValue
          : nextHourValue === 12
          ? 12
          : nextHourValue + 12;
      });
    },
    [use24h],
  );

  const handlePeriodChange = useCallback((nextPeriod: 'AM' | 'PM') => {
    setHour(prevHour => {
      const mod12 = prevHour % 12;
      return nextPeriod === 'AM' ? mod12 : mod12 + 12;
    });
  }, []);

  if (!visible) return null;

  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  const period: 'AM' | 'PM' = hour >= 12 ? 'PM' : 'AM';

  const toggleDay = (bit: number) => setRepeatDays(days => days ^ bit);

  const applyRelativeOffset = (minutesAhead: number) => {
    const target = new Date(Date.now() + minutesAhead * 60_000);
    setHour(target.getHours());
    setMinute(target.getMinutes());
  };

  const applyFixedTime = (targetHour: number, targetMinute: number) => {
    setHour(targetHour);
    setMinute(targetMinute);
  };

  const now = new Date();
  const previewTrigger = nextAlarmTrigger(
    {
      hour,
      minute,
      repeatDays,
      oneShotDate: null,
      enabled: true,
    },
    now,
  );
  const previewSummary = previewTrigger
    ? `${formatPreviewDay(previewTrigger, now)} · ${describeTimeUntil(
        previewTrigger,
        now,
      )}`
    : 'Scheduled';

  const timeOfDay = getTimeOfDayMeta(hour);
  const renderTimeOfDayIcon = () => {
    const iconColor = palette.accent;
    switch (timeOfDay.kind) {
      case 'sunrise':
        return <Sunrise size={14} color={iconColor} />;
      case 'sun':
        return <Sun size={14} color={iconColor} />;
      case 'sunset':
        return <Sunset size={14} color={iconColor} />;
      default:
        return <Moon size={14} color={iconColor} />;
    }
  };

  const save = () => {
    const problem = onSave({
      hour,
      minute,
      repeatDays,
      label: label.trim(),
      snoozeMinutes,
      vibrate,
      briefing,
      enabled: true,
      // A changed one-shot rings the next time this clock time comes.
      oneShotDate: null,
    });
    setError(problem);
  };

  const softAccentBg = isModern ? modernPalette.softViolet : `${colors.red}16`;
  const wheelBoxBg = palette.isDarkMode ? palette.bg : palette.surface;
  const cardSurfaceBg = palette.isDarkMode ? palette.bg : palette.surface;
  const lensBg = palette.card;
  const activeAccent = palette.accent;
  const repeatSummary = describeRepeat(repeatDays);

  const combinedTranslateY = Animated.add(sheetTranslateY, dragY);

  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent
      onRequestClose={handleCloseAnimated}
    >
      <View style={styles.modalRoot}>
        <Animated.View
          style={[
            styles.backdrop,
            {backgroundColor: colors.overlay, opacity: backdropAnim},
          ]}
        >
          <Pressable
            style={styles.backdropDismiss}
            onPress={handleCloseAnimated}
            accessibilityLabel="Close alarm editor"
          />
        </Animated.View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardWrap}
          pointerEvents="box-none"
        >
          <Animated.View
            testID="alarm-editor-sheet"
            style={[
              styles.sheet,
              isModern ? modernShadows.floating : undefined,
              {
                backgroundColor: palette.card,
                borderColor: palette.border,
                transform: [{translateY: combinedTranslateY}],
              },
            ]}
          >
            {/* Drag Handle + Header (Swipe Down to Dismiss) */}
            <View {...panResponder.panHandlers} style={styles.dragHeaderZone}>
              <View
                style={[styles.dragHandle, {backgroundColor: palette.border}]}
              />
              <View style={styles.headerRow}>
                <View style={styles.headerLeft}>
                  <View
                    style={[
                      styles.headerIconPill,
                      {backgroundColor: softAccentBg},
                    ]}
                  >
                    <AlarmClock size={19} color={activeAccent} />
                  </View>
                  <View style={styles.headerTextCol}>
                    <Text style={[styles.title, {color: palette.text}]}>
                      {alarm ? 'Edit alarm' : 'New alarm'}
                    </Text>
                    <Text
                      style={[styles.headerSub, {color: palette.muted}]}
                      numberOfLines={1}
                    >
                      Scroll wheels to pick a time
                    </Text>
                  </View>
                </View>
                <View style={styles.headerActions}>
                  {onDelete && (
                    <TouchableOpacity
                      testID="alarm-delete-button"
                      onPress={onDelete}
                      accessibilityRole="button"
                      accessibilityLabel="Delete alarm"
                      style={[
                        styles.headerCircleBtn,
                        {backgroundColor: palette.dangerSoft},
                      ]}
                    >
                      <Trash2 size={17} color={palette.danger} />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    onPress={handleCloseAnimated}
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                    style={[
                      styles.headerCircleBtn,
                      {backgroundColor: palette.surface},
                    ]}
                  >
                    <X size={18} color={palette.text} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Un-nested Hero Scrollable Drum Time Picker (zero nested-scroll lag) */}
            {!keyboardOpen && (
              <View style={styles.wheelSectionWrap}>
                <View
                  style={[
                    styles.wheelHeroCard,
                    {
                      backgroundColor: wheelBoxBg,
                      borderColor: palette.border,
                    },
                  ]}
                >
                  <View style={styles.wheelTopBar}>
                    <View
                      style={[
                        styles.timeOfDayPill,
                        {backgroundColor: softAccentBg},
                      ]}
                    >
                      {renderTimeOfDayIcon()}
                      <Text
                        testID="alarm-time-readout"
                        style={[styles.timeReadoutText, {color: activeAccent}]}
                      >
                        {`${timeOfDay.label} · ${formatAlarmTime(
                          hour,
                          minute,
                          use24h,
                        )}`}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.countdownBadge,
                        {
                          backgroundColor: palette.card,
                          borderColor: palette.border,
                        },
                      ]}
                    >
                      <Text
                        testID="alarm-countdown-badge"
                        style={[styles.countdownText, {color: palette.text}]}
                        numberOfLines={1}
                      >
                        {previewSummary}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.wheelStage}>
                    {/* Center Selection Lens */}
                    <View
                      pointerEvents="none"
                      style={[
                        styles.selectionLens,
                        !palette.isDarkMode && scheduleCardShadow,
                        {
                          backgroundColor: lensBg,
                          borderColor: `${activeAccent}42`,
                          top: WHEEL_ITEM_HEIGHT * 2 - 1,
                          height: WHEEL_ITEM_HEIGHT + 2,
                        },
                      ]}
                    />

                    <View style={styles.wheelColumnsRow}>
                      <ScrollWheelPicker
                        testID="alarm-wheel-hour"
                        accessibilityLabel="Alarm hour"
                        options={use24h ? HOURS_24_OPTIONS : HOURS_12_OPTIONS}
                        value={use24h ? hour : hour12}
                        onChange={handleHourChange}
                        loop
                        itemHeight={WHEEL_ITEM_HEIGHT}
                        visibleCount={WHEEL_VISIBLE_COUNT}
                        textColor={palette.text}
                        fontSize={28}
                        reducedMotion={reducedMotion}
                        style={styles.wheelDigitCol}
                      />

                      <Text
                        style={[styles.wheelColon, {color: activeAccent}]}
                        accessibilityElementsHidden
                        importantForAccessibility="no"
                      >
                        :
                      </Text>

                      <ScrollWheelPicker
                        testID="alarm-wheel-minute"
                        accessibilityLabel="Alarm minute"
                        options={MINUTE_OPTIONS}
                        value={minute}
                        onChange={setMinute}
                        loop
                        itemHeight={WHEEL_ITEM_HEIGHT}
                        visibleCount={WHEEL_VISIBLE_COUNT}
                        textColor={palette.text}
                        fontSize={28}
                        reducedMotion={reducedMotion}
                        style={styles.wheelDigitCol}
                      />

                      {!use24h && (
                        <ScrollWheelPicker
                          testID="alarm-wheel-period"
                          accessibilityLabel="AM or PM"
                          options={PERIOD_OPTIONS}
                          value={period}
                          onChange={handlePeriodChange}
                          loop={false}
                          itemHeight={WHEEL_ITEM_HEIGHT}
                          visibleCount={WHEEL_VISIBLE_COUNT}
                          textColor={activeAccent}
                          fontSize={19}
                          reducedMotion={reducedMotion}
                          style={styles.wheelPeriodCol}
                        />
                      )}
                    </View>
                  </View>

                  {/* Quick Time Jump Presets */}
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.quickPresetRow}
                  >
                    <TouchableOpacity
                      testID="alarm-preset-plus15"
                      onPress={() => applyRelativeOffset(15)}
                      activeOpacity={0.75}
                      style={[
                        styles.quickPresetChip,
                        {
                          backgroundColor: palette.card,
                          borderColor: palette.border,
                        },
                      ]}
                    >
                      <Text
                        style={[styles.quickPresetText, {color: palette.text}]}
                      >
                        +15 min
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      testID="alarm-preset-plus30"
                      onPress={() => applyRelativeOffset(30)}
                      activeOpacity={0.75}
                      style={[
                        styles.quickPresetChip,
                        {
                          backgroundColor: palette.card,
                          borderColor: palette.border,
                        },
                      ]}
                    >
                      <Text
                        style={[styles.quickPresetText, {color: palette.text}]}
                      >
                        +30 min
                      </Text>
                    </TouchableOpacity>
                    {(
                      [
                        [6, 0],
                        [7, 0],
                        [8, 0],
                      ] as const
                    ).map(([presetH, presetM]) => {
                      const active = hour === presetH && minute === presetM;
                      const text = formatAlarmTime(presetH, presetM, use24h);
                      return (
                        <TouchableOpacity
                          key={`${presetH}:${presetM}`}
                          testID={`alarm-preset-${presetH}-${presetM}`}
                          onPress={() => applyFixedTime(presetH, presetM)}
                          activeOpacity={0.75}
                          style={[
                            styles.quickPresetChip,
                            {
                              backgroundColor: active
                                ? activeAccent
                                : palette.card,
                              borderColor: active
                                ? activeAccent
                                : palette.border,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.quickPresetText,
                              {color: active ? '#FFFFFF' : palette.text},
                            ]}
                          >
                            {text}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              </View>
            )}

            {/* Independent Scrollable Options Below the Wheel */}
            <ScrollView
              style={styles.optionsScroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollBody}
            >
              {/* Repeat Section */}
              <View
                style={[
                  styles.bentoSection,
                  {
                    backgroundColor: cardSurfaceBg,
                    borderColor: palette.border,
                  },
                ]}
              >
                <View style={styles.sectionHeaderRow}>
                  <Text style={[styles.sectionLabel, {color: palette.muted}]}>
                    REPEAT
                  </Text>
                  <Text style={[styles.sectionMeta, {color: activeAccent}]}>
                    {repeatSummary}
                  </Text>
                </View>

                <View style={styles.presetPillsRow}>
                  {(
                    [
                      ['Once', 0, 'alarm-repeat-once'],
                      ['Weekdays', WEEKDAYS, 'alarm-repeat-weekdays'],
                      ['Weekends', WEEKEND, 'alarm-repeat-weekends'],
                      ['Every day', EVERY_DAY, 'alarm-repeat-everyday'],
                    ] as const
                  ).map(([name, value, id]) => {
                    const selected = repeatDays === value;
                    return (
                      <TouchableOpacity
                        key={name}
                        testID={id}
                        style={[
                          styles.pillChip,
                          {
                            backgroundColor: selected
                              ? activeAccent
                              : palette.card,
                            borderColor: selected
                              ? activeAccent
                              : palette.border,
                          },
                        ]}
                        onPress={() => setRepeatDays(value)}
                        accessibilityRole="button"
                        accessibilityState={{selected}}
                      >
                        <Text
                          style={[
                            styles.pillChipText,
                            {
                              color: selected ? '#FFFFFF' : palette.text,
                              fontWeight: selected ? '700' : '500',
                            },
                          ]}
                        >
                          {name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={styles.daysCirclesRow}>
                  {DAY_ORDER.map(key => (
                    <DayCircleButton
                      key={key}
                      dayKey={key}
                      selected={(repeatDays & DAY_BITS[key]) !== 0}
                      labelShort={DAY_SHORT[key]}
                      accentColor={activeAccent}
                      surfaceColor={palette.card}
                      borderColor={palette.border}
                      textColor={palette.text}
                      reducedMotion={reducedMotion}
                      onToggle={() => toggleDay(DAY_BITS[key])}
                    />
                  ))}
                </View>
              </View>

              {/* Label Section */}
              <View
                style={[
                  styles.bentoSection,
                  {
                    backgroundColor: cardSurfaceBg,
                    borderColor: palette.border,
                  },
                ]}
              >
                <Text style={[styles.sectionLabel, {color: palette.muted}]}>
                  LABEL
                </Text>
                <View
                  style={[
                    styles.inputWrap,
                    {
                      backgroundColor: palette.card,
                      borderColor: palette.border,
                    },
                  ]}
                >
                  <TextInput
                    testID="alarm-label-input"
                    value={label}
                    onChangeText={text => setLabel(text.slice(0, 60))}
                    placeholder="Wake up, 8 AM class, Study..."
                    placeholderTextColor={palette.muted}
                    maxLength={60}
                    style={[styles.input, {color: palette.text}]}
                    accessibilityLabel="Alarm label"
                  />
                  {label.length > 0 && (
                    <TouchableOpacity
                      onPress={() => setLabel('')}
                      accessibilityRole="button"
                      accessibilityLabel="Clear label"
                      style={[
                        styles.clearLabelBtn,
                        {backgroundColor: palette.surface},
                      ]}
                    >
                      <X size={13} color={palette.muted} />
                    </TouchableOpacity>
                  )}
                </View>

                <View style={styles.labelSuggestionsRow}>
                  {QUICK_LABEL_SUGGESTIONS.map(suggestion => {
                    const active =
                      label.trim().toLowerCase() === suggestion.toLowerCase();
                    return (
                      <TouchableOpacity
                        key={suggestion}
                        testID={`alarm-label-chip-${suggestion}`}
                        onPress={() => setLabel(active ? '' : suggestion)}
                        activeOpacity={0.75}
                        style={[
                          styles.suggestionChip,
                          {
                            backgroundColor: active
                              ? softAccentBg
                              : palette.card,
                            borderColor: active ? activeAccent : palette.border,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.suggestionChipText,
                            {
                              color: active ? activeAccent : palette.muted,
                              fontWeight: active ? '700' : '500',
                            },
                          ]}
                        >
                          {suggestion}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Options Section */}
              <View
                style={[
                  styles.bentoSection,
                  {
                    backgroundColor: cardSurfaceBg,
                    borderColor: palette.border,
                  },
                ]}
              >
                <Text style={[styles.sectionLabel, {color: palette.muted}]}>
                  ALERT & SNOOZE
                </Text>
                <View style={styles.snoozeRow}>
                  {SNOOZE_CHOICES.map(value => {
                    const selected = snoozeMinutes === value;
                    return (
                      <TouchableOpacity
                        key={value}
                        style={[
                          styles.snoozeChip,
                          {
                            backgroundColor: selected
                              ? activeAccent
                              : palette.card,
                            borderColor: selected
                              ? activeAccent
                              : palette.border,
                          },
                        ]}
                        onPress={() => setSnoozeMinutes(value)}
                        accessibilityRole="button"
                        accessibilityLabel={`Snooze ${value} minutes`}
                        accessibilityState={{selected}}
                      >
                        <Text
                          style={[
                            styles.pillChipText,
                            {
                              color: selected ? '#FFFFFF' : palette.text,
                              fontWeight: selected ? '700' : '500',
                            },
                          ]}
                        >
                          {value} min
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View
                  style={[styles.divider, {backgroundColor: palette.border}]}
                />

                <View style={styles.switchRow}>
                  <View style={styles.switchLeading}>
                    <View
                      style={[
                        styles.optionIconBox,
                        {backgroundColor: palette.card},
                      ]}
                    >
                      <Vibrate size={16} color={activeAccent} />
                    </View>
                    <Text style={[styles.switchLabel, {color: palette.text}]}>
                      Vibrate
                    </Text>
                  </View>
                  <Switch
                    testID="alarm-vibrate-switch"
                    value={vibrate}
                    onValueChange={setVibrate}
                    trackColor={{
                      false: palette.border,
                      true: activeAccent,
                    }}
                    thumbColor="#FFFFFF"
                    accessibilityLabel="Vibrate"
                  />
                </View>

                <View
                  style={[styles.divider, {backgroundColor: palette.border}]}
                />

                <View style={styles.switchRow}>
                  <View style={styles.switchLeading}>
                    <View
                      style={[
                        styles.optionIconBox,
                        {backgroundColor: palette.card},
                      ]}
                    >
                      <Sparkles size={16} color={activeAccent} />
                    </View>
                    <View style={styles.switchTextCol}>
                      <Text style={[styles.switchLabel, {color: palette.text}]}>
                        Morning briefing
                      </Text>
                      <Text style={[styles.hint, {color: palette.muted}]}>
                        Reads today&apos;s schedule aloud after you dismiss
                        (works offline).
                      </Text>
                    </View>
                  </View>
                  <Switch
                    testID="alarm-briefing-switch"
                    value={briefing}
                    onValueChange={setBriefing}
                    trackColor={{
                      false: palette.border,
                      true: activeAccent,
                    }}
                    thumbColor="#FFFFFF"
                    accessibilityLabel="Morning briefing"
                  />
                </View>
              </View>

              {error && (
                <Text
                  accessibilityRole="alert"
                  style={[styles.error, {color: palette.danger}]}
                >
                  {error}
                </Text>
              )}
            </ScrollView>

            {/* Sticky Bottom Action Bar */}
            <View
              style={[
                styles.footerBar,
                {
                  borderTopColor: palette.border,
                  backgroundColor: palette.card,
                  paddingBottom: Math.max(insets.bottom, Spacing.md),
                },
              ]}
            >
              <TouchableOpacity
                testID="alarm-cancel-button"
                onPress={handleCloseAnimated}
                style={[
                  styles.footerCancelBtn,
                  {
                    backgroundColor: palette.surface,
                    borderColor: palette.border,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={[styles.footerCancelText, {color: palette.text}]}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="alarm-save-button"
                onPress={save}
                activeOpacity={0.85}
                style={[
                  styles.footerSaveBtn,
                  {backgroundColor: activeAccent},
                  isModern ? modernShadows.subtle : undefined,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Save alarm"
              >
                <Text style={styles.footerSaveText}>
                  {alarm ? 'Save changes' : 'Set alarm'}
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  backdropDismiss: {
    flex: 1,
  },
  keyboardWrap: {
    justifyContent: 'flex-end',
    maxHeight: '94%',
  },
  sheet: {
    maxHeight: '100%',
    borderTopLeftRadius: ModernLayout.borderRadiusSheet,
    borderTopRightRadius: ModernLayout.borderRadiusSheet,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  dragHeaderZone: {
    paddingTop: 10,
    paddingHorizontal: Spacing.lg,
    paddingBottom: 8,
  },
  dragHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  headerIconPill: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextCol: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontFamily: Fonts.heading,
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  headerSub: {
    fontFamily: Fonts.body,
    fontSize: 12,
    marginTop: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerCircleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelSectionWrap: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: 10,
  },
  optionsScroll: {
    flexShrink: 1,
  },
  scrollBody: {
    paddingHorizontal: Spacing.lg,
    paddingTop: 2,
    paddingBottom: Spacing.lg,
    gap: 10,
  },
  wheelHeroCard: {
    borderRadius: 22,
    borderWidth: 1,
    paddingTop: 10,
    paddingBottom: 10,
    paddingHorizontal: 10,
  },
  wheelTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  timeOfDayPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  timeReadoutText: {
    fontFamily: Fonts.heading,
    fontSize: 12,
    fontWeight: '700',
  },
  countdownBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: '52%',
  },
  countdownText: {
    fontFamily: Fonts.body,
    fontSize: 11.5,
    fontWeight: '600',
  },
  wheelStage: {
    position: 'relative',
    justifyContent: 'center',
    marginVertical: 2,
  },
  selectionLens: {
    position: 'absolute',
    left: 4,
    right: 4,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  wheelColumnsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  wheelDigitCol: {
    flex: 1,
    maxWidth: 90,
  },
  wheelColon: {
    fontFamily: Fonts.heading,
    fontSize: 26,
    fontWeight: '800',
    marginHorizontal: 2,
    paddingBottom: 3,
  },
  wheelPeriodCol: {
    width: 66,
    marginLeft: 6,
  },
  quickPresetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingTop: 8,
    paddingHorizontal: 2,
  },
  quickPresetChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  quickPresetText: {
    fontFamily: Fonts.body,
    fontSize: 11.5,
    fontWeight: '600',
  },
  bentoSection: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 13,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionLabel: {
    fontFamily: Fonts.heading,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  sectionMeta: {
    fontFamily: Fonts.heading,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
  },
  presetPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginBottom: 10,
  },
  pillChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillChipText: {
    fontFamily: Fonts.body,
    fontSize: 12.5,
  },
  daysCirclesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dayCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircleText: {
    fontFamily: Fonts.heading,
    fontSize: 12.5,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    minHeight: 44,
  },
  input: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: 14.5,
    paddingVertical: 9,
  },
  clearLabelBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  labelSuggestionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 9,
  },
  suggestionChip: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  suggestionChipText: {
    fontFamily: Fonts.body,
    fontSize: 12,
  },
  snoozeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginBottom: 10,
  },
  snoozeChip: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 2,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 46,
    paddingVertical: 5,
    gap: 10,
  },
  switchLeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  optionIconBox: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchTextCol: {
    flex: 1,
  },
  switchLabel: {
    fontFamily: Fonts.body,
    fontSize: 14,
    fontWeight: '600',
  },
  hint: {
    fontFamily: Fonts.body,
    fontSize: 11.5,
    lineHeight: 16,
    marginTop: 2,
  },
  error: {
    fontFamily: Fonts.body,
    fontSize: 13,
    textAlign: 'center',
  },
  footerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: Spacing.lg,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerCancelBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerCancelText: {
    fontFamily: Fonts.heading,
    fontSize: 14.5,
    fontWeight: '700',
  },
  footerSaveBtn: {
    flex: 1.5,
    minHeight: 46,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerSaveText: {
    color: '#FFFFFF',
    fontFamily: Fonts.heading,
    fontSize: 15,
    fontWeight: '800',
  },
});
