import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Calendar } from 'lucide-react-native';
import { useTheme } from '../../../contexts/ThemeContext';
import { Colors } from '../../../theme';
import {
  timeStringToDate,
  dateToTimeString,
  formatTimeForDisplay,
  formatLocalDate,
} from '../utils/calendarHelpers';
import { TimeBlockModalState } from '../types';
import { Shadows } from '../../../theme';
import { parseRrule } from '../../../../storage/rruleHelper';

interface AddBlockModalProps {
  state: TimeBlockModalState;
  timeFormat24h: boolean;
}

export const AddBlockModal: React.FC<AddBlockModalProps> = ({ state, timeFormat24h }) => {
  const { colors } = useTheme();

  // Local recurrence form states
  const [repeatFreq, setRepeatFreq] = useState<'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'>('NONE');
  const [repeatInterval, setRepeatInterval] = useState('1');
  const [repeatWeekDays, setRepeatWeekDays] = useState<string[]>([]);
  const [repeatEndType, setRepeatEndType] = useState<'NEVER' | 'UNTIL' | 'COUNT'>('NEVER');
  const [repeatUntil, setRepeatUntil] = useState(''); // YYYY-MM-DD
  const [repeatCount, setRepeatCount] = useState('10');
  const [showUntilDatePicker, setShowUntilDatePicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Sync form recurrenceRule to local state when modal becomes visible
  useEffect(() => {
    if (state.visible) {
      if (state.editingBlock && state.editingBlock.recurrenceRule) {
        const rule = parseRrule(state.editingBlock.recurrenceRule);
        if (rule) {
          setRepeatFreq(rule.freq);
          setRepeatInterval(String(rule.interval || 1));
          setRepeatWeekDays(rule.byday || []);
          if (rule.until) {
            setRepeatEndType('UNTIL');
            setRepeatUntil(rule.until);
          } else if (rule.count) {
            setRepeatEndType('COUNT');
            setRepeatCount(String(rule.count));
          } else {
            setRepeatEndType('NEVER');
          }
          return;
        }
      }
      // Reset defaults
      setRepeatFreq('NONE');
      setRepeatInterval('1');
      setRepeatWeekDays([]);
      setRepeatEndType('NEVER');
      setRepeatUntil('');
      setRepeatCount('10');
    }
  }, [state.visible, state.editingBlock]);

  const handleSaveLocal = () => {
    let ruleStr: string | null = null;
    if (repeatFreq !== 'NONE') {
      const parts = [`FREQ=${repeatFreq}`];
      const parsedInterval = parseInt(repeatInterval, 10);
      if (!isNaN(parsedInterval) && parsedInterval > 0) {
        parts.push(`INTERVAL=${parsedInterval}`);
      }
      if (repeatFreq === 'WEEKLY' && repeatWeekDays.length > 0) {
        parts.push(`BYDAY=${repeatWeekDays.join(',')}`);
      }
      if (repeatEndType === 'UNTIL' && repeatUntil) {
        const cleanUntil = repeatUntil.replace(/-/g, '');
        parts.push(`UNTIL=${cleanUntil}T235959Z`);
      } else if (repeatEndType === 'COUNT' && repeatCount) {
        const parsedCount = parseInt(repeatCount, 10);
        if (!isNaN(parsedCount) && parsedCount > 0) {
          parts.push(`COUNT=${parsedCount}`);
        }
      }
      ruleStr = parts.join(';');
    }
    state.save(ruleStr);
  };

  return (
    <Modal visible={state.visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.cardBg, maxHeight: '90%' }]}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollContent}
          >
            <Text style={[styles.modalHeaderTitle, { color: colors.textPrimary }]}>
              {state.editingBlock ? 'Edit Time Block' : 'Create Time Block'}
            </Text>

            <TextInput
              style={[styles.modalInput, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.inputBg }]}
              placeholder="Deep Work, Study, Lunch..."
              placeholderTextColor={colors.placeholder}
              value={state.form.title}
              onChangeText={(v) => state.updateField('title', v)}
            />

            {/* Target Date Row */}
            <View style={styles.datePickerRow}>
              <Text style={[styles.timeInputLabel, { color: colors.textSecondary }]}>Date</Text>
              <TouchableOpacity
                style={[styles.dateSelectorBtn, { borderColor: colors.border, backgroundColor: colors.inputBg }]}
                onPress={() => setShowDatePicker(true)}
                activeOpacity={0.7}
              >
                <Calendar size={15} color={colors.textSecondary} style={{ marginRight: 8 }} />
                <Text style={[styles.dateSelectorBtnText, { color: colors.textPrimary }]}>
                  {state.form.date || formatLocalDate(new Date())}
                </Text>
              </TouchableOpacity>
              {showDatePicker && (
                <DateTimePicker
                  value={state.form.date ? new Date(`${state.form.date}T00:00:00`) : new Date()}
                  mode="date"
                  display="default"
                  onChange={(_event, date) => {
                    setShowDatePicker(false);
                    if (date) state.updateField('date', formatLocalDate(date));
                  }}
                />
              )}
            </View>

            <View style={styles.modalTimeRow}>
              <View style={styles.timeInputCol}>
                <Text style={[styles.timeInputLabel, { color: colors.textSecondary }]}>Start Time</Text>
                <TouchableOpacity
                  style={[styles.timePickerBtn, { borderColor: colors.border, backgroundColor: colors.inputBg }]}
                  onPress={() => state.setShowStartPicker(true)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.timePickerBtnText, { color: colors.textPrimary }]}>
                    {formatTimeForDisplay(state.form.startTime, timeFormat24h)}
                  </Text>
                </TouchableOpacity>
                {state.showStartPicker && (
                  <DateTimePicker
                    value={timeStringToDate(state.form.startTime)}
                    mode="time"
                    is24Hour={timeFormat24h}
                    display="default"
                    onChange={(_event, date) => {
                      state.setShowStartPicker(false);
                      if (date) state.updateField('startTime', dateToTimeString(date));
                    }}
                  />
                )}
              </View>
              <View style={styles.timeInputCol}>
                <Text style={[styles.timeInputLabel, { color: colors.textSecondary }]}>End Time</Text>
                <TouchableOpacity
                  style={[styles.timePickerBtn, { borderColor: colors.border, backgroundColor: colors.inputBg }]}
                  onPress={() => state.setShowEndPicker(true)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.timePickerBtnText, { color: colors.textPrimary }]}>
                    {formatTimeForDisplay(state.form.endTime, timeFormat24h)}
                  </Text>
                </TouchableOpacity>
                {state.showEndPicker && (
                  <DateTimePicker
                    value={timeStringToDate(state.form.endTime)}
                    mode="time"
                    is24Hour={timeFormat24h}
                    display="default"
                    onChange={(_event, date) => {
                      state.setShowEndPicker(false);
                      if (date) state.updateField('endTime', dateToTimeString(date));
                    }}
                  />
                )}
              </View>
            </View>

            <View style={styles.categoryRow}>
              {['Academic', 'Work', 'Personal', 'Health', 'Learning'].map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.categoryChip,
                    { borderColor: colors.border, backgroundColor: 'transparent' },
                    state.form.category === cat && { backgroundColor: colors.red, borderColor: colors.red },
                  ]}
                  onPress={() => state.updateField('category', cat)}
                >
                  <Text style={[
                    styles.categoryChipText,
                    { color: colors.textSecondary },
                    state.form.category === cat && { color: colors.white, fontWeight: 'bold' },
                  ]}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.colorRow}>
              {[Colors.blue, Colors.red, Colors.yellow, Colors.success, Colors.gradientPurple].map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[
                    styles.colorBubble,
                    { backgroundColor: c },
                    state.form.color === c && styles.colorBubbleActive,
                    state.form.color === c && { borderColor: colors.textPrimary },
                  ]}
                  onPress={() => state.updateField('color', c)}
                />
              ))}
            </View>

            {/* Recurrence Section */}
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Recurrence</Text>
            <View style={styles.recurrenceContainer}>
              <View style={styles.freqRow}>
                {(['NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const).map((freq) => (
                  <TouchableOpacity
                    key={freq}
                    style={[
                      styles.freqBtn,
                      { borderColor: colors.border, backgroundColor: colors.inputBg },
                      repeatFreq === freq && { backgroundColor: colors.red, borderColor: colors.red },
                    ]}
                    onPress={() => setRepeatFreq(freq)}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      styles.freqBtnText,
                      { color: colors.textSecondary },
                      repeatFreq === freq && { color: colors.white, fontWeight: 'bold' },
                    ]}>
                      {freq === 'NONE' ? 'None' : freq.charAt(0) + freq.slice(1).toLowerCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {repeatFreq !== 'NONE' && (
                <View style={[styles.recurrenceDetails, { borderColor: colors.border, backgroundColor: colors.cardBg }]}>
                  {/* Interval */}
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: colors.textPrimary }]}>Repeat every</Text>
                    <TextInput
                      style={[styles.detailNumberInput, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.inputBg }]}
                      keyboardType="numeric"
                      value={repeatInterval}
                      onChangeText={setRepeatInterval}
                    />
                    <Text style={[styles.detailLabel, { color: colors.textPrimary }]}>
                      {repeatFreq === 'DAILY' ? 'days' : repeatFreq === 'WEEKLY' ? 'weeks' : repeatFreq === 'MONTHLY' ? 'months' : 'years'}
                    </Text>
                  </View>

                  {/* Weekly Days */}
                  {repeatFreq === 'WEEKLY' && (
                    <View style={styles.detailRow}>
                      <Text style={[styles.detailLabel, { color: colors.textPrimary }]}>On days</Text>
                      <View style={styles.weekDaysGrid}>
                        {(['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const).map((day) => {
                          const active = repeatWeekDays.includes(day);
                          return (
                            <TouchableOpacity
                              key={day}
                              style={[
                                styles.dayBubble,
                                { borderColor: colors.border, backgroundColor: colors.inputBg },
                                active && { backgroundColor: colors.red, borderColor: colors.red },
                              ]}
                              onPress={() => {
                                if (active) {
                                  setRepeatWeekDays(repeatWeekDays.filter(d => d !== day));
                                } else {
                                  setRepeatWeekDays([...repeatWeekDays, day]);
                                }
                              }}
                            >
                              <Text style={[
                                styles.dayBubbleText,
                                { color: colors.textSecondary },
                                active && { color: colors.white, fontWeight: 'bold' },
                              ]}>
                                {day[0]}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  )}

                  {/* End Condition */}
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: colors.textPrimary }]}>Ends</Text>
                    <View style={styles.endTypeRow}>
                      {(['NEVER', 'UNTIL', 'COUNT'] as const).map((type) => (
                        <TouchableOpacity
                          key={type}
                          style={[
                            styles.endTypeBtn,
                            { borderColor: colors.border, backgroundColor: colors.inputBg },
                            repeatEndType === type && { backgroundColor: colors.red, borderColor: colors.red },
                          ]}
                          onPress={() => setRepeatEndType(type)}
                        >
                          <Text style={[
                            styles.endTypeBtnText,
                            { color: colors.textSecondary },
                            repeatEndType === type && { color: colors.white, fontWeight: 'bold' },
                          ]}>
                            {type === 'NEVER' ? 'Never' : type === 'UNTIL' ? 'On Date' : 'After'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {/* End Details */}
                  {repeatEndType === 'UNTIL' && (
                    <View style={styles.detailRow}>
                      <Text style={[styles.detailLabel, { color: colors.textPrimary }]}>Until date</Text>
                      <TouchableOpacity
                        style={[styles.dateSelectorBtn, { borderColor: colors.border, backgroundColor: colors.inputBg }]}
                        onPress={() => setShowUntilDatePicker(true)}
                      >
                        <Text style={[styles.dateSelectorBtnText, { color: colors.textPrimary }]}>
                          {repeatUntil || 'Select Date'}
                        </Text>
                      </TouchableOpacity>
                      {showUntilDatePicker && (
                        <DateTimePicker
                          value={repeatUntil ? new Date(repeatUntil) : new Date()}
                          mode="date"
                          display="default"
                          onChange={(_event, date) => {
                            setShowUntilDatePicker(false);
                            if (date) {
                              setRepeatUntil(formatLocalDate(date));
                            }
                          }}
                        />
                      )}
                    </View>
                  )}

                  {repeatEndType === 'COUNT' && (
                    <View style={styles.detailRow}>
                      <Text style={[styles.detailLabel, { color: colors.textPrimary }]}>End after</Text>
                      <TextInput
                        style={[styles.detailNumberInput, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.inputBg }]}
                        keyboardType="numeric"
                        value={repeatCount}
                        onChangeText={setRepeatCount}
                      />
                      <Text style={[styles.detailLabel, { color: colors.textPrimary }]}>occurrences</Text>
                    </View>
                  )}
                </View>
              )}
            </View>

            <TextInput
              style={[styles.modalInput, styles.textArea, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.inputBg }]}
              placeholder="Add optional notes..."
              placeholderTextColor={colors.placeholder}
              multiline
              numberOfLines={3}
              value={state.form.notes}
              onChangeText={(v) => state.updateField('notes', v)}
            />

            <View style={styles.actionRow}>
              {state.editingBlock && (
                <TouchableOpacity
                  style={[styles.modalBtn, styles.deleteBtn]}
                  onPress={() => state.delete(state.editingBlock!.id)}
                >
                  <Text style={styles.modalBtnText}>Delete</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.modalBtn, styles.cancelBtn, { backgroundColor: colors.divider }]}
                onPress={state.close}
              >
                <Text style={[styles.modalBtnTextDark, { color: colors.textPrimary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.saveBtn]}
                onPress={handleSaveLocal}
              >
                <Text style={styles.modalBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxHeight: '90%',
    ...Shadows.card,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  datePickerRow: {
    marginBottom: 12,
  },
  modalHeaderTitle: {
    fontFamily: 'sans-serif-medium',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    marginBottom: 12,
  },
  modalTimeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  timeInputCol: {
    width: '48%',
  },
  timeInputLabel: {
    fontSize: 11,
    marginBottom: 4,
  },
  timePickerBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  timePickerBtnText: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'sans-serif',
    letterSpacing: 1,
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  categoryChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginRight: 6,
    marginBottom: 6,
  },
  categoryChipText: {
    fontSize: 12,
  },
  colorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  colorBubble: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorBubbleActive: {},
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  modalBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginLeft: 8,
  },
  saveBtn: {
    backgroundColor: Colors.red,
  },
  cancelBtn: {},
  deleteBtn: {
    backgroundColor: Colors.error,
    marginRight: 'auto',
    marginLeft: 0,
  },
  modalBtnText: {
    color: Colors.textLight,
    fontWeight: 'bold',
    fontSize: 14,
  },
  modalBtnTextDark: {
    fontSize: 14,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  recurrenceContainer: {
    marginBottom: 16,
  },
  freqRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  freqBtn: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    marginHorizontal: 1,
  },
  freqBtnText: {
    fontSize: 10,
  },
  recurrenceDetails: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
    marginTop: 4,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 6,
  },
  detailLabel: {
    fontSize: 12,
    marginRight: 8,
  },
  detailNumberInput: {
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    width: 50,
    textAlign: 'center',
    marginRight: 8,
    fontSize: 12,
  },
  weekDaysGrid: {
    flexDirection: 'row',
    flex: 1,
    justifyContent: 'space-between',
  },
  dayBubble: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayBubbleText: {
    fontSize: 9,
    fontWeight: '600',
  },
  endTypeRow: {
    flexDirection: 'row',
    flex: 1,
    justifyContent: 'space-between',
  },
  endTypeBtn: {
    flex: 1,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    marginHorizontal: 2,
  },
  endTypeBtnText: {
    fontSize: 10,
  },
  dateSelectorBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 6,
    alignItems: 'center',
  },
  dateSelectorBtnText: {
    fontSize: 12,
  },
});
