export type Theme = 'dark' | 'light';
export const THEME_STORAGE_KEY = 'exodus-near-theme';
export function themeFromSaved(value: string | null): Theme {
  return value === 'light' ? 'light' : 'dark';
}
export const themeColors = { dark: '#080c14', light: '#eef2f8' };
