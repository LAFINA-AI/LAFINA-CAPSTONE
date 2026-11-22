import React, {useEffect, useState} from 'react';
import {Text} from 'react-native';
import type {StyleProp, TextStyle} from 'react-native';
import {useCallLevels} from '../../hooks/callMeter';
import type {CallMeter} from '../../hooks/callMeter';
import {SynthWaveAvatar} from './SynthWaveAvatar';
import type {SynthWaveAvatarProps} from './SynthWaveAvatar';
import {CallWaveform} from './CallWaveform';
import type {CallWaveformProps} from './CallWaveform';

/**
 * The call screen's live pieces. Each one subscribes to what changes often
 * (audio levels, the clock) itself, so the rest of the call screen does not
 * re-render for them.
 */

export const MeteredSynthWaveAvatar = React.memo(function MeteredAvatar({
  meter,
  ...props
}: Omit<SynthWaveAvatarProps, 'userLevel' | 'outputLevel'> & {
  meter: CallMeter;
}) {
  const {level, outputLevel} = useCallLevels(meter);
  // Hidden (minimized), the still frame needs no live levels.
  return (
    <SynthWaveAvatar
      {...props}
      userLevel={props.paused ? 0 : level}
      outputLevel={props.paused ? 0 : outputLevel}
    />
  );
});

export const MeteredCallWaveform = React.memo(function MeteredWaveform({
  meter,
  paused,
  ...props
}: Omit<CallWaveformProps, 'userLevel' | 'outputLevel'> & {
  meter: CallMeter;
  paused?: boolean;
}) {
  const {level, outputLevel} = useCallLevels(meter);
  return (
    <CallWaveform
      {...props}
      userLevel={paused ? 0 : level}
      outputLevel={paused ? 0 : outputLevel}
    />
  );
});

export const formatCallDuration = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

/** The running call time, ticking once a second (not while hidden). */
export const CallDurationText = React.memo(function CallDuration({
  startedAt,
  paused = false,
  style,
  testID = 'call-timer',
}: {
  /** When the call connected (epoch ms); null shows 00:00. */
  startedAt: number | null;
  paused?: boolean;
  style?: StyleProp<TextStyle>;
  testID?: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startedAt === null || paused) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [startedAt, paused]);
  const seconds =
    startedAt === null ? 0 : Math.max(0, Math.floor((now - startedAt) / 1000));
  return (
    <Text style={style} testID={testID}>
      {formatCallDuration(seconds)}
    </Text>
  );
});
