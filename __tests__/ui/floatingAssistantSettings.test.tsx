/**
 * Floating LAFINA (J-16, first part, added in FLOAT-02): off by default; the
 * explainer always comes before Android's overlay page; granted → native
 * `setEnabled(true, userId)`; unsupported device; turning off.
 */
import React from 'react';
import {NativeModules, Platform} from 'react-native';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {initDatabase} from '../../src/storage';
import {
  FloatingAssistantSettings,
  floatingAssistantSetting,
  floatingAssistantSummary,
} from '../../src/ui/components/profile/FloatingAssistantSettings';

const native = NativeModules as Record<string, any>;
const originalOS = Platform.OS;
let serial = 0;
const student = (): string => `floating-settings-${++serial}`;

const baseStatus = {
  supported: true,
  overlayGranted: false,
  notificationsGranted: true,
  enabled: false,
  running: false,
  hiddenUntilAppOpen: false,
  launchBlockedSeen: false,
  lowRamDevice: false,
};

let status = {...baseStatus};

const sheet = (userId: string) => (
  <ThemeProvider userId={userId}>
    <FloatingAssistantSettings userId={userId} visible onClose={jest.fn()} />
  </ThemeProvider>
);

beforeAll(async () => {
  await initDatabase();
});

beforeEach(() => {
  Object.defineProperty(Platform, 'OS', {value: 'android', configurable: true});
  status = {...baseStatus};
  native.LafinaFloatingAssistant.getStatus.mockImplementation(() =>
    Promise.resolve({...status}),
  );
  native.LafinaFloatingAssistant.setEnabled.mockImplementation(
    (enabled: boolean) => {
      status = {...status, enabled, running: enabled && status.overlayGranted};
      return Promise.resolve({...status});
    },
  );
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  Object.defineProperty(Platform, 'OS', {
    value: originalOS,
    configurable: true,
  });
  jest.restoreAllMocks();
});

test('off by default for every student', () => {
  const userId = student();
  expect(floatingAssistantSetting.isEnabled(userId)).toBe(false);
  expect(floatingAssistantSummary(userId, null)).toBe('Off');
});

test('without the permission: explainer first, Android settings only after Continue', async () => {
  const userId = student();
  const {getByTestId, queryByTestId} = render(sheet(userId));
  await waitFor(() =>
    expect(native.LafinaFloatingAssistant.getStatus).toHaveBeenCalled(),
  );

  await act(async () => {
    fireEvent(getByTestId('floating-enabled-switch'), 'valueChange', true);
  });
  expect(getByTestId('floating-explainer')).toBeTruthy();
  expect(
    native.LafinaFloatingAssistant.openOverlaySettings,
  ).not.toHaveBeenCalled();
  expect(native.LafinaFloatingAssistant.setEnabled).not.toHaveBeenCalled();
  expect(floatingAssistantSetting.isEnabled(userId)).toBe(false);

  // "Not now" closes it and changes nothing.
  fireEvent.press(getByTestId('floating-explainer-cancel'));
  expect(queryByTestId('floating-explainer')).toBeNull();
  expect(floatingAssistantSetting.isEnabled(userId)).toBe(false);

  await act(async () => {
    fireEvent(getByTestId('floating-enabled-switch'), 'valueChange', true);
  });
  await act(async () => {
    fireEvent.press(getByTestId('floating-explainer-continue'));
  });
  expect(
    native.LafinaFloatingAssistant.openOverlaySettings,
  ).toHaveBeenCalledTimes(1);
  // Not granted yet: still off.
  expect(floatingAssistantSetting.isEnabled(userId)).toBe(false);
  expect(native.LafinaFloatingAssistant.setEnabled).not.toHaveBeenCalled();
});

test('already granted: turns on and passes the student', async () => {
  const userId = student();
  status.overlayGranted = true;
  const {getByTestId} = render(sheet(userId));
  await waitFor(() =>
    expect(native.LafinaFloatingAssistant.getStatus).toHaveBeenCalled(),
  );
  await act(async () => {
    fireEvent(getByTestId('floating-enabled-switch'), 'valueChange', true);
  });
  expect(
    native.LafinaFloatingAssistant.openOverlaySettings,
  ).not.toHaveBeenCalled();
  expect(native.LafinaFloatingAssistant.setEnabled).toHaveBeenCalledWith(
    true,
    userId,
  );
  expect(floatingAssistantSetting.isEnabled(userId)).toBe(true);
  await waitFor(() =>
    expect(getByTestId('floating-status').props.children).toMatch(/^On\./),
  );

  await act(async () => {
    fireEvent(getByTestId('floating-enabled-switch'), 'valueChange', false);
  });
  expect(native.LafinaFloatingAssistant.setEnabled).toHaveBeenLastCalledWith(
    false,
    userId,
  );
  expect(floatingAssistantSetting.isEnabled(userId)).toBe(false);
  expect(getByTestId('floating-status').props.children).toBe('Off.');
});

