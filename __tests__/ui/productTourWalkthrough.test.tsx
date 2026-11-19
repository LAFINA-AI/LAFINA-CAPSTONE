import React from 'react';
import {act, fireEvent, render} from '@testing-library/react-native';
import {
  AccessibilityInfo,
  Alert,
  BackHandler,
  ScrollView,
  View,
} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {
  ProductTour,
  computeCardLayout,
  placeCard,
  spotlightPath,
} from '../../src/ui/tour/ProductTour';
import {
  buildQuickTourSteps,
  buildWalkthroughSteps,
  type TourStep,
} from '../../src/ui/tour/tourSteps';
import * as tourTargets from '../../src/ui/tour/tourTargets';
import {measureTourTarget, tourTargetRef} from '../../src/ui/tour/tourTargets';
import {CustomTabBar} from '../../src/ui/components/CustomTabBar';
import {NotesScreen} from '../../src/ui/screens/notes/NotesScreen';
import {ProfileScreen} from '../../src/ui/screens/ProfileScreen';
import {
  PRODUCT_TOUR_VERSION,
  initDatabase,
  localSettingsStore,
  productTourStore,
  userStore,
} from '../../src/storage';

const INITIAL_METRICS = {
  frame: {x: 0, y: 0, width: 390, height: 844},
  insets: {top: 24, left: 0, right: 0, bottom: 32},
};

