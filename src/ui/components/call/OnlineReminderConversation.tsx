import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {useVoiceConversation} from '../../hooks/useVoiceConversation';
import {useTheme} from '../../contexts/ThemeContext';
import {reminderCallContext} from '../../../cloud/voiceConversation';
import type {ConversationSnapshot} from '../../../cloud/voiceConversation';
import {actionService} from '../../../ai/voiceActions/actionService';
import {generateId} from '../../../utils';

export interface OnlineReminderHandle {
  endAndWait: () => Promise<void>;
  sendContext: (context: string) => Promise<boolean>;
}

interface Props {
  userId: string;
  task: string;
  onSnapshot: (snapshot: ConversationSnapshot) => void;
  onSpokenTurn: (text: string) => void;
  /** Snoozes the reminder this call is about (the agent's snooze_reminder). */
  onSnooze?: (minutes: number) => Promise<string>;
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

/** Mounted only after Answer, admission, permission and streaming consent. */
export const OnlineReminderConversation = forwardRef<
  OnlineReminderHandle,
  Props
>(({userId, task, onSnapshot, onSpokenTurn, onSnooze}, ref) => {
  const {colors} = useTheme();
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
        parameters,
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
    [userId],
  );
  // The reminder rides in the start-of-call context (audit finding 12).
  const conversation = useVoiceConversation(userId, {
    onFinalUserText: onSpokenTurn,
    extraContext: reminderCallContext(task),
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
    }),
    [],
  );
  useEffect(() => {
    current.current.start();
    return () => {
      current.current.end();
    };
  }, []);
  useEffect(() => {
    snapshotCallback.current(conversation.snapshot);
  }, [conversation.snapshot]);

  const {snapshot} = conversation;
  const label = snapshot.muted
    ? 'Muted'
    : snapshot.phase === 'speaking'
    ? 'LAFINA is speaking — you can interrupt'
    : snapshot.phase === 'thinking'
    ? 'Thinking…'
    : snapshot.phase === 'listening'
    ? 'Listening — pause whenever you like'
    : 'Connecting to online conversation…';
  return (
    <View style={styles.container} testID="online-reminder-conversation">
      {snapshot.phase === 'connecting' || snapshot.phase === 'idle' ? (
        <ActivityIndicator color={colors.primary} />
      ) : null}
      <Text
        style={[styles.status, {color: colors.textPrimary}]}
        accessibilityLiveRegion="polite"
      >
        {label}
      </Text>
      {['listening', 'speaking', 'thinking'].includes(snapshot.phase) ? (
        <TouchableOpacity
          onPress={() => conversation.setMuted(!snapshot.muted)}
          accessibilityRole="button"
          accessibilityLabel={
            snapshot.muted ? 'Unmute conversation' : 'Mute conversation'
          }
          style={[styles.mute, {borderColor: colors.border}]}
        >
          <Text style={{color: colors.textPrimary}}>
            {snapshot.muted ? 'Unmute' : 'Mute'}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {alignItems: 'center', justifyContent: 'center', padding: 12},
  status: {textAlign: 'center', fontSize: 15, marginVertical: 10},
  mute: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
});
