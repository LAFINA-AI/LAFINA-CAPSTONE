import {NativeModules} from 'react-native';
import {dateTimePicker} from '../src/core/native/dateTimePicker';

afterEach(() => {
  delete NativeModules.CapstoneDateTimePicker;
});
it('keeps cancellation separate from a chosen value and passes clock format explicitly', async () => {
  const pickTime = jest.fn(async () => '13:05');
  NativeModules.CapstoneDateTimePicker = {
    pickDate: jest.fn(async () => null),
    pickTime,
  };
  expect(await dateTimePicker.pickDate('2026-10-23')).toBeNull();
  expect(await dateTimePicker.pickTime('09:00', false)).toBe('13:05');
  expect(pickTime).toHaveBeenCalledWith('09:00', false);
});
it('rejects unavailable native picker and invalid runtime values without inventing a selection', async () => {
  await expect(dateTimePicker.pickDate('2026-10-23')).rejects.toThrow(
    'unavailable',
  );
  const pickDate = jest.fn(async () => '2026-02-31');
  NativeModules.CapstoneDateTimePicker = {
    pickDate,
    pickTime: jest.fn(async () => '24:00'),
  };
  await expect(dateTimePicker.pickDate('2026-10-23')).rejects.toThrow();
  await expect(dateTimePicker.pickTime('09:00', true)).rejects.toThrow(
    'invalid time',
  );
  pickDate.mockClear();
  await expect(dateTimePicker.pickDate('2026-02-31')).rejects.toThrow();
  expect(pickDate).not.toHaveBeenCalled();
});
