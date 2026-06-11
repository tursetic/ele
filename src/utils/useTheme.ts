import { useState, useEffect, useCallback } from 'react';
import { ThemeMode } from '../types';

function getSystemPreference(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getStoredTheme(): ThemeMode {
  try {
    const stored = localStorage.getItem('themeMode');
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
    // No valid theme stored, default to 'system' and save it
    localStorage.setItem('themeMode', 'system');
  } catch (_) {}
  return 'system';
}

function saveTheme(theme: ThemeMode) {
  try {
    localStorage.setItem('themeMode', theme);
  } catch (_) {}
}

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(getStoredTheme);
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() => {
    const mode = getStoredTheme();
    return mode === 'system' ? getSystemPreference() : mode;
  });

  useEffect(() => {
    const applyTheme = (theme: 'light' | 'dark') => {
      const root = document.documentElement;
      if (theme === 'dark') {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
      setResolvedTheme(theme);
    };

    const updateTheme = () => {
      const activeTheme = mode === 'system' ? getSystemPreference() : mode;
      applyTheme(activeTheme);
    };

    updateTheme();

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (mode === 'system') {
        updateTheme();
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [mode]);

  const setTheme = useCallback((newMode: ThemeMode) => {
    setMode(newMode);
    saveTheme(newMode);
  }, []);

  return { mode, resolvedTheme, setTheme };
}
