import React from 'react';
import {Animated} from 'react-native';
import Svg, {Circle, G, Path, Rect} from 'react-native-svg';
import {EASE, LINEAR, useKeyframeValue} from './introMotion';

/** Icons from the design prototype (24×24 view box, same paths). */

const SPARKLE =
  'M12 1.5c.9 5.6 4.9 9.6 10.5 10.5-5.6.9-9.6 4.9-10.5 10.5C11.1 16.9 7.1 12.9 1.5 12 7.1 11.1 11.1 7.1 12 1.5Z';
const CHECK = 'M5 12.5l4.5 4.5L19 7.5';

interface IconProps {
  size: number;
  color: string;
}

export const Sparkle: React.FC<IconProps> = ({size, color}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path fill={color} d={SPARKLE} />
  </Svg>
);

const Stroke: React.FC<
  IconProps & {width?: number; children: React.ReactNode}
> = ({size, color, width = 2, children}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <G
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    >
      {children}
    </G>
  </Svg>
);

export const CalendarIcon: React.FC<IconProps> = props => (
  <Stroke {...props}>
    <Rect x={3} y={4} width={18} height={18} rx={2} />
    <Path d="M16 2v4M8 2v4M3 10h18" />
  </Stroke>
);

export const MicIcon: React.FC<IconProps> = props => (
  <Stroke {...props}>
    <Rect x={9} y={2} width={6} height={12} rx={3} />
    <Path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4" />
  </Stroke>
);

export const BookIcon: React.FC<IconProps> = props => (
  <Stroke {...props}>
    <Path d="M4 4h6a3 3 0 0 1 2 1 3 3 0 0 1 2-1h6v15h-6a2 2 0 0 0-2 2 2 2 0 0 0-2-2H4Z" />
    <Path d="M12 5v16" />
  </Stroke>
);

export const ArrowRightIcon: React.FC<IconProps> = props => (
  <Stroke {...props} width={2.2}>
    <Path d="M5 12h14M13 6l6 6-6 6" />
  </Stroke>
);

export const BackIcon: React.FC<IconProps> = props => (
  <Stroke {...props}>
    <Path d="M19 12H5M11 18l-6-6 6-6" />
  </Stroke>
);

export const BellIcon: React.FC<IconProps> = props => (
  <Stroke {...props}>
    <Path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <Path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </Stroke>
);

export const FileIcon: React.FC<IconProps> = props => (
  <Stroke {...props}>
    <Path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
    <Path d="M14 3v5h5M9 13h6M9 17h4" />
  </Stroke>
);

export const ClockIcon: React.FC<IconProps> = props => (
  <Stroke {...props}>
    <Circle cx={12} cy={12} r={9} />
    <Path d="M12 7v5l3 2" />
  </Stroke>
);

export const CheckIcon: React.FC<IconProps> = props => (
  <Stroke {...props} width={3}>
    <Path d={CHECK} />
  </Stroke>
);

export const ExternalIcon: React.FC<IconProps> = props => (
  <Stroke {...props} width={2.2}>
    <Path d="M7 17L17 7M8 7h9v9" />
  </Stroke>
);

export const WifiOffIcon: React.FC<IconProps> = props => (
  <Stroke {...props}>
    <Path d="M2 2l20 20M8.5 16.4a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 5.2-2.8M16.7 10.4a10 10 0 0 1 2.3 1.6M2 8.8a15 15 0 0 1 4.2-2.6M10.7 5a15 15 0 0 1 11.3 3.8M12 20h.01" />
  </Stroke>
);

export const ShieldIcon: React.FC<IconProps> = props => (
  <Stroke {...props}>
    <Path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3Z" />
    <Path d="M9 12l2 2 4-4" />
  </Stroke>
);

export const CloudIcon: React.FC<IconProps> = props => (
  <Stroke {...props}>
    <Path d="M17.5 19H8a6 6 0 1 1 5.7-7.9A4.5 4.5 0 1 1 17.5 19Z" />
  </Stroke>
);

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** Check mark that draws itself (prototype class `draw`). */
export const DrawCheck: React.FC<IconProps & {delay: number}> = ({
  size,
  color,
  delay,
}) => {
  const offset = useKeyframeValue(
    [
      [0, 24],
      [1, 0],
    ],
    {duration: 450, easing: EASE, delay: delay * 1000, native: false},
  );
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <AnimatedPath
        d={CHECK}
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        strokeDasharray={24}
        strokeDashoffset={offset}
      />
    </Svg>
  );
};

/** Dashed line whose dashes move (prototype class `march`). */
export const MarchingPath: React.FC<{
  d: string;
  color: string;
  width: number;
  height: number;
}> = ({d, color, width, height}) => {
  const offset = useKeyframeValue(
    [
      [0, 0],
      [1, -16],
    ],
    {duration: 800, easing: LINEAR, loop: true, native: false},
    0,
  );
  return (
    <Svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
    >
      <AnimatedPath
        d={d}
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
        strokeDasharray="4 4"
        strokeDashoffset={offset}
      />
    </Svg>
  );
};

/** A circle with a dashed outline (CSS `border: … dashed`). */
export const DashedCircle: React.FC<{
  size: number;
  color: string;
  strokeWidth: number;
  fill?: string;
}> = ({size, color, strokeWidth, fill = 'none'}) => (
  <Svg width={size} height={size}>
    <Circle
      cx={size / 2}
      cy={size / 2}
      r={(size - strokeWidth) / 2}
      stroke={color}
      strokeWidth={strokeWidth}
      strokeDasharray={`${strokeWidth * 3} ${strokeWidth * 2}`}
      fill={fill}
    />
  </Svg>
);
