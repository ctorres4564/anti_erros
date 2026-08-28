import { NextResponse, type NextRequest } from 'next/server';
import { disciplineConfirmationSchema } from '@/lib/engagement-schema';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { isOnboardingComplete } from '@/services/onboarding';
import { recordActivationEvent } from '@/services/activation';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  if (!(await isOnboardingComplete(user.id))) {
    return NextResponse.json({ error: 'Complete o onboarding.' }, { status: 403 });
  }

  const parsed = disciplineConfirmationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Disciplina inválida.' }, { status: 400 });

  const { id } = await params;
  const confirmedAt = new Date().toISOString();
  const { data, error } = await createAdminClient()
    .from('analyses')
    .update({ discipline_confirmed: parsed.data.discipline, discipline_confirmed_at: confirmedAt })
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id, discipline, discipline_confirmed, discipline_confirmed_at')
    .maybeSingle();

  if (error) return NextResponse.json({ error: 'Não foi possível confirmar a disciplina.' }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Análise não encontrada.' }, { status: 404 });

  await recordActivationEvent(user.id, 'discipline_confirmed', { analysisId: id });
  return NextResponse.json({
    discipline: data.discipline,
    confirmedDiscipline: data.discipline_confirmed,
    confirmedAt: data.discipline_confirmed_at,
  });
}
