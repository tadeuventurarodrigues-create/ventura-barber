import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

function normalizeMessage(message: unknown) {
  return String(message || '').trim();
}

export async function PUT(req: Request) {
  try {
    const profile = await getCurrentProfile();

    if (!profile || profile.role !== 'shop_barber' || !profile.professional_id || !profile.barbershop_id) {
      return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 });
    }

    const body = await req.json();
    const enabled = Boolean(body.enabled);
    const message = normalizeMessage(body.message);

    if (enabled && !message) {
      return NextResponse.json(
        { error: 'Informe a mensagem automática que será enviada.' },
        { status: 400 }
      );
    }

    const result = await supabaseAdmin
      .from('professionals')
      .update({
        auto_reply_enabled: enabled,
        auto_reply_message: message || null,
      })
      .eq('id', profile.professional_id)
      .eq('barbershop_id', profile.barbershop_id)
      .select('id, auto_reply_enabled, auto_reply_message')
      .single();

    if (result.error || !result.data) {
      return NextResponse.json(
        { error: result.error?.message || 'Erro ao salvar resposta automática.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: 'Resposta automática salva com sucesso.',
      config: result.data,
    });
  } catch (error) {
    console.error('Erro ao salvar resposta automática do WhatsApp:', error);
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
  }
}
