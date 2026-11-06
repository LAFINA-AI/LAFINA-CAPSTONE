/**
 * AGY-PORT 10: the Offline Voice sheet and its Profile row, on the Jest
 * react-native-tts fake. Nothing audible is claimed.
 */
import React from 'react';
import {AppState} from 'react-native';
import type {AppStateStatus} from 'react-native';
import Tts from 'react-native-tts';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import {db, initDatabase, userStore} from '../../src/storage';
import {speechSettingsStore as speech} from '../../src/storage/speechSettingsStore';
import {__resetTtsForTests} from '../../src/ai/tts/ttsService';
import * as preferences from '../../src/ai/tts/speechPreferences';
import {OfflineVoice} from '../../src/ui/components/profile/OfflineVoice';
import {ProfileScreen} from '../../src/ui/screens/ProfileScreen';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';

const tts = Tts as unknown as Record<string, jest.Mock>;

let serial = 0;
const owner = (label: string): string => {
  serial += 1;
  const id = `p10ui-${label}-${serial}`;
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT OR IGNORE INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
     VALUES (?, ?, ?, 'student', 0, 0, 0, 0, ?, ?)`,
    [id, id, `${id}@example.invalid`, now, now],
  );
  return id;
};

const appStateListeners = (): Array<(state: AppStateStatus) => void> => {
  const listeners: Array<(state: AppStateStatus) => void> = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
    listeners.push(handler as (state: AppStateStatus) => void);
    return {remove: jest.fn()} as unknown as ReturnType<typeof AppState.addEventListener>;
  });
  return listeners;
};

const themed = (node: React.ReactElement) => <ThemeProvider userId={null}>{node}</ThemeProvider>;

beforeAll(async () => {
  await initDatabase();
});

beforeEach(() => {
  __resetTtsForTests();
  tts.setDefaultRate.mockClear();
  tts.setDefaultVoice.mockClear();
});

afterEach(() => {
  jest.restoreAllMocks();
  db.executeSync('DELETE FROM active_session');
});

describe('AGY-PORT 10 Offline Voice sheet', () => {
  it('shows engine and English readiness, saves a voice and speed, and resets', async () => {
    const userId = owner('sheet');
    userStore.setCurrentUser(userId);
    appStateListeners();
    const screen = render(themed(<OfflineVoice userId={userId} visible onClose={jest.fn()} />));
    await waitFor(() => expect(screen.getByTestId('voice-service').props.children).toBe('Ready'));
    expect(screen.getByTestId('voice-english').props.children).toBe('Offline English voice installed');
    expect(screen.getByTestId('voice-rate').props.children).toBe('Engine default');

    await act(async () => {
      fireEvent.press(screen.getByTestId('voice-option-en-us-x-sfg-local'));
    });
    await waitFor(() => expect(speech.read(userId).voiceId).toBe('en-us-x-sfg-local'));
    expect(tts.setDefaultVoice).toHaveBeenLastCalledWith('en-us-x-sfg-local');

    await act(async () => {
      fireEvent.press(screen.getByTestId('voice-faster'));
    });
    await waitFor(() => expect(screen.getByTestId('voice-rate').props.children).toBe('1.25×'));
    expect(speech.read(userId)).toMatchObject({explicit: true, rate: 1.25});
    expect(tts.setDefaultRate).toHaveBeenLastCalledWith(1.25, true);

    await act(async () => {
      fireEvent.press(screen.getByTestId('voice-reset'));
    });
    await waitFor(() => expect(screen.getByTestId('voice-rate').props.children).toBe('Engine default'));
    expect(speech.read(userId).explicit).toBe(false);
    expect(tts.setDefaultRate).toHaveBeenLastCalledWith(1, true);
  });

  it('says when no offline English voice is installed and keeps text working', async () => {
    const userId = owner('sheet-missing');
    userStore.setCurrentUser(userId);
    appStateListeners();
    tts.voices.mockImplementationOnce(() =>
      Promise.resolve([{id: 'net', language: 'en-US', networkConnectionRequired: true, notInstalled: false}]),
    ).mockImplementationOnce(() =>
      Promise.resolve([{id: 'net', language: 'en-US', networkConnectionRequired: true, notInstalled: false}]),
    );
    const screen = render(themed(<OfflineVoice userId={userId} visible onClose={jest.fn()} />));
    await waitFor(() =>
      expect(screen.getByTestId('voice-english').props.children).toBe('No offline English voice installed'),
    );
    expect(screen.queryByTestId('voice-option-net')).toBeNull();
  });

  it('shows a refused Preview and stops only its own Preview when the app leaves the foreground', async () => {
    const userId = owner('sheet-preview');
    userStore.setCurrentUser(userId);
    const listeners = appStateListeners();
    const refused = jest.spyOn(preferences, 'startVoicePreview').mockResolvedValueOnce('microphone_busy');
    const screen = render(themed(<OfflineVoice userId={userId} visible onClose={jest.fn()} />));
    await waitFor(() => expect(screen.getByTestId('voice-service').props.children).toBe('Ready'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('voice-preview'));
    });
    expect(screen.getByTestId('voice-notice').props.children).toMatch(/microphone is in use/);

    const stop = jest.fn(async () => undefined);
    refused.mockResolvedValueOnce({result: new Promise(() => undefined), stop});
    await act(async () => {
      fireEvent.press(screen.getByTestId('voice-preview'));
    });
    expect(screen.getByTestId('voice-notice').props.children).toBe('Playing Preview…');
    await act(async () => {
      listeners.forEach(listener => listener('background'));
    });
    expect(stop).toHaveBeenCalledTimes(1);
  });
});

describe('AGY-PORT 10 Profile row', () => {
  it('adds Offline Voice next to the existing AI & Voice controls', () => {
    const userId = owner('profile');
    userStore.setCurrentUser(userId);
    const screen = render(
      <ThemeProvider userId={userId}>
        <ProfileScreen userId={userId} refreshTrigger={0} onRefresh={jest.fn()} onLogout={jest.fn()} />
      </ThemeProvider>,
    );
    for (const text of ['Detailed AI Summaries', 'Test TTS Voice', 'Offline Voice', 'Default']) {
      expect(screen.getByText(text)).toBeTruthy();
    }
  });
});
