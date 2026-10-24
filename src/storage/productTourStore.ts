import { localSettingsStore } from './localSettingsStore';

const KEY = 'product_tour';
const PENDING = 'pending';

export const PRODUCT_TOUR_VERSION = 1;

export const productTourStore = {
  queue: (userId: string): void => {
    if (!userId) return;
    if (localSettingsStore.get(userId, KEY) !== null) return;
    localSettingsStore.set(userId, KEY, PENDING);
  },

  isPending: (userId: string): boolean =>
    Boolean(userId) && localSettingsStore.get(userId, KEY) === PENDING,

  markSeen: (userId: string, completed: boolean): void => {
    if (!userId) return;
    localSettingsStore.set(
      userId,
      KEY,
      JSON.stringify({
        version: PRODUCT_TOUR_VERSION,
        completed,
        seenAt: new Date().toISOString(),
      }),
    );
  },
};
