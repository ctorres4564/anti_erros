import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { ThemeToggle } from '@/components/ThemeToggle';
import { AnalysisForm } from '@/components/analysis/AnalysisForm';
import {
  persistThemePreference,
  readThemePreference,
  resolveTheme,
  THEME_STORAGE_KEY,
  themeInitializationScript,
} from '@/lib/theme';

describe('preferência visual antes do piloto', () => {
  let values: Map<string, string>;
  let storage: Pick<Storage, 'getItem' | 'setItem'>;

  beforeEach(() => {
    values = new Map<string, string>();
    storage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    };
  });

  it('usa SYSTEM como preferência padrão e acompanha o sistema operacional', () => {
    expect(readThemePreference(storage)).toBe('system');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('system', true)).toBe('dark');
  });

  it('permite alternar light → dark e dark → light', () => {
    persistThemePreference(storage, 'light');
    expect(readThemePreference(storage)).toBe('light');

    persistThemePreference(storage, 'dark');
    expect(readThemePreference(storage)).toBe('dark');

    persistThemePreference(storage, 'light');
    expect(readThemePreference(storage)).toBe('light');
  });

  it('persiste uma preferência válida e ignora um valor armazenado inválido', () => {
    persistThemePreference(storage, 'dark');
    expect(values.get(THEME_STORAGE_KEY)).toBe('dark');
    expect(readThemePreference(storage)).toBe('dark');

    values.set(THEME_STORAGE_KEY, 'contrast');
    expect(readThemePreference(storage)).toBe('system');
  });

  it('inicializa o tema antes da hidratação sem depender de uma cor fixa', () => {
    expect(themeInitializationScript).toContain('window.localStorage.getItem');
    expect(themeInitializationScript).toContain("prefers-color-scheme: dark");
    expect(themeInitializationScript).toContain("preference = stored === 'light'");
    expect(themeInitializationScript).toContain("root.classList.toggle('dark'");
  });

  it('renderiza um botão de tema acessível com estado atual informado', () => {
    const html = renderToStaticMarkup(createElement(ThemeToggle));

    expect(html).toContain('type="button"');
    expect(html).toContain('aria-label="Tema atual: Sistema. Escolher tema"');
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('focus-visible:ring-2');
  });

  it('mantém a renderização do formulário principal intacta', () => {
    const html = renderToStaticMarkup(createElement(AnalysisForm, { mode: 'authenticated' }));

    expect(html).toContain('<form');
    expect(html).toContain('name="question"');
    expect(html).toContain('name="userAnswer"');
    expect(html).toContain('name="correctAnswer"');
    expect(html).toContain('Criar nova análise');
  });
});
