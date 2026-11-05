import React, {useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type {StorageHealth} from '../../storage';
import {useTheme} from '../contexts/ThemeContext';
import type {ThemeColors} from '../contexts/ThemeContext';
import {Fonts, FontSize, Layout, Spacing, useThemedStyles} from '../theme';

interface StorageRecoveryScreenProps {
  health: StorageHealth;
  onRetry: () => Promise<void>;
}

const FALLBACK_MESSAGE =
  'Local storage is unavailable. Nothing can be saved right now. Your existing data has not been reset.';

/**
 * Shown instead of the app while local storage cannot be trusted, so nothing
 * appears to save. It deliberately offers no way to clear or replace data.
 */
export const StorageRecoveryScreen: React.FC<StorageRecoveryScreenProps> = ({
  health,
  onRetry,
}) => {
  const {colors} = useTheme();
  const themed = useThemedStyles(getRecoveryThemedStyles);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryFailed, setRetryFailed] = useState(false);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const handleRetry = async () => {
    setIsRetrying(true);
    setRetryFailed(false);
    try {
      await onRetry();
    } catch (error) {
      console.error('[StorageRecovery] Retry failed:', error);
    }
    // A successful retry unmounts this screen. If it is still mounted, storage
    // is still unavailable, so say so.
    if (mounted.current) {
      setIsRetrying(false);
      setRetryFailed(true);
    }
  };

  return (
    <View style={[styles.container, themed.container]}>
      <StatusBar
        barStyle={colors.statusBarStyle}
        backgroundColor={colors.background}
      />
      <Text accessibilityRole="header" style={[styles.title, themed.title]}>
        LAFINA can’t open your data
      </Text>
      <Text style={[styles.message, themed.message]}>
        {health.message ?? FALLBACK_MESSAGE}
      </Text>
      {retryFailed && !isRetrying ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.hint, themed.hint]}
        >
          That didn’t work yet. Try closing and reopening LAFINA, or check for
          an app update.
        </Text>
      ) : null}
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={{disabled: isRetrying, busy: isRetrying}}
        disabled={isRetrying}
        onPress={() => void handleRetry()}
        style={[styles.button, themed.button]}
        activeOpacity={0.8}
      >
        {isRetrying ? (
          <ActivityIndicator
            accessibilityLabel="Trying again"
            color={colors.white}
          />
        ) : (
          <Text style={[styles.buttonText, themed.buttonText]}>Try again</Text>
        )}
      </TouchableOpacity>
    </View>
  );
};

const getRecoveryThemedStyles = (colors: ThemeColors) => ({
  container: {backgroundColor: colors.background},
  title: {color: colors.textPrimary},
  message: {color: colors.textSecondary},
  hint: {color: colors.error},
  button: {backgroundColor: colors.blue},
  buttonText: {color: colors.white},
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  title: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.title,
    fontWeight: 'bold',
    marginBottom: Spacing.md,
  },
  message: {
    fontFamily: Fonts.body,
    fontSize: FontSize.bodyLarge,
    lineHeight: 22,
    marginBottom: Spacing.lg,
  },
  hint: {
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
    lineHeight: 20,
    marginBottom: Spacing.lg,
  },
  button: {
    minHeight: 48,
    borderRadius: Layout.borderRadiusButton,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    fontFamily: Fonts.body,
    fontSize: FontSize.bodyLarge,
    fontWeight: 'bold',
  },
});
