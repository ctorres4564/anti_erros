import { NextResponse, type NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  // Compatibilidade segura para links antigos: não tenta trocar um código PKCE
  // que depende do navegador onde o login foi iniciado.
  return NextResponse.redirect(new URL('/login?auth_error=link_invalid', request.url));
}
