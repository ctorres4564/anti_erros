import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  createTurnstileRenderOptions,
  TurnstileWidget,
} from '@/components/analysis/TurnstileWidget';
import { isTurnstileSubmissionBlocked } from '@/components/analysis/AnalysisForm';

describe('Turnstile interaction-only no formulário anônimo', () => {
  it('configura o widget Managed para aparecer somente quando houver interação', () => {
    const onChange = vi.fn();
    const options = createTurnstileRenderOptions('site-key-publica', onChange);

    expect(options).toMatchObject({
      sitekey: 'site-key-publica',
      appearance: 'interaction-only',
      theme: 'auto',
    });
  });

  it('token válido libera a submissão anônima', () => {
    const onChange = vi.fn();
    const options = createTurnstileRenderOptions('site-key-publica', onChange);

    options.callback('token-valido');

    expect(onChange).toHaveBeenCalledWith('token-valido', 'verified');
    expect(isTurnstileSubmissionBlocked('anonymous', true)).toBe(false);
  });

  it('ausência de token mantém a submissão anônima bloqueada', () => {
    expect(isTurnstileSubmissionBlocked('anonymous', false)).toBe(true);
    expect(isTurnstileSubmissionBlocked('authenticated', false)).toBe(false);
  });

  it('erro ou expiração invalidam o token e mantêm o tratamento de falha', () => {
    const onChange = vi.fn();
    const options = createTurnstileRenderOptions('site-key-publica', onChange);

    options['error-callback']();
    options['expired-callback']();

    expect(onChange).toHaveBeenNthCalledWith(1, undefined, 'failed');
    expect(onChange).toHaveBeenNthCalledWith(2, undefined, 'failed');
  });

  it('não reserva bloco nem exibe mensagens durante o fluxo normal', () => {
    const html = renderToStaticMarkup(
      createElement(TurnstileWidget, { onChange: vi.fn() })
    );

    expect(html).not.toContain('Verificando segurança');
    expect(html).not.toContain('Verificação concluída');
    expect(html).not.toContain('rounded-xl border bg-muted/30 p-4');
  });
});
