import { NextResponse, type NextRequest } from 'next/server';
import { activationEventSchema } from '@/lib/engagement-schema';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordActivationEvent, recordAnonymousActivationEvent } from '@/services/activation';

export async function POST(request: NextRequest) {
  const parsed = activationEventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Evento inválido.' }, { status: 400 });

  if (parsed.data.eventName === 'auth_gate_shown') {
    const anonymousId = request.cookies.get('anti_erros_anon_id')?.value;
    if (!anonymousId) return NextResponse.json({ error: 'Sessão anônima ausente.' }, { status: 400 });
    await recordAnonymousActivationEvent(anonymousId, parsed.data.eventName);
    return new NextResponse(null, { status: 204 });
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  const analysisId = parsed.data.analysisId as string;
  const { data: owned } = await createAdminClient()
    .from('analyses').select('id').eq('id', analysisId).eq('user_id', user.id).maybeSingle();
  if (!owned) return NextResponse.json({ error: 'Análise não encontrada.' }, { status: 404 });

  await recordActivationEvent(user.id, parsed.data.eventName, { analysisId });
  return new NextResponse(null, { status: 204 });
}
