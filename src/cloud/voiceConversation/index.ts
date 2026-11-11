import {DeviceEventEmitter, NativeModules} from 'react-native';
import {
  directProviderTestEnabled,
  directTestVoiceApi,
} from '../directProviderTest';
import {GUEST_USER_ID} from '../../constants';
import {chatStore} from '../../storage/chatStore';
import {localSettingsStore} from '../../storage/localSettingsStore';
import {onlineVoiceSettingsStore} from '../../storage/onlineVoiceSettingsStore';
import {userStore} from '../../storage/userStore';
import {ensureMicrophonePermission} from '../../ai/stt/sttService';
import {handbookPreference} from '../../skills/onlineChatSkill';
import {accountLinkService} from '../accountLinkService';
import {cloudClient} from '../cloudClient';
import {isGuestAccount} from '../entitlements';
import {VoiceConversationController} from './controller';
import type {VoiceConversationDeps} from './controller';
import {nativeVoiceTransport} from './nativeTransport';
import {voiceConversationApi} from './voiceConversationApi';
import {buildStudentVoiceContext} from './localVoiceData';

export {
  VoiceConversationController,
  FAILURE_MESSAGES,
  DEFAULT_LIMITS,
} from './controller';
export {buildStudentVoiceContext} from './localVoiceData';
export type {VoiceConversationDeps, VoiceConversationGates} from './controller';
export {
  LAFINA_VOICE_SYSTEM_PROMPT,
  DEFAULT_VOICE_PREFERENCES,
  buildVoicePersonaPrompt,
  stripReasoningContent,
  sanitizeSpeechText,
  detectConversationalDirective,
  getToolWorkingPhrase,
} from './personaPolicy';
export type {
  VoicePersonaPreferences,
  ConversationalDirective,
} from './personaPolicy';
export type * from './types';

export const VOICE_CONSENT_KEY = 'voiceConversation.consent.v1';
export const ONLINE_MODE_KEY = 'chat.onlineMode';

/** Chat listens for this so its Online Mode switch stays in step. */
export const ONLINE_MODE_CHANGED_EVENT = 'LAFINA_ONLINE_MODE_CHANGED';

/**
 * Turns Online Mode on after an explicit tap, exactly as Chat's switch does:
 * the server must accept this account first. Nothing else is sent.
 */
export const enableOnlineMode = async (
  userId: string,
): Promise<{ok: true} | {ok: false; message: string}> => {
  if (!(await cloudClient.isOnline().catch(() => false))) {
    return {
      ok: false,
      message: 'Connect to Wi-Fi or mobile data to use Online Mode.',
    };
  }
  const auth = await accountLinkService
    .authorizeOnlineMode(userId)
    .catch(() => null);
  if (!auth || auth.status !== 'success') {
    return {
      ok: false,
      message: auth?.message || 'Could not enable Online Mode. Try again.',
    };
  }
  if (!localSettingsStore.set(userId, ONLINE_MODE_KEY, 'true')) {
    return {
      ok: false,
      message:
        'Could not save the Online Mode setting on this device. Try again.',
    };
  }
  DeviceEventEmitter.emit(ONLINE_MODE_CHANGED_EVENT, {userId, enabled: true});
  return {ok: true};
};

export const voiceConsent = {
  read: (userId: string): boolean =>
    localSettingsStore.get(userId, VOICE_CONSENT_KEY, null) === 'true',
  write: (userId: string): boolean =>
    localSettingsStore.set(userId, VOICE_CONSENT_KEY, 'true'),
};

const isSignedInOwner = (userId: string): boolean => {
  if (!userId || userId === GUEST_USER_ID) return false;
  try {
    return userStore.getActiveSessionToken().userId === userId;
  } catch {
    return false;
  }
};

/** A local test socket is only accepted by builds that point at a test server. */
const allowLocalTestServer = (): boolean => {
  const override = (
    NativeModules.CapstoneBuild as {apiBaseUrlOverride?: unknown} | undefined
  )?.apiBaseUrlOverride;
  return typeof override === 'string' && override.trim().length > 0;
};

/** Production dependencies for one account's conversation. */
export const defaultVoiceConversationDeps = (
  userId: string,
  extra: Pick<VoiceConversationDeps, 'onFinalUserText'> = {},
): VoiceConversationDeps => ({
  gates: {
    isGuest: () => isGuestAccount(userId),
    isSignedInOwner: () => isSignedInOwner(userId),
    isOnlineMode: () =>
      localSettingsStore.get(userId, ONLINE_MODE_KEY, null) === 'true',
    isOnline: () => cloudClient.isOnline(),
    hasConsent: () =>
      voiceConsent.read(userId) &&
      localSettingsStore.get(
        userId,
        'voiceConversation.directDataConsent.v1',
        null,
      ) === 'true',
    ensureMicPermission: () => ensureMicrophonePermission(),
  },
  getVoice: () => onlineVoiceSettingsStore.read(userId),
  useHandbook: () => handbookPreference.read(userId),
  getStudentContext: () => buildStudentVoiceContext(userId),
  api: directProviderTestEnabled() ? directTestVoiceApi : voiceConversationApi,
  transport: nativeVoiceTransport,
  allowLocalTestServer: allowLocalTestServer(),
  persistence: {
    // Saved to this account's Chat only while it is still the signed-in one.
    userTurn: text => {
      if (isSignedInOwner(userId)) chatStore.addMessage(userId, 'user', text);
    },
    assistantTurn: (text, heard) => {
      if (!isSignedInOwner(userId)) return;
      chatStore.addMessage(userId, 'assistant', text, null, {
        voiceInterrupted: heard === 'interrupted',
      });
    },
  },
  log: line => console.log(line),
  ...extra,
});

// One conversation app-wide, so a reminder call or sign-out can end it.
let active: VoiceConversationController | null = null;
let pendingRelease: Promise<void> = Promise.resolve();

export const registerVoiceConversation = (
  controller: VoiceConversationController,
): (() => void) => {
  if (active && active !== controller) active.end();
  active = controller;
  return () => {
    if (active === controller) active = null;
  };
};

/** Ends a running conversation for a system reason (call, sign-out). No restart. */
export const endActiveVoiceConversation = (reason: string): void => {
  const controller = active;
  if (!controller) return;
  controller.stopForSystem(reason);
  pendingRelease = Promise.all([pendingRelease, controller.endAndWait()]).then(
    () => undefined,
  );
};

/** Wait for a previously interrupted conversation to release native audio. */
export const waitForVoiceConversationRelease = (): Promise<void> =>
  pendingRelease;

export const isVoiceConversationActive = (): boolean =>
  active?.isActive() === true;

export const getActiveVoiceConversation =
  (): VoiceConversationController | null => active;
