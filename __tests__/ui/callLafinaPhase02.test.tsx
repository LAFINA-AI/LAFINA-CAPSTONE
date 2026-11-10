import React from 'react';
import {render} from '@testing-library/react-native';
import {
  CallWaveform,
  getTruthfulStateText,
} from '../../src/ui/components/callLafina/CallWaveform';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import type {ConversationPhase} from '../../src/cloud/voiceConversation/types';

describe('Phase 02: Dual Audio Waveforms & Truthful Visual State Transitions', () => {
  const renderWithTheme = (ui: React.ReactElement) => {
    return render(<ThemeProvider userId={null}>{ui}</ThemeProvider>);
  };

  describe('F-006 & P02-02/P02-03: Assistant waveform from playback amplitude', () => {
    test('renders idle baseline bars when Lafina is not speaking', () => {
      const {getByTestId} = renderWithTheme(
        <CallWaveform
          phase="listening"
          muted={false}
          micCapturing={true}
          userLevel={0}
          outputLevel={0}
        />,
      );

      const assistantWaveform = getByTestId('call-assistant-waveform-idle');
      expect(assistantWaveform).toBeTruthy();
      expect(assistantWaveform.props.accessibilityValue.now).toBe(0);

      // Verify bars have idle resting height (4)
      const bar0 = getByTestId('assistant-waveform-bar-0');
      const flatStyle = [bar0.props.style].flat();
      expect(flatStyle).toEqual(
        expect.arrayContaining([expect.objectContaining({height: 4})]),
      );
    });

    test('renders expanded dynamic bars when Lafina is speaking with audio output', () => {
      const {getByTestId} = renderWithTheme(
        <CallWaveform
          phase="speaking"
          muted={false}
          micCapturing={true}
          userLevel={0}
          outputLevel={0.8}
        />,
      );

      const assistantWaveform = getByTestId('call-assistant-waveform-speaking');
      expect(assistantWaveform).toBeTruthy();
      expect(assistantWaveform.props.accessibilityValue.now).toBe(80);

      // Center bar (index 4) has multiplier 1.0, so height is larger than resting
      const centerBar = getByTestId('assistant-waveform-bar-4');
      const barStyle = [centerBar.props.style].flat();
      const heightStyle = barStyle.find(s => s && typeof s.height === 'number');
      expect(heightStyle?.height).toBeGreaterThan(20);
    });

    test('falls back to minimal active amplitude if speaking without measured RMS', () => {
      const {getByTestId} = renderWithTheme(
        <CallWaveform
          phase="speaking"
          muted={false}
          micCapturing={true}
          userLevel={0}
          outputLevel={0}
        />,
      );

      const assistantWaveform = getByTestId('call-assistant-waveform-speaking');
      expect(assistantWaveform).toBeTruthy();
      // Has effective fallback minimum level
      expect(assistantWaveform.props.accessibilityValue.now).toBe(12);
    });
  });

  describe('F-007 & P02-01/P02-04: User waveform from native microphone RMS', () => {
    test('renders flat muted indicator when muted is true, never animating input bars', () => {
      const {getByTestId, queryByTestId} = renderWithTheme(
        <CallWaveform
          phase="listening"
          muted={true}
          micCapturing={true}
          userLevel={0.9} // high level should be ignored when muted
          outputLevel={0}
        />,
      );

      expect(getByTestId('call-user-waveform-muted')).toBeTruthy();
      expect(queryByTestId('call-user-waveform-active')).toBeNull();
    });

    test('renders idle indicator when microphone is released / not capturing', () => {
      const {getByTestId, queryByTestId} = renderWithTheme(
        <CallWaveform
          phase="listening"
          muted={false}
          micCapturing={false}
          userLevel={0.5}
          outputLevel={0}
        />,
      );

      expect(getByTestId('call-user-waveform-idle')).toBeTruthy();
      expect(queryByTestId('call-user-waveform-active')).toBeNull();
    });

    test('renders active reactive bars when capturing and user speaks', () => {
      const {getByTestId} = renderWithTheme(
        <CallWaveform
          phase="listening"
          muted={false}
          micCapturing={true}
          userLevel={0.65}
          outputLevel={0}
        />,
      );

      expect(getByTestId('call-user-waveform-active')).toBeTruthy();
      const centerUserBar = getByTestId('user-waveform-bar-2');
      const barStyle = [centerUserBar.props.style].flat();
      const heightStyle = barStyle.find(s => s && typeof s.height === 'number');
      expect(heightStyle?.height).toBeGreaterThan(6);
    });

    test('user waveform rests at minimum height when student pauses/is quiet', () => {
      const {getByTestId} = renderWithTheme(
        <CallWaveform
          phase="listening"
          muted={false}
          micCapturing={true}
          userLevel={0.01} // below speech threshold
          outputLevel={0}
        />,
      );

      const centerUserBar = getByTestId('user-waveform-bar-2');
      const barStyle = [centerUserBar.props.style].flat();
      expect(barStyle).toEqual(
        expect.arrayContaining([expect.objectContaining({height: 3})]),
      );
    });
  });

  describe('F-008 & P02-05: Distinct non-audio thinking and tool working states', () => {
    test('thinking state shows non-audio pulse indicator while audio bars stay idle', () => {
      const {getByTestId, queryByTestId} = renderWithTheme(
        <CallWaveform
          phase="thinking"
          muted={false}
          micCapturing={true}
          userLevel={0}
          outputLevel={0}
        />,
      );

      // Non-audio thinking indicator is present
      expect(getByTestId('call-thinking-indicator')).toBeTruthy();
      // Tool working indicator is not present
      expect(queryByTestId('call-tool-working-indicator')).toBeNull();

      // Audio bars MUST NOT show speaking state (no fake output waveform)
      expect(getByTestId('call-assistant-waveform-idle')).toBeTruthy();
      expect(queryByTestId('call-assistant-waveform-speaking')).toBeNull();
    });

    test('tool_working state displays distinct action indicator without audio waveform', () => {
      const {getByTestId, queryByTestId} = renderWithTheme(
        <CallWaveform
          phase="tool_working"
          muted={false}
          micCapturing={true}
          userLevel={0}
          outputLevel={0}
          activeTool="Calendar"
        />,
      );

      // Tool working indicator is present with tool name
      expect(getByTestId('call-tool-working-indicator')).toBeTruthy();
      expect(getByTestId('call-waveform-status-text').props.children).toBe(
        'Working on Calendar…',
      );

      // Audio waveform is completely idle
      expect(getByTestId('call-assistant-waveform-idle')).toBeTruthy();
      expect(queryByTestId('call-assistant-waveform-speaking')).toBeNull();
    });
  });

  describe('F-009 & P02-06: Reduced-motion & low-power accessibility rendering', () => {
    test('renders accessible waveform without animated pulse when reduceMotion is true', () => {
      const {getByTestId} = renderWithTheme(
        <CallWaveform
          phase="thinking"
          muted={false}
          micCapturing={true}
          userLevel={0}
          outputLevel={0}
          reduceMotion={true}
        />,
      );

      expect(getByTestId('call-thinking-indicator')).toBeTruthy();
      const statusText = getByTestId('call-waveform-status-text');
      expect(statusText.props.children).toBe('Thinking…');
    });
  });

  describe('F-066: Truthful state labels helper and transitions', () => {
    const states: Array<{
      phase: ConversationPhase;
      muted: boolean;
      userLevel: number;
      hasReviewItem?: boolean;
      activeTool?: string;
      expected: string;
    }> = [
      {phase: 'connecting', muted: false, userLevel: 0, expected: 'Connecting…'},
      {phase: 'listening', muted: false, userLevel: 0, expected: 'Listening. Pause whenever you like'},
      {phase: 'listening', muted: false, userLevel: 0.15, expected: 'Listening to you…'},
      {phase: 'listening', muted: true, userLevel: 0, expected: 'Muted. LAFINA cannot hear you'},
      {phase: 'thinking', muted: false, userLevel: 0, expected: 'Thinking…'},
      {phase: 'tool_working', muted: false, userLevel: 0, activeTool: 'notes', expected: 'Working on notes…'},
      {phase: 'tool_working', muted: false, userLevel: 0, expected: 'Working…'},
      {phase: 'speaking', muted: false, userLevel: 0, expected: 'Speaking. Talk to interrupt'},
      {phase: 'listening', muted: false, userLevel: 0, hasReviewItem: true, expected: 'Waiting for confirmation'},
      {phase: 'restart_required', muted: false, userLevel: 0, expected: 'Call stopped'},
      {phase: 'ended', muted: false, userLevel: 0, expected: 'Call ended'},
      {phase: 'failed', muted: false, userLevel: 0, expected: 'Call Lafina unavailable'},
      {phase: 'idle', muted: false, userLevel: 0, expected: 'Talk with LAFINA naturally, hands-free'},
    ];

    states.forEach(({phase, muted, userLevel, hasReviewItem, activeTool, expected}) => {
      test(`truthfully maps state for phase "${phase}" (muted=${muted}, review=${Boolean(hasReviewItem)}) -> "${expected}"`, () => {
        const text = getTruthfulStateText({
          phase,
          muted,
          userLevel,
          hasReviewItem,
          activeTool,
        });
        expect(text).toBe(expected);
      });
    });
  });

  describe('P02-07: Immediate silencing on End, Stop, and barge-in', () => {
    test('clamped levels immediately transition to idle when phase switches from speaking to ended', () => {
      const {rerender, getByTestId, queryByTestId} = renderWithTheme(
        <CallWaveform
          phase="speaking"
          muted={false}
          micCapturing={true}
          userLevel={0}
          outputLevel={0.9}
        />,
      );

      expect(getByTestId('call-assistant-waveform-speaking')).toBeTruthy();

      // Simulate call End or Stop response event
      rerender(
        <ThemeProvider userId={null}>
          <CallWaveform
            phase="ended"
            muted={false}
            micCapturing={false}
            userLevel={0}
            outputLevel={0}
          />
        </ThemeProvider>,
      );

      expect(getByTestId('call-assistant-waveform-idle')).toBeTruthy();
      expect(queryByTestId('call-assistant-waveform-speaking')).toBeNull();
      expect(getByTestId('call-waveform-status-text').props.children).toBe(
        'Call ended',
      );
    });
  });
});
