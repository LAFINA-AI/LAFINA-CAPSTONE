import type {VoicePersonaPreferences} from '../../cloud/voiceConversation/personaPolicy';
import {getCallLafinaSettings} from '../../cloud/voiceConversation/callLafinaSettingsStore';
import {useEffect, useRef, useState} from 'react';
import {AppState} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import {
  VoiceConversationController,
  defaultVoiceConversationDeps,
  registerVoiceConversation,
  startVoiceConversation,
} from '../../cloud/voiceConversation';
import type {
  ConversationSnapshot,
  VoiceConversationDeps,
} from '../../cloud/voiceConversation';
import {createCallMeter, levelsOf, routeSnapshot} from './callMeter';
import type {CallMeter} from './callMeter';
import {setKeepScreenOn} from '../../utils/keepScreenOn';

/** Each mounted conversation holds the screen under its own name. */
let screenOwnerSeq = 0;

/** Why an online call stops when the connection drops; the call screen offers offline. */
export const NETWORK_DROP_REASON =
  'The internet connection dropped, so the online call stopped.';

/** How often a running conversation re-checks Online Mode and the signed-in account. */
const GATE_CHECK_MS = 3000;

const IDLE: ConversationSnapshot = {
  phase: 'idle',
  muted: false,
  micCapturing: false,
  level: 0,
  outputLevel: 0,
  toolPhrase: null,
  turns: [],
  notice: null,
  failure: null,
  restartReason: null,
  voiceName: null,
  endsAt: null,
  lastTiming: null,
};

