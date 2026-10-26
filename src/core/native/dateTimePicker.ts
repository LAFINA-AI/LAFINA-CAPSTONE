import {NativeModules} from 'react-native';
import {assertDate} from '../domain/scheduleTime';

function module() {
  const picker = NativeModules.CapstoneDateTimePicker;
  if (!picker?.pickDate || !picker?.pickTime) {
    throw new Error(
      'Android picker is unavailable. Enter the date or time manually.',
    );
  }
  return picker as {
    pickDate(initial: string): Promise<unknown>;
    pickTime(initial: string, twentyFourHour: boolean): Promise<unknown>;
  };
}
function time(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new Error(
      'The time picker returned an invalid time. Enter HH:mm manually.',
    );
  }
}
/** Pick wall-clock components only; scheduleTime owns timezone/DST resolution. */
export const dateTimePicker = {
  async pickDate(initial: string): Promise<string | null> {
    assertDate(initial);
    const result = await module().pickDate(initial);
    if (result === null) return null;
    if (typeof result !== 'string')
      throw new Error('Invalid date picker response.');
    assertDate(result);
    return result;
  },
  async pickTime(
    initial: string,
    twentyFourHour: boolean,
  ): Promise<string | null> {
    time(initial);
    const result = await module().pickTime(initial, twentyFourHour);
    if (result === null) return null;
    time(result);
    return result;
  },
};