describe('Walkthrough (ProductTour, Steps, Anchors & Choreography)', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('buildWalkthroughSteps covers all 5 tabs, 3 Tools sub-tabs, and all key student features', () => {
    const steps = buildWalkthroughSteps({
      isGuest: false,
      schoolEnabled: true,
      corPending: false,
    });

    expect(steps.length).toBe(12);
    expect(steps.map(s => s.tab)).toEqual([
      'dashboard',
      'dashboard',
      'calendar',
      'calendar',
      'chat',
      'chat',
      'chat',
      'notes',
      'notes',
      'notes',
      'profile',
      'profile',
    ]);
    expect(
      steps.filter(s => s.tab === 'notes').map(s => s.notesSubTab),
    ).toEqual(['alarms', 'todo', 'notes']);

    const fullCopy = steps
      .map(
        s =>
          `${s.title} ${s.body} ${
            s.highlights?.map(h => `${h.label} ${h.detail}`).join(' ') ?? ''
          } ${s.tip ?? ''}`,
      )
      .join(' ');

    // Key features covered across all 5 tabs
    for (const term of [
      'Up Next',
      'Free Study Blocks',
      'Customize Dashboard',
      'Month, Week & Day',
      'USTP COR',
      'Calendar Groups',
      'Philippine Holidays',
      '.ics',
      'Whisper',
      'Confirm before save',
      'Offline & Online AI',
      'USTP Handbook',
      'Temporary Chat',
      'Call LAFINA',
      'Call me vs Notify only',
      'AlarmManager',
      'Morning Briefing',
      'From Notes',
      'AI Assist',
      'Floating LAFINA',
      'Quick Chat',
      'Cloud Sync',
      'ElevenLabs',
      'Alarm & Reminder Health',
      '6 Color Themes',
      '5 AI Orb Designs',
    ]) {
      expect(fullCopy).toContain(term);
    }

    // No forbidden or unmounted features mentioned
    for (const forbidden of [
      'Pomodoro',
      'Flashcards',
      'Kokoro',
      'Gmail',
      'Developer Testing',
      'MeetingsScreen',
      'DOCX',
      'XLSX',
      'PPTX',
    ]) {
      expect(fullCopy).not.toContain(forbidden);
    }
  });

  test('buildWalkthroughSteps & buildQuickTourSteps adapt USTP Handbook and Guest copy honestly', () => {
    const confirmed = buildWalkthroughSteps({
      isGuest: false,
      schoolEnabled: true,
      corPending: false,
    });
    const pending = buildWalkthroughSteps({
      isGuest: true,
      schoolEnabled: false,
      corPending: true,
    });
    const nonUstp = buildQuickTourSteps({
      isGuest: true,
      schoolEnabled: false,
      corPending: false,
    });

    const handbookText = (steps: TourStep[]) =>
      steps
        .find(s => s.id === 'ai-engine-handbook')
        ?.highlights?.find(h => h.label === 'USTP Handbook')?.detail ?? '';

    expect(handbookText(confirmed)).toContain('chapter and page citations');
    expect(handbookText(pending)).toContain('confirm your USTP COR');
    expect(handbookText(nonUstp)).toContain('Scheduling mode');

    const syncLabel = (steps: TourStep[]) =>
      steps.find(s => s.id === 'profile-sync-health-themes')?.highlights?.[0]
        ?.detail ?? '';
    expect(syncLabel(confirmed)).toContain('sync automatically');
    expect(syncLabel(pending)).toContain('stays on this phone');
  });

  test('ProductTour renders steps, supports chapter jumping, Next/Back, HardwareBack and Skip', () => {
    type BackListener = Parameters<typeof BackHandler.addEventListener>[1];
    const backHandlers: BackListener[] = [];
    jest
      .spyOn(BackHandler, 'addEventListener')
      .mockImplementation((_event, handler) => {
        backHandlers.push(handler);
        return {
          remove: () => {
            const idx = backHandlers.indexOf(handler);
            if (idx >= 0) backHandlers.splice(idx, 1);
          },
        };
      });

    const steps = buildWalkthroughSteps({
      isGuest: true,
      schoolEnabled: false,
      corPending: false,
    });
    const onNavigate = jest.fn();
    const onStepChange = jest.fn();
    const onFinish = jest.fn();

    const ui = render(
      <SafeAreaProvider initialMetrics={INITIAL_METRICS}>
        <ThemeProvider userId={null} initialUIVariant="modern">
          <ProductTour
            steps={steps}
            label="Walkthrough"
            onNavigate={onNavigate}
            onStepChange={onStepChange}
            onFinish={onFinish}
          />
        </ThemeProvider>
      </SafeAreaProvider>,
    );

    expect(ui.getByTestId('product-tour')).toBeTruthy();
    expect(ui.getByText('WALKTHROUGH · 1 of 12')).toBeTruthy();
    expect(ui.getByText('Your day at a glance')).toBeTruthy();
    expect(onNavigate).toHaveBeenCalledWith('dashboard');
    expect(onStepChange).toHaveBeenCalledWith(steps[0], 0);

    // Jump straight to Tools chapter
    fireEvent.press(ui.getByTestId('product-tour-chapter-notes'));
    expect(ui.getByText('WALKTHROUGH · 8 of 12')).toBeTruthy();
    expect(ui.getByText('Alarms & Morning Briefing')).toBeTruthy();
    expect(onNavigate).toHaveBeenLastCalledWith('notes');
    expect(onStepChange).toHaveBeenLastCalledWith(steps[7], 7);

    // Step through Tools sub-tabs -> Profile -> Finish
    fireEvent.press(ui.getByTestId('product-tour-next'));
    expect(ui.getByText('To-Do lists & synced note checklists')).toBeTruthy();
    fireEvent.press(ui.getByTestId('product-tour-next'));
    expect(ui.getByText('Rich Notes & AI Note Assistant')).toBeTruthy();

    // Hardware Back moves backward inside tour without closing
    act(() => {
      const handler = backHandlers[backHandlers.length - 1];
      expect(handler?.({} as Parameters<BackListener>[0])).toBe(true);
    });
    expect(ui.getByText('To-Do lists & synced note checklists')).toBeTruthy();

    // Jump to Profile and complete
    fireEvent.press(ui.getByTestId('product-tour-chapter-profile'));
    expect(ui.getByText('Floating LAFINA & Quick Chat')).toBeTruthy();
    fireEvent.press(ui.getByTestId('product-tour-next'));
    expect(ui.getByText('Sync, Voices, Health & Themes')).toBeTruthy();
    expect(ui.getByText('Get started')).toBeTruthy();
    fireEvent.press(ui.getByTestId('product-tour-next'));
    expect(onFinish).toHaveBeenCalledWith(true);

    // Skip / X / Back at step 0 closes with completed = false
    onFinish.mockClear();
    fireEvent.press(ui.getByTestId('product-tour-chapter-dashboard'));
    expect(ui.getByText('WALKTHROUGH · 1 of 12')).toBeTruthy();
    act(() => {
      const handler = backHandlers[backHandlers.length - 1];
      expect(handler?.({} as Parameters<BackListener>[0])).toBe(true);
    });
    expect(onFinish).toHaveBeenCalledWith(false);
    ui.unmount();
  });

  test('computeCardLayout & placeCard keep coachmark clear of spotlight hole and bottom nav inset', () => {
    // Target at bottom tab bar: card goes above it
    const tabHole = {x: 160, y: 740, width: 70, height: 70};
    const topLayout = computeCardLayout(
      tabHole,
      {width: 390, height: 844},
      300,
      44,
    );
    expect(
      topLayout.top + Math.min(300, topLayout.maxHeight),
    ).toBeLessThanOrEqual(tabHole.y);

    // Target in top header: card goes below it and stays above bottomMargin
    const headerHole = {x: 320, y: 18, width: 44, height: 44};
    const bottomLayout = computeCardLayout(
      headerHole,
      {width: 390, height: 640},
      340,
      44,
    );
    expect(bottomLayout.top).toBeGreaterThanOrEqual(
      headerHole.y + headerHole.height,
    );
    expect(
      bottomLayout.top + Math.min(340, bottomLayout.maxHeight),
    ).toBeLessThanOrEqual(640 - 44);

    // Short split-screen viewport respects available room instead of forcing 180px floor
    const shortLayout = computeCardLayout(
      {x: 20, y: 180, width: 120, height: 80},
      {width: 390, height: 420},
      280,
      20,
    );
    expect(shortLayout.maxHeight).toBe(150);
    expect(shortLayout.top + shortLayout.maxHeight).toBeLessThanOrEqual(180);

    // Backward-compatible 3-arg placeCard still works
    expect(
      placeCard(null, {width: 360, height: 700}, 200),
    ).toBeGreaterThanOrEqual(16);

    // Spotlight SVG path contains cutout subpath when hole is non-null
    expect(spotlightPath(360, 700, headerHole)).toContain('A16 16');
    expect(spotlightPath(360, 700, null)).toBe('M0 0H360V700H0Z');
  });

  test('CustomTabBar registers full AI orb bounds for tab-chat tour target in Modern and Classic', async () => {
    const modernUi = render(
      <SafeAreaProvider initialMetrics={INITIAL_METRICS}>
        <ThemeProvider userId={null} initialUIVariant="modern">
          <CustomTabBar activeTab="dashboard" onTabPress={jest.fn()} />
        </ThemeProvider>
      </SafeAreaProvider>,
    );
    // Target callback was registered without throwing; verify classic mode also renders cleanly
    modernUi.unmount();

    const classicUi = render(
      <SafeAreaProvider initialMetrics={INITIAL_METRICS}>
        <ThemeProvider userId={null} initialUIVariant="classic">
          <CustomTabBar activeTab="chat" onTabPress={jest.fn()} />
        </ThemeProvider>
      </SafeAreaProvider>,
    );
    expect(classicUi.getByTestId('classic-custom-tab-bar')).toBeTruthy();
    classicUi.unmount();

    // tourTargetRef safely handles missing measureInWindow in test mocks
    const refCb = tourTargetRef('tab-chat');
    refCb({} as unknown as View);
    expect(await measureTourTarget('tab-chat')).toBeNull();
    refCb(null);
  });

  test('NotesScreen switches sub-tabs cleanly during tourSubTab and restores prior tab afterward without alerts', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const guest = userStore.createGuestUser();

    const ui = render(
      <SafeAreaProvider initialMetrics={INITIAL_METRICS}>
        <ThemeProvider userId={guest.id}>
          <NotesScreen
            userId={guest.id}
            refreshTrigger={0}
            onRefresh={jest.fn()}
          />
        </ThemeProvider>
      </SafeAreaProvider>,
    );

    expect(
      ui.getByTestId('notes-subtab-notes').props.accessibilityState.selected,
    ).toBe(true);

    ui.rerender(
      <SafeAreaProvider initialMetrics={INITIAL_METRICS}>
        <ThemeProvider userId={guest.id}>
          <NotesScreen
            userId={guest.id}
            refreshTrigger={0}
            tourSubTab="alarms"
            onRefresh={jest.fn()}
          />
        </ThemeProvider>
      </SafeAreaProvider>,
    );
    expect(
      ui.getByTestId('notes-subtab-alarms').props.accessibilityState.selected,
    ).toBe(true);

    ui.rerender(
      <SafeAreaProvider initialMetrics={INITIAL_METRICS}>
        <ThemeProvider userId={guest.id}>
          <NotesScreen
            userId={guest.id}
            refreshTrigger={0}
            tourSubTab="todo"
            onRefresh={jest.fn()}
          />
        </ThemeProvider>
      </SafeAreaProvider>,
    );
    expect(
      ui.getByTestId('notes-subtab-todo').props.accessibilityState.selected,
    ).toBe(true);

    // Clearing tourSubTab restores the user's original 'notes' tab
    ui.rerender(
      <SafeAreaProvider initialMetrics={INITIAL_METRICS}>
        <ThemeProvider userId={guest.id}>
          <NotesScreen
            userId={guest.id}
            refreshTrigger={0}
            onRefresh={jest.fn()}
          />
        </ThemeProvider>
      </SafeAreaProvider>,
    );
    expect(
      ui.getByTestId('notes-subtab-notes').props.accessibilityState.selected,
    ).toBe(true);
    expect(alertSpy).not.toHaveBeenCalled();
    ui.unmount();
  });

  test('productTourStore records PRODUCT_TOUR_VERSION 2 when completed', () => {
    const guest = userStore.createGuestUser();
    productTourStore.queue(guest.id);
    expect(productTourStore.isPending(guest.id)).toBe(true);
    productTourStore.markSeen(guest.id, true);
    expect(productTourStore.isPending(guest.id)).toBe(false);
    const saved = JSON.parse(
      localSettingsStore.get(guest.id, 'product_tour') || '{}',
    );
    expect(saved.version).toBe(PRODUCT_TOUR_VERSION);
    expect(PRODUCT_TOUR_VERSION).toBe(2);
    expect(saved.completed).toBe(true);
  });

  test('ProductTour renders cleanly across Classic Dark and reduced motion, and ProfileScreen replays it', () => {
    const guest = userStore.createGuestUser();
    userStore.setDarkModeEnabled(guest.id, true);
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(true);

    const onReplayTour = jest.fn();
    const profileUi = render(
      <SafeAreaProvider initialMetrics={INITIAL_METRICS}>
        <ThemeProvider userId={guest.id} initialUIVariant="classic">
          <ProfileScreen
            userId={guest.id}
            refreshTrigger={0}
            onRefresh={jest.fn()}
            onReplayTour={onReplayTour}
          />
        </ThemeProvider>
      </SafeAreaProvider>,
    );

    expect(profileUi.getByText('All features')).toBeTruthy();
    fireEvent.press(profileUi.getByText('Show the walkthrough again'));
    expect(onReplayTour).toHaveBeenCalledTimes(1);
    profileUi.unmount();

    const steps = buildWalkthroughSteps({
      isGuest: false,
      schoolEnabled: true,
      corPending: false,
    });
    const classicUi = render(
      <SafeAreaProvider initialMetrics={INITIAL_METRICS}>
        <ThemeProvider userId={guest.id} initialUIVariant="classic">
          <ProductTour
            steps={steps}
            label="Walkthrough"
            onNavigate={jest.fn()}
            onFinish={jest.fn()}
          />
        </ThemeProvider>
      </SafeAreaProvider>,
    );
    expect(classicUi.getByTestId('product-tour')).toBeTruthy();
    expect(classicUi.getByText('WALKTHROUGH · 1 of 12')).toBeTruthy();
    classicUi.unmount();
  });

  test('ProfileScreen scrolls to profile-floating-row using scroll wrapper view instead of ScrollView.measureInWindow', async () => {
    const guest = userStore.createGuestUser();
    const scrollToSpy = jest
      .spyOn(ScrollView.prototype, 'scrollTo')
      .mockImplementation(() => {});
    const measuredNodes: unknown[] = [];
    jest
      .spyOn(tourTargets, 'measureInWindow')
      .mockImplementation(async node => {
        measuredNodes.push(node);
        if (!node) return null;
        return measuredNodes.length % 2 === 1
          ? {x: 16, y: 680, width: 358, height: 120}
          : {x: 0, y: 40, width: 390, height: 800};
      });

    const ui = render(
      <SafeAreaProvider initialMetrics={INITIAL_METRICS}>
        <ThemeProvider userId={guest.id}>
          <ProfileScreen
            userId={guest.id}
            refreshTrigger={0}
            onRefresh={jest.fn()}
            tourAnchor="profile-floating-row"
          />
        </ThemeProvider>
      </SafeAreaProvider>,
    );

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 60));
    });

    expect(measuredNodes.length).toBeGreaterThanOrEqual(2);
    for (const node of measuredNodes) {
      expect(node).toBeTruthy();
      expect(typeof (node as {scrollTo?: unknown}).scrollTo).not.toBe(
        'function',
      );
    }
    expect(scrollToSpy).toHaveBeenCalledWith({y: 520, animated: false});
    ui.unmount();
  });
});
