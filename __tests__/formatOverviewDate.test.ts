import {formatOverviewDate} from '../src/core/ui/formatOverviewDate';

describe('Today date display fallback', () => {
  it('formats the selected timezone for a valid date', () => {
    expect(
      formatOverviewDate(new Date('2026-10-21T20:00:00.000Z'), 'Asia/Manila'),
    ).toEqual({text: 'Thursday, October 22, 2026', warning: null});
  });
  it('falls back to the UTC date without normalizing an unsupported timezone', () => {
    const result = formatOverviewDate(
      new Date('2026-10-21T20:00:00.000Z'),
      'Unsupported/Zone',
    );
    expect(result.text).toBe('2026-10-21 (UTC)');
    expect(result.warning).toMatch(/saved timezone/);
  });
  it('keeps an invalid device date recoverable', () => {
    expect(formatOverviewDate(new Date(NaN), 'Asia/Manila')).toEqual({
      text: 'Date unavailable',
      warning:
        'The current date is unavailable. Check the device clock in Android settings.',
    });
  });
});
