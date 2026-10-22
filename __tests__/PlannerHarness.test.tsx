import {fireEvent, render, screen} from '@testing-library/react-native';
import type {
  PlannerRepository,
  PlannerSnapshot,
  Task,
} from '../src/core/domain/planner';
import {PlannerHarness} from '../src/features/scheduling/PlannerHarness';

const instant = '2026-10-22T02:00:00.000Z';
const now = () => instant;

function injectedRepository() {
  const task: Task = {
    id: 'task-1',
    title: 'Synthetic coursework',
    notes: '',
    dueAt: instant,
    dueDate: null,
    timezone: 'Asia/Manila',
    status: 'TODO',
    reminderLeadMinutes: 0,
    version: 1,
    createdAt: instant,
    updatedAt: instant,
  };
  const snapshot: PlannerSnapshot = {
    tasks: [task],
    events: [],
    reminders: [
      {
        id: 'reminder-1',
        taskId: task.id,
        eventId: null,
        occurrenceKey: instant,
        scheduledAt: instant,
        leadMinutes: 0,
        status: 'RINGING',
        version: 1,
        lastOutcomeAt: null,
      },
    ],
    jobs: [
      {
        id: 'job-1',
        reminderId: 'reminder-1',
        occurrenceKey: instant,
        runAt: instant,
        status: 'RINGING',
        generation: 1,
        attemptCount: 1,
        deliveryState: 'UNAVAILABLE',
        deliveryReason: 'PHASE_02',
      },
    ],
  };
  const repository: PlannerRepository = {
    snapshot: jest.fn(() => snapshot),
    createTask: jest.fn(command => ({
      ...task,
      ...command.draft,
      reminderLeadMinutes: command.reminderLeadMinutes,
      id: 'new-task',
    })),
    updateTask: jest.fn(command => ({
      ...task,
      ...command.draft,
      reminderLeadMinutes: command.reminderLeadMinutes,
      version: 2,
    })),
    deleteTask: jest.fn(),
    createEvent: jest.fn(command => ({
      ...command.draft,
      reminderLeadMinutes: command.reminderLeadMinutes,
      id: 'event-1',
      version: 1,
      createdAt: instant,
      updatedAt: instant,
    })),
    updateEvent: jest.fn(command => ({
      ...command.draft,
      reminderLeadMinutes: command.reminderLeadMinutes,
      id: command.id,
      version: 2,
      createdAt: instant,
      updatedAt: instant,
    })),
    deleteEvent: jest.fn(),
    reminderAction: jest.fn(command => {
      if (command.action.kind === 'ACK') {
        snapshot.reminders[0]!.status = 'ACKNOWLEDGED';
      }
      return 'applied';
    }),
    upcoming: jest.fn(() => []),
    appendChat: jest.fn(),
    recentChat: jest.fn(() => []),
  };
  return {repository, snapshot, task};
}

