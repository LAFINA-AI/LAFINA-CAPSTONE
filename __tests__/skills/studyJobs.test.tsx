import {act, renderHook} from '@testing-library/react-native';
import {noteSessionChange} from '../../src/storage/sessionEpoch';
import {invalidateOwnerWork} from '../../src/storage/ownerWorkEpoch';
import {
  resetStudyJobsForTests,
  useStudyJob,
  type StudyJobContext,
} from '../../src/skills/studyJobs';

beforeEach(() => {
  resetStudyJobsForTests();
});

test.each(['signout', 'reset'] as const)(
  '%s cancels pending skill work and discards late results',
  async reason => {
    const hook = renderHook(() => useStudyJob<string>('owner-a', 'pending'));
    let finish!: (value: string) => void;
    let context!: StudyJobContext;
    let running!: Promise<void>;
    act(() => {
      running = hook.result.current.run(ctx => {
        context = ctx;
        return new Promise(resolve => {
          finish = resolve;
        });
      });
    });
    act(() =>
      reason === 'signout'
        ? noteSessionChange()
        : invalidateOwnerWork('owner-a'),
    );
    expect(context.signal.aborted).toBe(true);
    expect(context.isCancelled()).toBe(true);
    expect(hook.result.current.busy).toBe(false);
    await act(async () => {
      finish('private result');
      await running;
    });
    expect(hook.result.current.result).toBeNull();
    expect(hook.result.current.error).toBe('');
  },
);

test('resetting another owner leaves the active job intact', async () => {
  const hook = renderHook(() => useStudyJob<string>('owner-a', 'isolated'));
  await act(async () => {
    await hook.result.current.run(async ctx => {
      invalidateOwnerWork('owner-b');
      expect(ctx.isCancelled()).toBe(false);
      return 'retained';
    });
  });
  expect(hook.result.current.result).toBe('retained');
});

test('a job survives page navigation, preserves progress, and consumes its result once', async () => {
  let finish: (value: string) => void = () => {};
  const deferred = new Promise<string>(resolve => {
    finish = resolve;
  });
  const first = renderHook(() =>
    useStudyJob<string>('synthetic-owner', 'navigation-test'),
  );
  let running: Promise<void>;
  act(() => {
    running = first.result.current.run(() => deferred);
  });
  act(() => first.result.current.setProgress(2));
  expect(first.result.current.busy).toBe(true);
  first.unmount();
  const second = renderHook(() =>
    useStudyJob<string>('synthetic-owner', 'navigation-test'),
  );
  expect(second.result.current.progress).toBe(2);
  await act(async () => {
    finish('Finished');
    await running;
  });
  expect(second.result.current.result).toBe('Finished');
  act(() => second.result.current.consume());
  second.unmount();
  const third = renderHook(() =>
    useStudyJob<string>('synthetic-owner', 'navigation-test'),
  );
  expect(third.result.current.result).toBeNull();
  expect(third.result.current.busy).toBe(false);
});

test('study jobs support clearError, cancellation with AbortSignal, statusText, startedAt, and test reset', async () => {
  const hook = renderHook(() =>
    useStudyJob<string>('synthetic-owner', 'cancel-and-error'),
  );
  await act(async () => {
    await hook.result.current.run(async () => {
      throw new Error('Boom');
    });
  });
  expect(hook.result.current.error).toBe('Boom');
  expect(hook.result.current.startedAt).toBeNull();
  act(() => hook.result.current.clearError());
  expect(hook.result.current.error).toBe('');

  let resolveLate: (value: string) => void = () => {};
  let capturedCtx: StudyJobContext | null = null;
  let pendingRun: Promise<void>;
  act(() => {
    pendingRun = hook.result.current.run(ctx => {
      capturedCtx = ctx;
      ctx.setProgress(1, 'Working on part 1');
      return new Promise<string>(resolve => {
        resolveLate = resolve;
      });
    });
  });
  expect(hook.result.current.busy).toBe(true);
  expect(hook.result.current.statusText).toBe('Working on part 1');
  expect(typeof hook.result.current.startedAt).toBe('number');
  expect(capturedCtx!.aborted).toBe(false);
  expect(capturedCtx!.signal.aborted).toBe(false);
  expect(capturedCtx!.isCancelled()).toBe(false);

  act(() => hook.result.current.cancel());
  expect(hook.result.current.busy).toBe(false);
  expect(capturedCtx!.aborted).toBe(true);
  expect(capturedCtx!.signal.aborted).toBe(true);
  expect(capturedCtx!.isCancelled()).toBe(true);

  await act(async () => {
    resolveLate('Should be ignored');
    await pendingRun;
  });
  expect(hook.result.current.result).toBeNull();
  expect(hook.result.current.busy).toBe(false);

  // Late rejection after cancel must not populate error
  let rejectLate: (err: Error) => void = () => {};
  let failingRun: Promise<void>;
  act(() => {
    failingRun = hook.result.current.run(
      () =>
        new Promise<string>((_resolve, reject) => {
          rejectLate = reject;
        }),
    );
  });
  act(() => hook.result.current.cancel());
  await act(async () => {
    rejectLate(new Error('Late failure'));
    await failingRun;
  });
  expect(hook.result.current.error).toBe('');

  await act(async () => {
    await hook.result.current.run(async () => {
      throw new Error('Reset check');
    });
  });
  expect(hook.result.current.error).toBe('Reset check');
  act(() => resetStudyJobsForTests());
  expect(hook.result.current.error).toBe('');
});
