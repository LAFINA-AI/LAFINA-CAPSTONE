import {localSettingsStore} from '../storage/localSettingsStore';
import {userStore} from '../storage/userStore';

export function readSkillState<T>(owner: string, key: string, fallback: T): T {
  const raw = localSettingsStore.get(owner, `skills.${key}.v1`);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
export function writeSkillState<T>(owner: string, key: string, value: T): void {
  if (userStore.getCurrentUser()?.id !== owner)
    throw new Error('This account is no longer active.');
  if (!localSettingsStore.set(owner, `skills.${key}.v1`, JSON.stringify(value)))
    throw new Error(
      'Could not save on this phone. Your changes are still on screen; please try again.',
    );
}
