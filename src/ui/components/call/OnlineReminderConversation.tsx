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
}

/** Tools the agent may run during a reminder call: reads and the snooze. */
const REMINDER_CALL_TOOLS = new Set([
  'read_lafina_data',
  'read_calendar',
  'search_notes',
  'read_memories',
  'find_free_time',
  'snooze_reminder',
]);

/**
 * Planner changes in a reminder call come from the student's own words: the
 * call screen reads each turn and shows a review card.
 */
export const REMINDER_CALL_WRITE_NOTE =
  'In a reminder call the app turns the student’s own words into a review card on screen. Ask the student to say the change they want, then let them confirm it. Nothing was changed.';

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
    {userId, task, onSnapshot, onMeter, onSpokenTurn, onSnooze, snoozeMinutes},
    ref,
  ) => {
  const snooze = useRef(onSnooze);
  snooze.current = onSnooze;
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
});
