import React, {useEffect, useMemo, useState} from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {ChevronLeft, ChevronRight, Flag, X} from 'lucide-react-native';
import {
  getPhilippineHolidays,
  type HolidayKind,
} from '../utils/philippineHolidays';
import {useSchedulePalette, scheduleCardShadow} from './schedulePalette';

export interface HolidaysGroupModalProps {
  visible: boolean;
  initialYear: number;
  holidaysVisible: boolean;
  onToggleVisibility: (visible: boolean) => void;
  onSelectHolidayDate: (dateStr: string) => void;
  onClose: () => void;
}

const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

const SHORT_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const KIND_BADGE: Record<HolidayKind, string> = {
  regular: 'Regular',
  special: 'Special Non-Working',
  observance: 'Observance',
};

const formatHolidayDateBadge = (dateStr: string): string => {
  const parsed = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateStr;
  return `${SHORT_MONTHS[parsed.getMonth()]} ${parsed.getDate()} · ${
    SHORT_WEEKDAYS[parsed.getDay()]
  }`;
};

/**
 * Browser and visibility control for the built-in Holidays in the Philippines
 * calendar layer.
 */
export const HolidaysGroupModal: React.FC<HolidaysGroupModalProps> = ({
  visible,
  initialYear,
  holidaysVisible,
  onToggleVisibility,
  onSelectHolidayDate,
  onClose,
}) => {
  const palette = useSchedulePalette();
  const [year, setYear] = useState(initialYear);
  const [kindFilter, setKindFilter] = useState<'all' | 'regular' | 'special'>(
    'all',
  );

  useEffect(() => {
    if (visible) {
      setYear(initialYear);
      setKindFilter('all');
    }
  }, [visible, initialYear]);

  const holidays = useMemo(() => {
    const all = getPhilippineHolidays(year);
    if (kindFilter === 'all') return all;
    if (kindFilter === 'regular') return all.filter(h => h.kind === 'regular');
    return all.filter(h => h.kind !== 'regular');
  }, [year, kindFilter]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View
          testID="holidays-group-modal"
          style={[
            styles.sheet,
            {backgroundColor: palette.bg, borderColor: palette.border},
          ]}
        >
          {/* Header */}
          <View
            style={[
              styles.header,
              {backgroundColor: palette.card, borderBottomColor: palette.border},
            ]}
          >
            <View style={styles.headerLeft}>
              <View
                style={[
                  styles.headerIconBadge,
                  {backgroundColor: '#0B80431A'},
                ]}
              >
                <Flag size={18} color="#0B8043" />
              </View>
              <View style={styles.headerTextCol}>
                <Text style={[styles.headerTitle, {color: palette.text}]}>
                  Holidays in the Philippines
                </Text>
                <Text style={[styles.headerSubtitle, {color: palette.muted}]}>
                  {holidays.length} holidays in {year} · Tap any date to view
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close Philippine holidays"
              testID="holidays-close-button"
              style={[styles.closeBtn, {backgroundColor: palette.surface}]}
            >
              <X size={18} color={palette.muted} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Visibility Toggle Card */}
            <View
              style={[
                styles.controlCard,
                {backgroundColor: palette.card, borderColor: palette.border},
                !palette.isDarkMode && scheduleCardShadow,
              ]}
            >
              <View style={styles.controlTextCol}>
                <Text style={[styles.controlTitle, {color: palette.text}]}>
                  Show on Calendar
                </Text>
                <Text style={[styles.controlSub, {color: palette.muted}]}>
                  Display Philippine regular and special holidays
                </Text>
              </View>
              <Switch
                testID="holidays-modal-visibility-toggle"
                value={holidaysVisible}
                onValueChange={onToggleVisibility}
                trackColor={{false: palette.border, true: '#0B8043'}}
              />
            </View>

            {/* Year Switcher + Filter Chips */}
            <View style={styles.controlsBar}>
              <View
                style={[
                  styles.yearStepper,
                  {backgroundColor: palette.card, borderColor: palette.border},
                ]}
              >
                <TouchableOpacity
                  testID="holidays-year-prev"
                  onPress={() => setYear(y => y - 1)}
                  style={styles.yearBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Previous year"
                >
                  <ChevronLeft size={17} color={palette.text} />
                </TouchableOpacity>
                <Text style={[styles.yearText, {color: palette.text}]}>
                  {year}
                </Text>
                <TouchableOpacity
                  testID="holidays-year-next"
                  onPress={() => setYear(y => y + 1)}
                  style={styles.yearBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Next year"
                >
                  <ChevronRight size={17} color={palette.text} />
                </TouchableOpacity>
              </View>

              <View style={styles.filterRow}>
                {(
                  [
                    {key: 'all', label: 'All'},
                    {key: 'regular', label: 'Regular'},
                    {key: 'special', label: 'Special'},
                  ] as const
                ).map(item => {
                  const active = kindFilter === item.key;
                  return (
                    <TouchableOpacity
                      key={item.key}
                      onPress={() => setKindFilter(item.key)}
                      style={[
                        styles.filterChip,
                        {
                          backgroundColor: active ? '#0B8043' : palette.card,
                          borderColor: active ? '#0B8043' : palette.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          {color: active ? '#FFFFFF' : palette.text},
                        ]}
                      >
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Holiday Rows */}
            {holidays.map(holiday => (
              <TouchableOpacity
                key={`${holiday.date}-${holiday.name}`}
                activeOpacity={0.78}
                onPress={() => {
                  onSelectHolidayDate(holiday.date);
                  onClose();
                }}
                style={[
                  styles.holidayCard,
                  {backgroundColor: palette.card, borderColor: palette.border},
                  !palette.isDarkMode && scheduleCardShadow,
                ]}
              >
                <View
                  style={[
                    styles.colorStripe,
                    {
                      backgroundColor:
                        holiday.kind === 'regular'
                          ? '#0B8043'
                          : holiday.kind === 'special'
                          ? '#0891B2'
                          : palette.muted,
                    },
                  ]}
                />
                <View style={styles.holidayBody}>
                  <View style={styles.holidayTopRow}>
                    <Text style={[styles.holidayDate, {color: '#0B8043'}]}>
                      {formatHolidayDateBadge(holiday.date)}
                    </Text>
                    <View
                      style={[
                        styles.kindBadge,
                        {backgroundColor: palette.surface},
                      ]}
                    >
                      <Text
                        style={[styles.kindBadgeText, {color: palette.muted}]}
                      >
                        {KIND_BADGE[holiday.kind]}
                        {holiday.tentative ? ' · Est.' : ''}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.holidayName, {color: palette.text}]}>
                    {holiday.name}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    height: '88%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
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
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  headerIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  headerTextCol: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 1,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 34,
    gap: 10,
  },
  controlCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  controlTextCol: {
    flex: 1,
    marginRight: 10,
  },
  controlTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  controlSub: {
    fontSize: 12,
    marginTop: 2,
  },
  controlsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginVertical: 2,
  },
  yearStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 4,
    height: 36,
  },
  yearBtn: {
    padding: 6,
  },
  yearText: {
    fontSize: 14,
    fontWeight: '800',
    paddingHorizontal: 6,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 6,
  },
  filterChip: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  holidayCard: {
    flexDirection: 'row',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  colorStripe: {
    width: 5,
  },
  holidayBody: {
    flex: 1,
    padding: 12,
    gap: 4,
  },
  holidayTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  holidayDate: {
    fontSize: 12,
    fontWeight: '800',
  },
  kindBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  kindBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  holidayName: {
    fontSize: 15,
    fontWeight: '700',
  },
});