test('unsupported (low-RAM) phone: never turns on', async () => {
  const userId = student();
  status = {...status, supported: false, lowRamDevice: true};
  const {getByTestId, queryByTestId} = render(sheet(userId));
  await waitFor(() =>
    expect(native.LafinaFloatingAssistant.getStatus).toHaveBeenCalled(),
  );
  await act(async () => {
    fireEvent(getByTestId('floating-enabled-switch'), 'valueChange', true);
  });
  expect(getByTestId('floating-notice').props.children).toMatch(
    /not available/,
  );
  expect(queryByTestId('floating-explainer')).toBeNull();
  expect(native.LafinaFloatingAssistant.setEnabled).not.toHaveBeenCalled();
  expect(floatingAssistantSetting.isEnabled(userId)).toBe(false);
});

test('summary says when the permission is missing', () => {
  const userId = student();
  floatingAssistantSetting.setEnabled(userId, true);
  expect(floatingAssistantSummary(userId, {...baseStatus})).toBe(
    'Permission needed',
  );
  expect(
    floatingAssistantSummary(userId, {...baseStatus, overlayGranted: true}),
  ).toBe('On');
});

describe('J-16 (FLOAT-06): status, return without permission, help, account switch', () => {
  const {AppState} = require('react-native');
  const {
    FLOATING_COPY,
    FLOATING_SECOND_READ_MS,
  } = require('../../src/ui/components/profile/FloatingAssistantSettings');
  const {
    applyFloatingAssistantForUser,
  } = require('../../src/ui/quickChat/floatingAssistantAccount');

  let appStateListeners: Array<(state: string) => void> = [];
  beforeEach(() => {
    appStateListeners = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((
      _type: string,
      handler: (state: string) => void,
    ) => {
      appStateListeners.push(handler);
      return {
        remove: () => {
          appStateListeners = appStateListeners.filter(
            item => item !== handler,
          );
        },
      };
    }) as never);
    native.LafinaFloatingAssistant.openOverlaySettings.mockClear();
    native.LafinaFloatingAssistant.resetOrbPosition.mockClear();
    native.LafinaFloatingAssistant.openAppDetailsSettings.mockClear();
    native.LafinaFloatingAssistant.setEnabled.mockClear();
  });

  const returnToLafina = async () => {
    await act(async () => {
      appStateListeners.slice().forEach(listener => listener('active'));
      await Promise.resolve();
    });
  };

  test('summary covers every status value', () => {
    const userId = student();
    expect(
      floatingAssistantSummary(userId, {...baseStatus, supported: false}),
    ).toBe('Not available on this device');
    expect(floatingAssistantSummary(userId, {...baseStatus})).toBe('Off');
    floatingAssistantSetting.setEnabled(userId, true);
    expect(floatingAssistantSummary(userId, {...baseStatus})).toBe(
      'Permission needed',
    );
    expect(
      floatingAssistantSummary(userId, {
        ...baseStatus,
        overlayGranted: true,
        hiddenUntilAppOpen: true,
      }),
    ).toBe('Hidden until you open LAFINA');
    expect(
      floatingAssistantSummary(userId, {...baseStatus, overlayGranted: true}),
    ).toBe('On');
  });

  test('back from Android settings without granting: stays off, one line, after a second read', async () => {
    jest.useFakeTimers();
    const userId = student();
    const {getByTestId, queryByTestId} = render(sheet(userId));
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent(getByTestId('floating-enabled-switch'), 'valueChange', true);
    });
    await act(async () => {
      fireEvent.press(getByTestId('floating-explainer-continue'));
    });
    const readsBefore =
      native.LafinaFloatingAssistant.getStatus.mock.calls.length;

    await returnToLafina();
    // Not decided on the first read.
    expect(queryByTestId('floating-notice')).toBeNull();
    await act(async () => {
      jest.advanceTimersByTime(FLOATING_SECOND_READ_MS);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(native.LafinaFloatingAssistant.getStatus.mock.calls.length).toBe(
      readsBefore + 2,
    );
    expect(getByTestId('floating-notice').props.children).toBe(
      FLOATING_COPY.notGranted,
    );
    expect(getByTestId('floating-status').props.children).toBe('Off.');
    expect(floatingAssistantSetting.isEnabled(userId)).toBe(false);
    expect(native.LafinaFloatingAssistant.setEnabled).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  test('a grant seen only on the second read still turns it on', async () => {
    jest.useFakeTimers();
    const userId = student();
    const {getByTestId} = render(sheet(userId));
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent(getByTestId('floating-enabled-switch'), 'valueChange', true);
    });
    await act(async () => {
      fireEvent.press(getByTestId('floating-explainer-continue'));
    });
    await returnToLafina();
    status.overlayGranted = true;
    await act(async () => {
      jest.advanceTimersByTime(FLOATING_SECOND_READ_MS);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(native.LafinaFloatingAssistant.setEnabled).toHaveBeenCalledWith(
      true,
      userId,
    );
    expect(floatingAssistantSetting.isEnabled(userId)).toBe(true);
    jest.useRealTimers();
  });

  test('notifications off: one extra line; enabling is not blocked', async () => {
    const userId = student();
    status = {...status, overlayGranted: true, notificationsGranted: false};
    const {getByTestId} = render(sheet(userId));
    await waitFor(() =>
      expect(getByTestId('floating-notifications-off')).toBeTruthy(),
    );
    await act(async () => {
      fireEvent(getByTestId('floating-enabled-switch'), 'valueChange', true);
    });
    expect(floatingAssistantSetting.isEnabled(userId)).toBe(true);
  });

  test('reset position and help with the blocked-launch note', async () => {
    const userId = student();
    status = {...status, launchBlockedSeen: true};
    const {getByTestId, queryByTestId} = render(sheet(userId));
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.press(getByTestId('floating-reset-position'));
    });
    expect(
      native.LafinaFloatingAssistant.resetOrbPosition,
    ).toHaveBeenCalledTimes(1);
    expect(getByTestId('floating-info').props.children).toBe(
      FLOATING_COPY.positionReset,
    );

    expect(queryByTestId('floating-help')).toBeNull();
    fireEvent.press(getByTestId('floating-help-toggle'));
    expect(getByTestId('floating-help-blocked')).toBeTruthy();
    fireEvent.press(getByTestId('floating-open-app-settings'));
    expect(
      native.LafinaFloatingAssistant.openAppDetailsSettings,
    ).toHaveBeenCalledTimes(1);
  });

  test('switching to a student who has not turned it on stops the orb', async () => {
    const on = student();
    const off = student();
    floatingAssistantSetting.setEnabled(on, true);
    await applyFloatingAssistantForUser(on);
    expect(native.LafinaFloatingAssistant.setEnabled).toHaveBeenLastCalledWith(
      true,
      on,
    );
    await applyFloatingAssistantForUser(off);
    expect(native.LafinaFloatingAssistant.setEnabled).toHaveBeenLastCalledWith(
      false,
      off,
    );
    await applyFloatingAssistantForUser(null);
    expect(native.LafinaFloatingAssistant.setEnabled).toHaveBeenLastCalledWith(
      false,
      null,
    );
  });
});

