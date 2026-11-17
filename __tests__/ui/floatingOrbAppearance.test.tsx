/**
 * Floating LAFINA — customizable button (owner request 2026-11-18): the
 * "Look and feel" section of Profile → Floating LAFINA. A stateful fake of
 * the native module stands in for the device-local store; how the real
 * button draws is checked on the phone, not here.
 */
import React from 'react';
import {NativeModules, Platform} from 'react-native';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {initDatabase} from '../../src/storage';
import {
  FloatingOrbAppearance,
  ORB_LOOK_COPY,
  describeOrbLook,
} from '../../src/ui/components/profile/FloatingOrbAppearance';
import {FloatingAssistantSettings} from '../../src/ui/components/profile/FloatingAssistantSettings';
import {DEFAULT_ORB_CUSTOMIZATION} from '../../src/utils/floatingAssistantNative';
import type {OrbCustomization} from '../../src/utils/floatingAssistantNative';

const native = NativeModules as Record<string, any>;
const originalOS = Platform.OS;
let saved: OrbCustomization;

const section = () => (
  <ThemeProvider userId="orb-look-student">
    <FloatingOrbAppearance visible />
  </ThemeProvider>
);

const renderSection = async () => {
  const utils = render(section());
  await waitFor(() =>
    expect(
      native.LafinaFloatingAssistant.getOrbCustomization,
    ).toHaveBeenCalled(),
  );
  return utils;
};

beforeAll(async () => {
  await initDatabase();
});

beforeEach(() => {
  Object.defineProperty(Platform, 'OS', {value: 'android', configurable: true});
  saved = {...DEFAULT_ORB_CUSTOMIZATION};
  const module = native.LafinaFloatingAssistant;
  module.getOrbCustomization.mockImplementation(() =>
    Promise.resolve({...saved}),
  );
  module.setOrbCustomization.mockImplementation(
    (changes: Partial<OrbCustomization>) => {
      saved = {...saved, ...changes};
      return Promise.resolve({...saved});
    },
  );
  module.resetOrbCustomization.mockImplementation(() => {
    saved = {...DEFAULT_ORB_CUSTOMIZATION, side: saved.side};
    return Promise.resolve({...saved});
  });
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  Object.defineProperty(Platform, 'OS', {
    value: originalOS,
    configurable: true,
  });
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

test('defaults to the quiet edge bar, and the preview shows it', async () => {
  const {getByTestId, queryByTestId} = await renderSection();
  expect(getByTestId('floating-look-preview-handle')).toBeTruthy();
  expect(queryByTestId('floating-look-preview-bubble')).toBeNull();
  expect(
    getByTestId('floating-look-style-handle').props.accessibilityState,
  ).toMatchObject({selected: true});
  expect(getByTestId('floating-look-hint').props.children).toBe(
    ORB_LOOK_COPY.handleHint,
  );
  // Tuck only applies to the bubble.
  expect(queryByTestId('floating-look-tuck')).toBeNull();
  // "App theme" is sent so the native button can draw it.
  expect(native.LafinaFloatingAssistant.setOrbAppearance).toHaveBeenCalled();
});

test('each choice is saved natively and reflected in the preview', async () => {
  const {getByTestId, queryByTestId} = await renderSection();

  await act(async () => {
    fireEvent.press(getByTestId('floating-look-style-bubble'));
  });
  expect(
    native.LafinaFloatingAssistant.setOrbCustomization,
  ).toHaveBeenLastCalledWith({style: 'bubble'});
  expect(getByTestId('floating-look-preview-bubble')).toBeTruthy();
  expect(queryByTestId('floating-look-preview-handle')).toBeNull();
  expect(getByTestId('floating-look-tuck')).toBeTruthy();

  await act(async () => {
    fireEvent.press(getByTestId('floating-look-size-small'));
  });
  await act(async () => {
    fireEvent.press(getByTestId('floating-look-side-left'));
  });
  await act(async () => {
    fireEvent.press(getByTestId('floating-look-opacity-30'));
  });
  await act(async () => {
    fireEvent.press(getByTestId('floating-look-color-FFFFFF'));
  });
  await act(async () => {
    fireEvent(getByTestId('floating-look-tuck'), 'valueChange', false);
  });
  await act(async () => {
    fireEvent(getByTestId('floating-look-lock'), 'valueChange', true);
  });
  await act(async () => {
    fireEvent(getByTestId('floating-look-fullscreen'), 'valueChange', false);
  });

  expect(saved).toEqual({
    style: 'bubble',
    size: 'small',
    side: 'left',
    idleOpacity: 30,
    color: '#FFFFFF',
    tuckWhenIdle: false,
    lockPosition: true,
    hideInFullscreen: false,
  });
  expect(getByTestId('floating-look-preview').props.accessibilityLabel).toBe(
    `Preview: ${describeOrbLook(saved)}`,
  );
  expect(getByTestId('floating-look-hint').props.children).toBe(
    ORB_LOOK_COPY.locked,
  );
  const bubble = getByTestId('floating-look-preview-bubble');
  const flat = Object.assign({}, ...[bubble.props.style].flat(3));
  expect(flat).toMatchObject({
    width: 40,
    opacity: 0.3,
    backgroundColor: '#FFFFFF',
    left: 8,
  });
});

test('a failed save puts the previous choice back and says so', async () => {
  const {getByTestId} = await renderSection();
  native.LafinaFloatingAssistant.setOrbCustomization.mockImplementationOnce(
    () => Promise.reject(new Error('disk full')),
  );
  await act(async () => {
    fireEvent.press(getByTestId('floating-look-size-large'));
  });
  expect(
    getByTestId('floating-look-size-medium').props.accessibilityState,
  ).toMatchObject({selected: true});
  expect(getByTestId('floating-look-notice').props.children).toBe(
    ORB_LOOK_COPY.saveFailed,
  );
  expect(saved.size).toBe('medium');
});

test('Reset look returns to the defaults', async () => {
  saved = {
    ...DEFAULT_ORB_CUSTOMIZATION,
    style: 'bubble',
    size: 'large',
    idleOpacity: 100,
  };
  const {getByTestId} = await renderSection();
  await waitFor(() => getByTestId('floating-look-preview-bubble'));
  await act(async () => {
    fireEvent.press(getByTestId('floating-look-reset'));
  });
  expect(
    native.LafinaFloatingAssistant.resetOrbCustomization,
  ).toHaveBeenCalled();
  expect(getByTestId('floating-look-preview-handle')).toBeTruthy();
  expect(
    getByTestId('floating-look-opacity-75').props.accessibilityState,
  ).toMatchObject({selected: false});
});

test('the section sits in the Floating LAFINA sheet, and not on unsupported phones', async () => {
  const userId = 'orb-look-sheet';
  const {getByTestId, unmount} = render(
    <ThemeProvider userId={userId}>
      <FloatingAssistantSettings userId={userId} visible onClose={jest.fn()} />
    </ThemeProvider>,
  );
  await waitFor(() => expect(getByTestId('floating-look')).toBeTruthy());

  unmount();

  native.LafinaFloatingAssistant.getStatus.mockImplementationOnce(() =>
    Promise.resolve({supported: false}),
  );
  const other = render(
    <ThemeProvider userId={userId}>
      <FloatingAssistantSettings userId={userId} visible onClose={jest.fn()} />
    </ThemeProvider>,
  );
  await waitFor(() =>
    expect(other.getByTestId('floating-status').props.children).toBe(
      'Not available on this device.',
    ),
  );
  expect(other.queryByTestId('floating-look')).toBeNull();
});
