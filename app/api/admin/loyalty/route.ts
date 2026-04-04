import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(req: Request) {
  const body = await req.json();
  const existing = await supabaseAdmin.from('loyalty_settings').select('id').eq('barbershop_id', body.barbershop_id).maybeSingle();
  const payload = {
    barbershop_id: body.barbershop_id,
    enabled: String(body.enabled) === 'true',
    visits_required: Number(body.visits_required || 10),
    reward_label: body.reward_label || 'Corte grátis',
    reward_message: body.reward_message || null,
    rules_text: body.rules_text || null,
  };
  const result = existing.data
    ? await supabaseAdmin.from('loyalty_settings').update(payload).eq('id', existing.data.id).select('*').single()
    : await supabaseAdmin.from('loyalty_settings').insert(payload).select('*').single();
  if (!result.data) return NextResponse.json({ error: 'Erro ao salvar fidelidade.' }, { status: 500 });
  return NextResponse.json({ ok: true, message: 'Configuração de fidelidade salva.' });
}
