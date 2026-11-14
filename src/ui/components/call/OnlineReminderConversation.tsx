import React, {forwardRef, useEffect, useImperativeHandle, useRef} from 'react';
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

export interface OnlineReminderHandle {
  endAndWait: () => Promise<void>;
  sendContext: (context: string) => Promise<boolean>;
}

interface Props {
  userId: string;
  task: string;
  onSnapshot: (snapshot: ConversationSnapshot) => void;
  onSpokenTurn: (text: string) => void;
}

/** Mounted only after Answer, admission, permission and streaming consent. */
export const OnlineReminderConversation = forwardRef<
  OnlineReminderHandle,
  Props
>(({userId, task, onSnapshot, onSpokenTurn}, ref) => {
  const {colors} = useTheme();
  // The reminder rides in the start-of-call context (audit finding 12).
  const conversation = useVoiceConversation(userId, {
    onFinalUserText: onSpokenTurn,
    extraContext: reminderCallContext(task),
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
