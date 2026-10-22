import {useCallback, useEffect, useRef, useState} from 'react';
import {AppState, StyleSheet, Text, View} from 'react-native';
import {
  alarmClient,
  type AlarmClient,
  type AlarmCapabilities,
  type AlarmDiagnostics,
} from '../../core/native/reminders';
import type {
  PlannerRepository,
  PlannerSnapshot,
  Task,
} from '../../core/domain/planner';
import {useTheme} from '../../core/theme/ThemeContext';
import {spacing, typography} from '../../core/theme/theme';
import {Button, Message} from '../../core/ui/controls';

export function ReminderSettings({
  client = alarmClient,
  plannerFactory,
  showQa,
}: {
  client?: AlarmClient;
  plannerFactory: () => PlannerRepository;
  showQa: boolean;
}) {
  const {colors} = useTheme();
  const mounted = useRef(true);
  const busyRef = useRef(false);
  const repository = useRef<PlannerRepository | null>(null);
  const sequence = useRef(0);
  const [busy, setBusy] = useState(false);
  const [capabilities, setCapabilities] = useState<AlarmCapabilities | null>(
    null,
  );
  const [diagnostics, setDiagnostics] = useState<AlarmDiagnostics | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [qaTask, setQaTask] = useState<Task | null>(null);
  const [snapshot, setSnapshot] = useState<PlannerSnapshot | null>(null);

  const run = useCallback(async (operation: () => Promise<void>) => {
    if (busyRef.current) {
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      await operation();
    } catch {
      if (mounted.current) {
        setError(
          'Android reminder controls could not finish. Saved planner data has not been reset. Refresh status or retry.',
        );
      }
    } finally {
      busyRef.current = false;
      if (mounted.current) {
        setBusy(false);
      }
    }
  }, []);

  const refresh = useCallback(
    async (reconcile: boolean) => {
      // JS alone owns schema creation/migration; native code may only open schema 2.
      if (!repository.current) {
        repository.current = plannerFactory();
      }
      let actual = reconcile
        ? await client.reconcile()
        : await client.capabilities();
      if (!reconcile && actual.enabled) {
        actual = await client.reconcile();
      }
      const actualDiagnostics = await client.diagnostics();
      const actualSnapshot = showQa ? repository.current.snapshot() : null;
      if (mounted.current) {
        setCapabilities(actual);
        setDiagnostics(actualDiagnostics);
        setSnapshot(actualSnapshot);
        setQaTask(previous => {
          if (!previous) {
            return null;
          }
          return (
            actualSnapshot?.tasks.find(task => task.id === previous.id) ??
            (actualSnapshot?.truncated ? previous : null)
          );
        });
      }
    },
    [client, plannerFactory, showQa],
  );

  useEffect(() => {
    mounted.current = true;
    void run(async () => {
      await refresh(false);
    });
    return () => {
      mounted.current = false;
    };
  }, [refresh, run]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active' && capabilities?.enabled) {
        void run(() => refresh(true));
      }
    });
    return () => subscription.remove();
  }, [capabilities?.enabled, refresh, run]);

  function action(callback: () => Promise<void>) {
    void run(callback);
  }

  async function settings(
    kind: 'notifications' | 'exact' | 'fullScreen' | 'channel',
  ) {
    if (!(await client.openSettings(kind))) {
      if (mounted.current) {
        setNotice(
          'This Android settings page is unavailable. Open the app settings manually.',
        );
      }
    }
  }

  async function quickAlarm() {
    if (!repository.current) {
      throw new Error('Planner storage is not ready.');
    }
    const dueAt = new Date(Date.now() + 15000).toISOString();
    const token = `qa_${Date.now().toString(
      36,
    )}_${sequence.current++}_${Math.random().toString(36).slice(2, 10)}`;
    const task = repository.current.createTask({
      token,
      draft: {
        title: 'Phase 03 synthetic alarm',
        notes:
          'Synthetic reminder delivery check. Delete this test item afterward.',
        dueAt,
        dueDate: null,
        timezone: 'UTC',
        status: 'TODO',
      },
      reminderLeadMinutes: 0,
    });
    // A durable write remains visible/cancellable even if native reconciliation fails.
    if (mounted.current) {
      setQaTask(task);
      setSnapshot(repository.current.snapshot());
      setNotice(
        'Synthetic task saved for 15 seconds from now. Delivery is unverified until you receive and check the Android alert.',
      );
    }
    await refresh(true);
  }

  const qaReminder = qaTask
    ? snapshot?.reminders.find(reminder => reminder.taskId === qaTask.id)
    : null;
  const qaJob = qaReminder
    ? snapshot?.jobs.find(job => job.reminderId === qaReminder.id)
    : null;
  const allDisabled = busy || capabilities === null;
  return (
    <View style={styles.section}>
      <Text style={[styles.heading, {color: colors.text}]}>
        Android reminders
      </Text>
      <Message text="Reminders are off until you enable delivery. These are simulated reminder alerts, not phone calls. No microphone is used. Manual planner controls remain available." />
      {error ? <Message error text={error} /> : null}
      {notice ? <Message text={notice} /> : null}
      <Button
        label={busy ? 'Checking reminder status…' : 'Refresh reminder status'}
        disabled={busy}
        secondary
        onPress={() => action(() => refresh(true))}
      />
      {capabilities ? (
        <>
          <Message
            text={`Android API ${capabilities.sdk}. Delivery ${
              capabilities.enabled ? 'enabled' : 'off'
            }. Notifications ${
              capabilities.notifications ? 'allowed' : 'blocked'
            }. Exact timing ${
              capabilities.exact
                ? 'allowed'
                : 'unavailable; fallback timing may be delayed'
            }.`}
          />
          {!capabilities.notifications ? (
            <Message text="Android notifications are blocked. Saved items remain local, but reminder alerts cannot be shown until notification access is allowed." />
          ) : null}
          {capabilities.channelImportance < 3 ? (
            <Message text="The reminder notification channel is muted or low priority. Open channel settings to check sound, vibration and notification visibility." />
          ) : null}
          <Button
            label={
              capabilities.enabled
                ? 'Turn reminder delivery off'
                : 'Enable Android reminder delivery'
            }
            disabled={allDisabled}
            onPress={() =>
              action(async () => {
                const actual = await client.setEnabled(!capabilities.enabled);
                if (mounted.current) {
                  setCapabilities(actual);
                }
                await refresh(true);
              })
            }
          />
          <Button
            label="Request notification access"
            disabled={allDisabled}
            secondary
            onPress={() =>
              action(async () => {
                const granted = await client.requestNotifications();
                if (mounted.current) {
                  setNotice(
                    granted
                      ? 'Notification access is allowed. Check reminder channel settings if alerts remain silent.'
                      : 'Notification access was not granted. You can allow it later in Android settings.',
                  );
                }
                await refresh(false);
              })
            }
          />
          <Button
            label="Open notification settings"
            disabled={allDisabled}
            secondary
            onPress={() => action(() => settings('notifications'))}
          />
          <Button
            label="Open reminder channel settings"
            disabled={allDisabled}
            secondary
            onPress={() => action(() => settings('channel'))}
          />
          <Button
            label="Open exact alarm settings"
            disabled={allDisabled}
            secondary
            onPress={() => action(() => settings('exact'))}
          />
          <Message
            text={`Full-screen alerts ${
              capabilities.fullScreenEnabled ? 'requested' : 'off'
            }. Android eligibility ${
              capabilities.fullScreen ? 'allowed' : 'unavailable'
            }. A notification remains the fallback when full-screen alerts cannot open; Android and device settings control its visibility.`}
          />
          <Message text="If you allow full-screen alerts, reminder titles may appear on the lock screen. Enable this only if that is acceptable on this phone." />
          <Button
            label={
              capabilities.fullScreenEnabled
                ? 'Turn full-screen alerts off'
                : 'Allow full-screen reminder alerts'
            }
            disabled={allDisabled}
            secondary
            onPress={() =>
              action(async () => {
                const actual = await client.setFullScreenEnabled(
                  !capabilities.fullScreenEnabled,
                );
                if (mounted.current) {
                  setCapabilities(actual);
                }
                await refresh(false);
              })
            }
          />
          <Button
            label="Open full-screen alert settings"
            disabled={allDisabled}
            secondary
            onPress={() => action(() => settings('fullScreen'))}
          />
        </>
      ) : (
        <Message text="Open local storage and refresh status to check Android reminder access." />
      )}
      {diagnostics ? (
        <Message
          text={`Native jobs: ${diagnostics.counts.pending} pending, ${diagnostics.counts.ringing} ringing, ${diagnostics.counts.registered} registered, ${diagnostics.counts.failed} failed. Registration does not prove delivery.`}
        />
      ) : null}
      <Message text="Force-stopping the app prevents Android reminders until you open it again. Reboot, locked-screen behavior, battery restrictions and low-end phones still require device checks. No delivery guarantee is inferred from the status above." />
      {showQa ? (
        <>
          <Text style={[styles.heading, {color: colors.text}]}>
            Synthetic reminder check
          </Text>
          <Message text="QA only. Enable delivery and allow notifications first. This creates one synthetic task due in 15 seconds; put the app in the background and check the actual alert. ACK acknowledges the alert; the task stays TODO until explicitly completed." />
          <Button
            label="Create 15-second synthetic reminder"
            disabled={
              allDisabled ||
              !capabilities?.enabled ||
              !capabilities.notifications
            }
            onPress={() => action(quickAlarm)}
          />
          {qaTask ? (
            <>
              <Message
                text={`Last synthetic task: ${qaTask.status}. Reminder: ${
                  qaReminder?.status ?? 'outside loaded test view'
                }. Job: ${qaJob?.status ?? 'outside loaded test view'}.`}
              />
              <Button
                label="Cancel last synthetic reminder"
                disabled={busy}
                secondary
                onPress={() =>
                  action(async () => {
                    if (!repository.current) {
                      throw new Error('Planner storage is not ready.');
                    }
                    repository.current.deleteTask({
                      token: `cancel_${Date.now().toString(
                        36,
                      )}_${sequence.current++}`,
                      id: qaTask.id,
                      expectedVersion: qaTask.version,
                    });
                    if (mounted.current) {
                      setQaTask(null);
                      setNotice(
                        'Synthetic item deleted locally. Refresh Android status to verify cancellation.',
                      );
                    }
                    await refresh(true);
                  })
                }
              />
              {qaJob?.status === 'RINGING' ? (
                <Button
                  label="Open ringing synthetic reminder"
                  disabled={busy}
                  secondary
                  onPress={() =>
                    action(async () => {
                      const opened = await client.openReminder({
                        jobId: qaJob.id,
                        occurrenceKey: qaJob.occurrenceKey,
                        generation: qaJob.generation,
                      });
                      if (!opened && mounted.current) {
                        setNotice(
                          'This reminder is no longer ringing. Refresh its state.',
                        );
                      }
                    })
                  }
                />
              ) : null}
            </>
          ) : null}
          {snapshot?.truncated ? (
            <Message text="The finite test view is truncated. Records outside it remain saved locally." />
          ) : null}
          {diagnostics?.events.slice(0, 10).map((event, index) => (
            <Message
              key={`${event.atUtc}_${index}`}
              text={`${event.event} · ${event.atUtc}${
                event.plannedAt ? ` · planned ${event.plannedAt}` : ''
              }`}
            />
          ))}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {marginBottom: spacing.lg},
  heading: {
    fontSize: typography.heading,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
});
