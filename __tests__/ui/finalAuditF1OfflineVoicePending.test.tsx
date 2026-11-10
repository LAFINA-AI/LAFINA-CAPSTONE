/**
 * Final audit F1, sheet side: Stop, closing the sheet, the app leaving the
 * foreground and unmounting all cancel a Preview whose configuration or
 * engine start is still pending, before any playback token exists. When the
 * held work is released afterwards, nothing reaches Tts.speak. Jest
 * react-native-tts fake and real SQLite; nothing audible is claimed.
 */
import React from 'react';
import {AppState} from 'react-native';
import type {AppStateStatus} from 'react-native';
import Tts from 'react-native-tts';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import {db, initDatabase, userStore} from '../../src/storage';
import {speechSettingsStore as speech} from '../../src/storage/speechSettingsStore';
import {__resetTtsForTests} from '../../src/ai/tts/ttsService';
import {OfflineVoice} from '../../src/ui/components/profile/OfflineVoice';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';

type Mock = jest.Mock;
const tts = Tts as unknown as Record<string, Mock>;

let serial = 0;
const owner = (label: string): string => {
  serial += 1;
  const id = `f1ui-${label}-${serial}`;
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT OR IGNORE INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
     VALUES (?, ?, ?, 'student', 0, 0, 0, 0, ?, ?)`,
    [id, id, `${id}@example.invalid`, now, now],
  );
  return id;
};

const deferred = () => {
  let resolve: (value?: unknown) => void = () => undefined;
  const promise = new Promise<unknown>(done => {
    resolve = done;
  });
  return {promise, resolve};
};

const appStateListeners = (): Array<(state: AppStateStatus) => void> => {
  const listeners: Array<(state: AppStateStatus) => void> = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
    listeners.push(handler as (state: AppStateStatus) => void);
    return {remove: jest.fn()} as unknown as ReturnType<typeof AppState.addEventListener>;
  });
  return listeners;
};

const settle = async () => {
  for (let i = 0; i < 20; i += 1) await new Promise(resolve => setImmediate(resolve));
};

const originals: Record<string, ((...args: unknown[]) => unknown) | undefined> = {};

beforeAll(async () => {
  await initDatabase();
  for (const key of ['getInitStatus', 'setDefaultRate']) originals[key] = tts[key].getMockImplementation();
});

beforeEach(() => {
  __resetTtsForTests();
  for (const key of ['speak', 'setDefaultRate', 'getInitStatus']) tts[key].mockClear();
});

afterEach(() => {
  jest.restoreAllMocks();
  for (const [key, impl] of Object.entries(originals)) tts[key].mockImplementation(impl);
  db.executeSync('DELETE FROM active_session');
});

type Hold = 'configuration' | 'initialization';
type Exit = 'stop' | 'close' | 'background' | 'unmount';

const cases: Array<[Hold, Exit]> = [];
for (const hold of ['configuration', 'initialization'] as Hold[]) {
  for (const exit of ['stop', 'close', 'background', 'unmount'] as Exit[]) cases.push([hold, exit]);
}

describe('final audit F1: the Offline Voice sheet cancels a pending Preview', () => {
  it.each(cases)('%s pending, then %s: the released Preview never speaks', async (hold, exit) => {
    const userId = owner(`${hold}-${exit}`);
    userStore.setCurrentUser(userId);
    const listeners = appStateListeners();
    const onClose = jest.fn();
    const screen = render(
      <ThemeProvider userId={null}>
        <OfflineVoice userId={userId} visible onClose={onClose} />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('voice-english').props.children).toBe('Offline English voice installed'));

    const gate = deferred();
    if (hold === 'configuration') {
      // A saved choice: Preview applies its speed first, and that call is held.
      speech.save(userId, {voiceId: null, rate: 1.25, pitch: 1}, 0);
      tts.setDefaultRate.mockImplementationOnce(() => gate.promise);
    } else {
      // The engine is not started yet and its start does not answer.
      __resetTtsForTests();
      tts.getInitStatus.mockImplementationOnce(() => gate.promise.then(() => 'success'));
    }
    const reached = () =>
      hold === 'configuration'
        ? tts.setDefaultRate.mock.calls.length > 0
        : tts.getInitStatus.mock.calls.length > 0;
    tts.setDefaultRate.mockClear();
    tts.getInitStatus.mockClear();

    await act(async () => {
      fireEvent.press(screen.getByTestId('voice-preview'));
    });
    await act(async () => {
      for (let i = 0; i < 200 && !reached(); i += 1) await new Promise(resolve => setImmediate(resolve));
    });
    expect(reached()).toBe(true);

    await act(async () => {
      if (exit === 'stop') fireEvent.press(screen.getByTestId('voice-stop'));
      if (exit === 'close') fireEvent.press(screen.getByLabelText('Close'));
      if (exit === 'background') listeners.forEach(listener => listener('background'));
      if (exit === 'unmount') screen.unmount();
    });
    if (exit === 'close') expect(onClose).toHaveBeenCalledTimes(1);

    await act(async () => {
      gate.resolve();
      await settle();
    });
    expect(tts.speak).not.toHaveBeenCalled();
    if (exit === 'stop') {
      expect(screen.getByTestId('voice-notice').props.children).toBe('Preview stopped.');
    }
  });
});
