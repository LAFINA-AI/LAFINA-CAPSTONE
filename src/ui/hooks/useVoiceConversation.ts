import {useEffect, useRef, useState} from 'react';
import {AppState} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import {
  VoiceConversationController,
  defaultVoiceConversationDeps,
  registerVoiceConversation,
} from '../../cloud/voiceConversation';
import type {
  ConversationSnapshot,
  VoiceConversationDeps,
} from '../../cloud/voiceConversation';

/** How often a running conversation re-checks Online Mode and the signed-in account. */
const GATE_CHECK_MS = 3000;

const IDLE: ConversationSnapshot = {
  phase: 'idle',
  muted: false,
  micCapturing: false,
  level: 0,
  turns: [],
  notice: null,
  failure: null,
  restartReason: null,
  voiceName: null,
  endsAt: null,
  lastTiming: null,
};

export interface VoiceConversationHandle {
  snapshot: ConversationSnapshot;
  start: () => void;
  end: () => void;
  endAndWait: () => Promise<void>;
  setMuted: (muted: boolean) => void;
  stopResponse: () => void;
  sendText: (text: string) => Promise<boolean>;
  sendReminderContext: (task: string) => Promise<boolean>;
}

/**
 * One controller per account, alive while the panel is mounted. Unmounting,
 * switching account, leaving the app, losing the internet, or Online Mode or
 * the sign-in ending all stop the conversation and release the microphone;
 * none of them start it again.
 */
export const useVoiceConversation = (
  userId: string,
  options: {
    onFinalUserText?: (text: string) => void;
    /** Tests inject fakes here. */
    deps?: (userId: string) => VoiceConversationDeps;
  } = {},
): VoiceConversationHandle => {
  const [snapshot, setSnapshot] = useState<ConversationSnapshot>(IDLE);
  const controllerRef = useRef<VoiceConversationController | null>(null);
  const finalTextRef = useRef(options.onFinalUserText);
  finalTextRef.current = options.onFinalUserText;
  const depsFactory = useRef(options.deps ?? defaultVoiceConversationDeps);

  useEffect(() => {
    const deps = depsFactory.current(userId);
    const controller = new VoiceConversationController({
      ...deps,
      onFinalUserText: text => finalTextRef.current?.(text),
    });
    controllerRef.current = controller;
    setSnapshot(controller.getSnapshot());
    const unsubscribe = controller.subscribe(setSnapshot);
    const unregister = registerVoiceConversation(controller);

    const app = AppState.addEventListener('change', state => {
      if (state !== 'active' && controller.isActive()) {
        controller.stopForSystem(
          'The conversation stopped when LAFINA left the screen. Nothing listens in the background.',
        );
      }
    });
    const net = NetInfo.addEventListener(state => {
      if (controller.isActive() && state.isConnected === false) {
        controller.stopForSystem(
          'The internet connection dropped, so the conversation stopped. Offline push-to-talk still works.',
        );
      }
    });
    const gates = setInterval(() => {
      if (!controller.isActive()) return;
      if (!deps.gates.isSignedInOwner()) {
        controller.stopForSystem(
          'You were signed out, so the conversation stopped.',
        );
      } else if (!deps.gates.isOnlineMode()) {
        controller.stopForSystem(
          'Online Mode was turned off, so the conversation stopped.',
        );
      }
    }, GATE_CHECK_MS);

    return () => {
      clearInterval(gates);
      app.remove();
      net();
      unsubscribe();
      unregister();
      controller.dispose();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [userId]);

  return {
    snapshot,
    start: () => {
      void controllerRef.current?.start();
    },
    end: () => controllerRef.current?.end(),
    endAndWait: async () => { await controllerRef.current?.endAndWait(); },
    setMuted: muted => {
      void controllerRef.current?.setMuted(muted);
    },
    stopResponse: () => controllerRef.current?.stopResponse(),
    sendText: async text =>
      (await controllerRef.current?.sendText(text)) ?? false,
    sendReminderContext: async task =>
      (await controllerRef.current?.sendReminderContext(task)) ?? false,
  };
};
