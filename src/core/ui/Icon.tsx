import {Pressable, StyleSheet} from 'react-native';
import Svg, {Circle, Line, Path, Rect} from 'react-native-svg';
import {useTheme} from '../theme/ThemeContext';
import {dimensions} from '../theme/theme';

export type IconName =
  | 'calendar'
  | 'chat'
  | 'note'
  | 'user'
  | 'mic'
  | 'plus'
  | 'search'
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-down'
  | 'layers'
  | 'settings'
  | 'close'
  | 'send'
  | 'pin'
  | 'trash'
  | 'check'
  | 'more';

/** Small code-native outlines; no icon font, bitmap variants or remote assets. */
export function Icon({
  name,
  size = 24,
  color,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  const {colors} = useTheme();
  const stroke = color ?? colors.muted;
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessible={false}
    >
      {name === 'calendar' ? (
        <>
          <Rect x={4} y={5} width={16} height={16} rx={2} />
          <Path d="M8 3v4m8-4v4M4 11h16" />
        </>
      ) : name === 'chat' ? (
        <Path d="M4 4h16v13H9l-5 4V4Z" />
      ) : name === 'note' ? (
        <>
          <Path d="M6 3h8l5 5v13H6V3Zm8 0v6h5M9 13h7m-7 4h7M9 9h2" />
        </>
      ) : name === 'user' ? (
        <>
          <Circle cx={12} cy={7} r={4} />
          <Path d="M4 21v-3c0-6 16-6 16 0v3" />
        </>
      ) : name === 'mic' ? (
        <>
          <Rect x={9} y={2} width={6} height={13} rx={3} />
          <Path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-3 0h6" />
        </>
      ) : name === 'plus' ? (
        <Path d="M12 4v16M4 12h16" />
      ) : name === 'search' ? (
        <>
          <Circle cx={10} cy={10} r={6} />
          <Line x1={15} y1={15} x2={21} y2={21} />
        </>
      ) : name === 'chevron-left' ? (
        <Path d="m15 5-7 7 7 7" />
      ) : name === 'chevron-right' ? (
        <Path d="m9 5 7 7-7 7" />
      ) : name === 'chevron-down' ? (
        <Path d="m5 9 7 7 7-7" />
      ) : name === 'layers' ? (
        <Path d="m3 8 9-5 9 5-9 5-9-5Zm0 5 9 5 9-5M3 18l9 5 9-5" />
      ) : name === 'settings' ? (
        <>
          <Path d="M4 6h16M4 12h16M4 18h16" />
          <Circle cx={8} cy={6} r={2} fill={colors.surface} />
          <Circle cx={16} cy={12} r={2} fill={colors.surface} />
          <Circle cx={10} cy={18} r={2} fill={colors.surface} />
        </>
      ) : name === 'close' ? (
        <Path d="m5 5 14 14M5 19 19 5" />
      ) : name === 'send' ? (
        <Path d="m3 3 19 9-19 9 4-9-4-9Zm4 9h15" />
      ) : name === 'pin' ? (
        <Path d="m8 3 8 0-2 6 4 5H6l4-5-2-6Zm4 11v8" />
      ) : name === 'trash' ? (
        <Path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" />
      ) : name === 'check' ? (
        <Path d="m4 12 5 5L20 5" />
      ) : (
        <>
          <Circle cx={5} cy={12} r={1} fill={stroke} />
          <Circle cx={12} cy={12} r={1} fill={stroke} />
          <Circle cx={19} cy={12} r={1} fill={stroke} />
        </>
      )}
    </Svg>
  );
}

export function IconButton({
  name,
  label,
  onPress,
  disabled = false,
  color,
  backgroundColor,
  size,
}: {
  name: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  color?: string;
  backgroundColor?: string;
  size?: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{disabled}}
      disabled={disabled}
      onPress={onPress}
      style={({pressed}) => [
        styles.button,
        {backgroundColor, opacity: disabled ? 0.45 : pressed ? 0.65 : 1},
      ]}
    >
      <Icon name={name} size={size} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: dimensions.control,
    minWidth: dimensions.control,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: dimensions.radius,
  },
});
