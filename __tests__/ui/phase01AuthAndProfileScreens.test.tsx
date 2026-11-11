import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '../../src/ui/contexts/ThemeContext';
import { WelcomeScreen } from '../../src/ui/screens/WelcomeScreen';
import { OnboardingScreen } from '../../src/ui/screens/OnboardingScreen';
import { ProfileScreen } from '../../src/ui/screens/ProfileScreen';
import {
  db,
  initDatabase,
  userStore,
  academicProfileStore,
  timeBlocksStore,
} from '../../src/storage';
import { GUEST_USER_ID } from '../../src/constants';
import { chatMemoryStore } from '../../src/storage/chatMemoryStore';
import { visionService } from '../../src/ai/vision/visionService';
import { parseUstpCor } from '../../src/ai/vision/ustpCorParser';
import { NativeModules } from 'react-native';

const SAMPLE_COR_TEXT = `
Registration No: 556711 Academic Year/Term : 1st Semester AY 2026-2027
STUDENT GENERAL INFORMATION
Student No: 2023305519 College: COLLEGE OF INFORMATION TECHNOLOGY AND COMPUTING
Name: GONZALES, JOHN LEMAR L Program: B.S. in Information Technology
Gender: M Nationality: Filipino Major: N/A Curriculum: CITC-BSIT-2018-2019
Age: 22 Contact #: Year Level: 4th Year - Baccalaureate Scholarship/Discount:
Address: BLOCK 6, LOT 1 TIBASAK, MACASANDIG, CAGAYAN DE ORO CITY
CODE SUBJECT TITLE U N I T Lec Lab Credit SECTION SCHEDULE/ROOM FACULTY
IT414 IT Elective 3 2 1 3 IT4R11_Track2 F 7:00 AM - 10:00 AM/09-302(CITC Lab 3) Loredel Tamayo
W 7:00 AM - 9:00 AM/51-201 Loredel Tamayo
IT411 CAPSTONE Project and Research 2 2 1 3 IT411_Rojo JAY NOEL ROJO
GnS Gender and Society 3 0 3 IT4R11_Track2 TF 1:00 PM - 2:30 PM Anton Alfred Endaya
Total Unit(s) 8 2 10
ASSESSSED FEES
`;

