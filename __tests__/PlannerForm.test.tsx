import {act, fireEvent, render, screen} from '@testing-library/react-native';
import type {AcademicEvent, Task} from '../src/core/domain/planner';
import {defaultPreferences} from '../src/core/domain/preferences';
import {dateTimePicker} from '../src/core/native/dateTimePicker';
import {PlannerForm} from '../src/features/scheduling/PlannerForm';
import type {PlannerFormProps} from '../src/features/scheduling/PlannerForm';

jest.mock('../src/core/native/dateTimePicker', () => ({
  dateTimePicker: {pickDate: jest.fn(), pickTime: jest.fn()},
}));

const date = '2026-10-26';
const preferences = defaultPreferences('Asia/Manila');

function setup(overrides: Partial<PlannerFormProps> = {}) {
  const props: PlannerFormProps = {
    initial: null,
    kind: 'task',
    date,
    preferences,
    clockFormat: '12h',
    onSave: jest.fn(),
    onCancel: jest.fn(),
    ...overrides,
  };
  const result = render(<PlannerForm {...props} />);
  return {...result, props};
}

function title(value = 'Read Chapter 1') {
  fireEvent.changeText(screen.getByLabelText('Title'), value);
}

function timedTask() {
  title();
  fireEvent.press(screen.getByLabelText('Due: Date and time'));
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-23T00:00:00.000Z'));
});

afterEach(() => {
  jest.useRealTimers();
});

test('saves an undated manual task without inventing an alarm and guards repeat save taps', () => {
  const {props} = setup();
  title();
  fireEvent.press(screen.getByText('Save task'));
  fireEvent.press(screen.getByText('Save task'));
  expect(props.onSave).toHaveBeenCalledTimes(1);
  expect(props.onSave).toHaveBeenCalledWith({
    kind: 'task',
    draft: {
      title: 'Read Chapter 1',
      notes: '',
      timezone: 'Asia/Manila',
      dueAt: null,
      dueDate: null,
      status: 'TODO',
    },
    reminderLeadMinutes: null,
  });
});

test('rejects an impossible date, then saves a date-only task with no reminder', () => {
  const {props} = setup();
  title();
  fireEvent.press(screen.getByLabelText('Due: Date only'));
  fireEvent.changeText(screen.getByLabelText('Due date'), '2026-02-31');
  fireEvent.press(screen.getByText('Save task'));
  expect(props.onSave).not.toHaveBeenCalled();
  expect(
    screen.getByText('Use a real calendar date between 2000 and 2100.'),
  ).toBeTruthy();
  fireEvent.changeText(screen.getByLabelText('Due date'), date);
  fireEvent.press(screen.getByText('Save task'));
  expect(props.onSave).toHaveBeenCalledWith(
    expect.objectContaining({
      draft: expect.objectContaining({dueDate: date, dueAt: null}),
      reminderLeadMinutes: null,
    }),
  );
});

test('reminders require opt-in and validate whole minutes before UTC conversion is saved', () => {
  const {props} = setup();
  timedTask();
  expect(screen.queryByLabelText('Reminder lead (minutes)')).toBeNull();
  fireEvent(screen.getByLabelText('Remind me'), 'valueChange', true);
  expect(screen.getByLabelText('Reminder lead (minutes)').props.value).toBe(
    '15',
  );
  fireEvent.changeText(screen.getByLabelText('Reminder lead (minutes)'), '1.5');
  fireEvent.press(screen.getByText('Save task'));
  expect(props.onSave).not.toHaveBeenCalled();
  expect(
    screen.getByText('Reminder lead must be an integer from 0 to 120 minutes.'),
  ).toBeTruthy();
  fireEvent.changeText(screen.getByLabelText('Reminder lead (minutes)'), '10');
  fireEvent.changeText(screen.getByLabelText('Due time'), '15:30');
  expect(screen.getByText('3:30 PM')).toBeTruthy();
  fireEvent.press(screen.getByText('Save task'));
  expect(props.onSave).toHaveBeenCalledWith(
    expect.objectContaining({
      draft: expect.objectContaining({dueAt: '2026-10-26T07:30:00.000Z'}),
      reminderLeadMinutes: 10,
    }),
  );
});

test('switching from a timed reminder to a date-only task removes its alarm', () => {
  const {props} = setup();
  timedTask();
  fireEvent(screen.getByLabelText('Remind me'), 'valueChange', true);
  fireEvent.press(screen.getByLabelText('Due: Date only'));
  fireEvent.press(screen.getByText('Save task'));
  expect(props.onSave).toHaveBeenCalledWith(
    expect.objectContaining({reminderLeadMinutes: null}),
  );
});

test('a failed durable save retains the draft and permits an explicit retry', () => {
  const onSave = jest.fn().mockImplementationOnce(() => {
    throw new Error('This item changed elsewhere. Reopen it before saving.');
  });
  setup({onSave});
  title('Keep my notes');
  fireEvent.press(screen.getByText('Save task'));
  expect(screen.getByLabelText('Title').props.value).toBe('Keep my notes');
  expect(screen.getByText(/Your changes could not be saved/)).toBeTruthy();
  fireEvent.press(screen.getByText('Save task'));
  expect(onSave).toHaveBeenCalledTimes(2);
});

