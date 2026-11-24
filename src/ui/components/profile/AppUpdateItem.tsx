import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Fonts, useThemedStyles } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import type { ThemeColors } from '../../contexts/ThemeContext';
import { appUpdater } from '../../../updates';
import type { UpdateService, UpdateState } from '../../../updates';
import { useUpdateState } from '../updates/AppUpdatePrompt';
import { requestUpdateSheet } from '../updates/updateMemory';
import { RefreshCw } from 'lucide-react-native';
import { useSettingTone } from './SettingItem';

export const labelFor = (state: UpdateState): string => {
  switch (state.phase) {
    case 'checking':
      return 'Checking for updates…';
    case 'up-to-date':
      return `Up to date · ${state.currentVersion}`;
    case 'available':
      return `Update to ${state.version}`;
    case 'needs-install':
      return `${state.version} is available`;
    case 'downloading':
      return `Downloading ${state.version ?? 'update'} · ${state.percent ?? 0}%`;
    case 'ready':
      return state.kind === 'apk' ? `Install ${state.version}` : `Restart to use ${state.version}`;
    case 'error':
      return 'Update did not finish — tap to retry';
    default:
      return 'Check for updates';
  }
};

interface AppUpdateItemProps {
  service?: UpdateService;
  /** Opens the update sheet; false when no sheet is mounted (then it checks in place). */
  openSheet?: () => boolean;
}

/** Profile > About: the update status, opening the same sheet the app offers updates in. */
export const AppUpdateItem: React.FC<AppUpdateItemProps> = ({
  service = appUpdater,
  openSheet = requestUpdateSheet,
}) => {
  const { colors } = useTheme();
  const themed = useThemedStyles(getThemedStyles);
  const state = useUpdateState(service);
  const { phase } = state;
  const attention = phase === 'available' || phase === 'ready' || phase === 'needs-install';
  const busy = phase === 'checking' || phase === 'downloading';
  const tone = useSettingTone(attention ? 'danger' : 'mint');

  const handlePress = (): void => {
    if (!openSheet()) void service.check();
  };

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={handlePress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={labelFor(state)}
      accessibilityState={{ busy }}
      testID="app-update-item"
    >
      <View style={[styles.iconTile, { backgroundColor: tone.bg }]}>
        <RefreshCw size={17} color={tone.ink} />
      </View>
      <View style={styles.textColumn}>
        <Text
          style={[
            styles.label,
            themed.label,
            attention && [styles.attention, { color: colors.red }],
          ]}
        >
          {labelFor(state)}
        </Text>
        {phase === 'downloading' && (
          <View style={[styles.track, themed.track]}>
            <View
              style={[
                styles.fill,
                { width: `${state.percent ?? 0}%`, backgroundColor: colors.red },
              ]}
            />
          </View>
        )}
      </View>
      {busy ? (
        <ActivityIndicator size="small" color={colors.textMuted} />
      ) : (
        attention && <View style={[styles.dot, { backgroundColor: colors.red }]} />
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
  },
  iconTile: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  textColumn: {
    flex: 1,
    marginRight: 8,
  },
  label: {
    fontSize: 14.5,
    fontWeight: '600',
    fontFamily: Fonts.body,
  },
  attention: {
    fontWeight: 'bold',
  },
  track: {
    height: 3,
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  fill: {
    height: 3,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});

const getThemedStyles = (colors: ThemeColors) => ({
  label: { color: colors.textPrimary },
  track: { backgroundColor: colors.divider },
});
