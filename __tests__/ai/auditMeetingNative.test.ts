import {NativeModules, Platform} from 'react-native';
import {meetingRecorder} from '../../src/ai/native/meetingRecorder';

test('a stale meeting stop remains scoped to its original capture and keeps a newer mic claim', async () => {
  const platform = Object.getOwnPropertyDescriptor(Platform, 'OS')!;
  Object.defineProperty(Platform, 'OS', {configurable: true, value: 'android'});
  const native = NativeModules.LafinaMeetingRecorder;
  const previous = native.stopRecordingForMeeting;
  native.stopRecordingForMeeting = jest.fn(async (meetingId: string) => ({
    meetingId,
    chunkFiles: [],
    chunkDurationsMs: [],
  }));
  try {
    await meetingRecorder.start('audit-new-capture', 'Synthetic capture');
    await meetingRecorder.stop('audit-old-capture');
    expect(native.stopRecordingForMeeting).toHaveBeenCalledWith(
      'audit-old-capture',
    );
    expect(meetingRecorder.isRecordingClaimed()).toBe(true);
    native.stopRecordingForMeeting.mockRejectedValueOnce(
      new Error('stop not confirmed'),
    );
    await expect(meetingRecorder.stop('audit-new-capture')).rejects.toThrow(
      'stop not confirmed',
    );
    expect(meetingRecorder.isRecordingClaimed()).toBe(true);
    await meetingRecorder.stop('audit-new-capture');
    expect(meetingRecorder.isRecordingClaimed()).toBe(false);
  } finally {
    native.stopRecordingForMeeting = previous;
    Object.defineProperty(Platform, 'OS', platform);
  }
});
