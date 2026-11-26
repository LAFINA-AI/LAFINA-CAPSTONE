import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import {useVoiceConversation} from '../../hooks/useVoiceConversation';
import type {CallMeter} from '../../hooks/callMeter';
import {reminderCallContext} from '../../../cloud/voiceConversation';
import type {ConversationSnapshot} from '../../../cloud/voiceConversation';
import {actionService} from '../../../ai/voiceActions/actionService';
import {generateId} from '../../../utils';

export interface OnlineReminderHandle {
  endAndWait: () => Promise<void>;
  sendContext: (context: string) => Promise<boolean>;
  /** Mute or unmute the microphone; LAFINA cannot hear the student while muted. */
  setMuted?: (muted: boolean) => void;
  /** Stop LAFINA's current answer (the student wants to talk). */
  stopResponse?: () => void;
  /** A typed turn, for a student who cannot talk out loud right now. */
  sendText?: (text: string) => Promise<boolean>;
}

interface Props {
  userId: string;
  task: string;
  onSnapshot: (snapshot: ConversationSnapshot) => void;
  onMeter?: (meter: CallMeter) => void;
  onSpokenTurn: (text: string) => void;
  /** Snoozes the reminder this call is about (the agent's snooze_reminder). */
  onSnooze?: (minutes: number) => Promise<string>;
  /** The student's usual snooze, offered when they ask for "later". */
  snoozeMinutes?: number;
  /**
   * The agent's planner tools (prepare, revise, confirm, cancel a card). The
   * call screen answers them from its one reading of the student's words, so
   * the agent hears what is actually on screen and never asks again.
   */
  onPlannerTool?: (
    name: string,
    parameters: Record<string, unknown>,
    isCurrent: () => boolean,
  ) => Promise<string>;
  /** Resolves when the app has finished reading the reminder aloud. */
  beforeAudio?: () => Promise<void>;
}

/** Tools the agent may run during a reminder call: reads and the snooze. */
const REMINDER_CALL_TOOLS = new Set([
  'read_lafina_data',
  'read_calendar',
  'search_notes',
  'read_memories',
  'find_free_time',
  'snooze_reminder',
  'search_ustp_sources',
]);

/** Card tools the call screen answers from its reading of the student's turn. */
export const REMINDER_CALL_PLANNER_TOOLS = new Set([
  'prepare_lafina_action',
  'prepare_multi_action',
  'propose_follow_up_reminder',
  'revise_draft',
  'confirm_draft',
  'cancel_draft',
]);

/** Any other write tool (memories, skills) is not offered in a reminder call. */
export const REMINDER_CALL_WRITE_NOTE =
  'That is not available during a reminder call, so nothing was changed. For a planner change, call prepare_lafina_action with what the student already said; never ask them to repeat it.';

/**
 * The online conversation behind an answered reminder call. It draws nothing:
 * the call screen shows it in the Call LAFINA style from the snapshots it
 * reports. Mounted only after Answer, admission, permission and consent.
 */
export const OnlineReminderConversation = forwardRef<
  OnlineReminderHandle,
  Props
>(
  (
    {
      userId,
      task,
      onSnapshot,
      onMeter,
      onSpokenTurn,
      onSnooze,
      snoozeMinutes,
      onPlannerTool,
      beforeAudio,
    },
    ref,
  ) => {
    const snooze = useRef(onSnooze);
    snooze.current = onSnooze;
    const plannerTool = useRef(onPlannerTool);
    plannerTool.current = onPlannerTool;
    const audioGate = useRef(beforeAudio);
    audioGate.current = beforeAudio;
    const toolSession = useRef(generateId('reminder-call'));
    useEffect(() => {
      const session = toolSession.current;
      return () => actionService.clearSessionActions(session);
    }, []);
    const onClientTool = useCallback(
      async (
        name: string,
        parameters: Record<string, unknown>,
        isCurrent: () => boolean,
      ): Promise<string> => {
        const planner = plannerTool.current;
        if (planner && REMINDER_CALL_PLANNER_TOOLS.has(name))
          return planner(name, parameters, isCurrent);
        if (!REMINDER_CALL_TOOLS.has(name)) return REMINDER_CALL_WRITE_NOTE;
        let failed = false;
        const snoozeNow = snooze.current;
        const answer = await actionService.executeTool(
          userId,
          toolSession.current,
          name,
          // "Remind me later" with no length uses the student's own snooze.
          name === 'snooze_reminder' &&
            parameters.minutes === undefined &&
            snoozeMinutes
            ? {...parameters, minutes: snoozeMinutes}
            : parameters,
          isCurrent,
          {
            onError: () => {
              failed = true;
            },
            ...(snoozeNow ? {onSnoozeReminder: snoozeNow} : {}),
          },
        );
        if (failed) throw new Error(answer);
        return answer;
      },
      [snoozeMinutes, userId],
    );
    // The reminder rides in the start-of-call context (audit finding 12).
    const conversation = useVoiceConversation(userId, {
      onFinalUserText: onSpokenTurn,
      extraContext: reminderCallContext(task, snoozeMinutes),
      // The app read the reminder aloud already; skip the agent's generic
      // "I'm listening" greeting so the call does not start over.
      quietOpening: true,
      // Connects while the reminder is read aloud; audio opens when it ends.
      beforeAudio: () => audioGate.current?.() ?? Promise.resolve(),
      onClientTool,
    });
    const current = useRef(conversation);
    current.current = conversation;
    const snapshotCallback = useRef(onSnapshot);
    snapshotCallback.current = onSnapshot;
    useImperativeHandle(
      ref,
      () => ({
        endAndWait: async () => {
          await current.current.endAndWait();
        },
        sendContext: (context: string) => current.current.sendContext(context),
        setMuted: (muted: boolean) => current.current.setMuted(muted),
        stopResponse: () => current.current.stopResponse?.(),
        sendText: (text: string) =>
          current.current.sendText
            ? current.current.sendText(text)
            : Promise.resolve(false),
      }),
      [],
    );
    useEffect(() => {
      current.current.start();
      return () => {
        current.current.end();
      };
    }, []);
    const {snapshot, meter} = conversation;
    const latestSnapshot = useRef(snapshot);
    latestSnapshot.current = snapshot;
    const hasMeterCallback = Boolean(onMeter);
    const meterCallback = useRef(onMeter);
    meterCallback.current = onMeter;
    useEffect(() => {
      meterCallback.current?.(meter);
    }, [meter, hasMeterCallback]);
    useEffect(() => {
      if (hasMeterCallback) {
        snapshotCallback.current(snapshot);
      } else {
        snapshotCallback.current({...snapshot, ...meter.get()});
      }
    }, [snapshot, meter, hasMeterCallback]);
    useEffect(() => {
      if (hasMeterCallback) return undefined;
      return meter.subscribe(() =>
        snapshotCallback.current({...latestSnapshot.current, ...meter.get()}),
      );
    }, [meter, hasMeterCallback]);

    return null;
  },
);
