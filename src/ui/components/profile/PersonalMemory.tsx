import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ToolSheet } from '../tools';
import { useTheme } from '../../contexts/ThemeContext';
import type { ThemeColors } from '../../contexts/ThemeContext';
import { useThemedStyles } from '../../theme/createThemedStyles';
import { Fonts, FontSize, Spacing } from '../../theme';
import {
  EXPIRY_CHOICES,
  MAX_DURATION_MINUTES,
  MIN_DURATION_MINUTES,
  personalMemoryStore as memory,
} from '../../../storage/personalMemoryStore';
import type { EventMemorySnapshot, ExpiryDays } from '../../../storage/personalMemoryStore';

interface PersonalMemoryProps {
  userId: string;
  visible: boolean;
  onClose: () => void;
  onChanged?: () => void;
}

type Review = ReturnType<typeof memory.prepare>;

/**
 * AGY-PORT 09: opt-in defaults for new event drafts. The student types them,
 * reviews them and saves; they can correct, disable or forget them. They stay
 * on this device for this account and are never learned from history.
 */
export const PersonalMemory: React.FC<PersonalMemoryProps> = ({
  userId,
  visible,
  onClose,
  onChanged,
}) => {
  const { colors } = useTheme();
  const themed = useThemedStyles(getThemedStyles);
  const [snapshot, setSnapshot] = useState<EventMemorySnapshot | null>(null);
  const [time, setTime] = useState('');
  const [duration, setDuration] = useState('');
  const [days, setDays] = useState<ExpiryDays>(30);
  const [review, setReview] = useState<Review | null>(null);
  const [notice, setNotice] = useState('');
  const reviewRef = useRef<Review | null>(null);

  const cancelReview = useCallback(() => {
    if (reviewRef.current) memory.cancel(reviewRef.current.token);
    reviewRef.current = null;
    setReview(null);
  }, []);

  const reload = useCallback(() => {
    try {
      const saved = memory.read(userId);
      setSnapshot(saved);
      setTime(saved.value?.startTime ?? '');
      setDuration(saved.value?.durationMinutes?.toString() ?? '');
    } catch {
      setSnapshot(null);
      setNotice('Saved defaults unavailable. Close and try again.');
    }
  }, [userId]);

  useEffect(() => {
    if (visible) {
      setNotice('');
      reload();
    }
    return cancelReview;
  }, [visible, userId, reload, cancelReview]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') cancelReview();
    });
    return () => subscription.remove();
  }, [cancelReview]);

  const run = (work: () => void, done: string) => {
    try {
      work();
      setNotice(done);
      onChanged?.();
    } catch (error) {
      setNotice(
        error instanceof Error && error.message
          ? error.message
          : 'Could not save. Check the values and review again.',
      );
    }
    cancelReview();
    reload();
  };

  const prepare = () => {
    cancelReview();
    try {
      const minutes = duration.trim() ? Number(duration.trim()) : null;
      const next = memory.prepare(userId, {
        startTime: time.trim() || null,
        durationMinutes: minutes,
        expiresDays: days,
      });
      reviewRef.current = next;
      setReview(next);
      setNotice('Check the summary, then save.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Check the values.');
    }
  };

  const button = (label: string, onPress: () => void, testID: string, destructive = false) => (
    <TouchableOpacity
      key={testID}
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.button, themed.button]}
    >
      <Text style={[styles.buttonText, destructive ? themed.destructive : themed.text]}>{label}</Text>
    </TouchableOpacity>
  );

  const saved = snapshot?.value ?? null;
  const editInput = (setter: (value: string) => void) => (value: string) => {
    cancelReview();
    setter(value);
  };

  return (
    <ToolSheet
      visible={visible}
      title="Event Defaults"
      onClose={() => {
        cancelReview();
        onClose();
      }}
    >
      <Text style={[styles.note, themed.muted]}>
        Optional start time and length offered when you create a new event. LAFINA does not learn
        them from your chats, notes or reminders. An offer changes the draft only when you tap
        Apply, and you still save the event. Saved events never change. Kept on this device for
        this account only.
      </Text>

      <View style={styles.toggleRow}>
        <Text style={[styles.label, themed.text]}>Offer saved defaults</Text>
        <Switch
          testID="memory-enabled"
          accessibilityLabel="Offer saved defaults"
          disabled={!snapshot || !saved}
          value={snapshot?.enabled ?? false}
          onValueChange={value =>
            run(
              () => memory.setEnabled(userId, value, snapshot?.revision),
              value ? 'Offers turned on.' : 'Offers turned off.',
            )
          }
        />
      </View>
      <Text testID="memory-saved" style={[styles.note, themed.muted]}>
        {saved ? `Saved: ${memory.describe(saved)}` : 'Nothing saved.'}
      </Text>

      <Text style={[styles.label, themed.text]}>Start time</Text>
      <TextInput
        testID="memory-start"
        accessibilityLabel="Default event start time"
        placeholder="HH:MM, optional"
        placeholderTextColor={colors.placeholder}
        value={time}
        onChangeText={editInput(setTime)}
        style={[styles.input, themed.input]}
      />
      <Text style={[styles.label, themed.text]}>Length in minutes</Text>
      <TextInput
        testID="memory-duration"
        accessibilityLabel="Default event length in minutes"
        placeholder={`${MIN_DURATION_MINUTES}–${MAX_DURATION_MINUTES}, optional`}
        placeholderTextColor={colors.placeholder}
        keyboardType="number-pad"
        value={duration}
        onChangeText={editInput(setDuration)}
        style={[styles.input, themed.input]}
      />
      <Text style={[styles.label, themed.text]}>Expires</Text>
      <View style={styles.choiceRow}>
        {EXPIRY_CHOICES.map(value => (
          <TouchableOpacity
            key={value}
            testID={`memory-expiry-${value}`}
            accessibilityRole="radio"
            accessibilityState={{ selected: days === value }}
            onPress={() => {
              cancelReview();
              setDays(value);
            }}
            style={[styles.choice, themed.button, days === value && themed.selected]}
          >
            <Text style={[styles.buttonText, themed.text]}>
              {value ? `${value} days` : 'Never'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {button('Review', prepare, 'memory-review')}
      {review && (
        <View testID="memory-review-summary" style={[styles.review, themed.button]}>
          <Text style={[styles.note, themed.text]}>{review.summary}</Text>
          {button(
            'Save these defaults',
            () => run(() => memory.confirm(review.token, userId), 'Saved on this device.'),
            'memory-confirm',
          )}
          {button('Cancel', cancelReview, 'memory-cancel')}
        </View>
      )}

      {saved?.startTime
        ? button(
            'Forget start time',
            () => run(() => memory.forget(userId, 'startTime', snapshot?.revision), 'Start time forgotten.'),
            'memory-forget-start',
            true,
          )
        : null}
      {saved?.durationMinutes
        ? button(
            'Forget length',
            () =>
              run(() => memory.forget(userId, 'durationMinutes', snapshot?.revision), 'Length forgotten.'),
            'memory-forget-duration',
            true,
          )
        : null}
      {saved
        ? button(
            'Forget all event defaults',
            () => run(() => memory.forget(userId, 'all', snapshot?.revision), 'Event defaults forgotten.'),
            'memory-forget-all',
            true,
          )
        : null}

      {notice ? (
        <Text testID="memory-notice" accessibilityLiveRegion="polite" style={[styles.note, themed.text]}>
          {notice}
        </Text>
      ) : null}
    </ToolSheet>
  );
};

const styles = StyleSheet.create({
  note: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    marginBottom: Spacing.sm,
  },
  label: {
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
  },
  choiceRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  choice: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  button: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.sm,
  },
  buttonText: {
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
  },
  review: {
    borderWidth: 1,
    borderRadius: 8,
    padding: Spacing.md,
    marginTop: Spacing.sm,
  },
});

const getThemedStyles = (colors: ThemeColors) => ({
  text: {
    color: colors.textPrimary,
  },
  muted: {
    color: colors.textSecondary,
  },
  destructive: {
    color: colors.red,
  },
  button: {
    borderColor: colors.border,
  },
  selected: {
    borderColor: colors.blue,
  },
  input: {
    borderColor: colors.border,
    color: colors.textPrimary,
    backgroundColor: colors.inputBg,
  },
});
