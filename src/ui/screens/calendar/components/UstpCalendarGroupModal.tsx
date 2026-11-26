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
import {AlertTriangle, GraduationCap, X} from 'lucide-react-native';
import {
  USTP_ACADEMIC_YEAR,
  USTP_ACCENT_COLOR,
  USTP_AUDIENCE_LABELS,
  USTP_CALENDAR_NAME,
  USTP_CALENDAR_SOURCE_LABEL,
  USTP_CATEGORY_COLORS,
  USTP_CATEGORY_LABELS,
  USTP_TERM_LABELS,
  formatUstpDateRange,
  getUstpAcademicEvents,
  type UstpTerm,
} from '../utils/ustpAcademicCalendar';
import {useSchedulePalette, scheduleCardShadow} from './schedulePalette';

export interface UstpCalendarGroupModalProps {
  visible: boolean;
  ustpCalendarVisible: boolean;
  includeGraduate: boolean;
  onToggleVisibility: (visible: boolean) => void;
  onToggleGraduate: (include: boolean) => void;
  onSelectEventDate: (dateStr: string) => void;
  onClose: () => void;
}

const TERM_FILTERS: ReadonlyArray<{key: UstpTerm | 'all'; label: string}> = [
  {key: 'all', label: 'All'},
  {key: 'first', label: '1st Sem'},
  {key: 'second', label: '2nd Sem'},
  {key: 'midyear', label: 'Midyear'},
];

/**
 * Browser and visibility control for the built-in USTP Academic Calendar layer
 * (AY 2026–2027), available to confirmed USTP students.
 */
