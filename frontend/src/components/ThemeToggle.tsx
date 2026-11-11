import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const light = theme === 'light';
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={`Switch to ${light ? 'dark' : 'light'} mode`}
      onClick={() => setTheme(light ? 'dark' : 'light')}
    >
      {light ? <Moon size={17} /> : <Sun size={17} />}
      <span>{light ? 'Dark mode' : 'Light mode'}</span>
    </button>
  );
}