test('requires confirmation for a future due time whose reminder is already past', () => {
  const {props} = setup({date: '2026-10-23'});
  timedTask();
  fireEvent.changeText(screen.getByLabelText('Due time'), '08:05');
  fireEvent(screen.getByLabelText('Remind me'), 'valueChange', true);
  fireEvent.press(screen.getByText('Save task'));
  expect(props.onSave).not.toHaveBeenCalled();
  expect(
    screen.getByText(/This schedule or its reminder time is in the past/),
  ).toBeTruthy();
  fireEvent.press(screen.getByText('Save past schedule'));
  expect(props.onSave).toHaveBeenCalledTimes(1);
});

test('changing a past schedule invalidates its pending confirmation', () => {
  const {props} = setup({date: '2026-10-22'});
  timedTask();
  fireEvent.press(screen.getByText('Save task'));
  fireEvent.changeText(screen.getByLabelText('Due date'), date);
  expect(screen.queryByText('Save past schedule')).toBeNull();
  fireEvent.press(screen.getByText('Save task'));
  expect(props.onSave).toHaveBeenCalledTimes(1);
});

test('dirty cancellation requires discard and reports dirty changes to navigation', () => {
  const onDraftStateChange = jest.fn();
  const {props} = setup({onDraftStateChange});
  title();
  expect(onDraftStateChange).toHaveBeenLastCalledWith(true);
  fireEvent.press(screen.getByText('Cancel editing'));
  expect(props.onCancel).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('Keep editing'));
  expect(screen.getByLabelText('Title').props.value).toBe('Read Chapter 1');
  fireEvent.press(screen.getByText('Cancel editing'));
  fireEvent.press(screen.getByText('Discard schedule edits'));
  expect(props.onCancel).toHaveBeenCalledTimes(1);
});

test('a pristine form cancels immediately', () => {
  const {props} = setup();
  fireEvent.press(screen.getByText('Cancel editing'));
  expect(props.onCancel).toHaveBeenCalledTimes(1);
});

test('native picker failure preserves typed controls and cancelled picker preserves its value', async () => {
  jest
    .mocked(dateTimePicker.pickDate)
    .mockRejectedValueOnce(new Error('No activity'));
  jest.mocked(dateTimePicker.pickTime).mockResolvedValueOnce(null);
  const {props} = setup();
  timedTask();
  await act(async () => fireEvent.press(screen.getByText('Choose due date')));
  expect(
    screen.getByText(
      'The picker is unavailable. You can still type the date or time.',
    ),
  ).toBeTruthy();
  await act(async () => fireEvent.press(screen.getByText('Choose due time')));
  expect(dateTimePicker.pickTime).toHaveBeenCalledWith('09:00', false);
  expect(screen.getByLabelText('Due time').props.value).toBe('09:00');
  fireEvent.changeText(screen.getByLabelText('Due date'), date);
  fireEvent.press(screen.getByText('Save task'));
  expect(props.onSave).toHaveBeenCalledTimes(1);
});

test('native picker results update canonical input and late unmounted results do not notify navigation', async () => {
  jest.mocked(dateTimePicker.pickDate).mockResolvedValueOnce('2026-10-27');
  let resolve: (value: string | null) => void = () => {};
  jest.mocked(dateTimePicker.pickTime).mockImplementationOnce(
    () =>
      new Promise(done => {
        resolve = done;
      }),
  );
  const onDraftStateChange = jest.fn();
  const {unmount} = setup({clockFormat: '24h', onDraftStateChange});
  timedTask();
  await act(async () => fireEvent.press(screen.getByText('Choose due date')));
  expect(screen.getByLabelText('Due date').props.value).toBe('2026-10-27');
  fireEvent.press(screen.getByText('Choose due time'));
  expect(dateTimePicker.pickTime).toHaveBeenCalledWith('09:00', true);
  unmount();
  const count = onDraftStateChange.mock.calls.length;
  await act(async () => resolve('12:30'));
  expect(onDraftStateChange).toHaveBeenCalledTimes(count);
});

test('invalid event intervals cannot save and a bounded weekly class saves selected weekdays', () => {
  const {props} = setup({kind: 'event'});
  title('Calculus');
  fireEvent.changeText(screen.getByLabelText('End time'), '08:00');
  fireEvent.press(screen.getByText('Save event'));
  expect(screen.getByText('Event end must be after its start.')).toBeTruthy();
  fireEvent.changeText(screen.getByLabelText('End time'), '10:00');
  fireEvent(screen.getByLabelText('Repeat weekly'), 'valueChange', true);
  fireEvent.press(screen.getByLabelText('Repeat on Wednesday'));
  fireEvent.changeText(screen.getByLabelText('Repeat until'), '2026-11-08');
  fireEvent.press(screen.getByText('Save event'));
  expect(props.onSave).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: 'event',
      draft: expect.objectContaining({
        recurrence: {weekdays: [1, 3], untilDate: '2026-11-08'},
      }),
      reminderLeadMinutes: null,
    }),
  );
});

