import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import {AppState} from 'react-native';
import {PlannerScreen} from '../src/features/calendar/PlannerScreen';
import {PlannerItemDetails} from '../src/features/scheduling/PlannerItemDetails';
import {defaultPreferences} from '../src/core/domain/preferences';
import type {AlarmClient} from '../src/core/native/reminders';
import {reconcilePlanner} from '../src/core/native/reconcilePlanner';
import {
  createPlannerFixture,
  fixtureNow,
  reminderCommand,
  taskDraft,
} from './helpers/plannerFixtures';

const now = () => new Date(fixtureNow);
const preferences = {
  ...defaultPreferences('UTC'),
  onboardingCompletedAt: fixtureNow,
};
function client(): AlarmClient {
  const capabilities = {
    sdk: 37,
    enabled: false,
    notifications: false,
    exact: false,
    fullScreen: false,
    fullScreenEnabled: false,
    channelImportance: 4,
  };
  return {
    capabilities: jest.fn(async () => capabilities),
    reconcile: jest.fn(async () => ({
      ...capabilities,
      scheduled: 0,
      cancelled: 0,
      failed: 0,
    })),
    setEnabled: jest.fn(async enabled => ({...capabilities, enabled})),
    setFullScreenEnabled: jest.fn(async fullScreenEnabled => ({
      ...capabilities,
      fullScreenEnabled,
    })),
    requestNotifications: jest.fn(async () => false),
    openSettings: jest.fn(async () => true),
    openReminder: jest.fn(async () => false),
    diagnostics: jest.fn(async () => ({
      capabilities,
      counts: {pending: 0, ringing: 0, registered: 0, failed: 0},
      events: [],
    })),
  };
}
async function press(name: string) {
  // A mutation/Back action can also refresh async Android capabilities. Await
  // that UI turn rather than ending at the synchronous SQLite assertion.
  await act(async () => {
    fireEvent.press(screen.getByRole('button', {name}));
  });
}
describe('production manual planner with real host SQLite', () => {
  let fixture: ReturnType<typeof createPlannerFixture>;
  beforeEach(() => {
    fixture = createPlannerFixture();
    jest.spyOn(Date, 'now').mockReturnValue(Date.parse(fixtureNow));
  });
  afterEach(() => {
    fixture.close();
    jest.restoreAllMocks();
  });
  afterEach(async () => {
    await act(async () => {});
  });
  function setup() {
    const alarms = client();
    const failure = jest.fn();
    const repository = reconcilePlanner(
      fixture.repository,
      () => alarms.reconcile(),
      failure,
    );
    const factory = () => repository;
    const props = {
      mode: 'Calendar' as const,
      preferences,
      factory,
      reminderClient: alarms,
      now,
      onDraftStateChange: jest.fn(),
      onRouteChange: jest.fn(),
    };
    return {
      ...render(<PlannerScreen {...props} />),
      props,
      alarms,
      failure,
      repository,
    };
  }
  it('saves an undated task with delivery blocked, finds it in Tasks, explicitly completes and undoes, edits and confirms deletion', async () => {
    setup();
    await screen.findByText(/Android alerts are off/);
    await press('Add task');
    fireEvent.changeText(
      screen.getByLabelText('Title'),
      'Read organic chemistry',
    );
    await press('Save task');
    await screen.findByRole('header', {name: 'Read organic chemistry'});
    expect(
      fixture.repository.tasksPage({filter: 'active'}).items[0]?.dueAt,
    ).toBeNull();
    await press('Mark task complete');
    await screen.findByText('Task · COMPLETED');
    await press('Undo completion');
    await screen.findByText('Task · TODO');
    await press('Edit task');
    fireEvent.changeText(screen.getByLabelText('Title'), '');
    await press('Save task');
    expect(screen.getByLabelText('Title').props.value).toBe('');
    expect(
      fixture.repository.tasksPage({filter: 'active'}).items[0]?.title,
    ).toBe('Read organic chemistry');
    fireEvent.changeText(
      screen.getByLabelText('Title'),
      'Read revised chapter',
    );
    await press('Save task');
    await screen.findByRole('header', {name: 'Read revised chapter'});
    await press('Back to planner');
    fireEvent.press(screen.getByRole('radio', {name: 'Planner view: Tasks'}));
    await press('Task: Read revised chapter');
    await press('Delete task');
    await press('Keep item');
    expect(fixture.repository.tasksPage({filter: 'active'}).items).toHaveLength(
      1,
    );
    await press('Delete task');
    await press('Confirm delete');
    await screen.findByText(/No tasks in this filter/);
    expect(fixture.repository.tasksPage({filter: 'all'}).items).toHaveLength(0);
  });
  it('creates a manual timed event into the day agenda, changes the date without drift, and keeps its save when native reconcile rejects', async () => {
    const view = setup();
    jest
      .mocked(view.alarms.reconcile)
      .mockRejectedValue(new Error('native unavailable'));
    await screen.findByText(/Nothing scheduled/);
    await screen.findByText(/Android alerts are off/);
    await press('Add event');
    fireEvent.changeText(screen.getByLabelText('Title'), 'Calculus exam');
    fireEvent(
      screen.getByRole('switch', {name: 'Remind me'}),
      'valueChange',
      true,
    );
    fireEvent.changeText(screen.getByLabelText('Reminder lead (minutes)'), '0');
    await press('Save event');
    await screen.findByRole('header', {name: 'Calculus exam'});
    expect(fixture.repository.snapshot().jobs).toHaveLength(1);
    await waitFor(() => expect(view.failure).toHaveBeenCalled());
    await press('Back to planner');
    await press('Event: Calculus exam');
    await press('Edit event');
    fireEvent.changeText(screen.getByLabelText('Start date'), '2026-10-23');
    fireEvent.changeText(screen.getByLabelText('End date'), '2026-10-23');
    await press('Save event');
    await screen.findByRole('header', {name: 'Calculus exam'});
    await press('Back to planner');
    expect(
      screen.queryByRole('button', {name: 'Event: Calculus exam'}),
    ).toBeNull();
    await press('Go to another date');
    fireEvent.changeText(screen.getByLabelText('Agenda date'), '2026-10-23');
    await press('Go to date');
    expect(
      screen.getByRole('button', {name: 'Event: Calculus exam'}),
    ).toBeTruthy();
  });
  it('refreshes detail state after native snooze on foreground and never completes the task on ACK', async () => {
    const task = fixture.repository.createTask({
      token: 'native_task',
      draft: taskDraft({timezone: 'UTC'}),
      reminderLeadMinutes: 0,
    });
    fixture.setNow('2026-10-22T09:00:00.000Z');
    const job = fixture.repository.snapshot().jobs[0]!;
    fixture.repository.reminderAction(
      reminderCommand(job, 'ring', {
        kind: 'RING',
        timezone: 'UTC',
        quietHours: null,
      }),
    );
    const listen = jest.spyOn(AppState, 'addEventListener');
    setup();
    await screen.findByText(/Android alerts are off/);
    await press(`Task: ${task.title}`);
    await screen.findByText('Alert: RINGING. Delivery: UNAVAILABLE.');
    fixture.repository.reminderAction(
      reminderCommand(job, 'native_snooze', {kind: 'SNOOZE', minutes: 7}),
    );
    const foreground = listen.mock.calls.find(
      ([event]) => event === 'change',
    )?.[1];
    await act(async () => foreground?.('active'));
    await screen.findByText('Alert: SNOOZED. Delivery: UNAVAILABLE.');
    expect(screen.getByText(/next alert 2026-10-22 · 09:07/)).toBeTruthy();
    const next = fixture.repository.snapshot().jobs[0]!;
    fixture.setNow(next.runAt);
    fixture.repository.reminderAction(
      reminderCommand(next, 'ring_again', {
        kind: 'RING',
        timezone: 'UTC',
        quietHours: null,
      }),
    );
    await act(async () => foreground?.('active'));
    await screen.findByText('Alert: RINGING. Delivery: UNAVAILABLE.');
    await press('Acknowledge alert 1');
    await screen.findByText('Alert: ACKNOWLEDGED. Delivery: UNAVAILABLE.');
    expect(fixture.repository.getTask(task.id)?.status).toBe('TODO');
  });
  it('shows database action failure without a false ignored/expired notice and hides stale controls after read failure', async () => {
    const task = fixture.repository.createTask({
      token: 'failure_task',
      draft: taskDraft(),
      reminderLeadMinutes: 0,
    });
    fixture.setNow('2026-10-22T09:00:00.000Z');
    const job = fixture.repository.snapshot().jobs[0]!;
    fixture.repository.reminderAction(
      reminderCommand(job, 'ring_failed', {
        kind: 'RING',
        timezone: 'UTC',
        quietHours: null,
      }),
    );
    const action = jest
      .spyOn(fixture.repository, 'reminderAction')
      .mockImplementation(() => {
        throw new Error('SQLite write blocked');
      });
    render(
      <PlannerItemDetails
        repository={fixture.repository}
        selection={{kind: 'task', id: task.id}}
        timezone="UTC"
        clockFormat="24h"
        snoozeMinutes={10}
        onEdit={jest.fn()}
        onBack={jest.fn()}
        onChanged={jest.fn()}
      />,
    );
    await press('Acknowledge alert 1');
    expect(action).toHaveBeenCalled();
    expect(screen.getByText('SQLite write blocked')).toBeTruthy();
    expect(screen.queryByText(/This alert changed or expired/)).toBeNull();
    jest.spyOn(fixture.repository, 'getTask').mockImplementation(() => {
      throw new Error('read unavailable');
    });
    await press('Refresh item');
    expect(
      screen.queryByRole('button', {name: 'Mark task complete'}),
    ).toBeNull();
    expect(screen.getByText(/Could not read the latest item/)).toBeTruthy();
  });
  it('refreshes registration details on reconcile completion without changing the academic deadline', async () => {
    const task = fixture.repository.createTask({
      token: 'registration',
      draft: taskDraft({timezone: 'UTC'}),
      reminderLeadMinutes: 15,
    });
    const view = setup();
    await screen.findByText(/Android alerts are off/);
    await press(`Task: ${task.title}`);
    await screen.findByText('Alert: SCHEDULED. Delivery: UNAVAILABLE.');
    expect(
      screen.getByText(/Original alert 2026-10-22 · 08:45; next alert/),
    ).toBeTruthy();
    fixture.sql.execute(
      "UPDATE reminder_jobs SET delivery_state='REGISTERED',delivery_reason=NULL WHERE reminder_id=?",
      [fixture.repository.snapshot().reminders[0]!.id],
    );
    await act(async () => {
      view.rerender(<PlannerScreen {...view.props} deliveryRevision={1} />);
    });
    await screen.findByText('Alert: SCHEDULED. Delivery: REGISTERED.');
    expect(fixture.repository.getTask(task.id)?.dueAt).toBe(
      '2026-10-22T09:00:00.000Z',
    );
  });
  it('pages beyond20 visible tasks without omitting the second page', async () => {
    for (let i = 0; i < 25; i++)
      fixture.repository.createTask({
        token: `task_${i}`,
        draft: taskDraft({
          title: `Task ${String(i).padStart(2, '0')}`,
          dueAt: null,
        }),
        reminderLeadMinutes: null,
      });
    setup();
    await screen.findByText(/Nothing scheduled/);
    await screen.findByText(/Android alerts are off/);
    fireEvent.press(screen.getByRole('radio', {name: 'Planner view: Tasks'}));
    expect(screen.getAllByRole('button', {name: /^Task: Task/})).toHaveLength(
      20,
    );
    await press('Next task page');
    expect(screen.getAllByRole('button', {name: /^Task: Task/})).toHaveLength(
      5,
    );
    await press('Previous task page');
    expect(screen.getAllByRole('button', {name: /^Task: Task/})).toHaveLength(
      20,
    );
  });
  it('shows a bounded renderable fallback for a clock outside planner dates', async () => {
    render(
      <PlannerScreen
        mode="Calendar"
        preferences={preferences}
        factory={() => fixture.repository}
        reminderClient={client()}
        now={() => new Date('1999-01-01T00:00Z')}
        onDraftStateChange={jest.fn()}
        onRouteChange={jest.fn()}
      />,
    );
    expect(await screen.findByText(/This is a fallback view/)).toBeTruthy();
    await screen.findByText(/Android alerts are off/);
    expect(screen.getByRole('radio', {name: 'Day: 2000-01-01'})).toBeTruthy();
  });
});
