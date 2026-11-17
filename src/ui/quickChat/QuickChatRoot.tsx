import React, {useCallback, useEffect, useState} from 'react';
import {DeviceEventEmitter, StyleSheet, View} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {ThemeProvider, useTheme} from '../contexts/ThemeContext';
import {db, initDatabase, userStore} from '../../storage';
import {backendSelection} from '../../cloud/backendSelection';
import {floatingAssistantNative} from '../../utils/floatingAssistantNative';
import {QuickChatPanel} from './QuickChatPanel';
import type {QuickChatPanelState} from './QuickChatPanel';
import {quickChatPresence} from './quickChatPresence';

/** Native `QuickChatActivity.EVENT_VISIBILITY`, sent before the host resumes. */
export const QUICK_CHAT_VISIBILITY_EVENT = 'LAFINA_QUICK_CHAT_VISIBILITY';

let visibilityBridge: {remove: () => void} | null = null;

/**
 * Keeps `quickChatPresence.isOpen()` equal to "the Quick Chat activity is
 * the resumed LAFINA screen". Installed once when the bundle loads (this
 * module is imported by `index.js`), so the main root's AppState handler
 * sees the flag even before the Quick Chat root renders.
 */
export const installQuickChatVisibilityBridge = (): void => {
  if (visibilityBridge) return;
  visibilityBridge = DeviceEventEmitter.addListener(
    QUICK_CHAT_VISIBILITY_EVENT,
    (event: {visible?: unknown} | null) => {
      quickChatPresence.setOpen(event?.visible === true);
    },
  );
};

installQuickChatVisibilityBridge();

type Phase =
  | {kind: 'loading'}
  | {kind: 'panel'; state: QuickChatPanelState; userId: string | null};

/** Sends the theme's primary color to the orb (it is drawn natively). */
const OrbColorSync: React.FC = () => {
  const {colors} = useTheme();
  useEffect(() => {
    // Ignored by the wrapper unless it is #RRGGBB or #RRGGBBAA.
    void floatingAssistantNative.setOrbAppearance(colors.primary);
  }, [colors.primary]);
  return null;
};

/**
 * Floating LAFINA (ADR-036): the second React root, `LafinaQuickChat`,
 * rendered by `QuickChatActivity` on the shared React host. Storage is
 * ready before the theme reads any setting (ADR-036 Decision 8).
 */
export const QuickChatRoot: React.FC = () => {
  const [phase, setPhase] = useState<Phase>({kind: 'loading'});

  const resolve = useCallback(async () => {
    try {
      await initDatabase();
    } catch (error) {
      console.warn('[QuickChat] Storage is not ready:', error);
    }
    const health = db.getHealth();
    if (health.status === 'unavailable' || health.status === 'quarantined') {
      setPhase({kind: 'panel', state: 'storage', userId: null});
      return;
    }
    try {
      backendSelection.applySaved();
    } catch (error) {
      console.warn('[QuickChat] Saved server could not be applied:', error);
    }
    let user: ReturnType<typeof userStore.getCurrentUser> = null;
    try {
      user = userStore.getCurrentUser();
    } catch (error) {
      console.warn('[QuickChat] Current student could not be read:', error);
    }
    if (!user || user.isNewUser) {
      setPhase({kind: 'panel', state: 'no_user', userId: null});
      return;
    }
    setPhase({kind: 'panel', state: 'ready', userId: user.id});
  }, []);

  useEffect(() => {
    // Mounting means the activity was just created and is coming to the front.
    quickChatPresence.setOpen(true);
    void resolve();
    // Reopened later: the student may have signed out or switched in between.
    const unsubscribe = quickChatPresence.subscribe(() => {
      if (quickChatPresence.isOpen()) void resolve();
    });
    return () => {
      unsubscribe();
      quickChatPresence.setOpen(false);
    };
  }, [resolve]);

  if (phase.kind === 'loading') {
    return <View style={styles.fill} testID="quick-chat-loading" />;
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider userId={phase.userId}>
        <OrbColorSync />
        <QuickChatPanel userId={phase.userId} state={phase.state} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
};

const styles = StyleSheet.create({fill: {flex: 1}});

export default QuickChatRoot;
