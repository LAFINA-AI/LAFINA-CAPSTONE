import {
  defaultPreferences,
  decodePreferences,
  validatePreferences,
} from '../src/core/domain/preferences';

describe('local preference validation', () => {
  it('has anonymous text-only defaults and uses a safe invalid-timezone fallback', () => {
    const initial = defaultPreferences('invalid/timezone');
    expect(initial).toMatchObject({
      nickname: '',
      timezone: 'UTC',
      replyMode: 'text',
      onboardingCompletedAt: null,
    });
    expect(validatePreferences(initial)).toBeNull();
  });
  it.each([
    {timezone: 'not-a-timezone'},
    {leadMinutes: -1},
    {leadMinutes: 1.5},
    {leadMinutes: 121},
    {snoozeMinutes: 0},
    {snoozeMinutes: 121},
    {nickname: 'a'.repeat(41)},
    {quietStart: '25:00'},
    {quietHoursEnabled: true, quietStart: '07:00', quietEnd: '07:00'},
  ])('rejects invalid values %p', change => {
    expect(
      validatePreferences({...defaultPreferences('Asia/Manila'), ...change}),
    ).not.toBeNull();
  });
  it('round-trips legitimate settings and rejects unsupported or corrupt persisted data', () => {
    const preferences = {
      ...defaultPreferences('Asia/Manila'),
      nickname: "O'Neil",
      quietHoursEnabled: true,
    };
    expect(decodePreferences(JSON.stringify(preferences))).toEqual(preferences);
    expect(() => decodePreferences('{')).toThrow();
    expect(() =>
      decodePreferences(JSON.stringify({...preferences, schemaVersion: 2})),
    ).toThrow();
    expect(() =>
      decodePreferences(JSON.stringify({...preferences, replyMode: 'cloud'})),
    ).toThrow();
    expect(() =>
      decodePreferences(
        JSON.stringify({...preferences, onboardingCompletedAt: 'yesterday'}),
      ),
    ).toThrow();
  });
  it('loads older snapshots with preserved calendar defaults and rejects malformed display options', () => {
    const legacy = {...defaultPreferences('Asia/Manila')} as Record<
      string,
      unknown
    >;
    delete legacy.clockFormat;
    delete legacy.weekStartsMonday;
    expect(decodePreferences(JSON.stringify(legacy))).toMatchObject({
      clockFormat: '24h',
      weekStartsMonday: true,
    });
    expect(() =>
      decodePreferences(JSON.stringify({...legacy, clockFormat: 'cloud'})),
    ).toThrow();
    expect(() =>
      decodePreferences(JSON.stringify({...legacy, weekStartsMonday: 'yes'})),
    ).toThrow();
    expect(
      decodePreferences(
        JSON.stringify({
          ...legacy,
          clockFormat: '12h',
          weekStartsMonday: false,
        }),
      ),
    ).toMatchObject({clockFormat: '12h', weekStartsMonday: false});
  });
});
