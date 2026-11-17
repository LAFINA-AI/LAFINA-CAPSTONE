import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  AccessibilityInfo,
  Animated,
  BackHandler,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo';
import {useTheme} from '../contexts/ThemeContext';
import {Fonts, FontSize, Spacing} from '../theme';
import {resolveOnlineMode} from '../../cloud/onlineModeGate';
import type {OnlineModeDecision} from '../../cloud/onlineModeGate';
import {floatingAssistantNative} from '../../utils/floatingAssistantNative';
import {quickChatPresence} from './quickChatPresence';
import {QuickChatConversation} from './QuickChatConversation';

/** What the panel can show (UX spec `03` §4 and §7). */
export type QuickChatPanelState = 'ready' | 'no_user' | 'storage';

interface QuickChatPanelProps {
  userId: string | null;
  state: QuickChatPanelState;
}

const SHEET_MAX_WIDTH = 420;
const SHEET_MIN_HEIGHT = 220;
const SHEET_RADIUS = 24;
const OPEN_MS = 180;
const OPEN_REDUCED_MS = 80;

const STATE_MESSAGES: Record<Exclude<QuickChatPanelState, 'ready'>, string> = {
  no_user: 'Open LAFINA to finish setting up.',
  storage: 'LAFINA’s storage needs attention.',
};

export const closeQuickChat = (): void => {
  Keyboard.dismiss();
  void floatingAssistantNative.closeQuickChat();
};

/** "Open LAFINA": the main app on the Chat tab; the panel closes. */
export const openLafinaFromQuickChat = (userId: string | null): void => {
  Keyboard.dismiss();
  if (userId)
    quickChatPresence.requestNavigation({ownerId: userId, screen: 'chat'});
  void floatingAssistantNative.openMainApp();
};

/**
 * Floating LAFINA (ADR-036): the bottom sheet over the dimmed app underneath.
 * Edge-to-edge window: Android does not resize it for the keyboard, and the
 * reported keyboard height excludes the navigation bar (FLOAT-00 Spike A),
 * so the sheet sits above keyboard + bottom inset.
 */
