/** Owner-scoped shutdown hook: reset waits for capture to stop before deleting files. */
const sessions = new Map<string, () => Promise<void>>();
export const hasMeetingSession = (owner: string): boolean =>
  sessions.has(owner);

export const registerMeetingSession = (
  owner: string,
  shutdown: () => Promise<void>,
): (() => void) => {
  sessions.set(owner, shutdown);
  return () => {
    if (sessions.get(owner) === shutdown) sessions.delete(owner);
  };
};

export const stopMeetingSession = async (owner: string): Promise<void> => {
  await sessions.get(owner)?.();
};