describe('J-16 (FLOAT-06 device follow-up): revoked permission', () => {
  const {AppState} = require('react-native');
  const {
    FLOATING_COPY,
    FLOATING_SECOND_READ_MS,
  } = require('../../src/ui/components/profile/FloatingAssistantSettings');

  let listeners: Array<(state: string) => void> = [];
  beforeEach(() => {
    listeners = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((
      _type: string,
      handler: (state: string) => void,
    ) => {
      listeners.push(handler);
      return {
        remove: () => {
          listeners = listeners.filter(item => item !== handler);
        },
      };
    }) as never);
    native.LafinaFloatingAssistant.setEnabled.mockClear();
    native.LafinaFloatingAssistant.openOverlaySettings.mockClear();
  });

  test('on but revoked: Allow opens the explainer; back without the grant turns it off', async () => {
    jest.useFakeTimers();
    const userId = student();
    floatingAssistantSetting.setEnabled(userId, true);
    const {getByTestId, queryByTestId} = render(sheet(userId));
    await act(async () => {
      await Promise.resolve();
    });
    expect(getByTestId('floating-status').props.children).toMatch(
      /^Permission needed/,
    );
    await act(async () => {
      fireEvent.press(getByTestId('floating-fix-permission'));
    });
    expect(getByTestId('floating-explainer')).toBeTruthy();
    expect(queryByTestId('floating-fix-permission')).toBeNull();
    expect(
      native.LafinaFloatingAssistant.openOverlaySettings,
    ).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.press(getByTestId('floating-explainer-continue'));
    });
    expect(
      native.LafinaFloatingAssistant.openOverlaySettings,
    ).toHaveBeenCalledTimes(1);

    await act(async () => {
      listeners.slice().forEach(listener => listener('active'));
      await Promise.resolve();
    });
    await act(async () => {
      jest.advanceTimersByTime(FLOATING_SECOND_READ_MS);
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
    });
    expect(floatingAssistantSetting.isEnabled(userId)).toBe(false);
    expect(native.LafinaFloatingAssistant.setEnabled).toHaveBeenCalledWith(
      false,
      userId,
    );
    expect(getByTestId('floating-status').props.children).toBe('Off.');
    expect(getByTestId('floating-notice').props.children).toBe(
      FLOATING_COPY.notGranted,
    );
    jest.useRealTimers();
  });
});
