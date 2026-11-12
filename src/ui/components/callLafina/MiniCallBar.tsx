/**
 * In-App Mini Call Bar (Phase 13, F-054, P13-01, P13-02).
 *
 * Provides a compact, non-intrusive ongoing call bar docked above the
 * navigation tab bar when a live call is minimized.
 * Allows students to browse Calendar, Notes, or Chat while keeping the
 * voice conversation active, with quick Mute, End, and full-screen restoration.
 */

import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Bot,
  Mic,
  MicOff,
  PhoneOff,
  Maximize2,
} from 'lucide-react-native';
import {Fonts, FontSize, Layout, Spacing} from '../../theme';
import {useTheme} from '../../contexts/ThemeContext';
import {useThemedStyles} from '../../theme/createThemedStyles';
import type {ThemeColors} from '../../contexts/ThemeContext';
import type {ConversationPhase} from '../../../cloud/voiceConversation';

export interface MiniCallBarProps {
  phase: ConversationPhase;
  muted: boolean;
  durationSeconds: number;
  onExpand: () => void;
  onToggleMute: () => void;
  onEndCall: () => void;
  bottomOffset?: number;
}

export const formatMiniDuration = (secs: number): string => {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export const MiniCallBar: React.FC<MiniCallBarProps> = ({
  phase,
  muted,
  durationSeconds,
  onExpand,
  onToggleMute,
  onEndCall,
  bottomOffset,
}) => {
  const {colors} = useTheme();
  const themed = useThemedStyles(getThemedStyles);

  const isLive = phase === 'speaking' || phase === 'listening' || phase === 'thinking' || phase === 'tool_working';
  const statusText = muted
    ? 'Muted'
    : phase === 'speaking'
    ? 'Lafina is speaking…'
    : phase === 'thinking' || phase === 'tool_working'
    ? 'Thinking…'
    : 'Listening…';

  return (
    <View
      style={[
        styles.outerContainer,
        themed.outer,
        bottomOffset !== undefined && {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: bottomOffset,
          marginBottom: 0,
          zIndex: 60,
          elevation: 12,
        },
      ]}
      testID="mini-call-bar-container"
    >
      <TouchableOpacity
        style={styles.mainContent}
        onPress={onExpand}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Ongoing Call Lafina. Tap to restore full screen."
        testID="mini-call-bar"
      >
        {/* Avatar Ring */}
        <View
          style={[
            styles.avatarBadge,
            {
              backgroundColor: colors.primary + '18',
              borderColor: muted ? colors.warning : colors.primary,
            },
          ]}
          testID="mini-call-avatar"
        >
          <Bot size={18} color={muted ? colors.warning : colors.primary} />
        </View>

        {/* Info Column */}
        <View style={styles.infoCol}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, themed.primaryText]}>Call Lafina</Text>
            {isLive && (
              <View style={styles.timerBadge}>
                <View
                  style={[
                    styles.timerDot,
                    {backgroundColor: muted ? colors.warning : colors.success},
                  ]}
                />
                <Text
                  style={[styles.timerText, {color: colors.textSecondary}]}
                  testID="mini-call-timer"
                >
                  {formatMiniDuration(durationSeconds)}
                </Text>
              </View>
            )}
          </View>
          <Text style={[styles.subtitle, themed.secondaryText]} numberOfLines={1}>
            {statusText}
          </Text>
        </View>

        {/* Expand Icon Hint */}
        <Maximize2 size={16} color={colors.textSecondary} style={styles.expandHintIcon} />
      </TouchableOpacity>

      {/* Action Controls */}
      <View style={styles.controlsRow}>
        <TouchableOpacity
          style={[
            styles.controlBtn,
            {backgroundColor: muted ? colors.warning + '25' : colors.inputBg},
          ]}
          onPress={onToggleMute}
          accessibilityRole="button"
          accessibilityLabel={muted ? 'Unmute microphone' : 'Mute microphone'}
          testID="mini-call-mute"
        >
          {muted ? (
            <MicOff size={16} color={colors.warning} />
          ) : (
            <Mic size={16} color={colors.textPrimary} />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.controlBtn, {backgroundColor: colors.error}]}
          onPress={onEndCall}
          accessibilityRole="button"
          accessibilityLabel="End Call Lafina"
          testID="mini-call-end"
        >
          <PhoneOff size={16} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const getThemedStyles = (colors: ThemeColors) => ({
  outer: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  primaryText: {
    color: colors.textPrimary,
  },
  secondaryText: {
    color: colors.textSecondary,
  },
});

const styles = StyleSheet.create({
  outerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Layout.borderRadiusCard,
    borderWidth: 1,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.xs,
    elevation: 4,
    shadowColor: '#000000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  mainContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 2,
  },
  avatarBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoCol: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  title: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.body,
    fontWeight: '700',
  },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  timerText: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    fontWeight: '600',
  },
  subtitle: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
  },
  expandHintIcon: {
    marginRight: Spacing.xs,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginLeft: Spacing.xs,
  },
  controlBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
