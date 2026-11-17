/**
 * Floating LAFINA (ADR-036): the active account's own choice decides whether
 * the orb runs. Called by `App.tsx` whenever the signed-in student changes,
 * so one student's orb, Quick Chat transcript or "view item" request never
 * carries over to another account on the same phone.
 */
import {quickChatController} from '../../ai/quickChat/quickChatController';
import {floatingAssistantNative} from '../../utils/floatingAssistantNative';
import {floatingAssistantSetting} from '../components/profile/FloatingAssistantSettings';
import {quickChatPresence} from './quickChatPresence';

export const applyFloatingAssistantForUser = async (
  userId: string | null,
): Promise<void> => {
  quickChatController.retainOnly(userId);
  // A pending request for any other owner is dropped, never shown.
  if (quickChatPresence.hasPendingNavigation()) {
    const target = quickChatPresence.consumeNavigation(userId);
    if (target) quickChatPresence.requestNavigation(target);
  }
  const enabled = userId ? floatingAssistantSetting.isEnabled(userId) : false;
  await floatingAssistantNative.setEnabled(enabled, userId);
};
