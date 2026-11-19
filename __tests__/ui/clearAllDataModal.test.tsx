import React from 'react';
import {Alert, Dimensions, StyleSheet} from 'react-native';
import {act, fireEvent, render} from '@testing-library/react-native';
import {
  db,
  initDatabase,
  MODERN_THEME_IDS,
  notesStore,
  tasksStore,
  userStore,
  type ModernThemeId,
  type UIVariant,
} from '../../src/storage';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {
  CLEAR_DATA_CONFIRM_PHRASE,
  ClearAllDataModal,
  ClearDataResultModal,
} from '../../src/ui/components/profile/ClearAllDataModal';
import {ProfileScreen} from '../../src/ui/screens/ProfileScreen';
import {
  classicDarkColors,
  classicLightColors,
  getModernPalette,
  Layout,
  ModernLayout,
} from '../../src/ui/theme';

let seq = 0;
const createStudent = (label: string, darkMode = false): string => {
  seq += 1;
  const id = `cdm-${label}-${seq}`;
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT OR IGNORE INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
     VALUES (?, ?, ?, 'student', 0, 0, 0, ?, ?, ?)`,
    [id, id, `${id}@example.invalid`, darkMode ? 1 : 0, now, now],
  );
  userStore.setCurrentUser(id);
  return id;
};

const seedStudentRecords = (userId: string) => {
  notesStore.insert({
    id: `${userId}-note`,
    userId,
    title: 'Exam prep note',
    body: 'Chapter 4 review',
    isPinned: false,
    tags: [],
    category: 'General',
    isVoiceTranscribed: false,
  });
  tasksStore.insertTask({
    id: `${userId}-task`,
    userId,
    title: 'Submit lab report',
    dueDate: '2030-02-01',
    dueTime: '17:00',
    isCompleted: false,
    priority: 'High',
    category: 'Academic',
    notes: null,
    recurrenceRule: null,
  });
};

beforeAll(async () => {
  await initDatabase();
});

afterEach(() => {
  jest.restoreAllMocks();
  db.executeSync('DELETE FROM active_session');
});

describe('ClearAllDataModal warning design and type-to-confirm protection', () => {
  it('opens from Profile Clear All Data with structured breakdown cards and blocks deletion until DELETE is typed', () => {
    const userId = createStudent('guard');
    seedStudentRecords(userId);

    const alertSpy = jest.spyOn(Alert, 'alert');

    const view = render(
      <ThemeProvider userId={userId}>
        <ProfileScreen
          userId={userId}
          refreshTrigger={0}
          onRefresh={jest.fn()}
          onLogout={jest.fn()}
        />
      </ThemeProvider>,
    );

    expect(view.getByTestId('profile-clear-all-data-btn')).toBeTruthy();
    expect(
      view.getByText('Delete notes, tasks, schedule, chats & event defaults'),
    ).toBeTruthy();

    fireEvent.press(view.getByTestId('profile-clear-all-data-btn'));

    expect(view.getByTestId('clear-data-warning-modal')).toBeTruthy();
    expect(view.getByTestId('clear-data-modal-title').props.children).toBe(
      'Clear All Data',
    );
    expect(view.getByTestId('clear-data-modal-message').props.children).toMatch(
      /This action cannot be undone\./,
    );
    expect(view.getByTestId('clear-data-deleted-list')).toBeTruthy();
    expect(view.getByTestId('clear-data-kept-list')).toBeTruthy();
    expect(view.getByText('What will be permanently deleted')).toBeTruthy();
    expect(view.getByText('Kept on this device')).toBeTruthy();

    const confirmBtn = view.getByTestId('clear-data-confirm-btn');
    expect(confirmBtn.props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(confirmBtn);

    expect(notesStore.getAll(userId)).toHaveLength(1);
    expect(tasksStore.getAllTasks(userId)).toHaveLength(1);
    expect(alertSpy).not.toHaveBeenCalled();
    expect(view.queryByTestId('clear-data-result-card')).toBeNull();

    for (const wrongInput of ['del', 'DEL', 'yes', 'DELETE!']) {
      fireEvent.changeText(
        view.getByTestId('clear-data-confirm-input'),
        wrongInput,
      );
      expect(
        view.getByTestId('clear-data-confirm-btn').props.accessibilityState
          ?.disabled,
      ).toBe(true);
      fireEvent.press(view.getByTestId('clear-data-confirm-btn'));
      expect(notesStore.getAll(userId)).toHaveLength(1);
      expect(tasksStore.getAllTasks(userId)).toHaveLength(1);
    }

    fireEvent.changeText(
      view.getByTestId('clear-data-confirm-input'),
      `  ${CLEAR_DATA_CONFIRM_PHRASE.toLowerCase()}  `,
    );
    expect(
      view.getByTestId('clear-data-confirm-btn').props.accessibilityState
        ?.disabled,
    ).toBe(false);

    act(() => {
      fireEvent.press(view.getByTestId('clear-data-confirm-btn'));
    });

    expect(notesStore.getAll(userId)).toHaveLength(0);
    expect(tasksStore.getAllTasks(userId)).toHaveLength(0);
    expect(alertSpy).not.toHaveBeenCalled();

    expect(view.getByTestId('clear-data-result-card')).toBeTruthy();
    expect(view.getByTestId('clear-data-result-title').props.children).toBe(
      'Data Cleared',
    );
    expect(view.getByTestId('clear-data-result-message').props.children).toBe(
      'All personal scheduling data and saved event defaults have been deleted.',
    );
    expect(view.getByTestId('clear-data-result-cleared-card')).toBeTruthy();
    expect(view.getByTestId('clear-data-result-kept-card')).toBeTruthy();

    fireEvent.press(view.getByTestId('clear-data-result-done-btn'));
    expect(view.queryByTestId('clear-data-result-card')).toBeNull();
  });

  it('canceling closes without deleting and resets the confirmation input when reopened', () => {
    const userId = createStudent('cancel');
    seedStudentRecords(userId);

    const view = render(
      <ThemeProvider userId={userId}>
        <ProfileScreen
          userId={userId}
          refreshTrigger={0}
          onRefresh={jest.fn()}
          onLogout={jest.fn()}
        />
      </ThemeProvider>,
    );

    fireEvent.press(view.getByText('Clear All Data'));
    fireEvent.changeText(
      view.getByTestId('clear-data-confirm-input'),
      'DELETE',
    );
    expect(
      view.getByTestId('clear-data-confirm-btn').props.accessibilityState
        ?.disabled,
    ).toBe(false);

    fireEvent.press(view.getByTestId('clear-data-cancel-btn'));
    expect(view.queryByTestId('clear-data-modal-card')).toBeNull();
    expect(notesStore.getAll(userId)).toHaveLength(1);
    expect(tasksStore.getAllTasks(userId)).toHaveLength(1);

    fireEvent.press(view.getByText('Clear All Data'));
    expect(view.getByTestId('clear-data-modal-card')).toBeTruthy();
    expect(view.getByTestId('clear-data-confirm-input').props.value).toBe('');
    expect(
      view.getByTestId('clear-data-confirm-btn').props.accessibilityState
        ?.disabled,
    ).toBe(true);
  });

  it.each(MODERN_THEME_IDS)(
    'scales surface, border, kept-list, and danger tokens for Modern %s theme in Light and Dark modes',
    (themeId: ModernThemeId) => {
      for (const darkMode of [false, true]) {
        const userId = createStudent(`modern-${themeId}-${darkMode}`, darkMode);
        const palette = getModernPalette(darkMode, themeId);

        const view = render(
          <ThemeProvider
            userId={userId}
            initialUIVariant="modern"
            initialModernTheme={themeId}
          >
            <ClearAllDataModal
              visible
              onCancel={jest.fn()}
              onConfirm={jest.fn()}
            />
          </ThemeProvider>,
        );

        const cardStyle = StyleSheet.flatten(
          view.getByTestId('clear-data-modal-card').props.style,
        );
        const deletedStyle = StyleSheet.flatten(
          view.getByTestId('clear-data-deleted-list').props.style,
        );
        const keptStyle = StyleSheet.flatten(
          view.getByTestId('clear-data-kept-list').props.style,
        );

        expect(cardStyle.backgroundColor).toBe(palette.card);
        expect(cardStyle.borderColor).toBe(palette.border);
        expect(cardStyle.borderRadius).toBe(ModernLayout.borderRadiusCard);
        expect(deletedStyle.backgroundColor).toBe(palette.dangerSoft);
        expect(keptStyle.backgroundColor).toBe(palette.softViolet);
        expect(keptStyle.borderColor).toBe(palette.border);

        view.unmount();
      }
    },
  );

  it.each<[UIVariant, boolean]>([
    ['classic', false],
    ['classic', true],
  ])(
    'adapts surfaces and radii for %s variant (dark=%s)',
    (variant, darkMode) => {
      const userId = createStudent(`${variant}-${darkMode}`, darkMode);
      const expected = darkMode ? classicDarkColors : classicLightColors;

      const view = render(
        <ThemeProvider userId={userId} initialUIVariant={variant}>
          <ClearAllDataModal
            visible
            onCancel={jest.fn()}
            onConfirm={jest.fn()}
          />
        </ThemeProvider>,
      );

      const cardStyle = StyleSheet.flatten(
        view.getByTestId('clear-data-modal-card').props.style,
      );
      const deletedStyle = StyleSheet.flatten(
        view.getByTestId('clear-data-deleted-list').props.style,
      );
      const keptStyle = StyleSheet.flatten(
        view.getByTestId('clear-data-kept-list').props.style,
      );

      expect(cardStyle.backgroundColor).toBe(expected.cardBg);
      expect(cardStyle.borderColor).toBe(expected.border);
      expect(cardStyle.borderRadius).toBe(Layout.borderRadiusCard);
      expect(deletedStyle.backgroundColor).toBe(expected.bannerBg);
      expect(keptStyle.backgroundColor).toBe(expected.inputBg);
    },
  );

  it('scales typography, maxHeight, and spacing between compact and regular screen dimensions', () => {
    const userId = createStudent('dims');
    const dimsSpy = jest.spyOn(Dimensions, 'get');

    dimsSpy.mockReturnValue({width: 320, height: 560, scale: 2, fontScale: 1});
    const compactView = render(
      <ThemeProvider userId={userId}>
        <ClearAllDataModal visible onCancel={jest.fn()} onConfirm={jest.fn()} />
      </ThemeProvider>,
    );
    const compactCard = StyleSheet.flatten(
      compactView.getByTestId('clear-data-modal-card').props.style,
    );
    const compactTitle = StyleSheet.flatten(
      compactView.getByTestId('clear-data-modal-title').props.style,
    );
    const compactDeleted = StyleSheet.flatten(
      compactView.getByTestId('clear-data-deleted-list').props.style,
    );
    const compactCancel = StyleSheet.flatten(
      compactView.getByTestId('clear-data-cancel-btn').props.style,
    );
    const compactConfirm = StyleSheet.flatten(
      compactView.getByTestId('clear-data-confirm-btn').props.style,
    );
    expect(compactCard.maxHeight).toBeCloseTo(560 * 0.88, 1);
    expect(compactTitle.fontSize).toBe(18);
    expect(compactDeleted.padding).toBe(10);
    expect(compactCancel.height).toBe(42);
    expect(compactConfirm.height).toBe(42);
    compactView.unmount();

    dimsSpy.mockReturnValue({width: 412, height: 915, scale: 3, fontScale: 1});
    const regularView = render(
      <ThemeProvider userId={userId}>
        <ClearAllDataModal visible onCancel={jest.fn()} onConfirm={jest.fn()} />
      </ThemeProvider>,
    );
    const regularCard = StyleSheet.flatten(
      regularView.getByTestId('clear-data-modal-card').props.style,
    );
    const regularTitle = StyleSheet.flatten(
      regularView.getByTestId('clear-data-modal-title').props.style,
    );
    const regularDeleted = StyleSheet.flatten(
      regularView.getByTestId('clear-data-deleted-list').props.style,
    );
    const regularCancel = StyleSheet.flatten(
      regularView.getByTestId('clear-data-cancel-btn').props.style,
    );
    const regularConfirm = StyleSheet.flatten(
      regularView.getByTestId('clear-data-confirm-btn').props.style,
    );
    expect(regularCard.maxHeight).toBe(680);
    expect(regularTitle.fontSize).toBe(20);
    expect(regularDeleted.padding).toBe(12);
    expect(regularCancel.height).toBe(46);
    expect(regularConfirm.height).toBe(46);
    expect(regularCancel.flex).toBe(0.9);
    expect(regularConfirm.flex).toBe(1.45);
    expect(regularConfirm.alignItems).toBe('center');
    expect(regularConfirm.justifyContent).toBe('center');
    expect(regularView.getByText('Delete Everything').props.numberOfLines).toBe(
      1,
    );
    expect(regularView.getByText('Cancel').props.numberOfLines).toBe(1);
  });

  it('transitions Delete Everything from muted locked state to high-contrast theme danger state when unlocked', () => {
    const userId = createStudent('btn-states');
    const palette = getModernPalette(false, 'ocean');

    const view = render(
      <ThemeProvider
        userId={userId}
        initialUIVariant="modern"
        initialModernTheme="ocean"
      >
        <ClearAllDataModal visible onCancel={jest.fn()} onConfirm={jest.fn()} />
      </ThemeProvider>,
    );

    const lockedBtn = StyleSheet.flatten(
      view.getByTestId('clear-data-confirm-btn').props.style,
    );
    const lockedContent = StyleSheet.flatten(
      view.getByTestId('clear-data-confirm-btn-content').props.style,
    );
    expect(lockedBtn.backgroundColor).toBe(palette.surface);
    expect(lockedBtn.borderColor).toBe(palette.border);
    expect(lockedContent.opacity).toBe(0.72);

    fireEvent.changeText(
      view.getByTestId('clear-data-confirm-input'),
      'DELETE',
    );

    const unlockedBtn = StyleSheet.flatten(
      view.getByTestId('clear-data-confirm-btn').props.style,
    );
    const unlockedContent = StyleSheet.flatten(
      view.getByTestId('clear-data-confirm-btn-content').props.style,
    );
    expect(unlockedBtn.backgroundColor).toBe(palette.danger);
    expect(unlockedBtn.borderColor).toBe(palette.danger);
    expect(unlockedContent.opacity).toBe(1);
  });

  it('renders ClearDataResultModal statuses cleanly and adapts across all Modern themes and Classic mode', () => {
    for (const themeId of MODERN_THEME_IDS) {
      for (const darkMode of [false, true]) {
        const userId = createStudent(`res-${themeId}-${darkMode}`, darkMode);
        const palette = getModernPalette(darkMode, themeId);

        const view = render(
          <ThemeProvider
            userId={userId}
            initialUIVariant="modern"
            initialModernTheme={themeId}
          >
            <ClearDataResultModal
              result={{
                status: 'cleared',
                title: 'Data Cleared',
                message:
                  'All personal scheduling data and saved event defaults have been deleted.',
              }}
              onClose={jest.fn()}
            />
          </ThemeProvider>,
        );

        const cardStyle = StyleSheet.flatten(
          view.getByTestId('clear-data-result-card').props.style,
        );
        const clearedCardStyle = StyleSheet.flatten(
          view.getByTestId('clear-data-result-cleared-card').props.style,
        );
        const keptCardStyle = StyleSheet.flatten(
          view.getByTestId('clear-data-result-kept-card').props.style,
        );
        const doneBtnStyle = StyleSheet.flatten(
          view.getByTestId('clear-data-result-done-btn').props.style,
        );

        expect(cardStyle.backgroundColor).toBe(palette.card);
        expect(cardStyle.borderColor).toBe(palette.border);
        expect(clearedCardStyle.backgroundColor).toBe(palette.mint);
        expect(keptCardStyle.backgroundColor).toBe(palette.softViolet);
        expect(doneBtnStyle.backgroundColor).toBe(palette.accent);
        expect(view.getByText('RESET COMPLETE')).toBeTruthy();

        view.unmount();
      }
    }

    const classicUser = createStudent('res-classic', false);
    const partialView = render(
      <ThemeProvider userId={classicUser} initialUIVariant="classic">
        <ClearDataResultModal
          result={{
            status: 'partly_cleared',
            title: 'Data Partly Cleared',
            message: 'Some attachment files remain.',
          }}
          onClose={jest.fn()}
        />
      </ThemeProvider>,
    );

    const classicCardStyle = StyleSheet.flatten(
      partialView.getByTestId('clear-data-result-card').props.style,
    );
    const classicDoneBtn = StyleSheet.flatten(
      partialView.getByTestId('clear-data-result-done-btn').props.style,
    );
    expect(classicCardStyle.backgroundColor).toBe(classicLightColors.cardBg);
    expect(classicDoneBtn.backgroundColor).toBe(classicLightColors.primary);
    expect(partialView.getByText('PARTIAL RESET')).toBeTruthy();
    expect(
      partialView.queryByTestId('clear-data-result-cleared-card'),
    ).toBeNull();
    partialView.unmount();

    const notClearedView = render(
      <ThemeProvider userId={classicUser} initialUIVariant="classic">
        <ClearDataResultModal
          result={{
            status: 'not_cleared',
            title: 'Not Cleared',
            message: 'Nothing was deleted.',
          }}
          onClose={jest.fn()}
        />
      </ThemeProvider>,
    );
    expect(notClearedView.getByText('NO CHANGES MADE')).toBeTruthy();
    expect(
      notClearedView.queryByTestId('clear-data-result-cleared-card'),
    ).toBeNull();
  });
});
