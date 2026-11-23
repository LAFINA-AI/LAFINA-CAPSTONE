import { localSettingsStore } from '../../../storage/localSettingsStore';
import { DEVICE_SETTINGS_SCOPE } from '../../../storage/deviceScope';
import { parseMemory, type UpdateMemory } from '../../../updates/updatePrompt';

/** Device-wide: an update belongs to the phone, not to whoever is signed in. */
const KEY = 'app_updates.memory';

export const loadUpdateMemory = (): UpdateMemory =>
  parseMemory(localSettingsStore.get(DEVICE_SETTINGS_SCOPE, KEY));

export const saveUpdateMemory = (memory: UpdateMemory): boolean =>
  localSettingsStore.set(DEVICE_SETTINGS_SCOPE, KEY, JSON.stringify(memory));

type SheetListener = () => void;
const sheetListeners = new Set<SheetListener>();

/** Opens the update sheet (Profile > Check for updates). False if no screen can show it. */
export const requestUpdateSheet = (): boolean => {
  sheetListeners.forEach((listener) => listener());
  return sheetListeners.size > 0;
};

export const onUpdateSheetRequest = (listener: SheetListener): (() => void) => {
  sheetListeners.add(listener);
  return () => {
    sheetListeners.delete(listener);
  };
};
