import {
  assertDate,
  assertTimezone,
  assertUtc,
  evaluateReminderTime,
  expandWeekly,
  localDateTime,
  localToUtc,
} from '../src/core/domain/scheduleTime';

describe('strict calendar and UTC validation', () => {
  it('accepts leap dates and supported UTC boundaries', () => {
    expect(() => assertDate('2000-02-29')).not.toThrow();
    expect(() => assertDate('2024-02-29')).not.toThrow();
    expect(() => assertUtc('2000-01-01T00:00:00.000Z')).not.toThrow();
    expect(() => assertUtc('2100-12-31T23:59:59.999Z')).not.toThrow();
  });

  it.each([
    '2023-02-29',
    '2100-02-29',
    '2026-04-31',
    '2026-13-01',
    '1999-12-31',
    '2101-01-01',
    '2026-1-01',
    '2026-01-01 ',
  ])('rejects invalid calendar date %s without normalizing', date => {
    expect(() => assertDate(date)).toThrow();
  });

  it.each([
    '2026-01-01T00:00:00Z',
    '2026-01-01T00:00:00.000+00:00',
    '2026-01-01T24:00:00.000Z',
    '2026-01-01T00:00:60.000Z',
    '2026-02-30T00:00:00.000Z',
    '2026-01-01t00:00:00.000z',
    '2026-01-01',
  ])('rejects noncanonical or impossible UTC value %s', utc => {
    expect(() => assertUtc(utc)).toThrow();
  });

  it('checks actual timezone support including existing GMT preferences', () => {
    expect(() => assertTimezone('GMT')).not.toThrow();
    expect(() => assertTimezone('Asia/Manila')).not.toThrow();
    expect(() => assertTimezone('Invalid/Timezone')).toThrow();
    expect(() => assertTimezone(' Asia/Manila')).toThrow();
    expect(() => assertTimezone('')).toThrow();
  });
});

describe('wall-clock time conversion', () => {
  it('handles UTC date boundaries and fractional timezone offsets', () => {
    expect(localToUtc('2026-01-01', '00:15', 'Asia/Manila')).toBe(
      '2025-12-31T16:15:00.000Z',
    );
    expect(localToUtc('2026-01-01', '09:00', 'Asia/Kathmandu')).toBe(
      '2026-01-01T03:15:00.000Z',
    );
    expect(
      localDateTime('2026-01-01T00:00:59.999Z', 'America/Los_Angeles'),
    ).toEqual({
      date: '2025-12-31',
      time: '16:00',
    });
  });

  it('rejects a DST gap and an entire skipped calendar date', () => {
    expect(() => localToUtc('2026-03-08', '02:30', 'America/New_York')).toThrow(
      'does not exist',
    );
    expect(() => localToUtc('2011-12-30', '12:00', 'Pacific/Apia')).toThrow(
      'does not exist',
    );
  });

  it('requires an explicit DST fold choice and returns both distinct instants', () => {
    expect(() => localToUtc('2026-11-01', '01:30', 'America/New_York')).toThrow(
      'occurs twice',
    );
    expect(
      localToUtc('2026-11-01', '01:30', 'America/New_York', 'earlier'),
    ).toBe('2026-11-01T05:30:00.000Z');
    expect(localToUtc('2026-11-01', '01:30', 'America/New_York', 'later')).toBe(
      '2026-11-01T06:30:00.000Z',
    );
  });

  it('also resolves a half-hour DST fold', () => {
    expect(
      localToUtc('2026-04-05', '01:45', 'Australia/Lord_Howe', 'earlier'),
    ).toBe('2026-04-04T14:45:00.000Z');
    expect(
      localToUtc('2026-04-05', '01:45', 'Australia/Lord_Howe', 'later'),
    ).toBe('2026-04-04T15:15:00.000Z');
  });

  it.each(['24:00', '12:60', '9:00', '12:00:00', ' 12:00'])(
    'rejects invalid wall-clock time %s',
    time => expect(() => localToUtc('2026-01-01', time, 'UTC')).toThrow(),
  );
});

