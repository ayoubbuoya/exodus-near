import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  THEME_STORAGE_KEY,
  themeColors,
  themeFromSaved,
  type Theme,
} from '../lib/theme';

const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (theme: Theme) => void;
} | null>(null);
function readTheme(): Theme {
  try {
    return themeFromSaved(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return 'dark';
  }
}
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setCurrent] = useState<Theme>(readTheme);
  useEffect(() => {
    // Paint the palette in one frame; independently fading controls briefly
    // produce low-contrast text while the foreground has already changed.
    document.documentElement.classList.add('theme-switching');
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', themeColors[theme]);
    void document.documentElement.offsetHeight;
    const frame = requestAnimationFrame(() =>
      document.documentElement.classList.remove('theme-switching'),
    );
    return () => cancelAnimationFrame(frame);
  }, [theme]);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY || event.key === null)
        setCurrent(themeFromSaved(event.newValue));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  const setTheme = (next: Theme) => {
    setCurrent(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* The theme still works when storage is blocked. */
    }
  };
  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme requires ThemeProvider');
  return context;
}