export interface VoiceConversationHandle {
  /**
   * Everything but the live audio levels, which can lag here; read those
   * from `meter` (only the avatar and waveform need them).
   */
  snapshot: ConversationSnapshot;
  meter: CallMeter;
  /** Readies the next start where it can (see the controller's prepare). */
  prepare: () => void;
  start: () => void;
  end: () => void;
  endAndWait: () => Promise<boolean>;
  setMuted: (muted: boolean) => void;
  setSpeechPaused: (paused: boolean) => Promise<boolean>;
  completeLocalTurn: () => void;
  appSpeechStarted: () => void;
  appSpeechFinished: (heard: boolean) => void;
  stopResponse: () => void;
  sendText: (text: string) => Promise<boolean>;
  sendContext: (information: string) => Promise<boolean>;
  /** Ends the call once LAFINA's next spoken answer has finished. */
  endAfterReply: (maxMs?: number) => void;
  cancelEndAfterReply: () => void;
  setPreferences: (preferences: Partial<VoicePersonaPreferences>) => void;
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
    onTurnInterrupted?: () => void;
    onAgentText?: (text: string) => void;
    suppressAgentResponse?: () => boolean;
    appOwnedAudio?: boolean;
    onClientTool?: (
      name: string,
      parameters: Record<string, unknown>,
      isCurrent: () => boolean,
    ) => Promise<string>;
    /**
     * Start-of-call context put before the student summary (for example the
     * answered reminder). Read once, when the conversation is created.
     */
    extraContext?: string;
    /** Hide and silence the agent's fixed opening line (the app already spoke). */
    quietOpening?: boolean;
    /**
     * Waited for after the server session is ready, before audio opens (a
     * reminder call connects while its greeting is still being read).
     */
    beforeAudio?: () => Promise<void>;
    /** Tests inject fakes here. */
    deps?: (userId: string) => VoiceConversationDeps;
  } = {},
): VoiceConversationHandle => {
  const [snapshot, setSnapshot] = useState<ConversationSnapshot>(IDLE);
  const [meter] = useState(createCallMeter);
  const controllerRef = useRef<VoiceConversationController | null>(null);
  const finalTextRef = useRef(options.onFinalUserText);
  finalTextRef.current = options.onFinalUserText;
  const interruptedRef = useRef(options.onTurnInterrupted);
  interruptedRef.current = options.onTurnInterrupted;
  const agentTextRef = useRef(options.onAgentText);
  agentTextRef.current = options.onAgentText;
  const suppressRef = useRef(options.suppressAgentResponse);
  suppressRef.current = options.suppressAgentResponse;
  const appOwnedAudio = useRef(options.appOwnedAudio === true);
  const toolRef = useRef(options.onClientTool);
  toolRef.current = options.onClientTool;
  const depsFactory = useRef(options.deps ?? defaultVoiceConversationDeps);
  const extraContext = useRef(options.extraContext?.trim() ?? '');
  const quietOpening = useRef(options.quietOpening === true);
  const beforeAudioRef = useRef(options.beforeAudio);
  beforeAudioRef.current = options.beforeAudio;
  const hasBeforeAudio = useRef(Boolean(options.beforeAudio));

  useEffect(() => {
    const deps = depsFactory.current(userId);
    const controller = new VoiceConversationController({
      ...deps,
      gates: {
        ...deps.gates,
        isForeground: () => AppState.currentState === 'active',
      },
      getStudentContext: () =>
        [extraContext.current, deps.getStudentContext?.() ?? '']
          .filter(Boolean)
          .join('\n\n'),
      onFinalUserText: text => finalTextRef.current?.(text),
      onTurnInterrupted: () => interruptedRef.current?.(),
      onAgentText: text => agentTextRef.current?.(text),
      suppressAgentResponse: () => suppressRef.current?.() ?? false,
      appOwnedAudio: appOwnedAudio.current,
      quietOpening: quietOpening.current,
      ...(hasBeforeAudio.current
        ? {
            beforeAudio: () => beforeAudioRef.current?.() ?? Promise.resolve(),
          }
        : {}),
      onClientTool: (name, parameters, isCurrent) =>
        toolRef.current
          ? toolRef.current(name, parameters, isCurrent)
          : Promise.reject(new Error('Tool unavailable')),
    });
    controller.setPreferences(getCallLafinaSettings(userId));
    controllerRef.current = controller;
    const first = controller.getSnapshot();
    setSnapshot(first);
    meter.set(levelsOf(first));
    const screenOwner = `voice-conversation-${++screenOwnerSeq}`;
    let screenHeld = false;
    const holdScreen = (live: boolean): void => {
      if (live === screenHeld) return;
      screenHeld = live;
      // A screen that times out pauses the app, which ends the call.
      setKeepScreenOn(screenOwner, live);
    };
    const unsubscribe = controller.subscribe(next => {
      routeSnapshot(meter, setSnapshot, next);
      holdScreen(controller.isActive());
    });
    const unregister = registerVoiceConversation(controller);

    const app = AppState.addEventListener('change', state => {
      if (
        state !== 'active' &&
        controller.isActive() &&
        !controller.isRequestingPermission()
      ) {
        controller.stopForSystem(
          'The conversation stopped when LAFINA left the screen. Nothing listens in the background.',
        );
      }
    });
    const net = NetInfo.addEventListener(state => {
      if (controller.isActive() && state.isConnected === false) {
        controller.stopForSystem(NETWORK_DROP_REASON);
      }
    });
    const gates = setInterval(() => {
      if (!controller.isActive()) return;
      if (!deps.gates.isSignedInOwner()) {
        controller.stopForSystem(
          'You were signed out, so the conversation stopped.',
        );
      } else if (!deps.gates.hasConsent()) {
        controller.stopForSystem(
          'Microphone consent was withdrawn. Start again only after reviewing consent.',
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
      holdScreen(false);
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [userId, meter]);

  return {
    snapshot,
    meter,
    prepare: () => controllerRef.current?.prepare(),
    setPreferences: preferences =>
      controllerRef.current?.setPreferences(preferences),
    start: () => {
      const controller = controllerRef.current;
      if (controller) void startVoiceConversation(controller);
    },
    end: () => controllerRef.current?.end(),
    endAndWait: async () =>
      (await controllerRef.current?.endAndWait()) ?? false,
    setMuted: muted => {
      void controllerRef.current?.setMuted(muted);
    },
    setSpeechPaused: async paused =>
      (await controllerRef.current?.setSpeechPaused(paused)) ?? false,
    completeLocalTurn: () => controllerRef.current?.completeLocalTurn(),
    appSpeechStarted: () => controllerRef.current?.appSpeechStarted(),
    appSpeechFinished: heard => controllerRef.current?.appSpeechFinished(heard),
    stopResponse: () => controllerRef.current?.stopResponse(),
    sendText: async text =>
      (await controllerRef.current?.sendText(text)) ?? false,
    sendContext: async information =>
      (await controllerRef.current?.sendContext(information)) ?? false,
    endAfterReply: maxMs => controllerRef.current?.endAfterReply(maxMs),
    cancelEndAfterReply: () => controllerRef.current?.cancelEndAfterReply(),
  };
};
