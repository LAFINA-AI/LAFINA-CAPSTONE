import React from 'react';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import {
  Animated,
  AppState,
  NativeModules,
  Text,
  TouchableOpacity,
} from 'react-native';
import {ThemeProvider, useTheme} from '../../src/ui/contexts/ThemeContext';
import {LoginScreen} from '../../src/ui/screens/LoginScreen';
import {RegisterScreen} from '../../src/ui/screens/RegisterScreen';
import {AppUpdatePrompt} from '../../src/ui/components/updates/AppUpdatePrompt';
import {CallWaveform} from '../../src/ui/components/callLafina/CallWaveform';
import {SummarizerSkill} from '../../src/ui/screens/skills/SummarizerSkill';
import {useCommandReview} from '../../src/ui/hooks/useCommandReview';
import {
  endReviewSession,
  prepareReviewedCommand,
} from '../../src/ai/nlu/commandReview';
import {parseIntentFastPath} from '../../src/ai/nlu/fastPathParser';
import {validateIntent} from '../../src/ai/nlu/types';
import {chatOrchestrator} from '../../src/ai/chatOrchestrator';
import {accountLinkService} from '../../src/cloud/accountLinkService';
import {
  localSettingsStore,
  db,
  initDatabase,
  userStore,
} from '../../src/storage';
import * as themeReveal from '../../src/ui/theme/themeReveal';
import type {UpdateService, UpdateState} from '../../src/updates';

