import React from 'react';
import {StyleSheet, View} from 'react-native';
import Svg, {Circle, Path, Rect} from 'react-native-svg';

export interface DefaultProfileAvatarProps {
  size?: number;
  isDarkMode?: boolean;
  testID?: string;
}

/**
 * Neutral default person silhouette shown for first-time users (or after
 * resetting to default) until they pick a character avatar or local photo.
 */
export const DefaultProfileAvatar: React.FC<DefaultProfileAvatarProps> =
  React.memo(
    ({size = 112, isDarkMode = false, testID = 'default-profile-avatar'}) => {
      const backgroundColor = isDarkMode ? '#303443' : '#E4E6EB';
      const silhouetteColor = isDarkMode ? '#9BA3B4' : '#8A8D91';

      return (
        <View
          style={[
            styles.container,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor,
            },
          ]}
          testID={testID}
          accessible
          accessibilityRole="image"
          accessibilityLabel="Default profile avatar"
        >
          <Svg width="100%" height="100%" viewBox="0 0 120 120">
            <Rect x={0} y={0} width={120} height={120} fill={backgroundColor} />
            {/* Neutral head */}
            <Circle cx={60} cy={43} r={21} fill={silhouetteColor} />
            {/* Neutral shoulders curving cleanly to the bottom edge */}
            <Path
              d="M 18 120 C 18 89, 36 73, 60 73 C 84 73, 102 89, 102 120 Z"
              fill={silhouetteColor}
            />
          </Svg>
        </View>
      );
    },
  );

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
