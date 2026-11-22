/**
 * The Confirm button of a Call Lafina draft card (CALLFIX-02).
 *
 * It looks pressed the moment a save starts, whether the student tapped it or
 * said "save it", then shows a spinner, then a check and "Saved". A spoken
 * save and a tap look the same, so the student sees what their words did.
 * With Reduce Motion on, the states change without movement.
 */
import React, {useEffect, useRef} from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type {StyleProp, TextStyle, ViewStyle} from 'react-native';
import {Check} from 'lucide-react-native';
import {useTheme} from '../../../contexts/ThemeContext';
import {useReducedMotion} from '../../../hooks/useReducedMotion';

export interface ConfirmSaveButtonProps {
  busy: boolean;
  saved?: boolean;
  /** The button color before it is saved. */
  color: string;
  onPress: () => void;
  accessibilityLabel: string;
  testID: string;
  buttonStyle: StyleProp<ViewStyle>;
  busyStyle?: StyleProp<ViewStyle>;
  textStyle: StyleProp<TextStyle>;
  label?: string;
}

export const ConfirmSaveButton: React.FC<ConfirmSaveButtonProps> = ({
  busy,
  saved = false,
  color,
  onPress,
  accessibilityLabel,
  testID,
  buttonStyle,
  busyStyle,
  textStyle,
  label = 'Confirm',
}) => {
  const {colors} = useTheme();
  const reduced = useReducedMotion();
  const press = useRef(new Animated.Value(1)).current;
  const check = useRef(new Animated.Value(saved ? 1 : 0)).current;
  const wasBusy = useRef(busy);

  // The press: a short squeeze and spring back when a save starts.
  useEffect(() => {
    const started = (busy || saved) && !wasBusy.current;
    wasBusy.current = busy || saved;
    if (!started || reduced) return undefined;
    const anim = Animated.sequence([
      Animated.timing(press, {
        toValue: 0.92,
        duration: 90,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(press, {
        toValue: 1,
        friction: 4,
        tension: 160,
        useNativeDriver: true,
      }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [busy, saved, reduced, press]);

  // The check: drawn in over 350 ms once the save is written.
  useEffect(() => {
    if (!saved) {
      check.setValue(0);
      return undefined;
    }
    if (reduced) {
      check.setValue(1);
      return undefined;
    }
    const anim = Animated.timing(check, {
      toValue: 1,
      duration: 350,
      delay: 50,
      easing: Easing.out(Easing.back(1.6)),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [saved, reduced, check]);

  return (
    <Animated.View style={{transform: [{scale: press}]}}>
      <TouchableOpacity
        style={[
          buttonStyle,
          {backgroundColor: saved ? colors.success : color},
          busy && !saved && busyStyle,
        ]}
        onPress={onPress}
        disabled={busy || saved}
        accessibilityRole="button"
        accessibilityLabel={saved ? 'Saved' : accessibilityLabel}
        accessibilityState={{disabled: busy || saved, busy: busy && !saved}}
        testID={testID}
      >
        {saved ? (
          <View style={styles.savedRow} testID={`${testID}-saved`}>
            <Animated.View
              style={{opacity: check, transform: [{scale: check}]}}
            >
              <Check size={16} color={colors.textOnPrimary} strokeWidth={3} />
            </Animated.View>
            <Text style={[textStyle, {color: colors.textOnPrimary}]}>
              Saved
            </Text>
          </View>
        ) : busy ? (
          <ActivityIndicator size="small" color={colors.textOnPrimary} />
        ) : (
          <Text style={[textStyle, {color: colors.textOnPrimary}]}>
            {label}
          </Text>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});
