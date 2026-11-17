import React from 'react';
import {StyleSheet, Text, TouchableOpacity} from 'react-native';
import {useSchedulePalette} from './schedulePalette';
import {SCHEDULE_PAGE_SIZE} from '../hooks/useSchedulePage';

export function ScheduleMoreButton({
  remaining,
  onPress,
}: {
  remaining: number;
  onPress: () => void;
}) {
  const palette = useSchedulePalette();
  if (remaining <= 0) return null;
  return (
    <TouchableOpacity
      accessibilityRole="button"
      onPress={onPress}
      style={styles.button}
    >
      <Text style={{color: palette.text}}>{`Show next ${Math.min(
        SCHEDULE_PAGE_SIZE,
        remaining,
      )} items (${remaining} more)`}</Text>
    </TouchableOpacity>
  );
}
const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
