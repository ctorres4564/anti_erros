import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { GET } from '@/app/auth/callback/route';

describe('legacy GET /auth/callback', () => {
  it('não tenta mais trocar código PKCE nem reflete parâmetros sensíveis', async () => {
    const response = await GET(
      new NextRequest('https://anti-erros.metodoaprender.com/auth/callback?code=secret-code')
    );

    expect(response.headers.get('location')).toBe(
      'https://anti-erros.metodoaprender.com/login?auth_error=link_invalid'
    );
  });
});
