import {AppState, DeviceEventEmitter, NativeModules} from 'react-native';
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
import {isUstpSchoolEnabled} from '../../storage/ustpEligibility';

export {
  VoiceConversationController,
  FAILURE_MESSAGES,
  DEFAULT_LIMITS,
  reminderCallContext,
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

/**
 * v2 (2026-11-14): the disclosure now says a 7-day summary, notes and saved
 * memories are shared when a call starts. Raising the version makes students
 * who agreed to the older wording see and accept the new text once.
 */
export const VOICE_CONSENT_KEY = 'voiceConversation.consent.v2';
/** Reminder-call disclosure; raised with VOICE_CONSENT_KEY for the same reason. */
export const REMINDER_CALL_CONSENT_KEY = 'voiceConversation.reminderConsent.v2';
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
    isForeground: () => AppState.currentState === 'active',
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
  // Server-side handbook search only with a confirmed USTP COR setup.
  useHandbook: () =>
    handbookPreference.read(userId) && isUstpSchoolEnabled(userId),
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
const voiceOwners = new Set<() => void>();
const notifyVoiceOwner = (): void =>
  voiceOwners.forEach(listener => listener());
export const subscribeVoiceConversation = (
  listener: () => void,
): (() => void) => {
  voiceOwners.add(listener);
  return () => {
    voiceOwners.delete(listener);
  };
};
let acquisition = 0;

/** Every explicit start reacquires ownership, including a retained panel restart. */
export const startVoiceConversation = async (
  controller: VoiceConversationController,
): Promise<void> => {
  const token = ++acquisition;
  if (active && active !== controller) {
    if (!(await active.endAndWait())) return;
  }
  await pendingRelease;
  if (token !== acquisition) return;
  active = controller;
  notifyVoiceOwner();
  await controller.start();
  notifyVoiceOwner();
};

export const registerVoiceConversation = (
  controller: VoiceConversationController,
): (() => void) => {
  // Mounting an idle reminder panel must not displace a retained live panel.
  const update = () => {
    if (controller.isActive() && active !== controller) {
      if (active?.isActive())
        active.stopForSystem('Another conversation started.');
      active = controller;
    }
    notifyVoiceOwner();
  };
  const unsubscribe = controller.subscribe?.(update) ?? (() => undefined);
  update();
  return () => {
    unsubscribe();
    if (active === controller) {
      active = null;
      notifyVoiceOwner();
    }
  };
};

/** Ends a running conversation for a system reason (call, sign-out). No restart. */
export const endActiveVoiceConversation = (reason: string): void => {
  acquisition += 1;
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
