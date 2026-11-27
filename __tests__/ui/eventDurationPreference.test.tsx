import React from 'react';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import {db, initDatabase, userStore} from '../../src/storage';
import {
  personalMemoryStore as memory,
  EVENT_MEMORY_KEY,
} from '../../src/storage/personalMemoryStore';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {PreferencesSettingsScreen} from '../../src/ui/screens/PreferencesSettingsScreen';
import {
  prepareReviewedCommand,
  endReviewSession,
} from '../../src/ai/nlu/commandReview';
import {
  intentFromToolArguments,
  prepareStructuredReview,
} from '../../src/ai/voiceActions/structuredAction';
import {buildStudentVoiceContext} from '../../src/cloud/voiceConversation/localVoiceData';
import {
  parseGroupedRequest,
  createMultiActionBatch,
  reviseMultiItem,
} from '../../src/ai/voiceActions/multiActionService';
import * as scheduler from '../../src/scheduler/reminderPreferenceSync';

let owner: string;
beforeAll(async () => {
  await initDatabase();
});
beforeEach(() => {
  owner = userStore.createGuestUser().id;
  userStore.setCurrentUser(owner);
  memory.clearForDataReset(owner);
  jest
    .spyOn(scheduler, 'refreshPendingReminderLeadTimes')
    .mockResolvedValue({updatedCount: 0, failedCount: 0} as never);
});
afterEach(() => {
  jest.restoreAllMocks();
  endReviewSession();
});
const show = (onSaved = jest.fn()) =>
  render(
    <ThemeProvider userId={owner}>
      <PreferencesSettingsScreen
        userId={owner}
        onBack={jest.fn()}
        onSaved={onSaved}
      />
    </ThemeProvider>,
  );
const event = {
  action: 'create_event' as const,
  request: 'add a club event',
  title: 'Club meeting',
  date: '2030-06-15',
  time: '15:00',
};

test('Schedule has one duration field and saves it without a separate review or expiry', async () => {
  const onSaved = jest.fn();
  const view = show(onSaved);
  expect(view.getByText('Schedule')).toBeTruthy();
  expect(
    view.getByLabelText('Default event duration in minutes').props.value,
  ).toBe('60');
  expect(view.queryByLabelText('Default event start time')).toBeNull();
  expect(view.queryByText('Expires')).toBeNull();
  fireEvent.changeText(view.getByTestId('schedule-event-duration'), '90');
  expect(memory.getDefaultDuration(owner)).toBe(60);
  await act(async () => {
    fireEvent.press(view.getByText('Save Preferences'));
  });
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  expect(memory.read(owner).value).toEqual({
    startTime: null,
    durationMinutes: 90,
    expiresAt: null,
  });
  view.unmount();
  expect(show().getByTestId('schedule-event-duration').props.value).toBe('90');
});

test.each(['', '0', '14', '481', '30.5', '-30'])(
  'invalid duration %j is explained without saving',
  async value => {
    const view = show();
    fireEvent.changeText(view.getByTestId('schedule-event-duration'), value);
    fireEvent.press(view.getByText('Save Preferences'));
    expect(
      view.getByText(
        /Enter a default event duration from 15 to 480 whole minutes/,
      ),
    ).toBeTruthy();
    expect(memory.getDefaultDuration(owner)).toBe(60);
  },
);

test('enabled unexpired legacy duration is kept permanently and its fixed time is discarded', () => {
  memory.confirm(
    memory.prepare(owner, {
      startTime: '18:30',
      durationMinutes: 90,
      expiresDays: 30,
    }).token,
    owner,
  );
  expect(memory.getDefaultDuration(owner)).toBe(90);
  expect(memory.read(owner).value).toEqual({
    startTime: null,
    durationMinutes: 90,
    expiresAt: null,
  });
  const revision = memory.read(owner).revision;
  expect(memory.getDefaultDuration(owner)).toBe(90);
  expect(memory.read(owner).revision).toBe(revision);
});

test('disabled and expired legacy defaults reset to 60 instead of being reactivated', () => {
  memory.confirm(
    memory.prepare(owner, {
      startTime: '18:30',
      durationMinutes: 90,
      expiresDays: 30,
    }).token,
    owner,
  );
  memory.setEnabled(owner, false);
  expect(memory.getDefaultDuration(owner)).toBe(60);
  memory.confirm(
    memory.prepare(owner, {
      startTime: '18:30',
      durationMinutes: 90,
      expiresDays: 30,
    }).token,
    owner,
  );
  const expired = memory.read(owner);
  db.executeSync(
    'UPDATE local_settings SET value = ? WHERE user_id = ? AND key = ?',
    [
      JSON.stringify({
        ...expired,
        value: {...expired.value, expiresAt: '2000-01-01T00:00:00Z'},
      }),
      owner,
      EVENT_MEMORY_KEY,
    ],
  );
  expect(memory.getDefaultDuration(owner)).toBe(60);
});

