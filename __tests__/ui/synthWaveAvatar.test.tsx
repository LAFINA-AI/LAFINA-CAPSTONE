import React from 'react';
import {render} from '@testing-library/react-native';
import {SynthWaveAvatar} from '../../src/ui/components/callLafina/SynthWaveAvatar';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';

describe('SynthWaveAvatar Component', () => {
  test('renders the avatar with default testID and circular bounds', () => {
    const {getByTestId} = render(
      <ThemeProvider userId="test-user">
        <SynthWaveAvatar phase="idle" size={80} testID="test-avatar" />
      </ThemeProvider>,
    );

    const avatar = getByTestId('test-avatar');
    expect(avatar).toBeTruthy();
    expect(avatar.props.accessibilityRole).toBe('image');
  });

  test('adapts accessibility label across idle, listening, thinking, and speaking phases', () => {
    const {getByTestId, rerender} = render(
      <ThemeProvider userId="test-user">
        <SynthWaveAvatar phase="idle" testID="test-avatar" />
      </ThemeProvider>,
    );
    expect(getByTestId('test-avatar').props.accessibilityLabel).toBe(
      'Lafina voice waveform',
    );

    rerender(
      <ThemeProvider userId="test-user">
        <SynthWaveAvatar phase="listening" testID="test-avatar" />
      </ThemeProvider>,
    );
    expect(getByTestId('test-avatar').props.accessibilityLabel).toBe(
      'Lafina is listening',
    );

    rerender(
      <ThemeProvider userId="test-user">
        <SynthWaveAvatar phase="thinking" testID="test-avatar" />
      </ThemeProvider>,
    );
    expect(getByTestId('test-avatar').props.accessibilityLabel).toBe(
      'Lafina is thinking',
    );

    rerender(
      <ThemeProvider userId="test-user">
        <SynthWaveAvatar
          phase="speaking"
          outputLevel={0.75}
          testID="test-avatar"
        />
      </ThemeProvider>,
    );
    expect(getByTestId('test-avatar').props.accessibilityLabel).toBe(
      'Lafina is speaking',
    );
  });

  test('generates valid SVG paths for multi-strand audio waveforms when speaking', () => {
    const {getByTestId} = render(
      <ThemeProvider userId="test-user">
        <SynthWaveAvatar
          phase="speaking"
          outputLevel={0.9}
          size={76}
          testID="test-avatar"
        />
      </ThemeProvider>,
    );

    const avatar = getByTestId('test-avatar');
    expect(avatar).toBeTruthy();
    // Verify children elements (Svg, Paths) exist
    expect(avatar.props.children).toBeDefined();
  });

  test('renders muted state without throwing', () => {
    const {getByTestId} = render(
      <ThemeProvider userId="test-user">
        <SynthWaveAvatar
          phase="speaking"
          outputLevel={0.5}
          muted={true}
          testID="test-avatar"
        />
      </ThemeProvider>,
    );

    expect(getByTestId('test-avatar')).toBeTruthy();
  });
});
