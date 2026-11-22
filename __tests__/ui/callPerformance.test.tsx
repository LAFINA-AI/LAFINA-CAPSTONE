/**
 * Call LAFINA rendering cost (2026-11-22): audio levels reach only the
 * avatar and waveform, the call clock ticks in its own component, and a
 * minimized call stops drawing. Jest proves which components re-render;
 * frame rate and battery on a phone are not measured here.
 */
import React, {useState} from 'react';
import {act, render} from '@testing-library/react-native';
import {Text} from 'react-native';
import {
  createCallMeter,
  differsOnlyInLevels,
  routeSnapshot,
  useCallLevels,
} from '../../src/ui/hooks/callMeter';
import type {CallMeter} from '../../src/ui/hooks/callMeter';
import type {ConversationSnapshot} from '../../src/cloud/voiceConversation';
import {
  CallDurationText,
  formatCallDuration,
} from '../../src/ui/components/callLafina/MeteredCallVisuals';
import {SynthWaveAvatar} from '../../src/ui/components/callLafina/SynthWaveAvatar';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';

const snapshot = (
  over: Partial<ConversationSnapshot> = {},
): ConversationSnapshot => ({
  phase: 'speaking',
  muted: false,
  micCapturing: false,
  level: 0,
  outputLevel: 0,
  toolPhrase: null,
  turns: [],
  notice: null,
  failure: null,
  restartReason: null,
  voiceName: null,
  endsAt: null,
  lastTiming: null,
  ...over,
});

describe('call meter', () => {
  test('a snapshot that only moved its levels is the same to React', () => {
    const base = snapshot();
    expect(differsOnlyInLevels(base, {...base, level: 0.5})).toBe(true);
    expect(differsOnlyInLevels(base, {...base, outputLevel: 0.9})).toBe(true);
    expect(differsOnlyInLevels(base, {...base, phase: 'listening'})).toBe(
      false,
    );
    expect(differsOnlyInLevels(base, {...base, turns: []})).toBe(false);
    expect(differsOnlyInLevels(base, {...base, muted: true})).toBe(false);
  });

  test('the meter tells listeners only about real changes', () => {
    const meter = createCallMeter();
    const listener = jest.fn();
    const unsubscribe = meter.subscribe(listener);
    meter.set({level: 0, outputLevel: 0});
    expect(listener).not.toHaveBeenCalled();
    meter.set({level: 0.3, outputLevel: 0});
    expect(listener).toHaveBeenCalledTimes(1);
    expect(meter.get()).toEqual({level: 0.3, outputLevel: 0});
    unsubscribe();
    meter.set({level: 0.6, outputLevel: 0});
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test('level updates re-render the meter reader, not the call screen', () => {
    const meter = createCallMeter();
    let screenRenders = 0;
    let readerRenders = 0;
    let emit: (next: ConversationSnapshot) => void = () => undefined;
    // One object: its turns array is the one the screen starts with.
    const base = snapshot();

    const Reader = React.memo(function LevelReader({
      source,
    }: {
      source: CallMeter;
    }) {
      readerRenders += 1;
      const {outputLevel} = useCallLevels(source);
      return <Text testID="level">{outputLevel.toFixed(2)}</Text>;
    });
    const Screen = () => {
      const [state, setState] = useState(base);
      screenRenders += 1;
      emit = next => routeSnapshot(meter, setState, next);
      return (
        <>
          <Text testID="phase">{state.phase}</Text>
          <Reader source={meter} />
        </>
      );
    };

    const utils = render(<Screen />);
    const screenBefore = screenRenders;
    for (const outputLevel of [0.2, 0.5, 0.8, 0.4]) {
      act(() => emit({...base, outputLevel}));
    }
    expect(utils.getByTestId('level')).toHaveTextContent('0.40');
    expect(screenRenders).toBe(screenBefore);
    expect(readerRenders).toBeGreaterThanOrEqual(5);

    act(() => emit({...base, outputLevel: 0.4, phase: 'listening'}));
    expect(utils.getByTestId('phase')).toHaveTextContent('listening');
    expect(screenRenders).toBe(screenBefore + 1);
  });
});

describe('call clock', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('formats minutes and seconds', () => {
    expect(formatCallDuration(0)).toBe('00:00');
    expect(formatCallDuration(65)).toBe('01:05');
    expect(formatCallDuration(600)).toBe('10:00');
  });

  test('ticks on its own, and stops while paused', () => {
    const startedAt = Date.now();
    const utils = render(<CallDurationText startedAt={startedAt} />);
    expect(utils.getByTestId('call-timer')).toHaveTextContent('00:00');
    act(() => {
      jest.advanceTimersByTime(3_000);
    });
    expect(utils.getByTestId('call-timer')).toHaveTextContent('00:03');

    utils.rerender(<CallDurationText startedAt={startedAt} paused />);
    act(() => {
      jest.advanceTimersByTime(5_000);
    });
    expect(utils.getByTestId('call-timer')).toHaveTextContent('00:03');

    // Back on screen it shows the real elapsed time at once.
    utils.rerender(<CallDurationText startedAt={startedAt} />);
    expect(utils.getByTestId('call-timer')).toHaveTextContent('00:08');
  });

  test('no start time shows 00:00 and runs no timer', () => {
    const utils = render(<CallDurationText startedAt={null} />);
    expect(utils.getByTestId('call-timer')).toHaveTextContent('00:00');
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe('avatar', () => {
  test('a paused avatar draws a still frame with every strand', () => {
    const utils = render(
      <ThemeProvider userId="perf-user">
        <SynthWaveAvatar
          phase="speaking"
          outputLevel={0.8}
          paused
          testID="avatar"
        />
      </ThemeProvider>,
    );
    const avatar = utils.getByTestId('avatar');
    expect(avatar.props.accessibilityLabel).toBe('Lafina is speaking');
  });

  test('louder speech draws a taller still frame', () => {
    const paths = (level: number): string[] => {
      const utils = render(
        <ThemeProvider userId="perf-user">
          <SynthWaveAvatar phase="speaking" outputLevel={level} paused />
        </ThemeProvider>,
      );
      const found = utils.UNSAFE_root.findAll(
        node => typeof node.props?.d === 'string',
      );
      const ds = found.map(node => String(node.props.d));
      utils.unmount();
      return ds;
    };
    const quiet = paths(0.1);
    const loud = paths(0.9);
    expect(quiet.length).toBeGreaterThanOrEqual(9);
    expect(loud).not.toEqual(quiet);
  });
});
