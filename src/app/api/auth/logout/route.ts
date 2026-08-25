import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST() {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro ao efetuar logout:', error);
    return NextResponse.json(
      { error: 'Falha ao encerrar a sessão.' },
      { status: 500 }
    );
  }
}
