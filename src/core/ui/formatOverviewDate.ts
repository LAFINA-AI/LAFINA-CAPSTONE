/** Display fallback only: never change persisted timezone or scheduling instants. */
export function formatOverviewDate(
  date: Date,
  timezone: string,
): {
  text: string;
  warning: string | null;
} {
  try {
    return {
      text: new Intl.DateTimeFormat('en', {
        dateStyle: 'full',
        timeZone: timezone,
      }).format(date),
      warning: null,
    };
  } catch {
    const validDate = Number.isFinite(date.getTime());
    return {
      text: validDate
        ? `${date.toISOString().slice(0, 10)} (UTC)`
        : 'Date unavailable',
      warning: validDate
        ? 'This device could not format the saved timezone. Showing the UTC date; check your timezone in Profile → Scheduling & Reminder Preferences.'
        : 'The current date is unavailable. Check the device clock in Android settings.',
    };
  }
}