let seq = 0;
const createStudent = (prefix: string): string => {
  seq += 1;
  const id = `c3_${prefix}_${seq}`;
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT OR IGNORE INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
     VALUES (?, ?, ?, 'student', 0, 0, 0, 0, ?, ?)`,
    [id, id, `${id}@example.invalid`, now, now],
  );
  return id;
};

beforeAll(async () => {
  await initDatabase();
  userStore.createGuestUser();
});

afterEach(() => {
  jest.restoreAllMocks();
  endReviewSession();
  delete (NativeModules as Record<string, unknown>).LafinaThemeReveal;
});

describe('Cycle 3 UI performance & reliability audit fixes', () => {
  test('C3-01: ThemeContext unlocks capturingRef on captureForReveal rejection and skips stale writes on unmount', async () => {
    const userId = createStudent('theme');
    jest.spyOn(themeReveal, 'isThemeRevealAvailable').mockReturnValue(true);
    const captureSpy = jest
      .spyOn(themeReveal, 'captureForReveal')
      .mockRejectedValueOnce(new Error('native snapshot failed'))
      .mockResolvedValueOnce(true);
    const setDarkSpy = jest.spyOn(userStore, 'setDarkModeEnabled');

    const ToggleProbe: React.FC = () => {
      const {isDarkMode, toggleTheme} = useTheme();
      return (
        <TouchableOpacity
          testID="toggle-theme"
          onPress={() => toggleTheme({x: 10, y: 10})}
        >
          <Text testID="theme-state">{isDarkMode ? 'dark' : 'light'}</Text>
        </TouchableOpacity>
      );
    };

    const utils = render(
      <ThemeProvider userId={userId}>
        <ToggleProbe />
      </ThemeProvider>,
    );

    expect(utils.getByTestId('theme-state').props.children).toBe('light');

    // First toggle rejects in captureForReveal — must still flip and unlock!
    fireEvent.press(utils.getByTestId('toggle-theme'));
    await waitFor(() =>
      expect(utils.getByTestId('theme-state').props.children).toBe('dark'),
    );
    expect(setDarkSpy).toHaveBeenCalledWith(userId, true);

    // Second toggle must NOT be permanently blocked by capturingRef.
    fireEvent.press(utils.getByTestId('toggle-theme'));
    await waitFor(() =>
      expect(utils.getByTestId('theme-state').props.children).toBe('light'),
    );
    expect(captureSpy).toHaveBeenCalledTimes(2);
    expect(setDarkSpy).toHaveBeenCalledWith(userId, false);

    // Third toggle resolves AFTER unmount — must not write to userStore.
    let resolveLate!: (v: boolean) => void;
    captureSpy.mockImplementationOnce(
      () =>
        new Promise<boolean>(resolve => {
          resolveLate = resolve;
        }),
    );
    setDarkSpy.mockClear();
    fireEvent.press(utils.getByTestId('toggle-theme'));
    utils.unmount();
    await act(async () => {
      resolveLate(true);
      await Promise.resolve();
    });
    expect(setDarkSpy).not.toHaveBeenCalled();
  });

  test('C3-05: LoginScreen prevents same-frame double submit and ignores post-unmount success', async () => {
    let resolveLogin!: (value: {
      status: 'success';
      localUserId: string;
      message: string;
    }) => void;
    const loginSpy = jest.spyOn(accountLinkService, 'login').mockImplementation(
      () =>
        new Promise(resolve => {
          resolveLogin = resolve as never;
        }),
    );
    const onSuccess = jest.fn();

    const utils = render(
      <ThemeProvider userId={null}>
        <LoginScreen
          onLoginSuccess={onSuccess}
          onNavigateToRegister={() => undefined}
        />
      </ThemeProvider>,
    );

    fireEvent.changeText(
      utils.getByPlaceholderText('student@ustp.edu.ph'),
      'student@ustp.edu.ph',
    );
    fireEvent.changeText(utils.getByPlaceholderText('••••••••'), 'Password123');

    const btn = utils.getByTestId('login-submit-button');
    // Double-tap before React flushes loading state.
    fireEvent.press(btn);
    fireEvent.press(btn);
    expect(loginSpy).toHaveBeenCalledTimes(1);

    // Unmount while login is still in flight; late resolution must not call onLoginSuccess.
    utils.unmount();
    await act(async () => {
      resolveLogin({
        status: 'success',
        localUserId: 'late-user',
        message: 'ok',
      });
      await Promise.resolve();
    });
    expect(onSuccess).not.toHaveBeenCalled();
  });

  test('C3-05: RegisterScreen prevents same-frame double submit and ignores post-unmount success', async () => {
    let resolveReg!: (value: {
      status: 'success';
      localUserId: string;
      message: string;
    }) => void;
    const regSpy = jest
      .spyOn(accountLinkService, 'registerCloudFirst')
      .mockImplementation(
        () =>
          new Promise(resolve => {
            resolveReg = resolve as never;
          }),
      );
    const onSuccess = jest.fn();

    const utils = render(
      <ThemeProvider userId={null}>
        <RegisterScreen
          onRegisterSuccess={onSuccess}
          onNavigateToLogin={() => undefined}
        />
      </ThemeProvider>,
    );

    fireEvent.changeText(
      utils.getByPlaceholderText('What should LAFINA call you?'),
      'Alex Student',
    );
    fireEvent.changeText(
      utils.getByPlaceholderText('student@ustp.edu.ph'),
      'alex@ustp.edu.ph',
    );
    fireEvent.changeText(
      utils.getByPlaceholderText('Create a password'),
      'StrongPass123',
    );
    fireEvent.press(utils.getByTestId('register-terms-checkbox'));

    const btn = utils.getByTestId('register-submit-button');
    fireEvent.press(btn);
    fireEvent.press(btn);
    expect(regSpy).toHaveBeenCalledTimes(1);

    utils.unmount();
    await act(async () => {
      resolveReg({
        status: 'success',
        localUserId: 'late-reg-user',
        message: 'ok',
      });
      await Promise.resolve();
    });
    expect(onSuccess).not.toHaveBeenCalled();
  });

  test('C3-14: AppUpdatePrompt does not auto-download after unmount while check is pending', async () => {
    let resolveCheck!: (state: UpdateState) => void;
    const idleState: UpdateState = {
      phase: 'idle',
      currentVersion: '1.0.7',
      version: null,
      title: null,
      notes: null,
      percent: null,
      message: null,
      releaseUrl:
        'https://github.com/LAFINA-AI/LAFINA-CAPSTONE/releases/latest',
      kind: null,
      size: null,
      reason: null,
      checkedAt: null,
      installing: false,
    };
    const downloadSpy = jest.fn(async () => idleState);
    const fakeService: UpdateService = {
      getState: () => idleState,
      subscribe: () => () => undefined,
      check: jest.fn(
        () =>
          new Promise<UpdateState>(resolve => {
            resolveCheck = resolve;
          }),
      ),
      download: downloadSpy,
      retry: jest.fn(async () => idleState),
      cancel: jest.fn(),
      restart: jest.fn(async () => idleState),
      install: jest.fn(async () => 'installing' as const),
      canInstallApks: jest.fn(async () => true),
      openInstallPermissionSettings: jest.fn(async () => undefined),
      markLaunchSuccessful: jest.fn(async () => undefined),
    };

    const utils = render(
      <ThemeProvider userId={null}>
        <AppUpdatePrompt suppressed={false} service={fakeService} />
      </ThemeProvider>,
    );

    utils.unmount();
    await act(async () => {
      resolveCheck({
        ...idleState,
        phase: 'available',
        version: '9.9.9',
        title: 'v9.9.9',
        notes: 'Notes',
        kind: 'apk',
        size: 1024,
      });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(downloadSpy).not.toHaveBeenCalled();
  });

  test('C3-13: useCommandReview resolves confirm cleanly if unmounted mid-flight', async () => {
    const userId = createStudent('review');
    const prepared = prepareReviewedCommand(
      userId,
      validateIntent(parseIntentFastPath('Add task: Finish audit tomorrow')),
      {surface: 'chat'},
    );
    expect(prepared.status).toBe('proposal');

    let resolveConfirm!: (value: unknown) => void;
    jest.spyOn(chatOrchestrator, 'confirmReview').mockImplementation(
      () =>
        new Promise(resolve => {
          resolveConfirm = resolve;
        }) as never,
    );

    let confirmFn!: () => Promise<unknown>;
    const ReviewProbe: React.FC = () => {
      const review = useCommandReview(userId, 'chat');
      confirmFn = () => review.confirm();
      return <Text>{review.proposal?.title ?? 'none'}</Text>;
    };

    const utils = render(<ReviewProbe />);
    let pending!: Promise<unknown>;
    act(() => {
      pending = confirmFn();
    });
    utils.unmount();

    await act(async () => {
      resolveConfirm({
        reply: 'Saved',
        outcome: {status: 'applied', reply: 'Saved'},
      });
      const result = await pending;
      expect((result as {reply: string}).reply).toBe('Saved');
    });
  });

  test('C3-17: CallWaveform stops thinking animation loop when AppState backgrounds', () => {
    let appStateHandler: ((state: string) => void) | null = null;
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_event, handler) => {
        appStateHandler = handler as (state: string) => void;
        return {remove: jest.fn()};
      });
    const stopSpy = jest.fn();
    const startSpy = jest.fn();
    jest.spyOn(Animated, 'loop').mockReturnValue({
      start: startSpy,
      stop: stopSpy,
      reset: jest.fn(),
    });

    const utils = render(
      <ThemeProvider userId={null}>
        <CallWaveform
          phase="thinking"
          muted={false}
          micCapturing={false}
          userLevel={0}
          outputLevel={0}
        />
      </ThemeProvider>,
    );

    expect(startSpy).toHaveBeenCalledTimes(1);
    act(() => {
      appStateHandler?.('background');
    });
    expect(stopSpy).toHaveBeenCalled();

    act(() => {
      appStateHandler?.('active');
    });
    expect(startSpy).toHaveBeenCalledTimes(2);
    utils.unmount();
  });

  test('C3-15: SummarizerSkill resets prior user summary when userId switches', async () => {
    const userA = createStudent('sumA');
    const userB = createStudent('sumB');
    localSettingsStore.set(
      userA,
      'skills.summary.v1',
      JSON.stringify({
        text: 'Summary belonging exclusively to Student A',
        source: {text: 'Source A', label: 'Notes A'},
        length: 'Key points',
      }),
    );

    const utils = render(
      <ThemeProvider userId={userA}>
        <SummarizerSkill userId={userA} onFlashcards={() => undefined} />
      </ThemeProvider>,
    );

    expect(
      utils.getByText('Summary belonging exclusively to Student A'),
    ).toBeTruthy();

    utils.rerender(
      <ThemeProvider userId={userB}>
        <SummarizerSkill userId={userB} onFlashcards={() => undefined} />
      </ThemeProvider>,
    );

    await waitFor(() =>
      expect(
        utils.queryByText('Summary belonging exclusively to Student A'),
      ).toBeNull(),
    );
  });
});
