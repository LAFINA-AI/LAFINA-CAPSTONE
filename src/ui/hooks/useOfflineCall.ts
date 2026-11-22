import {useEffect, useRef, useState} from 'react';
import {AppState} from 'react-native';
import {
  registerVoiceConversation,
  startVoiceConversation,
} from '../../cloud/voiceConversation';
import type {ConversationSnapshot} from '../../cloud/voiceConversation';
import {
  OFFLINE_IDLE_SNAPSHOT,
  OfflineCallController,
} from '../../ai/offlineCall/offlineCallController';
import type {OfflineCallDeps} from '../../ai/offlineCall/offlineCallController';
import {defaultOfflineCallDeps} from '../../ai/offlineCall/offlineCallDeps';
import type {VoiceConversationHandle} from './useVoiceConversation';
import {createCallMeter, levelsOf, routeSnapshot} from './callMeter';
import {setKeepScreenOn} from '../../utils/keepScreenOn';

let screenOwnerSeq = 0;

export interface OfflineCallHandle extends VoiceConversationHandle {
  /** LAFINA says a line the app started (for example after a tap on Confirm). */
  announce: (text: string, options?: {inChat?: boolean}) => void;
}

/**
 * One offline call controller per account, alive while the call screen is
 * mounted. Leaving the app stops the call and releases the microphone;
 * nothing listens in the background.
 */
export const useOfflineCall = (
  userId: string,
  options: {
    respond: OfflineCallDeps['respond'];
    /** Tests inject fakes here. */
    deps?: (
      userId: string,
      respond: OfflineCallDeps['respond'],
    ) => OfflineCallDeps;
  },
): OfflineCallHandle => {
  const [snapshot, setSnapshot] = useState<ConversationSnapshot>(
    OFFLINE_IDLE_SNAPSHOT,
  );
  const [meter] = useState(createCallMeter);
  const controllerRef = useRef<OfflineCallController | null>(null);
  const respondRef = useRef(options.respond);
  respondRef.current = options.respond;
  const depsFactory = useRef(options.deps ?? defaultOfflineCallDeps);

  useEffect(() => {
    const controller = new OfflineCallController(
      depsFactory.current(userId, (text, source, turn) =>
        respondRef.current(text, source, turn),
      ),
    );
    controllerRef.current = controller;
    const first = controller.getSnapshot();
    setSnapshot(first);
    meter.set(levelsOf(first));
    const screenOwner = `offline-call-${++screenOwnerSeq}`;
    let screenHeld = false;
    const holdScreen = (live: boolean): void => {
      if (live === screenHeld) return;
      screenHeld = live;
      // A screen that sleeps would end the call; keep it on while it runs.
      setKeepScreenOn(screenOwner, live);
    };
    const unsubscribe = controller.subscribe(next => {
      routeSnapshot(meter, setSnapshot, next);
      holdScreen(controller.isActive());
    });
    const unregister = registerVoiceConversation(controller);
    const app = AppState.addEventListener('change', state => {
      // The microphone prompt briefly takes the screen; that is not leaving.
      if (
        state !== 'active' &&
        controller.isActive() &&
        !controller.isRequestingPermission()
      ) {
        controller.stopForSystem(
          'The call stopped when LAFINA left the screen. Nothing listens in the background.',
        );
      }
    });
    return () => {
      app.remove();
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
    // Offline readiness is the speech warmup the call screen starts.
    prepare: () => undefined,
    start: () => {
      const controller = controllerRef.current;
      if (controller) void startVoiceConversation(controller);
    },
    end: () => controllerRef.current?.end(),
    endAndWait: async () =>
      (await controllerRef.current?.endAndWait()) ?? false,
    setMuted: muted => controllerRef.current?.setMuted(muted),
    setSpeechPaused: async () => false,
    completeLocalTurn: () => undefined,
    appSpeechStarted: () => undefined,
    appSpeechFinished: () => undefined,
    stopResponse: () => controllerRef.current?.stopResponse(),
    sendText: async text =>
      (await controllerRef.current?.sendText(text)) ?? false,
    sendContext: async () => true,
    endAfterReply: () => controllerRef.current?.endAfterReply(),
    cancelEndAfterReply: () => controllerRef.current?.cancelEndAfterReply(),
    setPreferences: () => undefined,
    announce: (text, announceOptions) =>
      controllerRef.current?.announce(text, announceOptions),
  };
};
