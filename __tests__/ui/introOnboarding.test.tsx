import React from 'react';
import {act, fireEvent, render, screen} from '@testing-library/react-native';
import {
  AccessibilityInfo,
  Animated,
  BackHandler,
  StyleSheet,
} from 'react-native';
import type {ReactTestInstance} from 'react-test-renderer';
import {initDatabase} from '../../src/storage';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {IntroPager} from '../../src/ui/screens/onboarding/IntroPager';
import {
  EASE_SPRING,
  LINEAR,
  ReducedMotionContext,
  useKeyframeValue,
} from '../../src/ui/screens/onboarding/intro/introMotion';
import {
  formatIntroToday,
  introDeadlineWeekday,
} from '../../src/ui/screens/onboarding/intro/introTokens';

type BackListener = Parameters<typeof BackHandler.addEventListener>[1];

const sleep = (ms: number) =>
  act(() => new Promise<void>(resolve => setTimeout(resolve, ms)));

/** Current number held by an Animated.Value (JS driver). */
const valueOf = (value: Animated.Value): number =>
  (value as unknown as {__getValue: () => number}).__getValue();

/** Opacity of the nearest animated ancestor that sets one. */
const opacityOf = (node: ReactTestInstance): number | undefined => {
  let current: ReactTestInstance | null = node;
  while (current) {
    const style = StyleSheet.flatten(current.props?.style);
    if (style && typeof style.opacity === 'number') return style.opacity;
    current = current.parent;
  }
  return undefined;
};

const renderPager = (props: Partial<React.ComponentProps<typeof IntroPager>>) =>
  render(
    <ThemeProvider userId={null}>
      <IntroPager mode="welcome" onFinish={jest.fn()} {...props} />
    </ThemeProvider>,
  );

