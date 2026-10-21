import {createContext, useContext} from 'react';
import {resolveTheme} from './theme';
import type {Theme} from './theme';

export const ThemeContext = createContext<Theme>(resolveTheme('light', null));
export function useTheme(): Theme {
  return useContext(ThemeContext);
}
