import React, {useState} from 'react';
import {View, useWindowDimensions} from 'react-native';
import type {LayoutChangeEvent} from 'react-native';
import {FRAME_WIDTH} from './introTokens';

const MIN_SCALE = 0.5;

/**
 * Scale for a fixed-size illustration so it fits the phone. The design's
 * absolute positions stay exact; only the whole illustration shrinks, and
 * only when the screen is narrower than 390 dp or too short to fit it.
 */
export const useFitScale = (canvasHeight: number) => {
  const {width} = useWindowDimensions();
  const [room, setRoom] = useState<number | null>(null);
  const [others, setOthers] = useState<Record<string, number>>({});
  const other = Object.values(others).reduce((sum, h) => sum + h, 0);
  const byWidth = width / FRAME_WIDTH;
  const byHeight = room === null ? 1 : (room - other) / canvasHeight;
  const scale = Math.max(MIN_SCALE, Math.min(1, byWidth, byHeight));
  return {
    scale,
    /** onLayout of the area that holds the illustration and its text. */
    onRoomLayout: (event: LayoutChangeEvent) =>
      setRoom(event.nativeEvent.layout.height),
    /** onLayout for each other block that shares that area. */
    onOtherLayout: (key: string) => (event: LayoutChangeEvent) => {
      const height = event.nativeEvent.layout.height;
      setOthers(current =>
        current[key] === height ? current : {...current, [key]: height},
      );
    },
  };
};

/** A 390-wide design canvas drawn at `scale`, centred horizontally. */
export const ScaledCanvas: React.FC<{
  height: number;
  scale: number;
  children: React.ReactNode;
  testID?: string;
}> = ({height, scale, children, testID}) => (
  <View
    style={{
      width: FRAME_WIDTH * scale,
      height: height * scale,
      alignSelf: 'center',
    }}
    testID={testID}
  >
    <View
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: FRAME_WIDTH,
        height,
        transform: [{scale}],
        transformOrigin: '0% 0%',
      }}
    >
      {children}
    </View>
  </View>
);
