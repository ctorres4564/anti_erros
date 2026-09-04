import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  generateSimpleExplanation,
  simpleExplanationInputSchema,
  simpleExplanationRateLimitKey,
  SimpleExplanationError,
  SIMPLE_EXPLANATION_RATE_LIMIT_MAX,
  SIMPLE_EXPLANATION_RATE_LIMIT_WINDOW_MS,
} from '@/lib/ai/simple-explanation';
import { checkRateLimit } from '@/lib/security/rate-limit';
import type { GeminiCallTelemetry } from '@/lib/ai/usage';
import { recordAuthenticatedAiUsage } from '@/services/ai-usage';

/**
 * Explicação simples da questão, sob demanda (clique explícito do estudante).
 *
 * Esta rota NÃO executa o motor de análise, NÃO reclassifica o erro, NÃO lê nem
 * escreve em `analyses` / `pending_analyses` e NÃO persiste a explicação.
 * Nada aqui é registrado em log além do código técnico do erro — nunca o
 * conteúdo da questão ou da resposta.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Sessão expirada ou usuário não autenticado.' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const parsed = simpleExplanationInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados inválidos para gerar a explicação.' }, { status: 400 });
    }

    // Rate limit próprio (em memória, por usuário), aplicado só a requisições
    // bem formadas e sempre ANTES de qualquer chamada ao Gemini.
    const rateLimit = checkRateLimit(
      simpleExplanationRateLimitKey(user.id),
      SIMPLE_EXPLANATION_RATE_LIMIT_MAX,
      SIMPLE_EXPLANATION_RATE_LIMIT_WINDOW_MS
    );

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error:
            'Você pediu muitas explicações em pouco tempo. Aguarde alguns minutos e tente novamente.',
        },
        { status: 429 }
      );
    }

    // Telemetria de consumo, best-effort e sempre gravada — inclusive quando a
    // chamada falha, para não perder custo de chamadas com erro.
    const geminiCalls: GeminiCallTelemetry[] = [];
    const flushUsage = async () => {
      try {
        for (const call of geminiCalls) {
          await recordAuthenticatedAiUsage(user.id, call);
        }
      } catch {
        // Telemetria jamais derruba a explicação.
      } finally {
        geminiCalls.length = 0;
      }
    };

    let explanation: string;
    try {
      explanation = await generateSimpleExplanation(parsed.data, {
        onGeminiCall: (telemetry) => geminiCalls.push(telemetry),
      });
    } catch (error) {
      await flushUsage();
      throw error;
    }

    await flushUsage();

    return NextResponse.json({ explanation }, { status: 200 });
  } catch (error) {
    const code = error instanceof SimpleExplanationError ? error.code : 'UNKNOWN';
    console.warn('Falha ao gerar explicação simples.', { code });

    const status = code === 'TIMEOUT' ? 503 : code === 'HTTP_ERROR' ? 502 : 500;
    return NextResponse.json(
      { error: 'Não foi possível gerar a explicação agora. Tente novamente.' },
      { status }
    );
  }
}

export const runtime = 'nodejs';
