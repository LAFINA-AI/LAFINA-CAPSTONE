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
  getSavedModernAiButtonDesign,
  getSavedModernTheme,
  getSavedUIVariant,
  saveModernAiButtonDesign,
  saveModernTheme,
  saveUIVariant,
  userStore,
  type ModernAiButtonDesignId,
  type ModernThemeId,
  type UIVariant,
} from '../../storage';
import {getModernShadows, type ModernShadowSet} from '../theme/modern';
import {
  getModernAiButtonDesignMeta,
  getModernPalette,
  getModernThemeExtras,
  getModernThemeMeta,
  getThemeColors,
  type ModernAiButtonDesignMeta,
  type ModernPalette,
  type ModernThemeExtras,
  type ModernThemeMeta,
  type ThemeColors,
} from '../theme/palettes';
import {
  captureForReveal,
  isThemeRevealAvailable,
  revealNewTheme,
} from '../theme/themeReveal';
import type {ThemeRevealOrigin} from '../theme/themeReveal';

export type {ModernAiButtonDesignId, ModernThemeId, ThemeColors};

export interface ThemeContextType {
  isDarkMode: boolean;
  colors: ThemeColors;
  toggleTheme: (origin?: ThemeRevealOrigin | null) => void;
  uiVariant: UIVariant;
  isModern: boolean;
  setUIVariant: (variant: UIVariant) => void;
  modernPalette: ModernPalette;
  modernTheme: ModernThemeId;
  modernThemeMeta: ModernThemeMeta;
  modernThemeExtras: ModernThemeExtras;
  modernShadows: ModernShadowSet;
  setModernTheme: (themeId: ModernThemeId) => void;
  modernAiButtonDesign: ModernAiButtonDesignId;
  modernAiButtonDesignMeta: ModernAiButtonDesignMeta;
  setModernAiButtonDesign: (designId: ModernAiButtonDesignId) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{
  userId: string | null;
  refreshTrigger?: number;
  initialUIVariant?: UIVariant;
  initialModernTheme?: ModernThemeId;
  initialModernAiButtonDesign?: ModernAiButtonDesignId;
  children: React.ReactNode;
}> = ({
  userId,
  refreshTrigger,
  initialUIVariant,
  initialModernTheme,
  initialModernAiButtonDesign,
  children,
}) => {
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

  const [modernTheme, setModernThemeState] = useState<ModernThemeId>(
    () => initialModernTheme ?? getSavedModernTheme(userId),
  );

  const [modernAiButtonDesign, setModernAiButtonDesignState] =
    useState<ModernAiButtonDesignId>(
      () => initialModernAiButtonDesign ?? getSavedModernAiButtonDesign(userId),
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

  useEffect(() => {
    if (initialModernTheme) {
      setModernThemeState(initialModernTheme);
      return;
    }
    setModernThemeState(getSavedModernTheme(userId));
  }, [userId, refreshTrigger, initialModernTheme]);

  useEffect(() => {
    if (initialModernAiButtonDesign) {
      setModernAiButtonDesignState(initialModernAiButtonDesign);
      return;
    }
    setModernAiButtonDesignState(getSavedModernAiButtonDesign(userId));
  }, [userId, refreshTrigger, initialModernAiButtonDesign]);

  const colors = useMemo<ThemeColors>(
    () => getThemeColors(uiVariant, isDarkMode, modernTheme),
    [uiVariant, isDarkMode, modernTheme],
  );

  const modernPalette = useMemo<ModernPalette>(
    () => getModernPalette(isDarkMode, modernTheme),
    [isDarkMode, modernTheme],
  );

  const modernThemeMeta = useMemo<ModernThemeMeta>(
    () => getModernThemeMeta(modernTheme),
    [modernTheme],
  );

  const modernAiButtonDesignMeta = useMemo<ModernAiButtonDesignMeta>(
    () => getModernAiButtonDesignMeta(modernAiButtonDesign),
    [modernAiButtonDesign],
  );

  const modernThemeExtras = useMemo<ModernThemeExtras>(
    () => getModernThemeExtras(isDarkMode, modernTheme),
    [isDarkMode, modernTheme],
  );

  const modernShadows = useMemo<ModernShadowSet>(
    () => getModernShadows(modernThemeExtras.shadowColor),
    [modernThemeExtras.shadowColor],
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

  const setModernTheme = useCallback(
    (nextTheme: ModernThemeId) => {
      saveModernTheme(userId, nextTheme);
      setModernThemeState(nextTheme);
    },
    [userId],
  );

  const setModernAiButtonDesign = useCallback(
    (nextDesign: ModernAiButtonDesignId) => {
      saveModernAiButtonDesign(userId, nextDesign);
      setModernAiButtonDesignState(nextDesign);
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
      modernTheme,
      modernThemeMeta,
      modernThemeExtras,
      modernShadows,
      setModernTheme,
      modernAiButtonDesign,
      modernAiButtonDesignMeta,
      setModernAiButtonDesign,
    }),
    [
      isDarkMode,
      colors,
      toggleTheme,
      uiVariant,
      isModern,
      setUIVariant,
      modernPalette,
      modernTheme,
      modernThemeMeta,
      modernThemeExtras,
      modernShadows,
      setModernTheme,
      modernAiButtonDesign,
      modernAiButtonDesignMeta,
      setModernAiButtonDesign,
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

export const useModernTheme = () => {
  const {
    modernTheme,
    modernThemeMeta,
    modernThemeExtras,
    modernPalette,
    modernShadows,
    setModernTheme,
    modernAiButtonDesign,
    modernAiButtonDesignMeta,
    setModernAiButtonDesign,
  } = useTheme();
  return {
    modernTheme,
    modernThemeMeta,
    modernThemeExtras,
    modernPalette,
    modernShadows,
    setModernTheme,
    modernAiButtonDesign,
    modernAiButtonDesignMeta,
    setModernAiButtonDesign,
  };
};
