import { NextResponse, type NextRequest } from 'next/server';
import { analysisFeedbackSchema } from '@/lib/engagement-schema';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { isOnboardingComplete } from '@/services/onboarding';
import { recordActivationEvent } from '@/services/activation';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  if (!(await isOnboardingComplete(user.id))) {
    return NextResponse.json({ error: 'Complete o onboarding.' }, { status: 403 });
  }

  const parsed = analysisFeedbackSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Feedback inválido.' }, { status: 400 });

  const { id } = await params;
  const admin = createAdminClient();
  const { data: ownedAnalysis, error: ownershipError } = await admin
    .from('analyses').select('id').eq('id', id).eq('user_id', user.id).maybeSingle();
  if (ownershipError) return NextResponse.json({ error: 'Não foi possível validar a análise.' }, { status: 500 });
  if (!ownedAnalysis) return NextResponse.json({ error: 'Análise não encontrada.' }, { status: 404 });

  const now = new Date().toISOString();
  const { data, error } = await admin.from('analysis_feedback').upsert({
    analysis_id: id,
    user_id: user.id,
    rating: parsed.data.rating,
    comment: parsed.data.comment ?? null,
    updated_at: now,
  }, { onConflict: 'analysis_id' }).select('rating, comment, updated_at').single();

  if (error || !data) return NextResponse.json({ error: 'Não foi possível salvar o feedback.' }, { status: 500 });
  await recordActivationEvent(user.id, 'feedback_submitted', { analysisId: id, rating: data.rating });
  return NextResponse.json({ rating: data.rating, comment: data.comment, updatedAt: data.updated_at });
}
