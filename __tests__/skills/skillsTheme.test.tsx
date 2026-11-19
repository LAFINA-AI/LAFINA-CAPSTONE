import React from 'react';
import {renderHook} from '@testing-library/react-native';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {skillContrast, useSkillsPalette} from '../../src/ui/theme/skills';
import {MODERN_THEMES} from '../../src/ui/theme/palettes';
import {db, initDatabase, userStore} from '../../src/storage';

beforeAll(async () => {
  await initDatabase();
});
test.each(
  MODERN_THEMES.flatMap(theme =>
    [false, true].map(dark => ({theme: theme.id, dark})),
  ),
)(
  'Skills text and actions meet 4.5:1 in $theme, dark=$dark',
  ({theme, dark}) => {
    db.executeSync('DELETE FROM active_session');
    const user = userStore.createGuestUser();
    userStore.setCurrentUser(user.id);
    userStore.setDarkModeEnabled(user.id, dark);
    const {result, unmount} = renderHook(() => useSkillsPalette(), {
      wrapper: ({children}: React.PropsWithChildren) => (
        <ThemeProvider
          userId={user.id}
          initialUIVariant="modern"
          initialModernTheme={theme}
        >
          {children}
        </ThemeProvider>
      ),
    });
    const p = result.current;
    for (const background of [p.bg, p.card, p.surface])
      for (const ink of [p.text, p.muted, p.accent, p.mintInk, p.danger])
        expect(skillContrast(ink, background)).toBeGreaterThanOrEqual(4.5);
    expect(skillContrast(p.onAccent, p.accent)).toBeGreaterThanOrEqual(4.5);
    expect(skillContrast('#FFFFFF', p.darkInkBtn)).toBeGreaterThanOrEqual(4.5);
    unmount();
  },
);
test.each([false, true])(
  'Classic Skills text and actions meet 4.5:1, dark=%s',
  dark => {
    const user = userStore.createGuestUser();
    userStore.setCurrentUser(user.id);
    userStore.setDarkModeEnabled(user.id, dark);
    const {result, unmount} = renderHook(() => useSkillsPalette(), {
      wrapper: ({children}: React.PropsWithChildren) => (
        <ThemeProvider userId={user.id} initialUIVariant="classic">
          {children}
        </ThemeProvider>
      ),
    });
    const p = result.current;
    for (const bg of [p.bg, p.card, p.surface])
      for (const ink of [p.text, p.muted, p.accent])
        expect(skillContrast(ink, bg)).toBeGreaterThanOrEqual(4.5);
    expect(skillContrast(p.onAccent, p.accent)).toBeGreaterThanOrEqual(4.5);
    unmount();
  },
);
