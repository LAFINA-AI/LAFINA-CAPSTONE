import {useEffect, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import type {
  AcademicEvent,
  PlannerRepository,
  ReminderAction,
  Task,
} from '../../core/domain/planner';
import {useTheme} from '../../core/theme/ThemeContext';
import {dimensions, spacing, typography} from '../../core/theme/theme';
import {Button, Message} from '../../core/ui/controls';
import {displayInstant, operationToken} from '../calendar/plannerDisplay';

export interface PlannerSelection {
  kind: 'task' | 'event';
  id: string;
}
export function PlannerItemDetails({
  repository,
  selection,
  refreshSignal,
  timezone,
  clockFormat,
  snoozeMinutes,
  onEdit,
  onBack,
  onChanged,
}: {
  repository: PlannerRepository;
  selection: PlannerSelection;
  timezone: string;
  clockFormat: '12h' | '24h';
  snoozeMinutes: number;
  refreshSignal?: number;
  onEdit: (item: Task | AcademicEvent) => void;
  onBack: () => void;
  onChanged: () => void;
}) {
  const {colors} = useTheme();
  const [item, setItem] = useState<Task | AcademicEvent | null>(null);
  const [reminders, setReminders] = useState<ReturnType<
    PlannerRepository['reminderPage']
  > | null>(null);
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    try {
      setItem(
        selection.kind === 'task'
          ? repository.getTask(selection.id)
          : repository.getEvent(selection.id),
      );
      setReminders(
        repository.reminderPage({
          kind: selection.kind,
          id: selection.id,
          offset,
          limit: 10,
        }),
      );
      setError('');
    } catch {
      setError(
        'Could not read the latest item. Saved data has not been reset. Refresh or return to your planner.',
      );
      setReminders(null);
      setItem(null);
    }
  }, [
    repository,
    selection.id,
    selection.kind,
    offset,
    revision,
    refreshSignal,
  ]);
  function changed(action: () => void, message: string) {
    setNotice('');
    try {
      action();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'The change could not be saved. Refresh before retrying.',
      );
      return false;
    }
    setError('');
    setNotice(message);
    setRevision(value => value + 1);
    onChanged();
    return true;
  }
  function reminderAction(index: number, action: ReminderAction) {
    const pair = reminders?.items[index];
    if (!pair) return;
    let applied = 'ignored';
    const saved = changed(() => {
      applied = repository.reminderAction({
        token: operationToken(),
        id: pair.reminder.id,
        occurrenceKey: pair.job.occurrenceKey,
        generation: pair.job.generation,
        action,
      });
    }, 'Reminder action saved. Task completion is separate.');
    if (saved && applied === 'ignored')
      setNotice(
        'This alert changed or expired. Its latest state will be shown; no acknowledgement was invented.',
      );
  }
  return (
    <View>
      <Button label="Back to planner" secondary onPress={onBack} />
      {error ? <Message error text={error} /> : null}
      {notice ? <Message text={notice} /> : null}
      <Button
        label="Refresh item"
        secondary
        onPress={() => setRevision(value => value + 1)}
      />
      {item ? (
        <>
          <Text
            accessibilityRole="header"
            style={[styles.heading, {color: colors.text}]}
          >
            {item.title}
          </Text>
          <Message
            text={`${
              selection.kind === 'task' ? 'Task' : 'Event'
            } · ${item.status.replace(/_/g, ' ')}`}
          />
          {item.notes ? (
            <Text style={[styles.notes, {color: colors.text}]}>
              {item.notes}
            </Text>
          ) : null}
          {'dueAt' in item ? (
            <Message
              text={
                item.dueAt
                  ? `Due ${displayInstant(item.dueAt, timezone, clockFormat)}`
                  : item.dueDate
                  ? `Due ${item.dueDate} · date only, no alarm time`
                  : 'No due date'
              }
            />
          ) : (
            <>
              <Message
                text={`Starts ${displayInstant(
                  item.startAt,
                  timezone,
                  clockFormat,
                )}; ends ${displayInstant(item.endAt, timezone, clockFormat)}`}
              />
              {item.recurrence ? (
                <Message
                  text={`Weekly series through ${item.recurrence.untilDate}. Editing or deleting affects the entire series.`}
                />
              ) : null}
            </>
          )}
          <Message
            text={`Schedule timezone: ${item.timezone}. Display timezone: ${timezone}.`}
          />
          <Button
            label={selection.kind === 'task' ? 'Edit task' : 'Edit event'}
            onPress={() => onEdit(item)}
          />
          {'dueAt' in item ? (
            <>
              <Button
                label={
                  item.status === 'COMPLETED'
                    ? 'Undo completion'
                    : 'Mark task complete'
                }
                secondary
                onPress={() =>
                  changed(
                    () => {
                      repository.updateTask({
                        token: operationToken(),
                        id: item.id,
                        expectedVersion: item.version,
                        draft: {
                          ...item,
                          status:
                            item.status === 'COMPLETED' ? 'TODO' : 'COMPLETED',
                        },
                        reminderLeadMinutes: item.reminderLeadMinutes,
                      });
                    },
                    item.status === 'COMPLETED'
                      ? 'Task reopened. Check reminder delivery status; past reminders may be missed.'
                      : 'Task marked complete explicitly; its outstanding reminders are cancelled.',
                  )
                }
              />
              {item.status === 'TODO' ? (
                <Button
                  label="Start task"
                  secondary
                  onPress={() =>
                    changed(() => {
                      repository.updateTask({
                        token: operationToken(),
                        id: item.id,
                        expectedVersion: item.version,
                        draft: {...item, status: 'IN_PROGRESS'},
                        reminderLeadMinutes: item.reminderLeadMinutes,
                      });
                    }, 'Task is in progress.')
                  }
                />
              ) : null}
            </>
          ) : null}
          {confirmDelete ? (
            <>
              <Message text="Delete this item and cancel its reminders? This affects the entire series if it repeats." />
              <Button
                label="Keep item"
                secondary
                onPress={() => setConfirmDelete(false)}
              />
              <Button
                label="Confirm delete"
                onPress={() => {
                  try {
                    const target = {
                      token: operationToken(),
                      id: item.id,
                      expectedVersion: item.version,
                    };
                    if (selection.kind === 'task')
                      repository.deleteTask(target);
                    else repository.deleteEvent(target);
                  } catch (caught) {
                    setError(
                      caught instanceof Error
                        ? caught.message
                        : 'Delete failed. Refresh before retrying.',
                    );
                    return;
                  }
                  onChanged();
                  onBack();
                }}
              />
            </>
          ) : (
            <Button
              label={selection.kind === 'task' ? 'Delete task' : 'Delete event'}
              secondary
              onPress={() => setConfirmDelete(true)}
            />
          )}
          <Text
            accessibilityRole="header"
            style={[styles.heading, {color: colors.text}]}
          >
            Reminders
          </Text>
          <Message text="Acknowledging an alert never completes a task. Snooze changes the next alert time, not the academic deadline. Android delivery remains subject to permissions and device settings." />
          {reminders?.items.length === 0 ? (
            <Message text="No reminders for this item. Edit a timed item to add one." />
          ) : null}
          {reminders?.items.map(({reminder, job}, index) => (
            <View
              key={reminder.id}
              style={[styles.card, {borderColor: colors.border}]}
            >
              <Message
                text={`Alert: ${reminder.status}. Delivery: ${job.deliveryState}.`}
              />
              <Message
                text={`Original alert ${displayInstant(
                  reminder.scheduledAt,
                  timezone,
                  clockFormat,
                )}; next alert ${displayInstant(
                  job.runAt,
                  timezone,
                  clockFormat,
                )}`}
              />
              {job.deliveryState === 'UNAVAILABLE' ||
              job.deliveryState === 'FAILED' ? (
                <Message
                  error
                  text="Delivery is unavailable or needs attention. Review Profile → Reminder delivery. The item remains saved."
                />
              ) : null}
              {job.status === 'RINGING' ? (
                <>
                  <Button
                    label={`Acknowledge alert ${index + 1}`}
                    secondary
                    onPress={() => reminderAction(index, {kind: 'ACK'})}
                  />
                  <Button
                    label={`Snooze alert ${
                      index + 1
                    } for ${snoozeMinutes} minutes`}
                    secondary
                    onPress={() =>
                      reminderAction(index, {
                        kind: 'SNOOZE',
                        minutes: snoozeMinutes,
                      })
                    }
                  />
                </>
              ) : null}
              {job.status === 'PENDING' || job.status === 'RINGING' ? (
                <Button
                  label={`Cancel alert ${index + 1}`}
                  secondary
                  onPress={() => reminderAction(index, {kind: 'CANCEL'})}
                />
              ) : null}
            </View>
          ))}
          {offset > 0 ? (
            <Button
              label="Earlier reminders"
              secondary
              onPress={() => setOffset(value => Math.max(0, value - 10))}
            />
          ) : null}
          {reminders?.hasMore ? (
            <Button
              label="More reminders"
              secondary
              onPress={() => setOffset(value => value + 10)}
            />
          ) : null}
        </>
      ) : !error ? (
        <Message text="This item is no longer available. Return to your planner." />
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  heading: {
    fontSize: typography.heading,
    fontWeight: '700',
    marginVertical: spacing.md,
  },
  notes: {fontSize: typography.body, marginBottom: spacing.md},
  card: {
    borderWidth: dimensions.border,
    borderRadius: dimensions.radius,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
});
