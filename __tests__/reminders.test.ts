import {createAlarmClient} from '../src/core/native/reminders';
import type {NativeReminderBridge} from '../src/core/native/reminders';
import {reconcilePlanner} from '../src/core/native/reconcilePlanner';
import type {PlannerRepository, TaskDraft} from '../src/core/domain/planner';

const caps = {
  sdk: 37,
  enabled: false,
  notifications: false,
  exact: false,
  fullScreen: false,
  fullScreenEnabled: false,
  channelImportance: 4,
};
function setup() {
  const bridge: NativeReminderBridge = {
    capabilities: jest.fn(async () => JSON.stringify(caps)),
    reconcile: jest.fn(async () =>
      JSON.stringify({...caps, scheduled: 0, cancelled: 0, failed: 0}),
    ),
    setEnabled: jest.fn(async enabled => JSON.stringify({...caps, enabled})),
    setFullScreenEnabled: jest.fn(async fullScreenEnabled =>
      JSON.stringify({...caps, fullScreenEnabled}),
    ),
    openSettings: jest.fn(async () => true),
    openReminder: jest.fn(async () => true),
    diagnostics: jest.fn(async () =>
      JSON.stringify({
        capabilities: caps,
        counts: {pending: 0, ringing: 0, registered: 0, failed: 0},
        events: [],
      }),
    ),
  };
  const request = jest.fn(async () => false);
  return {bridge, request, client: createAlarmClient(() => bridge, request)};
}

it('reports unavailable native bridge without a false success', async () => {
  const client = createAlarmClient(
    () => undefined,
    async () => false,
  );
  await expect(client.capabilities()).rejects.toThrow('unavailable');
  await expect(client.reconcile()).rejects.toThrow('unavailable');
});
it('passes exact identity arguments and user settings commands unchanged', async () => {
  const {client, bridge, request} = setup();
  expect(await client.capabilities()).toEqual(caps);
  expect((await client.setEnabled(true)).enabled).toBe(true);
  expect((await client.setFullScreenEnabled(true)).fullScreenEnabled).toBe(
    true,
  );
  await client.openSettings('exact');
  await client.openReminder({
    jobId: 'job/a?b',
    occurrenceKey: '2026-10-23T02:00:00.000Z',
    generation: 9,
  });
  expect(bridge.openSettings).toHaveBeenCalledWith('exact');
  expect(bridge.openReminder).toHaveBeenCalledWith(
    'job/a?b',
    '2026-10-23T02:00:00.000Z',
    9,
  );
  expect(await client.requestNotifications()).toBe(false);
  expect(request).toHaveBeenCalledTimes(1);
});
it.each([0, -1, 1.5, Infinity, 2_147_483_648])(
  'rejects invalid generation %s before crossing the native bridge',
  async generation => {
    const {client, bridge} = setup();
    await expect(
      client.openReminder({jobId: 'job', occurrenceKey: 'occ', generation}),
    ).rejects.toThrow('identity');
    expect(bridge.openReminder).not.toHaveBeenCalled();
  },
);
it('rejects malformed capabilities, diagnostics and counts rather than assuming permission', async () => {
  const {client, bridge} = setup();
  jest
    .mocked(bridge.capabilities)
    .mockResolvedValueOnce(JSON.stringify({...caps, exact: 'true'}));
  await expect(client.capabilities()).rejects.toThrow('capability');
  jest
    .mocked(bridge.reconcile)
    .mockResolvedValueOnce(
      JSON.stringify({...caps, scheduled: -1, cancelled: 0, failed: 0}),
    );
  await expect(client.reconcile()).rejects.toThrow('count');
  jest.mocked(bridge.diagnostics).mockResolvedValueOnce(
    JSON.stringify({
      capabilities: caps,
      counts: {},
      events: Array(201).fill({}),
    }),
  );
  await expect(client.diagnostics()).rejects.toThrow('history');
});
it('propagates native refusal and validates bounded redacted diagnostics', async () => {
  const {client, bridge} = setup();
  jest
    .mocked(bridge.reconcile)
    .mockRejectedValueOnce(new Error('native refused'));
  await expect(client.reconcile()).rejects.toThrow('native refused');
  expect((await client.diagnostics()).events).toEqual([]);
  expect(bridge.setEnabled).not.toHaveBeenCalled();
});

it('keeps committed manual edits successful, coalesces reconciliation and surfaces delivery failure', async () => {
  const createTask = jest.fn(() => ({id: 'saved'}));
  const base = {createTask} as unknown as PlannerRepository;
  let resolve: (() => void) | undefined;
  const reconcile = jest
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<void>(done => {
          resolve = done;
        }),
    )
    .mockRejectedValueOnce(new Error('denied'));
  const failed = jest.fn();
  const repository = reconcilePlanner(base, reconcile, failed);
  const command = {
    token: 't',
    draft: {} as TaskDraft,
    reminderLeadMinutes: null,
  };
  expect(repository.createTask(command).id).toBe('saved');
  repository.createTask({...command, token: 't2'});
  repository.createTask({...command, token: 't3'});
  expect(reconcile).toHaveBeenCalledTimes(1);
  resolve?.();
  await new Promise<void>(done => setImmediate(done));
  expect(reconcile).toHaveBeenCalledTimes(2);
  expect(failed).toHaveBeenCalledTimes(1);
  expect(createTask).toHaveBeenCalledTimes(3);
});
it('does not request platform changes when the database mutation fails', () => {
  const base = {
    deleteTask: () => {
      throw new Error('version conflict');
    },
  } as unknown as PlannerRepository;
  const reconcile = jest.fn(async () => undefined);
  const repository = reconcilePlanner(base, reconcile, jest.fn());
  expect(() =>
    repository.deleteTask({token: 't', id: 'id', expectedVersion: 1}),
  ).toThrow('version conflict');
  expect(reconcile).not.toHaveBeenCalled();
});