test('recurrence rejects an omitted starting weekday and an excessive horizon', () => {
  const {props} = setup({kind: 'event'});
  title('Weekly class');
  fireEvent(screen.getByLabelText('Repeat weekly'), 'valueChange', true);
  fireEvent.press(screen.getByLabelText('Repeat on Monday'));
  fireEvent.press(screen.getByLabelText('Repeat on Wednesday'));
  fireEvent.changeText(screen.getByLabelText('Repeat until'), '2026-11-08');
  fireEvent.press(screen.getByText('Save event'));
  expect(
    screen.getByText(
      'The starting class must match a selected weekday and fold.',
    ),
  ).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Repeat on Monday'));
  fireEvent.changeText(screen.getByLabelText('Repeat until'), '2028-01-01');
  fireEvent.press(screen.getByText('Save event'));
  expect(
    screen.getByText(
      'A weekly series must span between 1 and 366 calendar days.',
    ),
  ).toBeTruthy();
  expect(props.onSave).not.toHaveBeenCalled();
});

test('DST gaps reject and folds require an explicit occurrence choice', () => {
  const {props} = setup({date: '2027-03-14'});
  timedTask();
  fireEvent.changeText(screen.getByLabelText('Timezone'), 'America/New_York');
  fireEvent.changeText(screen.getByLabelText('Due time'), '02:30');
  fireEvent.press(screen.getByText('Save task'));
  expect(
    screen.getByText(
      'This local time does not exist in the selected timezone.',
    ),
  ).toBeTruthy();
  expect(
    screen.queryByLabelText('Repeated local start time: Later occurrence'),
  ).toBeNull();
  fireEvent.changeText(screen.getByLabelText('Due date'), '2026-11-01');
  fireEvent.changeText(screen.getByLabelText('Due time'), '01:30');
  fireEvent.press(screen.getByText('Save task'));
  expect(props.onSave).not.toHaveBeenCalled();
  fireEvent.press(
    screen.getByLabelText('Repeated local start time: Later occurrence'),
  );
  fireEvent.press(screen.getByText('Save task'));
  expect(props.onSave).toHaveBeenCalledWith(
    expect.objectContaining({
      draft: expect.objectContaining({dueAt: '2026-11-01T06:30:00.000Z'}),
    }),
  );
});

test('editing an existing task preserves its explicit completion and saved later fold', () => {
  const initial: Task = {
    id: 'task',
    title: 'Finished class',
    notes: '',
    timezone: 'America/New_York',
    dueAt: '2026-11-01T06:30:00.000Z',
    dueDate: null,
    status: 'COMPLETED',
    reminderLeadMinutes: null,
    version: 2,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-02T00:00:00.000Z',
  };
  const {props} = setup({initial});
  title('Rename completed class');
  fireEvent.press(screen.getByText('Save task'));
  expect(props.onSave).toHaveBeenCalledWith(
    expect.objectContaining({
      draft: expect.objectContaining({
        dueAt: initial.dueAt,
        status: 'COMPLETED',
      }),
    }),
  );
});

test('editing notes preserves seconds in a pre-existing schedule instead of silently moving the alarm', () => {
  const initial: Task = {
    id: 'task',
    title: 'Existing exam',
    notes: '',
    timezone: 'UTC',
    dueAt: '2026-11-01T09:00:45.000Z',
    dueDate: null,
    status: 'TODO',
    reminderLeadMinutes: 10,
    version: 1,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  };
  const {props} = setup({initial});
  fireEvent.changeText(screen.getByLabelText('Notes'), 'Room 204');
  fireEvent.press(screen.getByText('Save task'));
  expect(props.onSave).toHaveBeenCalledWith(
    expect.objectContaining({
      draft: expect.objectContaining({dueAt: initial.dueAt}),
    }),
  );
});

test('whole-series editing warns clearly and preserves a cross-fold end instant', () => {
  const initial: AcademicEvent = {
    id: 'event',
    title: 'Fold seminar',
    notes: '',
    timezone: 'America/New_York',
    startAt: '2026-11-01T05:30:00.000Z',
    endAt: '2026-11-01T06:45:00.000Z',
    recurrence: {weekdays: [0], untilDate: '2026-11-01', fold: 'earlier'},
    status: 'ACTIVE',
    reminderLeadMinutes: null,
    version: 1,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  };
  const {props} = setup({initial, kind: 'event'});
  expect(screen.getByText(/This edits the entire weekly series/)).toBeTruthy();
  title('Renamed seminar');
  fireEvent.press(screen.getByText('Save event'));
  expect(props.onSave).toHaveBeenCalledWith(
    expect.objectContaining({
      draft: expect.objectContaining({
        startAt: initial.startAt,
        endAt: initial.endAt,
      }),
    }),
  );
});
