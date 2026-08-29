'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Check, Monitor, Moon, Sun } from 'lucide-react';
import {
  persistThemePreference,
  readThemePreference,
  resolveTheme,
  THEME_LABELS,
  THEME_PREFERENCES,
  type ResolvedTheme,
  type ThemePreference,
} from '@/lib/theme';

const THEME_ICONS = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};

const THEME_CHANGE_EVENT = 'anti-erros-theme-change';

function subscribeToThemePreference(onStoreChange: () => void) {
  window.addEventListener('storage', onStoreChange);
  window.addEventListener(THEME_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener('storage', onStoreChange);
    window.removeEventListener(THEME_CHANGE_EVENT, onStoreChange);
  };
}

function subscribeToSystemTheme(onStoreChange: () => void) {
  const systemPreference = window.matchMedia('(prefers-color-scheme: dark)');
  systemPreference.addEventListener('change', onStoreChange);
  return () => systemPreference.removeEventListener('change', onStoreChange);
}

function applyResolvedTheme(resolved: ResolvedTheme, preference: ThemePreference) {
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.dataset.theme = resolved;
  root.dataset.themePreference = preference;
  root.style.colorScheme = resolved;
}

export function ThemeToggle() {
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const preference = useSyncExternalStore(
    subscribeToThemePreference,
    () => readThemePreference(window.localStorage),
    () => 'system' as ThemePreference
  );
  const systemPrefersDark = useSyncExternalStore(
    subscribeToSystemTheme,
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
    () => false
  );
  const resolvedTheme = resolveTheme(preference, systemPrefersDark);

  useEffect(() => {
    const storedPreference = readThemePreference(window.localStorage);
    applyResolvedTheme(resolveTheme(storedPreference, systemPrefersDark), storedPreference);
  }, [preference, systemPrefersDark]);

  const selectTheme = (nextPreference: ThemePreference) => {
    const resolved = resolveTheme(
      nextPreference,
      window.matchMedia('(prefers-color-scheme: dark)').matches
    );
    persistThemePreference(window.localStorage, nextPreference);
    applyResolvedTheme(resolved, nextPreference);
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
    setOpen(false);
  };

  const CurrentIcon = resolvedTheme === 'dark' ? Moon : Sun;

  return (
    <div
      ref={menuRef}
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setOpen(false);
          menuRef.current?.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')?.focus();
        }
      }}
    >
      <button
        type="button"
        aria-label={`Tema atual: ${THEME_LABELS[preference]}. Escolher tema`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-lg border bg-card text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      >
        <CurrentIcon className="h-[18px] w-[18px]" aria-hidden="true" />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Escolher tema"
          className="absolute right-0 top-full z-50 mt-2 w-44 rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-lg"
        >
          {THEME_PREFERENCES.map((theme) => {
            const Icon = THEME_ICONS[theme];
            const selected = preference === theme;
            return (
              <button
                key={theme}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => selectTheme(theme)}
                className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span className="flex-1">{THEME_LABELS[theme]}</span>
                {selected ? <Check className="h-4 w-4 text-primary" aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}

      <span className="sr-only" aria-live="polite">
        Tema {THEME_LABELS[preference]}, aparência {THEME_LABELS[resolvedTheme].toLowerCase()}.
      </span>
    </div>
  );
}