describe('introduction (design prototype)', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('sample dates follow the phone date', () => {
    const thursday = new Date(2026, 10, 19, 9, 0);
    expect(formatIntroToday(thursday)).toBe('Thursday · Nov 19');
    expect(introDeadlineWeekday(thursday)).toBe('Saturday');
    expect(formatIntroToday(new Date(2027, 0, 3))).toBe('Sunday · Jan 3');
    expect(introDeadlineWeekday(new Date(2027, 0, 8))).toBe('Sunday');
  });

  test('welcome mode follows the prototype navigation', () => {
    const onFinish = jest.fn();
    const onSignIn = jest.fn();
    const onCreateAccount = jest.fn();
    renderPager({onFinish, onSignIn, onCreateAccount});

    expect(screen.getByTestId('intro-welcome')).toBeTruthy();
    fireEvent.press(screen.getByTestId('intro-get-started'));
    expect(screen.getByTestId('intro-page-1')).toBeTruthy();
    // Slide 1 shows the brand instead of a back arrow.
    expect(screen.queryByTestId('intro-back')).toBeNull();
    fireEvent.press(screen.getByTestId('intro-continue'));
    expect(screen.getByTestId('intro-page-2')).toBeTruthy();
    fireEvent.press(screen.getByTestId('intro-back'));
    expect(screen.getByTestId('intro-page-1')).toBeTruthy();

    // Skip → last slide, whose CTA starts without an account.
    fireEvent.press(screen.getByTestId('intro-skip'));
    expect(screen.getByTestId('intro-page-4')).toBeTruthy();
    expect(screen.queryByTestId('intro-skip')).toBeNull();
    expect(screen.getByText(/Submit project proposal/).props.children).toBe(
      `Submit project proposal · ${introDeadlineWeekday()} · 5:00 PM`,
    );
    fireEvent.press(screen.getByTestId('intro-create-account'));
    expect(onCreateAccount).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByTestId('intro-sign-in'));
    expect(onSignIn).toHaveBeenCalledTimes(1);
    expect(onFinish).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText('Continue without an account'));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  test('flow mode (signed in): no welcome, no sign-in, Skip finishes', () => {
    const handlers: BackListener[] = [];
    jest
      .spyOn(BackHandler, 'addEventListener')
      .mockImplementation((_event, handler) => {
        handlers.push(handler);
        return {
          remove: () => {
            const index = handlers.indexOf(handler);
            if (index >= 0) handlers.splice(index, 1);
          },
        };
      });
    const onFinish = jest.fn();
    const onSkip = jest.fn();
    renderPager({mode: 'flow', onFinish, onSkip});

    expect(screen.getByTestId('intro-page-1')).toBeTruthy();
    expect(screen.queryByTestId('intro-sign-in')).toBeNull();
    let handled: boolean | null | undefined;
    act(() => {
      handled = handlers[handlers.length - 1]({} as never);
    });
    // Slide 1 has nothing before it in the flow; the setup screen decides.
    expect(handled).toBe(false);

    fireEvent.press(screen.getByTestId('intro-skip'));
    expect(onSkip).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 3; i += 1) {
      fireEvent.press(screen.getByTestId('intro-continue'));
    }
    expect(screen.getByTestId('intro-page-4')).toBeTruthy();
    expect(screen.queryByText('Continue without an account')).toBeNull();
    expect(screen.queryByTestId('intro-create-account')).toBeNull();
    fireEvent.press(screen.getByText('Continue'));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  test('entry animations start on their first keyframe', () => {
    renderPager({});
    // a-up with a 1.05 s delay holds opacity 0 (fill-mode: both).
    expect(opacityOf(screen.getByText('Your academic AI secretary'))).toBe(0);
    screen.unmount();
  });

  test('keyframe engine: delay, per-segment stops and end state', async () => {
    const seen: Animated.Value[] = [];
    const Probe: React.FC = () => {
      seen[0] = useKeyframeValue(
        [
          [0, 0],
          [0.6, 1],
          [1, 0.5],
        ],
        {duration: 100, easing: EASE_SPRING, delay: 60, native: false},
      );
      return null;
    };
    render(<Probe />);
    expect(valueOf(seen[0])).toBe(0);
    await sleep(30);
    // Still inside animation-delay.
    expect(valueOf(seen[0])).toBe(0);
    await sleep(400);
    expect(valueOf(seen[0])).toBe(0.5);
  });

  test('keyframe engine: loops show the resting style during the delay, then restart from 0%', async () => {
    const seen: Animated.Value[] = [];
    const Probe: React.FC = () => {
      seen[0] = useKeyframeValue(
        [
          [0, 10],
          [1, 20],
        ],
        {duration: 80, easing: LINEAR, delay: 80, loop: true, native: false},
        0,
      );
      return null;
    };
    const ui = render(<Probe />);
    expect(valueOf(seen[0])).toBe(0);
    await sleep(120);
    const samples: number[] = [];
    for (let i = 0; i < 30; i += 1) {
      samples.push(valueOf(seen[0]));
      await sleep(10);
    }
    ui.unmount();
    expect(Math.min(...samples)).toBeGreaterThanOrEqual(10);
    expect(Math.max(...samples)).toBeLessThanOrEqual(20);
    // At least one restart (value jumps back down) was observed.
    expect(
      samples.some((value, i) => i > 0 && value < samples[i - 1] - 3),
    ).toBe(true);
  });

  test('keyframe engine under reduce motion: end frame, loops at rest', () => {
    const seen: Animated.Value[] = [];
    const Probe: React.FC = () => {
      seen[0] = useKeyframeValue(
        [
          [0, 0],
          [1, 1],
        ],
        {duration: 500, easing: EASE_SPRING, delay: 500, native: false},
      );
      seen[1] = useKeyframeValue(
        [
          [0, 0.6],
          [1, 0],
        ],
        {duration: 500, easing: LINEAR, loop: true, native: false},
        1,
      );
      return null;
    };
    render(
      <ReducedMotionContext.Provider value>
        <Probe />
      </ReducedMotionContext.Provider>,
    );
    expect(valueOf(seen[0])).toBe(1);
    expect(valueOf(seen[1])).toBe(1);
  });

  test('reduce motion shows the end state with no animation', async () => {
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(true);
    renderPager({});
    await act(async () => {
      await Promise.resolve();
    });
    expect(opacityOf(screen.getByText('Your academic AI secretary'))).toBe(1);
    expect(opacityOf(screen.getByText('Made for USTP students'))).toBe(1);
    fireEvent.press(screen.getByTestId('intro-get-started'));
    // A newly shown slide renders its final frame immediately.
    expect(opacityOf(screen.getByText('3 planned'))).toBe(1);
    expect(opacityOf(screen.getByText(/Your academic day/))).toBe(1);
  });
});
