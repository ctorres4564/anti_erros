export const THEME_STORAGE_KEY = 'anti-erros-theme';

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ResolvedTheme = Exclude<ThemePreference, 'system'>;

export const THEME_LABELS: Record<ThemePreference, string> = {
  system: 'Sistema',
  light: 'Claro',
  dark: 'Escuro',
};

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && THEME_PREFERENCES.includes(value as ThemePreference);
}

export function readThemePreference(storage: Pick<Storage, 'getItem'>): ThemePreference {
  try {
    const stored = storage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

export function persistThemePreference(
  storage: Pick<Storage, 'setItem'>,
  preference: ThemePreference
): void {
  try {
    storage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // The visual preference still applies for the current page when storage is unavailable.
  }
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light';
  return preference;
}

export const themeInitializationScript = `
(function () {
  try {
    var stored = window.localStorage.getItem('${THEME_STORAGE_KEY}');
    var preference = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
    var systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var resolved = preference === 'system' ? (systemPrefersDark ? 'dark' : 'light') : preference;
    var root = document.documentElement;
    root.classList.toggle('dark', resolved === 'dark');
    root.dataset.theme = resolved;
    root.dataset.themePreference = preference;
    root.style.colorScheme = resolved;
  } catch (_) {}
})();`;