describe('Phase 01 Welcome, Onboarding, and Profile Screens', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    jest.restoreAllMocks();
    db.executeSync('DELETE FROM active_session');
    db.executeSync('DELETE FROM user_preferences');
    db.executeSync('DELETE FROM time_blocks');
    db.executeSync('DELETE FROM local_settings');
    db.executeSync('DELETE FROM users');
  });

  test('WelcomeScreen starts guest session on Get Started Free and navigates to Login/Register', () => {
    const onGetStarted = jest.fn();
    const onNavigateToLogin = jest.fn();
    const onNavigateToRegister = jest.fn();

    const { getByText } = render(
      <ThemeProvider userId={null}>
        <WelcomeScreen
          onGetStarted={onGetStarted}
          onNavigateToLogin={onNavigateToLogin}
          onNavigateToRegister={onNavigateToRegister}
        />
      </ThemeProvider>,
    );

    fireEvent.press(getByText('Get Started Free'));
    expect(onGetStarted).toHaveBeenCalledWith(GUEST_USER_ID);

    fireEvent.press(getByText('Log In'));
    expect(onNavigateToLogin).toHaveBeenCalledTimes(1);

    fireEvent.press(getByText('Create Account'));
    expect(onNavigateToRegister).toHaveBeenCalledTimes(1);
  });

  test('OnboardingScreen steps through 6 steps and marks onboarding complete', async () => {
    const guest = userStore.createGuestUser();
    const onComplete = jest.fn();

    const { getByText } = render(
      <ThemeProvider userId={guest.id}>
        <OnboardingScreen
          userId={guest.id}
          onOnboardingComplete={onComplete}
        />
      </ThemeProvider>,
    );

    for (let i = 0; i < 5; i += 1) {
      fireEvent.press(getByText('Continue'));
    }
    fireEvent.press(getByText('Get Started'));

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
    expect(userStore.isOnboardingComplete(guest.id)).toBe(true);
  });

  test('onboarding saves optional name and conversation style as memories', async () => {
    const guest = userStore.createGuestUser();
    chatMemoryStore.setEnabled(guest.id, true);
    const onComplete = jest.fn();
    const ui = render(
      <ThemeProvider userId={guest.id}>
        <OnboardingScreen userId={guest.id} onOnboardingComplete={onComplete} />
      </ThemeProvider>,
    );
    for (let i = 0; i < 4; i += 1) fireEvent.press(ui.getByText('Continue'));
    fireEvent.changeText(ui.getByTestId('onboarding-preferred-name'), 'Alex');
    fireEvent.press(ui.getByTestId('onboarding-tone-casual'));
    fireEvent.press(ui.getByText('Continue'));
    fireEvent.press(ui.getByText('Get Started'));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    const values = chatMemoryStore.list(guest.id).map((m) => m.text);
    expect(values).toContain('Prefers to be called Alex.');
    expect(values).toContain('Prefers a casual conversational tone.');
  });

  test('OnboardingScreen USTP Student flow attaches COR PDF, auto-fills preferences, updates profile name, schedules classes, and saves COR memories', async () => {
    const guest = userStore.createGuestUser();
    chatMemoryStore.setEnabled(guest.id, true);
    const onComplete = jest.fn();

    jest.spyOn(visionService, 'pickCorDocument').mockResolvedValue({
      uri: 'content://com.ustp/cor-ustp.pdf',
      fileName: 'cor-ustp.pdf',
      mimeType: 'application/pdf',
    });
    jest
      .spyOn(visionService, 'scanUstpCorFromUri')
      .mockResolvedValue(parseUstpCor(SAMPLE_COR_TEXT));

    const ui = render(
      <ThemeProvider userId={guest.id}>
        <OnboardingScreen userId={guest.id} onOnboardingComplete={onComplete} />
      </ThemeProvider>,
    );

    // Step 1: Select "Yes, USTP Student" and attach COR
    fireEvent.press(ui.getByTestId('onboarding-ustp-yes'));
    fireEvent.press(ui.getByTestId('onboarding-attach-cor'));

    await waitFor(() => {
      expect(ui.getByTestId('onboarding-cor-preview')).toBeTruthy();
    });
    expect(ui.getByText(/John Lemar L\. Gonzales/)).toBeTruthy();

    // Advance through steps 1 -> 6 and finish
    for (let i = 0; i < 5; i += 1) {
      fireEvent.press(ui.getByText('Continue'));
    }
    fireEvent.press(ui.getByText('Get Started'));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));

    // Verify user display name updated to COR name
    expect(userStore.getUserById(guest.id)?.username).toBe(
      'John Lemar L. Gonzales',
    );

    // Verify academic profile saved
    const savedProfile = academicProfileStore.get(guest.id);
    expect(savedProfile?.studentNo).toBe('2023305519');
    expect(savedProfile?.program).toBe('B.S. in Information Technology');
    expect(savedProfile?.yearLevel).toBe('4th Year - Baccalaureate');

    // Verify recurring schedule persisted in timeBlocksStore (F + W + T + F = 4 blocks)
    const blocks = timeBlocksStore.getAll(guest.id);
    expect(blocks.length).toBe(4);
    expect(blocks.some((b) => b.title === 'IT414 · IT Elective 3')).toBe(true);

    // Verify memories saved
    const memories = chatMemoryStore.list(guest.id).map((m) => m.text);
    expect(memories).toContain('Prefers to be called John Lemar.');
    expect(memories.some((m) => m.includes('2023305519'))).toBe(true);
  });

  test('OnboardingScreen Non-USTP Student flow prompts to upload schedule image or skip', async () => {
    const guest = userStore.createGuestUser();
    const onComplete = jest.fn();

    const ui = render(
      <ThemeProvider userId={guest.id}>
        <OnboardingScreen userId={guest.id} onOnboardingComplete={onComplete} />
      </ThemeProvider>,
    );

    fireEvent.press(ui.getByTestId('onboarding-ustp-no'));
    expect(ui.getByTestId('onboarding-scan-schedule-image')).toBeTruthy();
    expect(ui.getByTestId('onboarding-scan-schedule-camera')).toBeTruthy();

    // User can skip and continue normally
    for (let i = 0; i < 5; i += 1) {
      fireEvent.press(ui.getByText('Continue'));
    }
    fireEvent.press(ui.getByText('Get Started'));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  });

  test('ProfileScreen displays USTP COR Academic Profile details when saved', () => {
    const guest = userStore.createGuestUser();
    const cor = parseUstpCor(SAMPLE_COR_TEXT);
    academicProfileStore.save(guest.id, {
      ...cor.profile,
      isUstpStudent: true,
      courses: cor.courses.map((c) => ({
        code: c.code,
        subjectTitle: c.subjectTitle,
        lecUnits: c.lecUnits,
        labUnits: c.labUnits,
        creditUnits: c.creditUnits,
        section: c.section,
        faculty: c.faculty,
        scheduleSummary: 'TBA',
      })),
    });

    const ui = render(
      <ThemeProvider userId={guest.id}>
        <ProfileScreen
          userId={guest.id}
          refreshTrigger={0}
          onRefresh={jest.fn()}
          onLogout={jest.fn()}
        />
      </ThemeProvider>,
    );

    expect(ui.getByText(/John Lemar L\. Gonzales/)).toBeTruthy();
    expect(ui.getByTestId('profile-academic-card')).toBeTruthy();
    expect(ui.getByText('B.S. in Information Technology')).toBeTruthy();
    expect(ui.getByText('4th Year - Baccalaureate')).toBeTruthy();
    expect(ui.getAllByText('2023305519').length).toBeGreaterThanOrEqual(1);
  });

  test('developer settings expose onboarding replay in debug builds', () => {
    const guest = userStore.createGuestUser();
    const modules = NativeModules as Record<string, unknown>;
    const original = modules.CapstoneBuild;
    modules.CapstoneBuild = { backendSwitchEnabled: true };
    const onReplayOnboarding = jest.fn();
    try {
      const ui = render(
        <ThemeProvider userId={guest.id}>
          <ProfileScreen
            userId={guest.id}
            refreshTrigger={0}
            onRefresh={() => undefined}
            onReplayOnboarding={onReplayOnboarding}
          />
        </ThemeProvider>,
      );
      fireEvent.press(ui.getByText('Replay onboarding'));
      expect(onReplayOnboarding).toHaveBeenCalledTimes(1);
      ui.unmount();
    } finally {
      modules.CapstoneBuild = original;
    }
  });

  test('canceling an onboarding replay preserves existing memories', () => {
    const guest = userStore.createGuestUser();
    const prior = chatMemoryStore.list(guest.id).map((m) => m.text);
    const cancel = jest.fn();
    const ui = render(
      <ThemeProvider userId={guest.id}>
        <OnboardingScreen
          userId={guest.id}
          onOnboardingComplete={() => undefined}
          onCancel={cancel}
        />
      </ThemeProvider>,
    );
    fireEvent.press(ui.getByText('Cancel replay'));
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(chatMemoryStore.list(guest.id).map((m) => m.text)).toEqual(prior);
  });

  test('ProfileScreen renders guest profile banner and settings items', () => {
    const guest = userStore.createGuestUser();
    const onLogout = jest.fn();
    const onNavigateToRegister = jest.fn();
    const onReplayTour = jest.fn();
    const onRefresh = jest.fn();

    const { getByText, queryByText } = render(
      <ThemeProvider userId={guest.id}>
        <ProfileScreen
          userId={guest.id}
          refreshTrigger={0}
          onRefresh={onRefresh}
          onLogout={onLogout}
          onNavigateToRegister={onNavigateToRegister}
          onReplayTour={onReplayTour}
        />
      </ThemeProvider>,
    );

    expect(getByText('Guest User')).toBeTruthy();
    expect(queryByText('24-Hour Time Format')).toBeNull();
    expect(userStore.get24HourFormat(guest.id)).toBe(false);
    expect(getByText('Week Starts on Monday')).toBeTruthy();
    expect(getByText('Dark Mode')).toBeTruthy();
    expect(getByText('Test TTS Voice')).toBeTruthy();
  });
});
