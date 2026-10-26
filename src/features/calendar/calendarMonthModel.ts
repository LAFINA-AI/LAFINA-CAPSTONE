const monthNames = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

function monthLength(year: number, month: number): number {
  if (month === 2)
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function dateParts(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error('Choose a real calendar date.');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (
    year < 1 ||
    year > 9999 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > monthLength(year, month)
  )
    throw new Error('Choose a real calendar date.');
  return {year, month, day};
}

/** Date-only values never pass through the device's timezone. Monday starts the grid. */
export function calendarMonth(date: string): {
  title: string;
  cells: Array<string | null>;
} {
  const {year, month} = dateParts(date);
  // setUTCFullYear avoids JavaScript's special interpretation of years 00–99.
  const first = new Date(0);
  first.setUTCFullYear(year, month - 1, 1);
  const offset = (first.getUTCDay() + 6) % 7;
  const days = monthLength(year, month);
  const prefix = `${String(year).padStart(4, '0')}-${String(month).padStart(
    2,
    '0',
  )}`;
  return {
    title: `${monthNames[month - 1]} ${year}`,
    cells: Array.from({length: Math.ceil((offset + days) / 7) * 7}, (_, i) => {
      const day = i - offset + 1;
      return day < 1 || day > days
        ? null
        : `${prefix}-${String(day).padStart(2, '0')}`;
    }),
  };
}

/** Retains the selected day when possible, clamping to the destination month. */
export function shiftCalendarMonth(date: string, direction: -1 | 1): string {
  const current = dateParts(date);
  const index = (current.year - 1) * 12 + current.month - 1 + direction;
  if (index < 0 || index >= 9999 * 12)
    throw new Error('Calendar months must stay between years 1 and 9999.');
  const year = Math.floor(index / 12) + 1;
  const month = (index % 12) + 1;
  const day = Math.min(current.day, monthLength(year, month));
  return `${String(year).padStart(4, '0')}-${String(month).padStart(
    2,
    '0',
  )}-${String(day).padStart(2, '0')}`;
}