describe('bounded weekly recurrence', () => {
  const series = {
    startDate: '2026-03-01',
    time: '09:00',
    timezone: 'America/New_York',
    rule: {weekdays: [0], untilDate: '2026-03-22'},
    fromUtc: '2026-03-01T00:00:00.000Z',
    toUtc: '2026-03-23T00:00:00.000Z',
  };

  it('keeps wall-clock time anchored to the selected zone across DST', () => {
    expect(expandWeekly(series)).toEqual([
      '2026-03-01T14:00:00.000Z',
      '2026-03-08T13:00:00.000Z',
      '2026-03-15T13:00:00.000Z',
      '2026-03-22T13:00:00.000Z',
    ]);
    // Travel changes display only; occurrence calculation has no device zone.
    const first = expandWeekly(series)[0];
    expect(localDateTime(first!, 'Asia/Manila')).toEqual({
      date: '2026-03-01',
      time: '22:00',
    });
  });

  it('uses an inclusive start/exclusive end query and stable series anchor', () => {
    expect(
      expandWeekly({
        ...series,
        fromUtc: '2026-03-08T13:00:00.000Z',
        toUtc: '2026-03-22T13:00:00.000Z',
      }),
    ).toEqual(['2026-03-08T13:00:00.000Z', '2026-03-15T13:00:00.000Z']);
  });

  it('handles leap/month boundaries and the full 366-date horizon', () => {
    expect(
      expandWeekly({
        startDate: '2024-02-28',
        time: '00:00',
        timezone: 'UTC',
        rule: {weekdays: [3, 4, 5], untilDate: '2024-03-01'},
        fromUtc: '2024-02-28T00:00:00.000Z',
        toUtc: '2024-03-02T00:00:00.000Z',
      }),
    ).toEqual([
      '2024-02-28T00:00:00.000Z',
      '2024-02-29T00:00:00.000Z',
      '2024-03-01T00:00:00.000Z',
    ]);
    expect(
      expandWeekly({
        ...series,
        startDate: '2024-01-01',
        timezone: 'UTC',
        rule: {weekdays: [1], untilDate: '2024-12-31'},
        fromUtc: '2024-01-01T00:00:00.000Z',
        toUtc: '2025-01-01T00:00:00.000Z',
      }),
    ).toHaveLength(53);
  });

  it('rejects unbounded/reversed series, invalid weekdays and query intervals', () => {
    expect(() =>
      expandWeekly({...series, rule: {weekdays: [0], untilDate: '2027-03-02'}}),
    ).toThrow('366');
    expect(() =>
      expandWeekly({...series, rule: {weekdays: [0], untilDate: '2026-02-28'}}),
    ).toThrow('366');
    for (const weekdays of [[], [0, 0], [7], [-1], [1.5]]) {
      expect(() =>
        expandWeekly({...series, rule: {...series.rule, weekdays}}),
      ).toThrow();
    }
    expect(() => expandWeekly({...series, toUtc: series.fromUtc})).toThrow(
      'positive',
    );
  });

  it('rejects DST gaps rather than silently shifting a class occurrence', () => {
    expect(() => expandWeekly({...series, time: '02:30'})).toThrow(
      'does not exist',
    );
  });
});

describe('quiet hours and missed reminder policy', () => {
  const runAt = '2026-10-21T14:00:00.000Z'; // 22:00 in Manila
  const quiet = {start: '22:00', end: '07:00'};

  it('defers at the inclusive quiet start across midnight', () => {
    expect(evaluateReminderTime(runAt, runAt, 'Asia/Manila', quiet)).toEqual({
      kind: 'quiet',
      nextAtUtc: '2026-10-21T23:00:00.000Z',
    });
    const early = '2026-10-21T22:59:00.000Z';
    expect(evaluateReminderTime(early, early, 'Asia/Manila', quiet)).toEqual({
      kind: 'quiet',
      nextAtUtc: '2026-10-21T23:00:00.000Z',
    });
    const end = '2026-10-21T23:00:00.000Z';
    expect(evaluateReminderTime(end, end, 'Asia/Manila', quiet)).toEqual({
      kind: 'ready',
    });
  });

  it('handles same-day quiet windows and chooses the later fold at their end', () => {
    const noon = '2026-10-21T04:30:00.000Z';
    expect(
      evaluateReminderTime(noon, noon, 'Asia/Manila', {
        start: '12:00',
        end: '13:00',
      }),
    ).toEqual({kind: 'quiet', nextAtUtc: '2026-10-21T05:00:00.000Z'});
    const fold = '2026-11-01T05:00:00.000Z';
    expect(
      evaluateReminderTime(fold, fold, 'America/New_York', {
        start: '00:00',
        end: '01:30',
      }),
    ).toEqual({kind: 'quiet', nextAtUtc: '2026-11-01T06:30:00.000Z'});
    const afterFirstEnd = '2026-11-01T05:45:00.000Z';
    expect(
      evaluateReminderTime(afterFirstEnd, afterFirstEnd, 'America/New_York', {
        start: '00:00',
        end: '01:30',
      }),
    ).toEqual({kind: 'quiet', nextAtUtc: '2026-11-01T06:30:00.000Z'});
    const afterLaterEnd = '2026-11-01T06:30:00.000Z';
    expect(
      evaluateReminderTime(afterLaterEnd, afterLaterEnd, 'America/New_York', {
        start: '00:00',
        end: '01:30',
      }),
    ).toEqual({kind: 'ready'});
  });

  it('classifies future and overdue instants with an inclusive grace boundary', () => {
    expect(
      evaluateReminderTime(
        runAt,
        '2026-10-21T13:59:59.999Z',
        'Asia/Manila',
        quiet,
      ),
    ).toEqual({kind: 'future', nextAtUtc: runAt});
    expect(
      evaluateReminderTime(
        runAt,
        '2026-10-21T14:15:00.000Z',
        'Asia/Manila',
        null,
      ),
    ).toEqual({kind: 'ready'});
    expect(
      evaluateReminderTime(
        runAt,
        '2026-10-21T14:15:00.001Z',
        'Asia/Manila',
        quiet,
      ),
    ).toEqual({kind: 'missed'});
  });

  it('rejects invalid quiet windows, grace and a nonexistent quiet end', () => {
    expect(() =>
      evaluateReminderTime(runAt, runAt, 'UTC', {start: '07:00', end: '07:00'}),
    ).toThrow('different');
    expect(() => evaluateReminderTime(runAt, runAt, 'UTC', null, -1)).toThrow();
    expect(() =>
      evaluateReminderTime(runAt, runAt, 'UTC', null, 1.5),
    ).toThrow();
    const gap = '2026-03-08T06:45:00.000Z';
    expect(() =>
      evaluateReminderTime(gap, gap, 'America/New_York', {
        start: '01:00',
        end: '02:30',
      }),
    ).toThrow('does not exist');
  });
});