export const UstpCalendarGroupModal: React.FC<UstpCalendarGroupModalProps> = ({
  visible,
  ustpCalendarVisible,
  includeGraduate,
  onToggleVisibility,
  onToggleGraduate,
  onSelectEventDate,
  onClose,
}) => {
  const palette = useSchedulePalette();
  const [termFilter, setTermFilter] = useState<UstpTerm | 'all'>('all');

  useEffect(() => {
    if (visible) {
      setTermFilter('all');
    }
  }, [visible]);

  const events = useMemo(
    () =>
      getUstpAcademicEvents({
        includeGraduate,
        term: termFilter,
      }),
    [includeGraduate, termFilter],
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View
          testID="ustp-calendar-group-modal"
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
                  {backgroundColor: `${USTP_ACCENT_COLOR}1A`},
                ]}
              >
                <GraduationCap size={18} color={USTP_ACCENT_COLOR} />
              </View>
              <View style={styles.headerTextCol}>
                <Text style={[styles.headerTitle, {color: palette.text}]}>
                  {USTP_CALENDAR_NAME}
                </Text>
                <Text style={[styles.headerSubtitle, {color: palette.muted}]}>
                  {USTP_ACADEMIC_YEAR} · {events.length} event
                  {events.length === 1 ? '' : 's'} · Tap any event to jump
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close USTP Academic Calendar"
              testID="ustp-calendar-close-button"
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
                  Display USTP exams, enrollment, and campus dates
                </Text>
              </View>
              <Switch
                testID="ustp-calendar-modal-visibility-toggle"
                value={ustpCalendarVisible}
                onValueChange={onToggleVisibility}
                trackColor={{false: palette.border, true: USTP_ACCENT_COLOR}}
              />
            </View>

            {/* Graduate School Opt-In Card */}
            <View
              style={[
                styles.controlCard,
                {backgroundColor: palette.card, borderColor: palette.border},
                !palette.isDarkMode && scheduleCardShadow,
              ]}
            >
              <View style={styles.controlTextCol}>
                <Text style={[styles.controlTitle, {color: palette.text}]}>
                  Include Graduate Events
                </Text>
                <Text style={[styles.controlSub, {color: palette.muted}]}>
                  Add Graduate School enrollment, midterms, and finals
                </Text>
              </View>
              <Switch
                testID="ustp-calendar-graduate-toggle"
                value={includeGraduate}
                onValueChange={onToggleGraduate}
                trackColor={{false: palette.border, true: USTP_ACCENT_COLOR}}
              />
            </View>

            {/* Term Filter Chips */}
            <View style={styles.filterRow}>
              {TERM_FILTERS.map(item => {
                const active = termFilter === item.key;
                return (
                  <TouchableOpacity
                    key={item.key}
                    testID={`ustp-term-filter-${item.key}`}
                    onPress={() => setTermFilter(item.key)}
                    style={[
                      styles.filterChip,
                      {
                        backgroundColor: active
                          ? USTP_ACCENT_COLOR
                          : palette.card,
                        borderColor: active
                          ? USTP_ACCENT_COLOR
                          : palette.border,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{selected: active}}
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

            {/* Event Rows */}
            {events.map(ev => {
              const stripeColor =
                USTP_CATEGORY_COLORS[ev.category] || USTP_ACCENT_COLOR;
              return (
                <TouchableOpacity
                  key={ev.id}
                  testID={`ustp-event-row-${ev.id}`}
                  activeOpacity={0.78}
                  onPress={() => {
                    onSelectEventDate(ev.startDate);
                    onClose();
                  }}
                  style={[
                    styles.eventCard,
                    {backgroundColor: palette.card, borderColor: palette.border},
                    !palette.isDarkMode && scheduleCardShadow,
                  ]}
                >
                  <View
                    style={[styles.colorStripe, {backgroundColor: stripeColor}]}
                  />
                  <View style={styles.eventBody}>
                    <View style={styles.eventTopRow}>
                      <Text style={[styles.eventDate, {color: stripeColor}]}>
                        {formatUstpDateRange(ev.startDate, ev.endDate)}
                      </Text>
                      <View style={styles.badgeGroup}>
                        {ev.audience === 'gr' && (
                          <View
                            style={[
                              styles.audienceBadge,
                              {backgroundColor: `${USTP_ACCENT_COLOR}18`},
                            ]}
                          >
                            <Text
                              style={[
                                styles.audienceBadgeText,
                                {color: USTP_ACCENT_COLOR},
                              ]}
                            >
                              {USTP_AUDIENCE_LABELS.gr}
                            </Text>
                          </View>
                        )}
                        <View
                          style={[
                            styles.kindBadge,
                            {backgroundColor: palette.surface},
                          ]}
                        >
                          <Text
                            style={[
                              styles.kindBadgeText,
                              {color: palette.muted},
                            ]}
                          >
                            {USTP_TERM_LABELS[ev.term]} ·{' '}
                            {USTP_CATEGORY_LABELS[ev.category]}
                          </Text>
                        </View>
                      </View>
                    </View>

                    <Text style={[styles.eventName, {color: palette.text}]}>
                      {ev.title}
                    </Text>

                    {ev.description ? (
                      <Text style={[styles.eventDesc, {color: palette.muted}]}>
                        {ev.description}
                      </Text>
                    ) : null}

                    {ev.displayMode === 'endpoints' ? (
                      <Text
                        style={[styles.endpointHint, {color: palette.muted}]}
                      >
                        Shown on Start and Deadline dates on the calendar grid
                      </Text>
                    ) : null}

                    {ev.needsConfirmation && ev.caveatNote ? (
                      <View
                        style={[
                          styles.caveatBox,
                          {
                            backgroundColor: palette.isDarkMode
                              ? 'rgba(217, 119, 6, 0.18)'
                              : '#FEF3C7',
                            borderColor: palette.isDarkMode
                              ? 'rgba(217, 119, 6, 0.4)'
                              : '#F59E0B',
                          },
                        ]}
                      >
                        <AlertTriangle size={13} color="#D97706" />
                        <Text
                          style={[
                            styles.caveatText,
                            {
                              color: palette.isDarkMode
                                ? '#FCD34D'
                                : '#92400E',
                            },
                          ]}
                        >
                          {ev.caveatNote}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </TouchableOpacity>
              );
            })}

            {/* Source Note */}
            <Text style={[styles.sourceFootnote, {color: palette.muted}]}>
              Source: {USTP_CALENDAR_SOURCE_LABEL} (CDO). Published dates are
              for reference; official USTP advisories and class schedules
              supersede.
            </Text>
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
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginVertical: 2,
  },
  filterChip: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  eventCard: {
    flexDirection: 'row',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  colorStripe: {
    width: 5,
  },
  eventBody: {
    flex: 1,
    padding: 12,
    gap: 4,
  },
  eventTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 6,
  },
  eventDate: {
    fontSize: 12,
    fontWeight: '800',
  },
  badgeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  audienceBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  audienceBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  kindBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  kindBadgeText: {
    fontSize: 10.5,
    fontWeight: '600',
  },
  eventName: {
    fontSize: 15,
    fontWeight: '700',
  },
  eventDesc: {
    fontSize: 12.5,
    lineHeight: 17,
  },
  endpointHint: {
    fontSize: 11,
    fontStyle: 'italic',
  },
  caveatBox: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  caveatText: {
    flex: 1,
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: '500',
  },
  sourceFootnote: {
    fontSize: 11.5,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 8,
  },
});
