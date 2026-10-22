import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import {AppState} from 'react-native';
import type {
  AlarmCapabilities,
  AlarmClient,
} from '../src/core/native/reminders';
import type {
  PlannerRepository,
  PlannerSnapshot,
  Task,
} from '../src/core/domain/planner';
import {ReminderSettings} from '../src/features/reminders/ReminderSettings';

const now = '2026-10-23T08:00:00.000Z';

function fixtures(overrides: Partial<AlarmCapabilities> = {}) {
  const capability: AlarmCapabilities = {
    sdk: 37,
    enabled: false,
    notifications: false,
    exact: false,
    fullScreen: false,
    fullScreenEnabled: false,
    channelImportance: 2,
    ...overrides,
  };
  const snapshot: PlannerSnapshot = {
    tasks: [],
    events: [],
    reminders: [],
    jobs: [],
  };
  const repo: PlannerRepository = {
    snapshot: jest.fn(() => snapshot),
    createTask: jest.fn(command => {
      const task: Task = {
        ...command.draft,
        reminderLeadMinutes: command.reminderLeadMinutes,
        id: `task:${command.token}`,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      const occurrenceKey = `${task.id}|${task.dueAt}`;
      const reminderId = `reminder:${occurrenceKey}`;
      snapshot.tasks.push(task);
      snapshot.reminders.push({
        id: reminderId,
        taskId: task.id,
        eventId: null,
        occurrenceKey,
        scheduledAt: task.dueAt!,
        leadMinutes: 0,
        status: 'SCHEDULED',
        version: 1,
        lastOutcomeAt: null,
      });
      snapshot.jobs.push({
        id: `job:${reminderId}`,
        reminderId,
        occurrenceKey,
        runAt: task.dueAt!,
        status: 'PENDING',
        generation: 1,
        attemptCount: 0,
        deliveryState: 'UNAVAILABLE',
        deliveryReason: null,
      });
      return task;
    }),
    updateTask: jest.fn(() => {
      throw new Error('This settings UI never updates task completion.');
    }),
    deleteTask: jest.fn(command => {
      snapshot.tasks = snapshot.tasks.filter(task => task.id !== command.id);
      snapshot.jobs.forEach(job => {
        job.status = 'CANCELLED';
        job.generation++;
      });
    }),
    createEvent: jest.fn(() => {
      throw new Error('Not used by reminder settings');
    }),
    updateEvent: jest.fn(() => {
      throw new Error('Not used by reminder settings');
    }),
    deleteEvent: jest.fn(),
    reminderAction: jest.fn(() => 'ignored'),
    upcoming: jest.fn(() => []),
    appendChat: jest.fn(),
    recentChat: jest.fn(() => []),
  };
  const client: AlarmClient = {
    capabilities: jest.fn(async () => ({...capability})),
    reconcile: jest.fn(async () => ({
      ...capability,
      scheduled: 0,
      cancelled: 0,
      failed: 0,
    })),
    setEnabled: jest.fn(async enabled => {
      capability.enabled = enabled;
      return {...capability};
    }),
    setFullScreenEnabled: jest.fn(async enabled => {
      capability.fullScreenEnabled = enabled;
      return {...capability};
    }),
    requestNotifications: jest.fn(async () => false),
    openSettings: jest.fn(async () => true),
    openReminder: jest.fn(async () => true),
    diagnostics: jest.fn(async () => ({
      capabilities: {...capability},
      counts: {pending: 0, ringing: 0, registered: 0, failed: 0},
      events: [],
    })),
  };
  const plannerFactory = jest.fn(() => repo);
  return {client, plannerFactory, repo, snapshot, capability};
}

async function ready() {
  await screen.findByText(/Android API 37/);
  await waitFor(() =>
    expect(
      screen.getByRole('button', {name: 'Refresh reminder status'}),
    ).toBeEnabled(),
  );
}

describe('Android reminder settings with injected adapters, not device delivery proof', () => {
  afterEach(() => jest.restoreAllMocks());

  it('shows actual denial/fallback state and requires explicit delivery/permission/full-screen actions', async () => {
    const f = fixtures({reason: 'NOTIFICATIONS_DENIED'});
    render(<ReminderSettings {...f} showQa />);
    await ready();
    expect(f.plannerFactory).toHaveBeenCalledTimes(1);
    expect(f.client.setEnabled).not.toHaveBeenCalled();
    expect(f.client.requestNotifications).not.toHaveBeenCalled();
    expect(f.client.setFullScreenEnabled).not.toHaveBeenCalled();
    expect(f.client.reconcile).not.toHaveBeenCalled();
    expect(screen.getByText(/Notifications are blocked/i)).toBeTruthy();
    expect(screen.queryByText('NOTIFICATIONS_DENIED')).toBeNull();
    expect(screen.getByText(/fallback timing may be delayed/)).toBeTruthy();
    expect(
      screen.getByRole('button', {name: 'Create 15-second synthetic reminder'}),
    ).toBeDisabled();
    fireEvent.press(
      screen.getByRole('button', {name: 'Enable Android reminder delivery'}),
    );
    await screen.findByRole('button', {name: 'Turn reminder delivery off'});
    await ready();
    expect(f.client.setEnabled).toHaveBeenCalledWith(true);
    expect(f.client.reconcile).toHaveBeenCalledTimes(1);
    fireEvent.press(
      screen.getByRole('button', {name: 'Request notification access'}),
    );
    await screen.findByText(/Notification access was not granted/);
    await ready();
    expect(f.client.requestNotifications).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', {name: 'Create 15-second synthetic reminder'}),
    ).toBeDisabled();
    expect(f.repo.createTask).not.toHaveBeenCalled();
  });

  it('opens only the requested Android setting and keeps full-screen preference explicit', async () => {
    const f = fixtures();
    render(<ReminderSettings {...f} showQa={false} />);
    await ready();
    const settings = [
      ['Open notification settings', 'notifications'],
      ['Open reminder channel settings', 'channel'],
      ['Open exact alarm settings', 'exact'],
      ['Open full-screen alert settings', 'fullScreen'],
    ] as const;
    for (const [label, argument] of settings) {
      fireEvent.press(screen.getByRole('button', {name: label}));
      await ready();
      expect(f.client.openSettings).toHaveBeenLastCalledWith(argument);
    }
    fireEvent.press(
      screen.getByRole('button', {name: 'Allow full-screen reminder alerts'}),
    );
    await screen.findByRole('button', {name: 'Turn full-screen alerts off'});
    await ready();
    expect(f.client.setFullScreenEnabled).toHaveBeenCalledWith(true);
    expect(
      screen.getByText(/reminder titles may appear on the lock screen/),
    ).toBeTruthy();
    expect(screen.getByText(/notification remains the fallback/)).toBeTruthy();
    expect(
      screen.queryByRole('button', {
        name: 'Create 15-second synthetic reminder',
      }),
    ).toBeNull();
    expect(f.repo.createTask).not.toHaveBeenCalled();
  });

  it('initializes the JS-owned schema before native access and permits recovery after storage failure', async () => {
    const f = fixtures();
    f.plannerFactory.mockImplementationOnce(() => {
      throw new Error('Migration failed');
    });
    render(<ReminderSettings {...f} showQa />);
    await screen.findByText(/Android reminder controls could not finish/);
    expect(f.client.capabilities).not.toHaveBeenCalled();
    expect(f.client.reconcile).not.toHaveBeenCalled();
    fireEvent.press(
      screen.getByRole('button', {name: 'Refresh reminder status'}),
    );
    await ready();
    expect(f.plannerFactory).toHaveBeenCalledTimes(2);
    expect(f.client.reconcile).toHaveBeenCalledTimes(1);
    expect(f.repo.deleteTask).not.toHaveBeenCalled();
  });

  it('shows recoverable native errors and never reports a delivery success from registration', async () => {
    const f = fixtures();
    jest
      .mocked(f.client.capabilities)
      .mockRejectedValueOnce(new Error('Native bridge failed'));
    render(<ReminderSettings {...f} showQa />);
    await screen.findByText(/Android reminder controls could not finish/);
    fireEvent.press(
      screen.getByRole('button', {name: 'Refresh reminder status'}),
    );
    await ready();
    expect(
      screen.getByText(/Registration does not prove delivery/),
    ).toBeTruthy();
    expect(f.repo.deleteTask).not.toHaveBeenCalled();
    jest.mocked(f.client.openSettings).mockResolvedValueOnce(false);
    fireEvent.press(
      screen.getByRole('button', {name: 'Open exact alarm settings'}),
    );
    await screen.findByText(/Open the app settings manually/);
  });

  it('creates a timed synthetic task, opens a real ringing identity, and reads ACK separately from task completion', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(Date.parse(now));
    const f = fixtures({
      enabled: true,
      notifications: true,
      exact: true,
      channelImportance: 4,
    });
    render(<ReminderSettings {...f} showQa />);
    await ready();
    expect(f.client.reconcile).toHaveBeenCalledTimes(1);
    fireEvent.press(
      screen.getByRole('button', {name: 'Create 15-second synthetic reminder'}),
    );
    await screen.findByText(/Synthetic task saved for 15 seconds/);
    await ready();
    expect(f.repo.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        draft: expect.objectContaining({
          title: 'Phase 03 synthetic alarm',
          dueAt: '2026-10-23T08:00:15.000Z',
          dueDate: null,
          timezone: 'UTC',
          status: 'TODO',
        }),
        reminderLeadMinutes: 0,
      }),
    );
    expect(
      screen.getByText(
        /Last synthetic task: TODO. Reminder: SCHEDULED. Job: PENDING/,
      ),
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', {name: 'Open ringing synthetic reminder'}),
    ).toBeNull();
    const job = f.snapshot.jobs[0]!;
    job.status = 'RINGING';
    f.snapshot.reminders[0]!.status = 'RINGING';
    fireEvent.press(
      screen.getByRole('button', {name: 'Refresh reminder status'}),
    );
    await screen.findByRole('button', {
      name: 'Open ringing synthetic reminder',
    });
    await ready();
    fireEvent.press(
      screen.getByRole('button', {name: 'Open ringing synthetic reminder'}),
    );
    await ready();
    expect(f.client.openReminder).toHaveBeenCalledWith({
      jobId: job.id,
      occurrenceKey: job.occurrenceKey,
      generation: 1,
    });
    job.status = 'ACKNOWLEDGED';
    f.snapshot.reminders[0]!.status = 'ACKNOWLEDGED';
    fireEvent.press(
      screen.getByRole('button', {name: 'Refresh reminder status'}),
    );
    await screen.findByText(
      /Last synthetic task: TODO. Reminder: ACKNOWLEDGED. Job: ACKNOWLEDGED/,
    );
    await ready();
    expect(f.repo.updateTask).not.toHaveBeenCalled();
    const task = f.snapshot.tasks[0]!;
    fireEvent.press(
      screen.getByRole('button', {name: 'Cancel last synthetic reminder'}),
    );
    await waitFor(() =>
      expect(f.repo.deleteTask).toHaveBeenCalledWith(
        expect.objectContaining({id: task.id, expectedVersion: 1}),
      ),
    );
    await ready();
    expect(
      screen.queryByRole('button', {name: 'Cancel last synthetic reminder'}),
    ).toBeNull();
  });

  it('keeps a durable synthetic task cancellable when native reconciliation fails', async () => {
    const f = fixtures({enabled: true, notifications: true});
    render(<ReminderSettings {...f} showQa />);
    await ready();
    jest
      .mocked(f.client.reconcile)
      .mockRejectedValueOnce(new Error('Native scheduling denied'));
    fireEvent.press(
      screen.getByRole('button', {name: 'Create 15-second synthetic reminder'}),
    );
    await screen.findByText(/Android reminder controls could not finish/);
    expect(f.snapshot.tasks).toHaveLength(1);
    expect(
      screen.getByRole('button', {name: 'Cancel last synthetic reminder'}),
    ).toBeEnabled();
    expect(screen.getByText(/Delivery is unverified until/)).toBeTruthy();
    expect(f.repo.deleteTask).not.toHaveBeenCalled();
  });

  it('refreshes enabled delivery on foreground entry without prompting or polling', async () => {
    const listener = jest.spyOn(AppState, 'addEventListener');
    const f = fixtures({enabled: true, notifications: true});
    const view = render(<ReminderSettings {...f} showQa={false} />);
    await ready();
    const subscription = listener.mock.calls.at(-1);
    expect(subscription?.[0]).toBe('change');
    await act(async () => subscription?.[1]('active'));
    await waitFor(() => expect(f.client.reconcile).toHaveBeenCalledTimes(2));
    expect(f.client.requestNotifications).not.toHaveBeenCalled();
    expect(f.client.setEnabled).not.toHaveBeenCalled();
    view.unmount();
  });
});
