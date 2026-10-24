import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme } from '../../../contexts/ThemeContext';
import { Colors } from '../../../theme';
import { timeStringToDate, dateToTimeString, formatTimeForDisplay } from '../utils/calendarHelpers';
import { ScheduleItemModalState } from '../types';
import { Shadows } from '../../../theme';
import { parseRrule } from '../../../../storage/rruleHelper';

interface AddTaskEventModalProps {
  state: ScheduleItemModalState;
  timeFormat24h: boolean;
}

export const AddTaskEventModal: React.FC<AddTaskEventModalProps> = ({ state, timeFormat24h }) => {
  const { colors } = useTheme();

  // Local recurrence form states
  const [repeatFreq, setRepeatFreq] = useState<'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'>('NONE');
  const [repeatInterval, setRepeatInterval] = useState('1');
  const [repeatWeekDays, setRepeatWeekDays] = useState<string[]>([]);
  const [repeatEndType, setRepeatEndType] = useState<'NEVER' | 'UNTIL' | 'COUNT'>('NEVER');
  const [repeatUntil, setRepeatUntil] = useState(''); // YYYY-MM-DD
  const [repeatCount, setRepeatCount] = useState('10');
  const [showUntilDatePicker, setShowUntilDatePicker] = useState(false);

  // Sync form recurrenceRule to local state when modal becomes visible
  useEffect(() => {
    if (state.visible) {
      if (state.editingItem && state.editingItem.recurrenceRule) {
        const rule = parseRrule(state.editingItem.recurrenceRule);
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
  }, [state.visible, state.editingItem]);

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
        <View style={[styles.modalContent, { backgroundColor: colors.cardBg }]}>
          <Text style={[styles.modalHeaderTitle, { color: colors.textPrimary }]}>
            {state.editingItem ? `Edit ${state.modalType}` : `Create ${state.modalType}`}
          </Text>

          <TextInput
            style={[styles.modalInput, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.inputBg }]}
            placeholder={state.modalType === 'task' ? 'Buy groceries, Finish report...' : 'Consultation, Lecture...'}
            placeholderTextColor={colors.placeholder}
            value={state.form.title}
            onChangeText={(v) => state.updateField('title', v)}
          />

          <View style={styles.modalRow}>
            <View style={styles.modalCol}>
              <Text style={[styles.modalColLabel, { color: colors.textSecondary }]}>
                {state.modalType === 'task' ? 'Due Time' : 'Start Time'}
              </Text>
              <TouchableOpacity
                style={[styles.timePickerBtn, { borderColor: colors.border, backgroundColor: colors.inputBg }]}
                onPress={() => state.setShowTimePicker(true)}
                activeOpacity={0.7}
              >
                <Text style={[styles.timePickerBtnText, { color: colors.textPrimary }]}>
                  {formatTimeForDisplay(state.form.time, timeFormat24h)}
                </Text>
              </TouchableOpacity>
              {state.showTimePicker && (
                <DateTimePicker
                  value={timeStringToDate(state.form.time)}
                  mode="time"
                  is24Hour={timeFormat24h}
                  display="default"
                  onChange={(_event, date) => {
                    state.setShowTimePicker(false);
                    if (date) state.updateField('time', dateToTimeString(date));
                  }}
                />
              )}
            </View>
            {state.modalType === 'event' && (
              <View style={styles.modalCol}>
                <Text style={[styles.modalColLabel, { color: colors.textSecondary }]}>End Time</Text>
                <TouchableOpacity
                  style={[styles.timePickerBtn, { borderColor: colors.border, backgroundColor: colors.inputBg }]}
                  onPress={() => state.setShowEndTimePicker(true)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.timePickerBtnText, { color: colors.textPrimary }]}>
                    {formatTimeForDisplay(state.form.endTime, timeFormat24h)}
                  </Text>
                </TouchableOpacity>
                {state.showEndTimePicker && (
                  <DateTimePicker
                    value={timeStringToDate(state.form.endTime)}
                    mode="time"
                    is24Hour={timeFormat24h}
                    display="default"
                    onChange={(_event, date) => {
                      state.setShowEndTimePicker(false);
                      if (date) state.updateField('endTime', dateToTimeString(date));
                    }}
                  />
                )}
              </View>
            )}
          </View>

          {state.modalType === 'task' && (
            <View style={[styles.segmentedRow, { backgroundColor: colors.divider }]}>
              {(['High', 'Medium', 'Low'] as const).map((pr) => (
                <TouchableOpacity
                  key={pr}
                  style={[
                    styles.segmentBtn,
                    { backgroundColor: 'transparent' },
                    state.form.priority === pr && { backgroundColor: colors.red },
                  ]}
                  onPress={() => state.updateField('priority', pr)}
                >
                  <Text style={[
                    styles.segmentBtnText,
                    { color: colors.textSecondary },
                    state.form.priority === pr && { color: colors.white, fontWeight: 'bold' },
                  ]}>
                    {pr}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={styles.categoryRow}>
            {['Work', 'Personal', 'Health', 'Learning'].map((cat) => (
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

          {state.modalType === 'event' && (
            <TextInput
              style={[styles.modalInput, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.inputBg }]}
              placeholder="Location (optional)"
              placeholderTextColor={colors.placeholder}
              value={state.form.location}
              onChangeText={(v) => state.updateField('location', v)}
            />
          )}

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
                            setRepeatUntil(date.toISOString().split('T')[0]);
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
            placeholder="Add notes..."
            placeholderTextColor={colors.placeholder}
            multiline
            numberOfLines={3}
            value={state.form.notes}
            onChangeText={(v) => state.updateField('notes', v)}
          />

          <View style={styles.actionRow}>
            {state.editingItem && (
              <TouchableOpacity
                style={[styles.modalBtn, styles.deleteBtn]}
                onPress={() => state.delete(state.editingItem!.id, state.modalType)}
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
    padding: 24,
    width: '100%',
    ...Shadows.card,
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
  modalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalCol: {
    width: '48%',
  },
  modalColLabel: {
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
  segmentedRow: {
    flexDirection: 'row',
    borderRadius: 8,
    padding: 2,
    marginBottom: 12,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  segmentBtnText: {
    fontSize: 12,
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
