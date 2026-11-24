import React from 'react';
import {act, render} from '@testing-library/react-native';
import {
  MeetingsProvider,
  useMeetings,
} from '../../src/ui/contexts/MeetingsContext';
import {meetingRecorder} from '../../src/ai/native/meetingRecorder';
import {initDatabase, userStore, recordedMeetingStore} from '../../src/storage';
import {stopMeetingSession} from '../../src/ai/native/meetingSession';

let state: ReturnType<typeof useMeetings>;
const Probe = () => {
  state = useMeetings();
  return null;
};
const mount = () =>
  render(
    <MeetingsProvider userId="local_guest_user">
      <Probe />
    </MeetingsProvider>,
  );
beforeAll(async () => {
  await initDatabase();
  userStore.createGuestUser();
});
beforeEach(() => {
  userStore.setCurrentUser('local_guest_user');
  jest.spyOn(meetingRecorder, 'isAvailable').mockReturnValue(true);
  jest.spyOn(meetingRecorder, 'requestPermission').mockResolvedValue(true);
  jest.spyOn(meetingRecorder, 'getAvailableStorageMB').mockResolvedValue(1000);
  jest.spyOn(meetingRecorder, 'start').mockImplementation(async id => id);
  jest
    .spyOn(meetingRecorder, 'stop')
    .mockResolvedValue({meetingId: '', chunkFiles: [], chunkDurationsMs: []});
  jest.spyOn(meetingRecorder, 'cancelAudioImport').mockResolvedValue(true);
});
afterEach(() => jest.restoreAllMocks());

test('unmounting the signed-in provider stops its active capture', async () => {
  const screen = mount();
  await act(async () => {
    await state.startRecording({title: 'Audit capture'});
  });
  expect(state.recorder?.status).toBe('recording');
  await act(async () => {
    screen.unmount();
  });
  expect(meetingRecorder.stop).toHaveBeenCalled();
});

test('permission granted after sign-out never opens the microphone', async () => {
  let grant!: (value: boolean) => void;
  (meetingRecorder.requestPermission as jest.Mock).mockReturnValue(
    new Promise<boolean>(resolve => {
      grant = resolve;
    }),
  );
  const screen = mount();
  let pending!: Promise<void>;
  act(() => {
    pending = state.startRecording({});
  });
  screen.unmount();
  await act(async () => {
    grant(true);
    await pending;
  });
  expect(meetingRecorder.start).not.toHaveBeenCalled();
});

test('late recorder startup is stopped after sign-out', async () => {
  let started!: (id: string) => void;
  (meetingRecorder.start as jest.Mock).mockReturnValue(
    new Promise<string>(resolve => {
      started = resolve;
    }),
  );
  const screen = mount();
  let pending!: Promise<void>;
  await act(async () => {
    pending = state.startRecording({});
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(meetingRecorder.start).toHaveBeenCalled();
  screen.unmount();
  await act(async () => {
    started('audit-delayed');
    await pending;
  });
  expect(meetingRecorder.stop).toHaveBeenCalled();
});

test('data reset can await capture shutdown while the provider remains usable', async () => {
  const screen = mount();
  await act(async () => {
    await state.startRecording({});
  });
  await act(async () => {
    await stopMeetingSession('local_guest_user');
  });
  expect(meetingRecorder.stop).toHaveBeenCalled();
  expect(state.recorder).toBeNull();
  await act(async () => {
    await state.startRecording({});
  });
  expect(state.recorder?.status).toBe('recording');
  await act(async () => screen.unmount());
});

test('failed audio deletion keeps the database reference and reports failure', async () => {
  recordedMeetingStore.create({
    id: 'audit-delete-failure',
    userId: 'local_guest_user',
    title: 'Keep on failure',
  });
  recordedMeetingStore.update('audit-delete-failure', {
    audioBytes: 1234,
    status: 'completed',
  });
  jest.spyOn(meetingRecorder, 'deleteMeetingAudio').mockResolvedValue(false);
  const screen = mount();
  await act(async () => {
    await expect(state.deleteAudio('audit-delete-failure')).rejects.toThrow(
      /could not be deleted/,
    );
  });
  expect(recordedMeetingStore.get('audit-delete-failure')?.audioBytes).toBe(
    1234,
  );
  await act(async () => screen.unmount());
});
