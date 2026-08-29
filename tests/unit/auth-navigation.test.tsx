import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/ThemeToggle', () => ({
  ThemeToggle: () => React.createElement('button', null, 'Tema'),
}));

vi.mock('@/components/auth/LogoutButton', () => ({
  LogoutButton: () => React.createElement('button', null, 'Sair'),
}));

import { AuthNavigation } from '@/components/auth/AuthNavigation';

describe('AuthNavigation', () => {
  it('mostra Entrar e oculta ações privadas sem sessão', () => {
    const html = renderToStaticMarkup(<AuthNavigation authenticated={false} />);

    expect(html).toContain('Entrar');
    expect(html).not.toContain('Minha conta');
    expect(html).not.toContain('Minhas análises');
    expect(html).not.toContain('Sair');
  });

  it('mostra conta, histórico e logout com sessão, sem manter Entrar', () => {
    const html = renderToStaticMarkup(<AuthNavigation authenticated />);

    expect(html).toContain('Minha conta');
    expect(html).toContain('Minhas análises');
    expect(html).toContain('Sair');
    expect(html).not.toContain('Entrar');
  });
});
