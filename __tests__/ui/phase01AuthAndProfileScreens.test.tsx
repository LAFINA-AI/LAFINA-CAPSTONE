import React from 'react';
import {
  render,
  fireEvent,
  waitFor,
  act,
  within,
} from '@testing-library/react-native';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {WelcomeScreen} from '../../src/ui/screens/WelcomeScreen';
import {OnboardingScreen} from '../../src/ui/screens/OnboardingScreen';
import {ProfileScreen} from '../../src/ui/screens/ProfileScreen';
import {developerTestService} from '../../src/ui/components/profile/developerTestService';
import {db, initDatabase, userStore} from '../../src/storage';
import {GUEST_USER_ID} from '../../src/constants';
import {chatMemoryStore} from '../../src/storage/chatMemoryStore';
import {parseUstpCor} from '../../src/ai/vision/ustpCorParser';
import {preferencesStore} from '../../src/storage/preferencesStore';
import {studentSetupStore} from '../../src/storage/studentSetupStore';
import {onboardingProgressStore} from '../../src/storage/onboardingProgressStore';
import {getUstpEligibility} from '../../src/storage/ustpEligibility';
import {replyPreferenceInstruction} from '../../src/ai/personalization';
import {enableUstpForTest} from '../fixtures/ustpEligibility';
import {
  NativeModules,
  Alert,
  BackHandler,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import RNFS from 'react-native-fs';
import {PreferencesSettingsScreen} from '../../src/ui/screens/PreferencesSettingsScreen';
import {
  setSelectedOfflineModelId,
  deleteOfflineModel,
  getSelectedOfflineModelId,
} from '../../src/ai/nlu';

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

  test('Android Back on the introduction returns to the previous page and from the source page (found on emulator)', () => {
    type BackListener = Parameters<typeof BackHandler.addEventListener>[1];
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
    const pressBack = (): boolean | null | undefined => {
      let handled: boolean | null | undefined;
      act(() => {
        handled = handlers[handlers.length - 1](
          {} as Parameters<BackListener>[0],
        );
      });
      return handled;
    };
    const ui = render(
      <ThemeProvider userId={null}>
        <WelcomeScreen
          onGetStarted={jest.fn()}
          onNavigateToLogin={jest.fn()}
          onNavigateToRegister={jest.fn()}
        />
      </ThemeProvider>,
    );
    fireEvent.press(ui.getByTestId('intro-continue'));
    fireEvent.press(ui.getByTestId('intro-continue'));
    fireEvent.press(ui.getByTestId('intro-handbook-citation'));
    expect(ui.getByText('USTP Student Handbook 2023 Edition')).toBeTruthy();
    expect(pressBack()).toBe(true);
    expect(ui.getByTestId('intro-page-2')).toBeTruthy();
    expect(pressBack()).toBe(true);
    expect(ui.getByTestId('intro-page-1')).toBeTruthy();
    expect(pressBack()).toBe(true);
    // On the first page, Back is left to Android (leave the app).
    expect(pressBack()).toBe(false);
    jest.restoreAllMocks();
  });

  test('WelcomeScreen introduction: real handbook citation, sign-in, create account and guest start without records', () => {
    const onGetStarted = jest.fn();
    const onNavigateToLogin = jest.fn();
    const onNavigateToRegister = jest.fn();

    const ui = render(
      <ThemeProvider userId={null}>
        <WelcomeScreen
          onGetStarted={onGetStarted}
          onNavigateToLogin={onNavigateToLogin}
          onNavigateToRegister={onNavigateToRegister}
        />
      </ThemeProvider>,
    );

    expect(ui.getByTestId('intro-page-0')).toBeTruthy();
    expect(ui.getByText(/Your academic day/)).toBeTruthy();
    fireEvent.press(ui.getByTestId('intro-continue'));
    expect(ui.getByText(/Say it\./)).toBeTruthy();
    fireEvent.press(ui.getByTestId('intro-continue'));
    // "Ask anything about USTP" quotes the bundled pack with its real citation.
    expect(ui.getByText(/Ask anything/)).toBeTruthy();
    expect(
      ui.getByText('Available to USTP students after COR setup.'),
    ).toBeTruthy();
    expect(
      ui.getByText(/2023 Handbook · Ch\. 14 · Art\. 1 · p\. 50/),
    ).toBeTruthy();
    fireEvent.press(ui.getByTestId('intro-handbook-citation'));
    expect(ui.getByText('USTP Student Handbook 2023 Edition')).toBeTruthy();
    expect(ui.getByText(/multiples of 0\.25 from 1 to 5/)).toBeTruthy();
    fireEvent.press(ui.getByTestId('intro-source-back'));

    fireEvent.press(ui.getByTestId('intro-sign-in'));
    expect(onNavigateToLogin).toHaveBeenCalledTimes(1);
    fireEvent.press(ui.getByTestId('intro-skip'));
    expect(ui.getByTestId('intro-page-3')).toBeTruthy();
    fireEvent.press(ui.getByTestId('intro-create-account'));
    expect(onNavigateToRegister).toHaveBeenCalledTimes(1);

    // The demos created nothing and asked for nothing.
    expect(
      db.executeSync('SELECT COUNT(*) AS n FROM time_blocks').rows?.[0]?.n,
    ).toBe(0);
    fireEvent.press(ui.getByText('Continue without an account'));
    expect(onGetStarted).toHaveBeenCalledWith(GUEST_USER_ID);
    expect(onboardingProgressStore.introSeen()).toBe(true);
  });

  test('scheduling-mode onboarding: 4-step AI + COR + permissions + finish saves preferences and memory', async () => {
    const guest = userStore.createGuestUser();
    chatMemoryStore.setEnabled(guest.id, true);
    const defaults = preferencesStore.get(guest.id);
    const onComplete = jest.fn();
    const ui = render(
      <ThemeProvider userId={guest.id}>
        <OnboardingScreen userId={guest.id} onOnboardingComplete={onComplete} />
      </ThemeProvider>,
    );

    // Intro in the flow (not seen yet on this phone), then skippable.
    fireEvent.press(ui.getByTestId('intro-skip'));

    // Step 1: offline AI chooser; user can continue right away without waiting.
    expect(ui.getByTestId('onboarding-ai')).toBeTruthy();
    fireEvent.press(ui.getByTestId('onboarding-continue'));

    // Step 2 is COR-first: no campus or program picker, no manual entry.
    expect(ui.getByText('Set up my USTP COR')).toBeTruthy();
    expect(ui.getByText("I'll add my COR later")).toBeTruthy();
    expect(ui.queryByText(/campus/i)).toBeNull();
    expect(ui.queryByPlaceholderText(/program/i)).toBeNull();
    fireEvent.press(ui.getByTestId('onboarding-not-ustp'));

    // Step 3: permissions prompt (can skip/continue without blocking).
    expect(ui.getByTestId('onboarding-permissions')).toBeTruthy();
    fireEvent.press(ui.getByTestId('onboarding-continue'));

    // Step 4: optional quick preferences on a single finish screen.
    fireEvent.changeText(ui.getByTestId('onboarding-name'), 'Alex');
    fireEvent.press(ui.getByTestId('onboarding-tone-casual'));
    fireEvent.press(ui.getByTestId('onboarding-lead-10'));
    fireEvent.press(ui.getByTestId('onboarding-finish'));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(onComplete).toHaveBeenCalledWith({
      startTour: false,
      goal: null,
    });
    expect(userStore.isOnboardingComplete(guest.id)).toBe(true);
    const setup = studentSetupStore.get(guest.id);
    expect(setup.affiliation).toBe('not_ustp');
    expect(setup.preferredName).toBe('Alex');
    expect(setup.tone).toBe('casual');
    expect(setup.explicit).toEqual(
      expect.arrayContaining(['name', 'tone', 'lead']),
    );
    expect(setup.explicit).not.toContain('routine');
    const prefs = preferencesStore.get(guest.id);
    expect(prefs.reminderLeadMinutes).toBe(10);
    expect(prefs.wakeTime).toBe(defaults.wakeTime);
    expect(getUstpEligibility(guest.id).eligible).toBe(false);
    const memories = chatMemoryStore.list(guest.id).map(m => m.text);
    expect(memories).toContain('Prefers to be called Alex.');
    expect(memories).toContain('Prefers a casual conversational tone.');
    expect(replyPreferenceInstruction(guest.id)).toMatch(/casual/i);
  });

  test('"add my COR later" keeps USTP pending; memory off still finishes cleanly', async () => {
    const guest = userStore.createGuestUser();
    onboardingProgressStore.markIntroSeen();
    const memoriesBefore = chatMemoryStore.list(guest.id);
    const onComplete = jest.fn();
    const ui = render(
      <ThemeProvider userId={guest.id}>
        <OnboardingScreen userId={guest.id} onOnboardingComplete={onComplete} />
      </ThemeProvider>,
    );
    fireEvent.press(ui.getByTestId('onboarding-continue'));
    fireEvent.press(ui.getByTestId('onboarding-cor-later'));
    fireEvent.press(ui.getByTestId('onboarding-continue'));
    const setup = studentSetupStore.get(guest.id);
    expect(setup.affiliation).toBe('ustp');
    expect(setup.corStatus).toBe('pending');
    expect(getUstpEligibility(guest.id)).toMatchObject({
      eligible: false,
      reason: 'cor_pending',
    });
    fireEvent.press(ui.getByTestId('onboarding-memory-toggle'));
    fireEvent.press(ui.getByTestId('onboarding-finish-tour'));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(onComplete).toHaveBeenCalledWith({startTour: true, goal: null});
    expect(chatMemoryStore.isEnabled(guest.id)).toBe(false);
    // Nothing new was remembered.
    expect(chatMemoryStore.list(guest.id)).toEqual(memoriesBefore);
    expect(studentSetupStore.get(guest.id).explicit).toEqual([]);
  });

  test('Back and restarts keep onboarding answers', () => {
    const guest = userStore.createGuestUser();
    onboardingProgressStore.markIntroSeen();
    const first = render(
      <ThemeProvider userId={guest.id}>
        <OnboardingScreen userId={guest.id} onOnboardingComplete={jest.fn()} />
      </ThemeProvider>,
    );
    fireEvent.press(first.getByTestId('onboarding-continue'));
    fireEvent.press(first.getByTestId('onboarding-not-ustp'));
    fireEvent.press(first.getByTestId('onboarding-continue'));
    fireEvent.changeText(first.getByTestId('onboarding-name'), 'Rin');
    fireEvent.press(first.getByTestId('onboarding-back'));
    expect(first.getByTestId('onboarding-permissions')).toBeTruthy();
    first.unmount();

    const again = render(
      <ThemeProvider userId={guest.id}>
        <OnboardingScreen userId={guest.id} onOnboardingComplete={jest.fn()} />
      </ThemeProvider>,
    );
    fireEvent.press(again.getByTestId('onboarding-continue'));
    expect(again.getByTestId('onboarding-name').props.value).toBe('Rin');
  });

  test('choosing "Set up my USTP COR" opens the review; leaving it keeps the COR pending', async () => {
    const guest = userStore.createGuestUser();
    onboardingProgressStore.markIntroSeen();
    const ui = render(
      <ThemeProvider userId={guest.id}>
        <OnboardingScreen userId={guest.id} onOnboardingComplete={jest.fn()} />
      </ThemeProvider>,
    );
    fireEvent.press(ui.getByTestId('onboarding-continue'));
    fireEvent.press(ui.getByTestId('onboarding-setup-cor'));
    expect(ui.getByTestId('cor-start')).toBeTruthy();
    expect(ui.getByText(/not official USTP verification/)).toBeTruthy();
    fireEvent.press(ui.getByTestId('cor-later'));
    expect(studentSetupStore.get(guest.id)).toMatchObject({
      affiliation: 'ustp',
      corStatus: 'pending',
    });
    expect(ui.getByTestId('onboarding-permissions')).toBeTruthy();
    fireEvent.press(ui.getByTestId('onboarding-continue'));
    expect(ui.getByTestId('onboarding-ready')).toBeTruthy();
  });

  test('onboarding permissions step prompts for notifications, alarms, full-screen calls and microphone', async () => {
    const originalPlatformOS = Platform.OS;
    const originalReminderModule = NativeModules.LafinaReminder;
    let notificationsGranted = false;
    let micGranted = false;
    const openExactAlarmSettings = jest.fn(async () => true);
    const openFullScreenIntentSettings = jest.fn(async () => true);

    Platform.OS = 'android';
    NativeModules.LafinaReminder = {
      ...(originalReminderModule ?? {}),
      scheduleExactAlarm: jest.fn(async () => true),
      getPermissionStatus: jest.fn(async () => ({
        notificationsEnabled: notificationsGranted,
        canScheduleExactAlarms: false,
        canUseFullScreenIntent: false,
      })),
      openExactAlarmSettings,
      openFullScreenIntentSettings,
      openNotificationSettings: jest.fn(async () => true),
    };
    jest
      .spyOn(PermissionsAndroid, 'check')
      .mockImplementation(async permission => {
        if (permission === PermissionsAndroid.PERMISSIONS.RECORD_AUDIO) {
          return micGranted;
        }
        if (permission === PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS) {
          return notificationsGranted;
        }
        return false;
      });
    const requestSpy = jest
      .spyOn(PermissionsAndroid, 'request')
      .mockImplementation(async permission => {
        if (permission === PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS) {
          notificationsGranted = true;
        }
        if (permission === PermissionsAndroid.PERMISSIONS.RECORD_AUDIO) {
          micGranted = true;
        }
        return PermissionsAndroid.RESULTS.GRANTED;
      });

    try {
      const guest = userStore.createGuestUser();
      onboardingProgressStore.markIntroSeen();
      const ui = render(
        <ThemeProvider userId={guest.id}>
          <OnboardingScreen
            userId={guest.id}
            onOnboardingComplete={jest.fn()}
          />
        </ThemeProvider>,
      );
      fireEvent.press(ui.getByTestId('onboarding-continue'));
      fireEvent.press(ui.getByTestId('onboarding-cor-later'));

      expect(await ui.findByTestId('onboarding-permissions')).toBeTruthy();
      expect(ui.getByTestId('onboarding-perm-notifications')).toBeTruthy();
      expect(ui.getByTestId('onboarding-perm-alarms')).toBeTruthy();
      expect(ui.getByTestId('onboarding-perm-fullscreen')).toBeTruthy();
      expect(ui.getByTestId('onboarding-perm-mic')).toBeTruthy();

      fireEvent.press(ui.getByTestId('onboarding-perm-alarms-btn'));
      expect(openExactAlarmSettings).toHaveBeenCalledTimes(1);
      fireEvent.press(ui.getByTestId('onboarding-perm-fullscreen-btn'));
      expect(openFullScreenIntentSettings).toHaveBeenCalledTimes(1);

      fireEvent.press(await ui.findByTestId('onboarding-perm-allow-all'));
      await waitFor(() => {
        expect(requestSpy).toHaveBeenCalledWith(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        );
        expect(requestSpy).toHaveBeenCalledWith(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        );
        expect(ui.getAllByText('Allowed').length).toBeGreaterThanOrEqual(2);
      });

      fireEvent.press(ui.getByTestId('onboarding-continue'));
      expect(ui.getByTestId('onboarding-ready')).toBeTruthy();
    } finally {
      Platform.OS = originalPlatformOS;
      if (originalReminderModule === undefined) {
        delete NativeModules.LafinaReminder;
      } else {
        NativeModules.LafinaReminder = originalReminderModule;
      }
    }
  });

  test('onboarding offline AI chooser recommends a model and lets the user continue while downloading in the background', async () => {
    const rnfsMutable = RNFS as unknown as Record<string, unknown>;
    const originalPlatformOS = Platform.OS;
    const originalNativeExtractor = NativeModules.LafinaIntentExtractor;
    const mockFiles: Record<string, {size: number}> = {};
    const savedRnfsProps = {
      exists: rnfsMutable.exists,
      stat: rnfsMutable.stat,
      mkdir: rnfsMutable.mkdir,
      unlink: rnfsMutable.unlink,
      downloadFile: rnfsMutable.downloadFile,
      stopDownload: rnfsMutable.stopDownload,
      moveFile: rnfsMutable.moveFile,
    };

    let resolveDownload!: (res: {statusCode: number}) => void;
    let downloadTarget = '';
    const modelSize = 193_986_560;

    Platform.OS = 'android';
    NativeModules.LafinaIntentExtractor = {
      unloadModel: jest.fn(async () => true),
      isEngineAvailable: jest.fn(async () => true),
      getDeviceSpecs: jest.fn(async () => ({
        totalRamBytes: 3_900_000_000,
        availableRamBytes: 1_500_000_000,
        isLowRamDevice: false,
        isLowMemoryNow: false,
        cpuCores: 8,
        supports64Bit: true,
        primaryAbi: 'arm64-v8a',
        availableStorageBytes: 8_000_000_000,
        totalStorageBytes: 64_000_000_000,
        deviceLabel: 'Redmi Note Test',
        androidSdk: 34,
      })),
    };
    rnfsMutable.exists = jest.fn(async (filePath: string) =>
      Boolean(mockFiles[filePath]),
    );
    rnfsMutable.stat = jest.fn(async (filePath: string) => {
      if (!mockFiles[filePath]) throw new Error('File does not exist');
      return {size: mockFiles[filePath].size};
    });
    rnfsMutable.mkdir = jest.fn(async () => undefined);
    rnfsMutable.unlink = jest.fn(async (filePath: string) => {
      delete mockFiles[filePath];
    });
    rnfsMutable.moveFile = jest.fn(async (from: string, to: string) => {
      mockFiles[to] = mockFiles[from] || {size: modelSize};
      delete mockFiles[from];
    });
    rnfsMutable.stopDownload = jest.fn();
    rnfsMutable.downloadFile = jest.fn(
      ({
        toFile,
        progress,
      }: {
        toFile: string;
        progress?: (res: {bytesWritten: number; contentLength: number}) => void;
      }) => {
        downloadTarget = toFile;
        if (progress) {
          progress({
            bytesWritten: Math.round(modelSize * 0.4),
            contentLength: modelSize,
          });
        }
        return {
          jobId: 777,
          promise: new Promise<{statusCode: number}>(resolve => {
            resolveDownload = res => {
              mockFiles[toFile] = {size: modelSize};
              resolve(res);
            };
          }),
        };
      },
    );

    try {
      const guest = userStore.createGuestUser();
      onboardingProgressStore.markIntroSeen();
      const ui = render(
        <ThemeProvider userId={guest.id}>
          <OnboardingScreen
            userId={guest.id}
            onOnboardingComplete={jest.fn()}
          />
        </ThemeProvider>,
      );

      await waitFor(() => {
        expect(ui.getByTestId('onboarding-ai-recommendation')).toBeTruthy();
        expect(ui.getByTestId('onboarding-ai-download-continue')).toBeTruthy();
      });

      // Recommended for 4 GB RAM device is Gemma 3 270M.
      expect(ui.getByText(/Recommended: Gemma-3-270M-Instruct/)).toBeTruthy();

      // Tapping "Download Gemma 3 270M & continue" starts the download AND moves immediately to COR step!
      fireEvent.press(ui.getByTestId('onboarding-ai-download-continue'));
      expect(ui.getByTestId('onboarding-setup-cor')).toBeTruthy();

      // Progress banner is visible while the user goes through COR / finishes onboarding.
      await waitFor(() => {
        expect(ui.getByTestId('onboarding-cor-ai-downloading')).toBeTruthy();
      });

      fireEvent.press(ui.getByTestId('onboarding-cor-later'));
      expect(ui.getByTestId('onboarding-permissions')).toBeTruthy();
      expect(ui.getByTestId('onboarding-perm-ai-downloading')).toBeTruthy();
      fireEvent.press(ui.getByTestId('onboarding-continue'));
      expect(ui.getByTestId('onboarding-ready')).toBeTruthy();
      expect(ui.getByTestId('onboarding-finish-ai-status')).toBeTruthy();
      expect(ui.getByText(/Downloading 40%/)).toBeTruthy();

      // Finish the download while on the final screen -> shows Ready and active model is selected.
      expect(downloadTarget).toContain('gemma-3-270m');
      await act(async () => {
        resolveDownload({statusCode: 200});
      });

      await waitFor(() => {
        expect(getSelectedOfflineModelId(guest.id)).toBe('gemma-3-270m');
        expect(ui.getByText(/Gemma 3 270M · Ready/)).toBeTruthy();
      });
      ui.unmount();
    } finally {
      await deleteOfflineModel('gemma-3-270m', GUEST_USER_ID);
      setSelectedOfflineModelId('qwen2.5-0.5b', GUEST_USER_ID);
      Platform.OS = originalPlatformOS;
      if (originalNativeExtractor === undefined) {
        delete NativeModules.LafinaIntentExtractor;
      } else {
        NativeModules.LafinaIntentExtractor = originalNativeExtractor;
      }
      for (const [key, originalValue] of Object.entries(savedRnfsProps)) {
        if (originalValue === undefined) {
          delete rnfsMutable[key];
        } else {
          rnfsMutable[key] = originalValue;
        }
      }
    }
  });

  test('ProfileScreen displays USTP COR Academic Profile details cleanly without header overlap or shouting uppercase', () => {
    const guest = userStore.createGuestUser();
    const cor = parseUstpCor(SAMPLE_COR_TEXT);
    enableUstpForTest(guest.id, {
      ...cor.profile,
      courses: cor.courses.map(c => ({
        code: c.code,
        subjectTitle: c.subjectTitle,
        lecUnits: c.lecUnits,
        labUnits: c.labUnits,
        creditUnits: c.creditUnits,
        section: c.section,
        faculty: c.faculty,
        scheduleSummary: c.scheduleSummary,
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

    expect(ui.getByText('Offline Guest Account')).toBeTruthy();
    const heroSubtitle = ui.getByTestId('profile-academic-subtitle');
    expect(within(heroSubtitle).getByText('CITC')).toBeTruthy();
    expect(within(heroSubtitle).getByText('4th Year')).toBeTruthy();
    expect(within(heroSubtitle).getByText('IT4R11_Track2')).toBeTruthy();
    expect(ui.getByTestId('profile-academic-card')).toBeTruthy();
    expect(ui.getByText('Academic Profile')).toBeTruthy();
    expect(ui.getByText('Reviewed USTP COR')).toBeTruthy();
    expect(ui.getByText('USTP · COR confirmed')).toBeTruthy();
    expect(ui.getByTestId('profile-attach-cor-btn')).toBeTruthy();
    expect(ui.getByText('B.S. in Information Technology')).toBeTruthy();
    expect(ui.getByText('4th Year - Baccalaureate')).toBeTruthy();
    expect(
      ui.getByText('CITC — College of Information Technology and Computing'),
    ).toBeTruthy();
    expect(ui.queryByText(/COLLEGE OF INFORMATION/)).toBeNull();
    expect(ui.getByText('Academic Term')).toBeTruthy();
    expect(ui.getByText('1st Semester AY 2026-2027')).toBeTruthy();
    expect(ui.getByText('Curriculum')).toBeTruthy();
    expect(ui.getByText('CITC-BSIT-2018-2019')).toBeTruthy();
    // The student number is not shown (academic memory and profile keep no IDs).
    expect(ui.queryByText('Student No.')).toBeNull();

    // Enrolled subjects list expands and collapses when tapped
    expect(ui.queryByTestId('profile-academic-subjects-list')).toBeNull();
    fireEvent.press(ui.getByTestId('profile-toggle-subjects-btn'));
    expect(ui.getByTestId('profile-academic-subjects-list')).toBeTruthy();
    expect(ui.getByText(/IT Elective 3/)).toBeTruthy();
    expect(ui.getByText(/CAPSTONE Project and Research 2/)).toBeTruthy();
    fireEvent.press(ui.getByTestId('profile-toggle-subjects-btn'));
    expect(ui.queryByTestId('profile-academic-subjects-list')).toBeNull();
  });

  test('ProfileScreen uses singular subject label when only 1 subject is saved', () => {
    const guest = userStore.createGuestUser();
    enableUstpForTest(guest.id, {
      campus: 'USTP CDO Campus',
      registrationNo: '111',
      studentNo: '2024300617',
      fullName: 'BLANCO, NOEL JHUMEL G',
      formattedName: 'Noel Jhumel G. Blanco',
      preferredName: 'Noel Jhumel',
      gender: 'M',
      age: 20,
      nationality: 'Filipino',
      college: 'COLLEGE OF INFORMATION TECHNOLOGY AND COMPUTING',
      collegeShort: 'CITC',
      program: 'B.S. in Information Technology',
      major: 'N/A',
      yearLevel: '2nd Year - Baccalaureate',
      yearLevelShort: '2nd Year',
      curriculum: 'CITOC-BSIT-2018-2019',
      academicTerm: '1st Semester AY 2024-2025',
      academicYearTerm: '1st Semester AY 2024-2025',
      section: 'IT2R13',
      primarySection: 'IT2R13',
      totalUnits: '3',
      totalLecUnits: 2,
      totalLabUnits: 1,
      totalCreditUnits: 3,
      courses: [
        {
          code: 'IT211',
          subjectTitle: 'Human Computer Interaction',
          lecUnits: 2,
          labUnits: 1,
          creditUnits: 3,
          section: 'IT2R13',
          faculty: 'Jane Doe',
          scheduleSummary: 'Mon 8:00 AM–10:00 AM (09-301)',
        },
      ],
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

    expect(ui.getByText('1 subject (3 units)')).toBeTruthy();
  });

  test('developer settings expose onboarding replay in debug builds', () => {
    const guest = userStore.createGuestUser();
    const modules = NativeModules as Record<string, unknown>;
    const original = modules.CapstoneBuild;
    modules.CapstoneBuild = {backendSwitchEnabled: true};
    developerTestService.setDeveloperModeEnabled(true);
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
      developerTestService.setDeveloperModeEnabled(false);
      modules.CapstoneBuild = original;
    }
  });

  test('canceling an onboarding replay preserves existing memories', () => {
    const guest = userStore.createGuestUser();
    const prior = chatMemoryStore.list(guest.id).map(m => m.text);
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
    fireEvent.press(ui.getByLabelText('Cancel replay'));
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(chatMemoryStore.list(guest.id).map(m => m.text)).toEqual(prior);
  });

  test('ProfileScreen renders guest profile banner and settings items', () => {
    const guest = userStore.createGuestUser();
    const onLogout = jest.fn();
    const onNavigateToRegister = jest.fn();
    const onReplayTour = jest.fn();
    const onRefresh = jest.fn();

    const {getByText, queryByText} = render(
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
    expect(queryByText('App Interface')).toBeNull();
    expect(queryByText('Student Pro')).toBeNull();
  });

  test('ProfileScreen centers long display names symmetrically without Student Pro badge for student accounts', async () => {
    const uid = await userStore.register(
      'Maria Concepcion D. Villanueva-Reyes',
      'maria.villanueva@ustp.edu.ph',
      'StrongPass123!',
    );
    const ui = render(
      <ThemeProvider userId={uid}>
        <ProfileScreen
          userId={uid}
          refreshTrigger={0}
          onRefresh={jest.fn()}
          onLogout={jest.fn()}
        />
      </ThemeProvider>,
    );

    expect(ui.getByTestId('profile-display-name').props.children).toBe(
      'Maria Concepcion D. Villanueva-Reyes',
    );
    expect(ui.queryByTestId('student-pro-tag')).toBeNull();
    expect(ui.queryByText('Student Pro')).toBeNull();
    expect(ui.queryByText('App Interface')).toBeNull();
    expect(ui.getByLabelText('Dark Mode')).toBeTruthy();
  });

  describe('PreferencesSettingsScreen Curated Offline AI Model Presets', () => {
    const rnfsMutable = RNFS as unknown as Record<string, unknown>;
    const originalPlatformOS = Platform.OS;
    const originalNativeExtractor = NativeModules.LafinaIntentExtractor;
    let mockFiles: Record<string, {size: number}> = {};
    let savedRnfsProps: Record<string, unknown> = {};

    beforeEach(() => {
      mockFiles = {};
      savedRnfsProps = {
        exists: rnfsMutable.exists,
        stat: rnfsMutable.stat,
        mkdir: rnfsMutable.mkdir,
        unlink: rnfsMutable.unlink,
        downloadFile: rnfsMutable.downloadFile,
        stopDownload: rnfsMutable.stopDownload,
        moveFile: rnfsMutable.moveFile,
      };

      Platform.OS = 'android';
      NativeModules.LafinaIntentExtractor = {
        unloadModel: jest.fn(async () => true),
        isEngineAvailable: jest.fn(async () => true),
        getDeviceSpecs: jest.fn(async () => ({
          totalRamBytes: 3_900_000_000,
          availableRamBytes: 1_500_000_000,
          isLowRamDevice: false,
          isLowMemoryNow: false,
          cpuCores: 8,
          supports64Bit: true,
          primaryAbi: 'arm64-v8a',
          availableStorageBytes: 8_000_000_000,
          totalStorageBytes: 64_000_000_000,
          deviceLabel: 'Redmi Note Test',
          androidSdk: 34,
        })),
      };

      rnfsMutable.exists = jest.fn(async (filePath: string) =>
        Boolean(mockFiles[filePath]),
      );
      rnfsMutable.stat = jest.fn(async (filePath: string) => {
        if (!mockFiles[filePath]) {
          throw new Error('File does not exist');
        }
        return {size: mockFiles[filePath].size};
      });
      rnfsMutable.mkdir = jest.fn(async () => undefined);
      rnfsMutable.unlink = jest.fn(async (filePath: string) => {
        delete mockFiles[filePath];
      });
      rnfsMutable.downloadFile = jest.fn(
        ({
          toFile,
          progress,
        }: {
          toFile: string;
          progress?: (res: {
            bytesWritten: number;
            contentLength: number;
          }) => void;
        }) => {
          const mockSize = toFile.includes('gemma-3-1b')
            ? 845000000
            : toFile.includes('gemma-3-270m')
            ? 193986560
            : 397800000;
          if (progress) {
            progress({bytesWritten: mockSize, contentLength: mockSize});
          }
          return {
            jobId: 201,
            promise: Promise.resolve({statusCode: 200}).then(() => {
              mockFiles[toFile] = {size: mockSize};
              return {statusCode: 200};
            }),
          };
        },
      );
      rnfsMutable.stopDownload = jest.fn();
      rnfsMutable.moveFile = jest.fn(async (from: string, to: string) => {
        mockFiles[to] = mockFiles[from] || {size: 193986560};
        delete mockFiles[from];
      });
    });

    afterEach(async () => {
      await deleteOfflineModel('gemma-3-270m', GUEST_USER_ID);
      setSelectedOfflineModelId('qwen2.5-0.5b', GUEST_USER_ID);
      Platform.OS = originalPlatformOS;
      if (originalNativeExtractor === undefined) {
        delete NativeModules.LafinaIntentExtractor;
      } else {
        NativeModules.LafinaIntentExtractor = originalNativeExtractor;
      }

      for (const [key, originalValue] of Object.entries(savedRnfsProps)) {
        if (originalValue === undefined) {
          delete rnfsMutable[key];
        } else {
          rnfsMutable[key] = originalValue;
        }
      }
    });

    test('renders all 5 curated presets, downloads Gemma 3 270M, switches models, and deletes downloaded preset', async () => {
      const alertSpy = jest
        .spyOn(Alert, 'alert')
        .mockImplementation(() => undefined);
      const guest = userStore.createGuestUser();

      const ui = render(
        <ThemeProvider userId={guest.id}>
          <PreferencesSettingsScreen
            userId={guest.id}
            onBack={jest.fn()}
            onSaved={jest.fn()}
          />
        </ThemeProvider>,
      );

      await waitFor(() => {
        expect(ui.getByTestId('offline-ai-header-badge').props.children).toBe(
          'Fast-Path Only',
        );
        expect(ui.getByTestId('offline-ai-recommendation-card')).toBeTruthy();
      });

      expect(
        ui.getByTestId('offline-ai-device-specs').props.children,
      ).toContain('4 GB RAM');
      expect(
        ui.getByTestId('offline-model-recommended-gemma-3-270m'),
      ).toBeTruthy();
      expect(
        ui.getByTestId('offline-model-compat-gemma-3-1b').props.children.props
          .children,
      ).toContain('6GB+ RAM');

      expect(ui.getByTestId('offline-model-card-fast_path_only')).toBeTruthy();
      expect(ui.getByTestId('offline-model-card-smollm2-135m')).toBeTruthy();
      expect(ui.getByTestId('offline-model-card-gemma-3-270m')).toBeTruthy();
      expect(ui.getByTestId('offline-model-card-qwen2.5-0.5b')).toBeTruthy();
      expect(ui.getByTestId('offline-model-card-gemma-3-1b')).toBeTruthy();

      fireEvent.press(ui.getByTestId('offline-model-download-gemma-3-270m'));

      await waitFor(() => {
        expect(ui.getByTestId('offline-ai-header-badge').props.children).toBe(
          'Active: Gemma 3 270M',
        );
        expect(
          ui.getByTestId('offline-model-active-gemma-3-270m'),
        ).toBeTruthy();
      });

      expect(getSelectedOfflineModelId(guest.id)).toBe('gemma-3-270m');

      fireEvent.press(ui.getByTestId('offline-model-select-fast_path_only'));

      await waitFor(() => {
        expect(getSelectedOfflineModelId(guest.id)).toBe('fast_path_only');
        expect(ui.getByTestId('offline-ai-header-badge').props.children).toBe(
          'Fast-Path Only',
        );
        expect(
          ui.getByTestId('offline-model-select-gemma-3-270m'),
        ).toBeTruthy();
      });

      fireEvent.press(ui.getByTestId('offline-model-select-gemma-3-270m'));

      await waitFor(() => {
        expect(getSelectedOfflineModelId(guest.id)).toBe('gemma-3-270m');
        expect(ui.getByTestId('offline-ai-header-badge').props.children).toBe(
          'Active: Gemma 3 270M',
        );
        expect(
          ui.getByTestId('offline-model-active-gemma-3-270m'),
        ).toBeTruthy();
      });

      alertSpy.mockClear();
      fireEvent.press(ui.getByTestId('offline-model-delete-gemma-3-270m'));

      expect(alertSpy).toHaveBeenCalledWith(
        'Remove Offline AI Model',
        expect.stringContaining('Gemma-3-270M-Instruct'),
        expect.any(Array),
      );

      const buttons = alertSpy.mock.calls[0][2] as
        | Array<{text?: string; onPress?: () => void | Promise<void>}>
        | undefined;
      const deleteButton = buttons?.find(btn => btn.text === 'Delete');
      expect(deleteButton).toBeTruthy();
      await act(async () => {
        await deleteButton?.onPress?.();
      });

      await waitFor(() => {
        expect(
          ui.getByTestId('offline-model-download-gemma-3-270m'),
        ).toBeTruthy();
        expect(ui.getByTestId('offline-ai-header-badge').props.children).toBe(
          'Fast-Path Only',
        );
      });

      ui.unmount();
    });
  });
});
