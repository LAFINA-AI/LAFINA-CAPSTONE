/**
 * Developer Testing Hub (DEVTEST-01): the Perf tab runs a suite, shows the
 * results, saves a bounded copy and exports CSV/JSON. Jest render with the
 * in-memory database: no device, model or provider is involved.
 */
import React from 'react';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import {Alert} from 'react-native';
import RNFS from 'react-native-fs';
import Share from 'react-native-share';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {DeveloperModal} from '../../src/ui/components/profile/DeveloperModal';
import {developerTestService} from '../../src/ui/components/profile/developerTestService';
import {benchmarkResultsStore} from '../../src/ai/benchmark';
import {cloudClient} from '../../src/cloud/cloudClient';
import {db, initDatabase, userStore} from '../../src/storage';

let owner: string;

beforeAll(async () => {
  await initDatabase();
});
beforeEach(() => {
  db.executeSync('DELETE FROM local_settings');
  owner = userStore.createGuestUser().id;
  developerTestService.setDeveloperModeEnabled(true);
});
afterEach(() => {
  jest.restoreAllMocks();
  developerTestService.setDeveloperModeEnabled(false);
});

const openPerfTab = () => {
  const modal = render(
    <ThemeProvider userId={owner}>
      <DeveloperModal
        visible={true}
        userId={owner}
        isGuest={true}
        onClose={jest.fn()}
        onRefreshProfile={jest.fn()}
      />
    </ThemeProvider>,
  );
  fireEvent.press(modal.getByLabelText('Performance and benchmarks'));
  return modal;
};

it('runs the Quick Offline Test, saves the run and exports it', async () => {
  const request = jest.spyOn(cloudClient, 'request');
  const modal = openPerfTab();
  expect(modal.getByText('Per-message timing')).toBeTruthy();
  expect(modal.getByText('No saved runs yet.')).toBeTruthy();

  await act(async () => {
    fireEvent.press(modal.getByLabelText('Run Quick Offline Test'));
  });
  await waitFor(() => expect(benchmarkResultsStore.latest()).not.toBeNull(), {
    timeout: 20_000,
  });
  const run = benchmarkResultsStore.latest()!;
  expect(run.suiteId).toBe('quick_offline');
  await waitFor(() =>
    expect(modal.getByText(/Personal data unchanged: PASS/)).toBeTruthy(),
  );
  // Offline runs make no online requests.
  expect(request).not.toHaveBeenCalled();

  await act(async () => {
    fireEvent.press(modal.getByText('Export CSV'));
  });
  expect(RNFS.writeFile).toHaveBeenCalledWith(
    expect.stringMatching(/dev_benchmarks\/.+\.csv$/),
    expect.stringContaining('run_id,'),
    'utf8',
  );
  await act(async () => {
    fireEvent.press(modal.getByText('Export JSON'));
  });
  expect(RNFS.writeFile).toHaveBeenCalledWith(
    expect.stringMatching(/\.json$/),
    expect.stringContaining('"schema": "lafina.devbenchmark/1"'),
    'utf8',
  );
  expect(Share.open).toHaveBeenCalledTimes(2);
}, 30_000);

it('an online run asks first and does nothing when cancelled', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const before = benchmarkResultsStore.list().length;
  const modal = openPerfTab();
  await act(async () => {
    fireEvent.press(modal.getByLabelText('Run Quick Online Test'));
  });
  await waitFor(() => expect(alert).toHaveBeenCalled());
  const [title, message, buttons] = alert.mock.calls[0];
  // A guest account fails the preflight; nothing signs in.
  expect(title).toBe('Online preflight failed');
  expect(message).toMatch(/request\(s\) planned/);
  expect(message).toMatch(/AI quota/);
  expect(buttons?.map(b => b.text)).toEqual(['Cancel', 'Run']);
  expect(benchmarkResultsStore.list()).toHaveLength(before);
});
