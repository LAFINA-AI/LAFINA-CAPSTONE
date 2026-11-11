import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  StatusBar,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useTheme} from '../contexts/ThemeContext';
import {useCommandReview} from '../hooks/useCommandReview';
import {VoiceConversationPanel} from '../components/voice/VoiceConversationPanel';
import type {VoiceConversationDeps} from '../../cloud/voiceConversation';

import type {CallNavigationTarget} from '../navigation/callNavigation';

export interface CallLafinaScreenProps {
  userId: string;
  onClose: () => void;
  onNavigate?: (target: CallNavigationTarget) => void;
  onMinimize?: () => void;
  deps?: (userId: string) => VoiceConversationDeps;
}

/**
 * Call Lafina 2.0 dedicated full-screen voice call screen.
 *
 * Provides a distraction-free, accessible call interface for natural spoken turn-taking,
 * live waveforms, real-time timer, in-call action card confirmation, and controls.
 */
export const CallLafinaScreen: React.FC<CallLafinaScreenProps> = ({
  userId,
  onClose,
  onMinimize,
  onNavigate,
  deps,
}) => {
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();
  const review = useCommandReview(userId, 'voice');

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          paddingTop: Math.max(insets.top, 12),
          paddingBottom: Math.max(insets.bottom, 12),
        },
      ]}
      testID="call-lafina-screen"
    >
      <StatusBar
        barStyle={colors.statusBarStyle}
        backgroundColor={colors.background}
      />
      <VoiceConversationPanel
        userId={userId}
        review={review}
        onBack={onClose}
        onMinimize={onMinimize}
        onNavigate={onNavigate}
        deps={deps}
        fullScreen={true}
      />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
});