export const QuickChatPanel: React.FC<QuickChatPanelProps> = ({
  userId,
  state,
}) => {
  const {colors, isModern, modernPalette} = useTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [online, setOnline] = useState<OnlineModeDecision | null>(null);
  const [chipNote, setChipNote] = useState(false);
  /** UX 03 §7.3: an open card is protected from a stray tap on the scrim. */
  const [cardOpen, setCardOpen] = useState(false);
  const appear = useRef(new Animated.Value(0)).current;
  const keyboardShown = useRef(false);

  const playOpen = useCallback(() => {
    appear.setValue(0);
    void AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then(reduced => {
        Animated.timing(appear, {
          toValue: 1,
          duration: reduced ? OPEN_REDUCED_MS : OPEN_MS,
          useNativeDriver: true,
        }).start();
      });
  }, [appear]);

  const refreshOnline = useCallback(() => {
    if (!userId || state !== 'ready') {
      setOnline(null);
      return;
    }
    let current = true;
    void resolveOnlineMode(userId).then(decision => {
      if (current) setOnline(decision);
    });
    return () => {
      current = false;
    };
  }, [userId, state]);

  // Open (first mount) and every reopen from the orb or the notification.
  useEffect(() => {
    playOpen();
    const cancels = new Set<() => void>();
    const recheck = () => {
      const cancel = refreshOnline();
      if (cancel) cancels.add(cancel);
    };
    recheck();
    const unsubscribe = quickChatPresence.subscribe(() => {
      if (!quickChatPresence.isOpen()) return;
      playOpen();
      recheck();
    });
    // The chip follows connectivity while the panel is open.
    let wasConnected: boolean | null = null;
    const unsubscribeNet = NetInfo.addEventListener(net => {
      const connected =
        Boolean(net.isConnected) && net.isInternetReachable !== false;
      if (wasConnected !== null && connected !== wasConnected) recheck();
      wasConnected = connected;
    });
    return () => {
      unsubscribe();
      unsubscribeNet();
      cancels.forEach(cancel => cancel());
    };
  }, [playOpen, refreshOnline]);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', event => {
      keyboardShown.current = true;
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      keyboardShown.current = false;
      setKeyboardHeight(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // Back: the keyboard first, then the panel (an explicit native finish).
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (keyboardShown.current) {
          Keyboard.dismiss();
          return true;
        }
        closeQuickChat();
        return true;
      },
    );
    return () => subscription.remove();
  }, []);

  const bottomGap =
    (keyboardHeight > 0 ? keyboardHeight : 0) + insets.bottom + Spacing.md;
  const available = window.height - bottomGap - insets.top;
  const maxHeight = Math.max(
    Math.min(
      window.height * 0.62,
      keyboardHeight > 0 ? available - Spacing.xxl : available,
      window.height - insets.top - insets.bottom - Spacing.lg,
    ),
    Math.min(SHEET_MIN_HEIGHT, available),
  );
  const width = Math.min(window.width - Spacing.lg * 2, SHEET_MAX_WIDTH);
  const surface = isModern ? modernPalette.card : colors.surface;
  const onlineOn = online?.enabled === true;

  const translateY = appear.interpolate({
    inputRange: [0, 1],
    outputRange: [16, 0],
  });

  return (
    <View style={styles.fill} testID="quick-chat-panel">
      <Pressable
        style={[
          StyleSheet.absoluteFill,
          {backgroundColor: colors.overlay},
          styles.scrim,
        ]}
        onPress={() => (cardOpen ? Keyboard.dismiss() : closeQuickChat())}
        accessibilityRole="button"
        accessibilityLabel="Close Quick Chat"
        testID="quick-chat-scrim"
      />
      <Animated.View
        style={[
          styles.sheet,
          {
            width,
            maxHeight,
            bottom: bottomGap,
            backgroundColor: surface,
            borderColor: colors.divider,
            opacity: appear,
            transform: [{translateY}],
          },
        ]}
        testID="quick-chat-sheet"
      >
        <View style={[styles.header, {borderBottomColor: colors.divider}]}>
          <View style={[styles.mark, {backgroundColor: colors.primary}]}>
            <Text style={[styles.markText, {color: colors.textOnPrimary}]}>
              L
            </Text>
          </View>
          <Text
            style={[styles.title, {color: colors.textPrimary}]}
            accessibilityRole="header"
          >
            Quick Chat
          </Text>
          {state === 'ready' ? (
            <TouchableOpacity
              onPress={() => setChipNote(previous => !previous)}
              accessibilityRole="button"
              accessibilityLabel={onlineOn ? 'Online' : 'Offline'}
              testID="quick-chat-status-chip"
              style={[styles.chip, {borderColor: colors.border}]}
            >
              <View
                style={[
                  styles.dot,
                  {
                    backgroundColor: onlineOn
                      ? colors.success
                      : colors.textMuted,
                  },
                ]}
              />
              <Text style={[styles.chipText, {color: colors.textSecondary}]}>
                {onlineOn ? 'Online' : 'Offline'}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.spacer} />
          )}
          <TouchableOpacity
            onPress={() => openLafinaFromQuickChat(userId)}
            accessibilityRole="button"
            accessibilityLabel="Open LAFINA"
            testID="quick-chat-open-lafina"
            style={styles.iconButton}
          >
            <Text style={[styles.icon, {color: colors.textSecondary}]}>↗</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={closeQuickChat}
            accessibilityRole="button"
            accessibilityLabel="Close"
            testID="quick-chat-close"
            style={styles.iconButton}
          >
            <Text style={[styles.icon, {color: colors.textSecondary}]}>✕</Text>
          </TouchableOpacity>
        </View>

        {chipNote && state === 'ready' ? (
          <Text
            style={[styles.chipNote, {color: colors.textSecondary}]}
            testID="quick-chat-status-note"
          >
            {onlineOn
              ? 'Online Mode is on for your account. Change it in the Chat tab.'
              : online?.message ??
                'Offline: LAFINA answers on this phone. Change Online Mode in the Chat tab.'}
          </Text>
        ) : null}

        {state === 'ready' && userId ? (
          <View style={styles.body}>
            <QuickChatConversation
              userId={userId}
              onlineMode={onlineOn}
              onCardOpenChange={setCardOpen}
            />
          </View>
        ) : (
          <View
            style={styles.body}
            testID={`quick-chat-state-${state === 'ready' ? 'no_user' : state}`}
          >
            <Text style={[styles.hint, {color: colors.textPrimary}]}>
              {STATE_MESSAGES[state === 'ready' ? 'no_user' : state]}
            </Text>
            <TouchableOpacity
              onPress={() => openLafinaFromQuickChat(null)}
              accessibilityRole="button"
              testID="quick-chat-state-open"
              style={[styles.primaryButton, {backgroundColor: colors.primary}]}
            >
              <Text
                style={[styles.primaryLabel, {color: colors.textOnPrimary}]}
              >
                Open LAFINA
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  fill: {flex: 1},
  scrim: {opacity: 0.35},
  sheet: {
    position: 'absolute',
    alignSelf: 'center',
    minHeight: SHEET_MIN_HEIGHT,
    borderRadius: SHEET_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    elevation: 12,
  },
  header: {
    // Grows with large text (200% font scale) instead of clipping the title.
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xxs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  mark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
  },
  markText: {fontFamily: Fonts.heading, fontSize: FontSize.body},
  title: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.bodyLarge,
    flex: 1,
  },
  spacer: {flex: 0},
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xxs,
    marginRight: Spacing.xs,
  },
  dot: {width: 8, height: 8, borderRadius: 4, marginRight: Spacing.xs},
  chipText: {fontFamily: Fonts.body, fontSize: FontSize.small},
  chipNote: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {fontSize: 18},
  body: {padding: Spacing.lg, flexShrink: 1},
  hint: {
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
    marginBottom: Spacing.md,
  },
  primaryButton: {
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: {fontFamily: Fonts.heading, fontSize: FontSize.body},
});
