import {
  clockText,
  localToday,
  plannerDateWarning,
  shiftDate,
  weekDates,
} from '../src/features/calendar/plannerDisplay';

it.each([
  ['1999-12-31T00:00:00Z', 'UTC'],
  ['2101-01-01T00:00:00Z', 'UTC'],
  ['2000-01-01T00:00:00Z', 'America/Los_Angeles'],
  ['2100-12-31T23:59:59Z', 'Asia/Manila'],
  ['invalid', 'UTC'],
])(
  'keeps an unsupported device/local date %s renderable with a visible warning',
  (value, zone) => {
    const date = new Date(value);
    const safe = localToday(date, zone);
    expect(safe >= '2000-01-01' && safe <= '2100-12-31').toBe(true);
    expect(() => weekDates(safe)).not.toThrow();
    expect(plannerDateWarning(date, zone)).toMatch(/fallback view/);
  },
);
it('keeps weekday navigation date-based across DST and validates calendar boundaries', () => {
  expect(weekDates('2026-03-08')).toEqual([
    '2026-03-02',
    '2026-03-03',
    '2026-03-04',
    '2026-03-05',
    '2026-03-06',
    '2026-03-07',
    '2026-03-08',
  ]);
  expect(shiftDate('2026-03-08', 1)).toBe('2026-03-09');
  expect(() => shiftDate('2000-01-01', -1)).toThrow();
  expect(() => shiftDate('2100-12-31', 1)).toThrow();
  expect(weekDates('2000-01-01')).toEqual(['2000-01-01', '2000-01-02']);
  expect(clockText('00:05', '12h')).toBe('12:05 AM');
  expect(clockText('12:00', '12h')).toBe('12:00 PM');
  expect(clockText('13:05', '12h')).toBe('1:05 PM');
});
