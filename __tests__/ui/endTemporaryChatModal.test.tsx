import React from 'react';
import {Alert, StyleSheet} from 'react-native';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import {
  chatStore,
  db,
  initDatabase,
  MODERN_THEME_IDS,
  userStore,
  type ModernThemeId,
  type UIVariant,
} from '../../src/storage';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {EndTemporaryChatModal} from '../../src/ui/components/chat/EndTemporaryChatModal';
import {ChatScreen} from '../../src/ui/screens/ChatScreen';
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
  const id = `etc-${label}-${seq}`;
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT OR IGNORE INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
     VALUES (?, ?, ?, 'student', 0, 0, 0, ?, ?, ?)`,
    [id, id, `${id}@example.invalid`, darkMode ? 1 : 0, now, now],
  );
  userStore.setCurrentUser(id);
  return id;
};

beforeAll(async () => {
  await initDatabase();
});

afterEach(() => {
  jest.restoreAllMocks();
  db.executeSync('DELETE FROM active_session');
});

describe('EndTemporaryChatModal', () => {
  it('opens from ChatScreen instead of Alert.alert, keeps temporary chat on Keep Chat, and ends it on End Chat', async () => {
    const userId = createStudent('flow');
    chatStore.addMessage(userId, 'user', 'Saved message');
    chatStore.addMessage(userId, 'assistant', 'Saved reply');

    const alertSpy = jest.spyOn(Alert, 'alert');

    const view = render(
      <ThemeProvider userId={userId}>
        <ChatScreen userId={userId} />
      </ThemeProvider>,
    );

    // Enter temporary chat and send a message
    fireEvent.press(view.getByTestId('chat-temporary-toggle-button'));
    fireEvent.changeText(
      view.getByTestId('chat-text-input'),
      'Temporary question',
    );
    await act(async () => {
      fireEvent.press(view.getByTestId('chat-send-button'));
    });
    expect(await view.findByText('Temporary question')).toBeTruthy();

    // Tap temporary toggle -> opens custom themed modal, not Alert.alert
    fireEvent.press(view.getByTestId('chat-temporary-toggle-button'));
    expect(alertSpy).not.toHaveBeenCalled();
    expect(view.getByTestId('end-temp-chat-modal')).toBeTruthy();
    expect(view.getByTestId('end-temp-chat-title').props.children).toBe(
      'End Temporary Chat?',
    );
    expect(view.getByTestId('end-temp-chat-cleared-card')).toBeTruthy();
    expect(view.getByTestId('end-temp-chat-restored-card')).toBeTruthy();
    expect(view.getByText(/UNSAVED MESSAGE/)).toBeTruthy();

    // Keep Chat closes modal and preserves temporary conversation
    fireEvent.press(view.getByTestId('end-temp-chat-cancel-btn'));
    expect(view.queryByTestId('end-temp-chat-modal')).toBeNull();
    expect(view.getByText('Temporary question')).toBeTruthy();

    // Reopen and confirm End Chat -> clears temporary conversation and restores saved chat
    fireEvent.press(view.getByTestId('chat-temporary-toggle-button'));
    fireEvent.press(view.getByTestId('end-temp-chat-confirm-btn'));

    await waitFor(() => {
      expect(view.queryByTestId('end-temp-chat-modal')).toBeNull();
      expect(view.queryByText('Temporary question')).toBeNull();
      expect(view.getAllByText('Saved message').length).toBeGreaterThanOrEqual(
        1,
      );
    });
  });

  it('shows empty-session copy when zero temporary messages have been sent', () => {
    const userId = createStudent('empty');
    const view = render(
      <ThemeProvider userId={userId}>
        <EndTemporaryChatModal
          visible
          messageCount={0}
          onCancel={jest.fn()}
          onConfirm={jest.fn()}
        />
      </ThemeProvider>,
    );

    expect(view.getByText('TEMPORARY SESSION')).toBeTruthy();
    expect(
      view.getByText(
        'Leave temporary mode and return to your saved conversations.',
      ),
    ).toBeTruthy();
    expect(
      view.getByText(
        'No messages were sent — nothing will be added to your chat history.',
      ),
    ).toBeTruthy();
  });

  const themeCases: Array<{
    label: string;
    uiVariant: UIVariant;
    darkMode: boolean;
    modernTheme: ModernThemeId;
  }> = [
    {
      label: 'Classic Light',
      uiVariant: 'classic',
      darkMode: false,
      modernTheme: MODERN_THEME_IDS[0],
    },
    {
      label: 'Classic Dark',
      uiVariant: 'classic',
      darkMode: true,
      modernTheme: MODERN_THEME_IDS[0],
    },
    ...MODERN_THEME_IDS.flatMap(themeId => [
      {
        label: `Modern ${themeId} Light`,
        uiVariant: 'modern' as const,
        darkMode: false,
        modernTheme: themeId,
      },
      {
        label: `Modern ${themeId} Dark`,
        uiVariant: 'modern' as const,
        darkMode: true,
        modernTheme: themeId,
      },
    ]),
  ];

  it.each(themeCases)(
    'adapts card surface, accent, badges, and radii for $label',
    ({label, uiVariant, darkMode, modernTheme}) => {
      const userId = createStudent(
        label.toLowerCase().replace(/\s+/g, '-'),
        darkMode,
      );
      const isModern = uiVariant === 'modern';
      const modernPalette = getModernPalette(darkMode, modernTheme);
      const classicColors = darkMode ? classicDarkColors : classicLightColors;

      const expectedCardBg = isModern
        ? modernPalette.card
        : classicColors.cardBg;
      const expectedBorderColor = isModern
        ? modernPalette.border
        : classicColors.border;
      const expectedAccent = isModern
        ? modernPalette.accent
        : classicColors.primary;
      const expectedCardRadius = isModern
        ? ModernLayout.borderRadiusCard
        : Layout.borderRadiusCard;
      const expectedDangerSoft = isModern
        ? modernPalette.dangerSoft
        : darkMode
        ? '#3A1D24'
        : '#FDECEC';
      const expectedSafeSoft = isModern
        ? modernPalette.mint
        : darkMode
        ? '#143326'
        : '#ECFDF5';

      const view = render(
        <ThemeProvider
          userId={userId}
          initialUIVariant={uiVariant}
          initialModernTheme={modernTheme}
        >
          <EndTemporaryChatModal
            visible
            messageCount={2}
            onCancel={jest.fn()}
            onConfirm={jest.fn()}
          />
        </ThemeProvider>,
      );

      const cardStyle = StyleSheet.flatten(
        view.getByTestId('end-temp-chat-card').props.style,
      );
      const accentBarStyle = StyleSheet.flatten(
        view.getByTestId('end-temp-chat-accent-bar').props.style,
      );
      const confirmBtnStyle = StyleSheet.flatten(
        view.getByTestId('end-temp-chat-confirm-btn').props.style,
      );
      const clearedStyle = StyleSheet.flatten(
        view.getByTestId('end-temp-chat-cleared-card').props.style,
      );
      const restoredStyle = StyleSheet.flatten(
        view.getByTestId('end-temp-chat-restored-card').props.style,
      );

      expect(cardStyle.backgroundColor).toBe(expectedCardBg);
      expect(cardStyle.borderColor).toBe(expectedBorderColor);
      expect(cardStyle.borderRadius).toBe(expectedCardRadius);
      expect(accentBarStyle.backgroundColor).toBe(expectedAccent);
      expect(confirmBtnStyle.backgroundColor).toBe(expectedAccent);
      expect(clearedStyle.backgroundColor).toBe(expectedDangerSoft);
      expect(restoredStyle.backgroundColor).toBe(expectedSafeSoft);
    },
  );
});
