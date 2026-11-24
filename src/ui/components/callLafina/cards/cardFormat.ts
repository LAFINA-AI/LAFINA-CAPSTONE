/** Short, friendly dates and times for call cards. */

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** "2026-11-25" → "Wed, Nov 25". Anything else is shown as it is. */
export const shortDate = (date: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return date;
  const value = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  return `${WEEKDAYS[value.getDay()]}, ${
    MONTHS[value.getMonth()]
  } ${value.getDate()}`;
};

/** "14:05" → "2:05 PM". Anything else is shown as it is. */
export const time12 = (time: string): string => {
  const match = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!match) return time;
  const hours = Number(match[1]);
  const suffix = hours >= 12 ? 'PM' : 'AM';
  return `${hours % 12 || 12}:${match[2]} ${suffix}`;
};
