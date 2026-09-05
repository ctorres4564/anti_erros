import { NextResponse } from 'next/server';

/**
 * O preview com IA foi descontinuado. A rota permanece temporariamente para
 * rejeitar clientes antigos de forma explícita enquanto claims já emitidos
 * continuam válidos em /api/pending-analyses/claim.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: 'ANONYMOUS_ANALYSIS_DISCONTINUED',
      message: 'A análise de questões próprias agora exige autenticação.',
    },
    { status: 410 }
  );
}

export const runtime = 'nodejs';
