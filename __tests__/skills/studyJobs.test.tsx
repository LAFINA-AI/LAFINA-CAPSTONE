import {act, renderHook} from '@testing-library/react-native';
import {useStudyJob} from '../../src/skills/studyJobs';

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
