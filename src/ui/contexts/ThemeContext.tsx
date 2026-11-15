import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from 'react';
import {useColorScheme} from 'react-native';
import {
  getSavedUIVariant,
  saveUIVariant,
  userStore,
  type UIVariant,
} from '../../storage';
import {
  getModernPalette,
  getThemeColors,
  type ModernPalette,
  type ThemeColors,
} from '../theme/palettes';
import {
  captureForReveal,
  isThemeRevealAvailable,
  revealNewTheme,
} from '../theme/themeReveal';
import type {ThemeRevealOrigin} from '../theme/themeReveal';

export type {ThemeColors};

export interface ThemeContextType {
  isDarkMode: boolean;
  colors: ThemeColors;
  toggleTheme: (origin?: ThemeRevealOrigin | null) => void;
  uiVariant: UIVariant;
  isModern: boolean;
  setUIVariant: (variant: UIVariant) => void;
  modernPalette: ModernPalette;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{
  userId: string | null;
  refreshTrigger?: number;
  initialUIVariant?: UIVariant;
  children: React.ReactNode;
}> = ({userId, refreshTrigger, initialUIVariant, children}) => {
  const systemScheme = useColorScheme();

  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (userId) {
      return userStore.getDarkModeEnabled(userId);
    }
    return systemScheme === 'dark';
  });

  const [uiVariant, setUIVariantState] = useState<UIVariant>(
    () => initialUIVariant ?? getSavedUIVariant(userId),
  );

  useEffect(() => {
    if (userId) {
      setIsDarkMode(userStore.getDarkModeEnabled(userId));
    } else {
      setIsDarkMode(systemScheme === 'dark');
    }
  }, [userId, systemScheme, refreshTrigger]);

  useEffect(() => {
    if (initialUIVariant) {
      setUIVariantState(initialUIVariant);
      return;
    }
    setUIVariantState(getSavedUIVariant(userId));
  }, [userId, refreshTrigger, initialUIVariant]);

  const colors = useMemo<ThemeColors>(
    () => getThemeColors(uiVariant, isDarkMode),
    [uiVariant, isDarkMode],
  );

  const modernPalette = useMemo<ModernPalette>(
    () => getModernPalette(isDarkMode),
    [isDarkMode],
  );

  const capturingRef = useRef(false);
  const revealPendingRef = useRef(false);

  const toggleTheme = useCallback(
    (origin?: ThemeRevealOrigin | null) => {
      const flip = (): void =>
        setIsDarkMode(prev => {
          const next = !prev;
          if (userId) {
            userStore.setDarkModeEnabled(userId, next);
          }
          return next;
        });

      if (!isThemeRevealAvailable()) {
        flip();
        return;
      }
      if (capturingRef.current) return;
      capturingRef.current = true;
      void captureForReveal(origin).then(captured => {
        capturingRef.current = false;
        revealPendingRef.current = captured;
        flip();
      });
    },
    [userId],
  );

  const setUIVariant = useCallback(
    (nextVariant: UIVariant) => {
      saveUIVariant(userId, nextVariant);
      setUIVariantState(nextVariant);
    },
    [userId],
  );

  useEffect(() => {
    if (!revealPendingRef.current) return;
    revealPendingRef.current = false;
    revealNewTheme();
  }, [isDarkMode]);

  const isModern = uiVariant === 'modern';

  const contextValue = useMemo(
    () => ({
      isDarkMode,
      colors,
      toggleTheme,
      uiVariant,
      isModern,
      setUIVariant,
      modernPalette,
    }),
    [
      isDarkMode,
      colors,
      toggleTheme,
      uiVariant,
      isModern,
      setUIVariant,
      modernPalette,
    ],
  );

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
};

export const useUIVariant = () => {
  const {uiVariant, isModern, setUIVariant, modernPalette} = useTheme();
  return {uiVariant, isModern, setUIVariant, modernPalette};
};
