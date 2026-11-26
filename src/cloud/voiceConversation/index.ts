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
import type {VoiceConversationDeps} from './controller';
import type {ConversationController} from './types';
import {nativeVoiceTransport} from './nativeTransport';
import {voiceConversationApi} from './voiceConversationApi';
import {buildStudentVoiceContext} from './localVoiceData';
import {buildChatRecap} from './callRecap';
import {isUstpSchoolEnabled} from '../../storage/ustpEligibility';
import {chatMemoryStore} from '../../storage/chatMemoryStore';
import {chatMemoryService} from '../chatMemoryService';
import {explicitMemory} from '../../ai/explicitMemory';
import {isForgetAllMemoriesRequest} from '../../ai/chatMemoryCommands';
import {callGreetingFor} from '../../ai/callGreetings';
import {localHandbookService} from '../../handbook';
import {
  clearCallUstpSources,
  consumeCallUstpCitation,
} from '../../ai/voiceActions/callUstpCitations';

export {
  VoiceConversationController,
  FAILURE_MESSAGES,
  DEFAULT_LIMITS,
  NETWORK_DROP_REASON,
  RECONNECT_FAILED_REASON,
  classifyDrop,
  reminderCallContext,
} from './controller';
export {buildStudentVoiceContext} from './localVoiceData';
export {buildChatRecap, callRecapTurns} from './callRecap';
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
 * memories are shared when a call starts. v3 (2026-11-26, ADR-046): and the
 * last few messages of the chat the call writes into, so LAFINA remembers
 * what was said. Raising the version makes students who agreed to the older
 * wording see and accept the new text once.
 */
export const VOICE_CONSENT_KEY = 'voiceConversation.consent.v3';
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

/** The data-sharing consent the online call checks (same key as actionSecurity.DATA_CONSENT_KEY, which imports this module). */
export const DIRECT_DATA_CONSENT_KEY = 'voiceConversation.directDataConsent.v1';

/**
 * The student agreed to the online Call Lafina disclosure (voice streamed,
 * a short 7-day summary, notes and memories shared). A reminder call uses
 * the same agreement: it never asks again mid-ring. Without it, the
 * reminder call is simply offline.
 */
export const hasOnlineCallConsent = (userId: string): boolean =>
  voiceConsent.read(userId) &&
  localSettingsStore.get(userId, DIRECT_DATA_CONSENT_KEY, null) === 'true';

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

const createVoicePersistence = (userId: string) => {
  let lastUserTurn: {text: string; revision: string} | null = null;
  return {
    // Saved to this account's general Chat only while it is still the signed-in one.
    userTurn: (text: string) => {
      if (!isSignedInOwner(userId)) return;
      clearCallUstpSources(userId);
      lastUserTurn = {
        text,
        revision: chatMemoryStore.revision(userId),
      };
      chatStore.addGeneralMessage(userId, 'user', text);
    },
    assistantTurn: (text: string, heard: 'complete' | 'interrupted') => {
      if (!isSignedInOwner(userId)) return;
      const citation = consumeCallUstpCitation(userId, text);
      const saved = chatStore.addGeneralMessage(userId, 'assistant', text, {
        voiceInterrupted: heard === 'interrupted',
        ...(citation ? citation : {}),
      });
      const captured = lastUserTurn;
      lastUserTurn = null;
      if (
        saved &&
        heard === 'complete' &&
        captured &&
        captured.text.trim().length >= 8 &&
        text.trim().length >= 4 &&
        !directProviderTestEnabled() &&
        (!explicitMemory(captured.text) ||
          isForgetAllMemoriesRequest(captured.text)) &&
        (isForgetAllMemoriesRequest(captured.text) ||
          (chatMemoryService.isActive(userId) &&
            Boolean(cloudClient.getAccessToken())))
      ) {
        void chatMemoryService.afterExchange({
          userId,
          sessionId: saved.sessionId,
          assistantMessageId: saved.id,
          userText: captured.text,
          replyText: text,
          memoryRevision: captured.revision,
        });
      }
    },
  };
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
    // Matches callMode.ts: only an explicit Offline Mode ('false') blocks online calls.
    isOnlineMode: () =>
      localSettingsStore.get(userId, ONLINE_MODE_KEY, null) !== 'false',
    isOnline: () => cloudClient.isOnline(),
    hasConsent: () => hasOnlineCallConsent(userId),
    ensureMicPermission: () => ensureMicrophonePermission(),
  },
  getVoice: () => onlineVoiceSettingsStore.read(userId),
  // Server-side handbook search only with a confirmed USTP COR setup.
  useHandbook: () =>
    handbookPreference.read(userId) && isUstpSchoolEnabled(userId),
  hasLocalHandbook: () => localHandbookService.isPopulated(),
  // The chat's recent conversation first: the context is cut from the end.
  getStudentContext: () =>
    [buildChatRecap(userId), buildStudentVoiceContext(userId)]
      .filter(Boolean)
      .join('\n\n'),
  // ADR-046: a network or server drop reconnects the same call.
  autoReconnect: true,
  getOpeningLine: () => callGreetingFor(userId, 'online'),
  api: directProviderTestEnabled() ? directTestVoiceApi : voiceConversationApi,
  transport: nativeVoiceTransport,
  allowLocalTestServer: allowLocalTestServer(),
  persistence: createVoicePersistence(userId),
  log: line => console.log(line),
  ...extra,
});

// One conversation app-wide, so a reminder call or sign-out can end it.
let active: ConversationController | null = null;
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
  controller: ConversationController,
): Promise<void> => {
  const token = ++acquisition;
  if (active && active !== controller) {
    await active.endAndWait().catch(() => false);
  }
  await pendingRelease;
  if (token !== acquisition) return;
  active = controller;
  notifyVoiceOwner();
  await controller.start();
  notifyVoiceOwner();
};

/** Continue call: like a start, but the call keeps its memory (ADR-046). */
export const resumeVoiceConversation = async (
  controller: ConversationController,
): Promise<void> => {
  const token = ++acquisition;
  if (active && active !== controller) {
    await active.endAndWait().catch(() => false);
  }
  await pendingRelease;
  if (token !== acquisition) return;
  active = controller;
  notifyVoiceOwner();
  await (controller.resume ? controller.resume() : controller.start());
  notifyVoiceOwner();
};

export const registerVoiceConversation = (
  controller: ConversationController,
): (() => void) => {
  // Mounting an idle reminder panel must not displace a retained live panel.
  const update = () => {
    if (controller.isActive() && active !== controller) {
      if (active?.isActive()) {
        const displaced = active;
        displaced.stopForSystem('Another conversation started.');
        pendingRelease = Promise.all([
          pendingRelease,
          displaced.endAndWait().catch(() => false),
        ]).then(() => undefined);
      }
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
  pendingRelease = Promise.all([
    pendingRelease,
    controller.endAndWait().catch(() => false),
  ]).then(() => undefined);
};

/** Wait for a previously interrupted conversation to release native audio. */
export const waitForVoiceConversationRelease = (): Promise<void> =>
  pendingRelease;

export const isVoiceConversationActive = (): boolean =>
  active?.isActive() === true;

export const getActiveVoiceConversation = (): ConversationController | null =>
  active;
