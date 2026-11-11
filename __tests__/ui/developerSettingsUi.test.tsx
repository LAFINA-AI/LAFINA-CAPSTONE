import React from 'react';
import {
  fireEvent,
  render,
  waitFor,
} from '@testing-library/react-native';
import { Alert } from 'react-native';
import { ThemeProvider } from '../../src/ui/contexts/ThemeContext';
import { ProfileScreen } from '../../src/ui/screens/ProfileScreen';
import { DeveloperModal } from '../../src/ui/components/profile/DeveloperModal';
import { developerTestService } from '../../src/ui/components/profile/developerTestService';
import { db, initDatabase, userStore } from '../../src/storage';

describe('Developer Settings UI & Triggers', () => {
  const TEST_USER = 'dev-ui-user-01';

  beforeAll(async () => {
    await initDatabase();
    userStore.createGuestUser();
    try {
      db.executeSync(
        `INSERT OR IGNORE INTO users (id, username, email, is_new_user, created_at, updated_at)
         VALUES (?, ?, ?, 0, datetime('now'), datetime('now'))`,
        [TEST_USER, 'teststudent', 'teststudent@ustp.edu.ph'],
      );
    } catch {
      // Ignore
    }
  });

  beforeEach(() => {
    developerTestService.setDeveloperModeEnabled(true);
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    developerTestService.setDeveloperModeEnabled(false);
  });

  it('renders expanded Developer section with test triggers on ProfileScreen', async () => {
    const onRefresh = jest.fn();
    const screen = render(
      <ThemeProvider userId={TEST_USER}>
        <ProfileScreen
          userId={TEST_USER}
          refreshTrigger={0}
          onRefresh={onRefresh}
        />
      </ThemeProvider>,
    );

    // Verify Developer section header and triggers exist
    expect(screen.getByText('Developer')).toBeTruthy();
    expect(screen.getByText('Developer Testing Hub')).toBeTruthy();
    expect(screen.getByText('Simulate Incoming Call (Now)')).toBeTruthy();
    expect(screen.getByText('Schedule Native Alarm (in 5s)')).toBeTruthy();
    expect(screen.getByText('Force Cloud Sync Now')).toBeTruthy();
    expect(screen.getByText('Seed Sample Student Data')).toBeTruthy();

    screen.unmount();
  });

  it('triggers quick incoming call from ProfileScreen', async () => {
    const triggerSpy = jest
      .spyOn(developerTestService, 'triggerImmediateCall')
      .mockResolvedValue({ success: true, message: 'Dispatched', reminderId: 'call-1' });

    const screen = render(
      <ThemeProvider userId={TEST_USER}>
        <ProfileScreen
          userId={TEST_USER}
          refreshTrigger={0}
          onRefresh={jest.fn()}
        />
      </ThemeProvider>,
    );

    fireEvent.press(screen.getByText('Simulate Incoming Call (Now)'));

    await waitFor(() => {
      expect(triggerSpy).toHaveBeenCalledWith(TEST_USER, 'CS402 Capstone Progress Check');
    });

    triggerSpy.mockRestore();
    screen.unmount();
  });

  it('triggers quick 5s alarm from ProfileScreen', async () => {
    const alarmSpy = jest
      .spyOn(developerTestService, 'scheduleExactAlarmInSeconds')
      .mockResolvedValue({ success: true, message: 'Armed', reminderId: 'alarm-1' });

    const screen = render(
      <ThemeProvider userId={TEST_USER}>
        <ProfileScreen
          userId={TEST_USER}
          refreshTrigger={0}
          onRefresh={jest.fn()}
        />
      </ThemeProvider>,
    );

    fireEvent.press(screen.getByText('Schedule Native Alarm (in 5s)'));

    await waitFor(() => {
      expect(alarmSpy).toHaveBeenCalledWith(TEST_USER, 5, '5-Second Alarm Test');
    });

    alarmSpy.mockRestore();
    screen.unmount();
  });

  it('triggers quick student sample data seeding from ProfileScreen', async () => {
    const seedSpy = jest
      .spyOn(developerTestService, 'seedStudentSampleData')
      .mockResolvedValue({
        success: true,
        created: { tasks: 3, events: 3, timeBlocks: 1, reminders: 2, notes: 2, categories: 3 },
      });

    const onRefresh = jest.fn();
    const screen = render(
      <ThemeProvider userId={TEST_USER}>
        <ProfileScreen
          userId={TEST_USER}
          refreshTrigger={0}
          onRefresh={onRefresh}
        />
      </ThemeProvider>,
    );

    fireEvent.press(screen.getByText('Seed Sample Student Data'));

    await waitFor(() => {
      expect(seedSpy).toHaveBeenCalledWith(TEST_USER);
      expect(onRefresh).toHaveBeenCalled();
    });

    seedSpy.mockRestore();
    screen.unmount();
  });

  it('renders DeveloperModal and switches tabs seamlessly', async () => {
    const onClose = jest.fn();
    const onRefreshProfile = jest.fn();

    const modal = render(
      <ThemeProvider userId={TEST_USER}>
        <DeveloperModal
          visible={true}
          userId={TEST_USER}
          isGuest={false}
          onClose={onClose}
          onRefreshProfile={onRefreshProfile}
        />
      </ThemeProvider>,
    );

    // Initial Tab: Alarms & Calls
    expect(modal.getByText('Developer Tools')).toBeTruthy();
    expect(modal.getByText('Trigger Incoming Call Now')).toBeTruthy();
    expect(modal.getByText('Android Alarm Permissions')).toBeTruthy();

    // Switch to Sync & Cloud
    fireEvent.press(modal.getByText('Sync & Cloud'));
    expect(modal.getByText('Cloud Sync Control')).toBeTruthy();
    expect(modal.getByText('Force Full Sync Now')).toBeTruthy();

    // Switch to NLU & Voice
    fireEvent.press(modal.getByText('NLU & Voice'));
    expect(modal.getByText('NLU & Intent Playground')).toBeTruthy();
    expect(modal.getByText('Parse Intent')).toBeTruthy();

    // Switch to Data & DB
    fireEvent.press(modal.getByText('Data & DB'));
    expect(modal.getByText('Student Data Fixtures')).toBeTruthy();
    expect(modal.getByText('Seed Sample Student Data')).toBeTruthy();

    // Close button
    fireEvent.press(modal.getByLabelText('Close developer tools'));
    expect(onClose).toHaveBeenCalled();

    modal.unmount();
  });
});