test('an event uses the duration only when no explicit end or length is given', () => {
  memory.saveDefaultDuration(owner, 90);
  const prepared = prepareStructuredReview(owner, event, 'voice');
  expect(prepared?.status).toBe('proposal');
  if (prepared?.status !== 'proposal') throw new Error('Expected proposal');
  expect(prepared.proposal.draftFields).toMatchObject({
    time: '15:00',
    endTime: '16:30',
  });
  const explicit = prepareStructuredReview(
    owner,
    {...event, endTime: '15:30'},
    'voice',
  );
  if (explicit?.status !== 'proposal')
    throw new Error('Expected explicit proposal');
  expect(explicit.proposal.draftFields).toMatchObject({endTime: '15:30'});
});

test('an event with a missing time asks instead of using a legacy start or 9 AM', () => {
  memory.confirm(
    memory.prepare(owner, {
      startTime: '18:30',
      durationMinutes: 90,
      expiresDays: 30,
    }).token,
    owner,
  );
  const input = intentFromToolArguments({...event, time: undefined});
  if (!input) throw new Error('Expected intent');
  const prepared = prepareReviewedCommand(owner, input, {
    referenceDate: new Date(2030, 5, 14, 12),
  });
  expect(prepared.status).toBe('clarify');
  expect(prepared.reply).toMatch(/What time should.*start/);
  expect(prepared.reply).not.toMatch(/9:00|18:30|6:30/);
  expect(buildStudentVoiceContext(owner)).toMatch(
    /omit endTime and durationMinutes/,
  );
  expect(buildStudentVoiceContext(owner)).toMatch(
    /Ask for a missing start time/,
  );
});

test('grouped events use the preference and keep explicit end times', () => {
  memory.saveDefaultDuration(owner, 90);
  const parsed = parseGroupedRequest(
    'add event "Club activity" tomorrow at 3pm and add task "Submit draft" tomorrow',
    new Date(2030, 5, 14, 12),
    memory.getDefaultDuration(owner),
  );
  expect(
    createMultiActionBatch('duration-group', owner, parsed.items).items[0],
  ).toMatchObject({time: '15:00', endTime: '16:30'});
  const explicit = parseGroupedRequest(
    'add event "Club activity" tomorrow at 3pm for 30 minutes and add task "Submit draft" tomorrow',
    new Date(2030, 5, 14, 12),
    90,
  );
  expect(explicit.items[0].endTime).toBe('15:30');
  const mixed = parseGroupedRequest(
    'Add a meeting tomorrow at 5 PM and a reminder to submit slides Friday at 3 PM',
    new Date(2030, 5, 14, 12),
    90,
  );
  expect(mixed.items[1]).toMatchObject({
    kind: 'reminder',
    title: 'Submit slides',
  });
  const pending = createMultiActionBatch('missing-group-time', owner, [
    {
      id: 'missing-time',
      kind: 'event',
      title: 'Club activity',
      date: '2030-06-15',
      status: 'draft',
    },
  ]);
  expect(
    reviseMultiItem(pending, 'missing-time', {time: '15:00'}).items[0].endTime,
  ).toBe('16:30');
});

test('duration writes remain owner checked and data reset returns to 60', () => {
  memory.saveDefaultDuration(owner, 90);
  expect(() => memory.saveDefaultDuration('someone-else', 45)).toThrow();
  memory.clearForDataReset(owner);
  expect(memory.getDefaultDuration(owner)).toBe(60);
});

test('saving a duration repairs an unreadable legacy record without retaining a fixed time', () => {
  db.executeSync(
    'UPDATE local_settings SET value = ? WHERE user_id = ? AND key = ?',
    ['{broken', owner, EVENT_MEMORY_KEY],
  );
  expect(memory.getDefaultDuration(owner)).toBe(60);
  db.transactionSync(tx => memory.saveDefaultDuration(owner, 45, tx));
  expect(memory.read(owner).value).toEqual({
    startTime: null,
    durationMinutes: 45,
    expiresAt: null,
  });
});