describe('Phase 02 developer harness', () => {
  it('edits the source reminder preference rather than a historical reminder lead', () => {
    const {repository, task} = injectedRepository();
    task.reminderLeadMinutes = 30;
    render(
      <PlannerHarness
        repository={repository}
        timezone="Asia/Manila"
        now={now}
      />,
    );
    fireEvent.press(
      screen.getByRole('button', {name: 'Edit task 1: Synthetic coursework'}),
    );
    expect(
      screen.getByLabelText('Reminder lead minutes (empty for none, 0–120)')
        .props.value,
    ).toBe('30');
  });

  it('simulates a due reminder in its source timezone despite an unrelated edited timezone', () => {
    const {repository, task} = injectedRepository();
    task.timezone = 'America/New_York';
    render(
      <PlannerHarness
        repository={repository}
        timezone="Asia/Manila"
        now={now}
      />,
    );
    fireEvent.changeText(
      screen.getByLabelText('Item timezone'),
      'Europe/London',
    );
    fireEvent.press(
      screen.getByRole('button', {name: 'Inspect reminder 1: RINGING'}),
    );
    fireEvent.press(
      screen.getByRole('button', {name: 'Simulate due for selected reminder'}),
    );
    expect(repository.reminderAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: {kind: 'RING', timezone: 'America/New_York', quietHours: null},
      }),
    );
  });

  it('retains a failed draft and its operation token on retry without exposing SQL errors', () => {
    const {repository} = injectedRepository();
    jest.mocked(repository.createTask).mockImplementationOnce(() => {
      throw new Error('SQLite failed with private schedule payload');
    });
    render(
      <PlannerHarness
        repository={repository}
        timezone="Asia/Manila"
        now={now}
      />,
    );
    fireEvent.changeText(
      screen.getByLabelText('Item title'),
      'Synthetic draft',
    );
    fireEvent.press(screen.getByRole('button', {name: 'Create local item'}));
    expect(screen.getByDisplayValue('Synthetic draft')).toBeTruthy();
    expect(screen.queryByText(/private schedule payload/)).toBeNull();
    expect(screen.getByRole('alert')).toBeTruthy();
    const firstToken = jest.mocked(repository.createTask).mock.calls[0]![0]
      .token;
    fireEvent.press(screen.getByRole('button', {name: 'Create local item'}));
    expect(jest.mocked(repository.createTask).mock.calls[1]![0].token).toBe(
      firstToken,
    );
    expect(screen.getByText(/Saved locally/)).toBeTruthy();
  });

  it('uses a different operation token when a failed draft changes', () => {
    const {repository} = injectedRepository();
    jest.mocked(repository.createTask).mockImplementation(() => {
      throw new Error('write failed');
    });
    render(
      <PlannerHarness
        repository={repository}
        timezone="Asia/Manila"
        now={now}
      />,
    );
    fireEvent.changeText(screen.getByLabelText('Item title'), 'First title');
    fireEvent.press(screen.getByRole('button', {name: 'Create local item'}));
    fireEvent.changeText(screen.getByLabelText('Item title'), 'Changed title');
    fireEvent.press(screen.getByRole('button', {name: 'Create local item'}));
    const calls = jest.mocked(repository.createTask).mock.calls;
    expect(calls[1]![0].token).not.toBe(calls[0]![0].token);
  });

  it('rejects an impossible local date before calling the write API', () => {
    const {repository} = injectedRepository();
    render(
      <PlannerHarness
        repository={repository}
        timezone="Asia/Manila"
        now={now}
      />,
    );
    fireEvent.changeText(screen.getByLabelText('Item title'), 'Invalid date');
    fireEvent.press(screen.getByRole('radio', {name: 'Task due: Timed'}));
    fireEvent.changeText(
      screen.getByLabelText('Start or due date (YYYY-MM-DD)'),
      '2026-02-31',
    );
    fireEvent.changeText(
      screen.getByLabelText('Start or due time (HH:mm)'),
      '09:00',
    );
    fireEvent.press(screen.getByRole('button', {name: 'Create local item'}));
    expect(
      screen.getByText('Use a real calendar date between 2000 and 2100.'),
    ).toBeTruthy();
    expect(repository.createTask).not.toHaveBeenCalled();
  });

  it('requires delete confirmation, allows cancellation and passes the selected version', () => {
    const {repository} = injectedRepository();
    render(
      <PlannerHarness
        repository={repository}
        timezone="Asia/Manila"
        now={now}
      />,
    );
    fireEvent.press(
      screen.getByRole('button', {name: 'Edit task 1: Synthetic coursework'}),
    );
    fireEvent.press(screen.getByRole('button', {name: 'Delete selected item'}));
    expect(repository.deleteTask).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole('button', {name: 'Keep selected item'}));
    expect(
      screen.queryByRole('button', {name: 'Confirm delete selected item'}),
    ).toBeNull();
    fireEvent.press(screen.getByRole('button', {name: 'Delete selected item'}));
    fireEvent.press(
      screen.getByRole('button', {name: 'Confirm delete selected item'}),
    );
    expect(repository.deleteTask).toHaveBeenCalledWith(
      expect.objectContaining({id: 'task-1', expectedVersion: 1}),
    );
  });

  it('sends ACK with occurrence and generation and never calls task completion', () => {
    const {repository, task} = injectedRepository();
    render(
      <PlannerHarness
        repository={repository}
        timezone="Asia/Manila"
        now={now}
      />,
    );
    fireEvent.press(
      screen.getByRole('button', {name: 'Inspect reminder 1: RINGING'}),
    );
    fireEvent.press(
      screen.getByRole('button', {
        name: 'ACK selected reminder (keep task status)',
      }),
    );
    expect(repository.reminderAction).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'reminder-1',
        occurrenceKey: instant,
        generation: 1,
        action: {kind: 'ACK'},
      }),
    );
    expect(repository.updateTask).not.toHaveBeenCalled();
    expect(task.status).toBe('TODO');
    expect(screen.getByText('Linked task status: TODO')).toBeTruthy();
    expect(screen.getByText(/Selected reminder: ACKNOWLEDGED/)).toBeTruthy();
  });

  it('cannot simulate a future job as due or snooze a fractional duration', () => {
    const {repository, snapshot} = injectedRepository();
    snapshot.jobs[0]!.runAt = '2026-10-23T02:00:00.000Z';
    render(
      <PlannerHarness
        repository={repository}
        timezone="Asia/Manila"
        now={now}
      />,
    );
    fireEvent.press(
      screen.getByRole('button', {name: 'Inspect reminder 1: RINGING'}),
    );
    fireEvent.press(
      screen.getByRole('button', {name: 'Simulate due for selected reminder'}),
    );
    expect(screen.getByText(/This job is still in the future/)).toBeTruthy();
    fireEvent.changeText(
      screen.getByLabelText('Snooze minutes (1–120)'),
      '1.5',
    );
    fireEvent.press(
      screen.getByRole('button', {name: 'Snooze selected reminder'}),
    );
    expect(repository.reminderAction).not.toHaveBeenCalled();
  });

  it('shows a read failure instead of a falsely empty planner and permits retry', () => {
    const {repository} = injectedRepository();
    jest.mocked(repository.snapshot).mockImplementationOnce(() => {
      throw new Error('read failed');
    });
    render(
      <PlannerHarness
        repository={repository}
        timezone="Asia/Manila"
        now={now}
      />,
    );
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.queryByText(/Loaded: 0 tasks/)).toBeNull();
    fireEvent.press(
      screen.getByRole('button', {name: 'Reload planner storage'}),
    );
    expect(
      screen.getByRole('button', {name: 'Edit task 1: Synthetic coursework'}),
    ).toBeTruthy();
  });
});
