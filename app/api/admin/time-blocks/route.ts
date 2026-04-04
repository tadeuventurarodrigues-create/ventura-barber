import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getCurrentProfile } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const profile = await getCurrentProfile();

    if (!profile) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
    }

    const body = await req.json();

    if (!body.professional_id || !body.block_date || !body.start_time || !body.end_time) {
      return NextResponse.json(
        { error: 'Dados obrigatórios faltando.' },
        { status: 400 }
      );
    }

    const professional = await supabaseAdmin
      .from('professionals')
      .select('id, barbershop_id')
      .eq('id', body.professional_id)
      .single();

    if (!professional.data) {
      return NextResponse.json(
        { error: 'Barbeiro não encontrado.' },
        { status: 404 }
      );
    }

    const isAdmin = profile.role === 'admin';
    const isShopManager =
      profile.role === 'shop_manager' &&
      profile.barbershop_id === professional.data.barbershop_id;

    const isOwnerBarber =
      profile.role === 'shop_barber' && profile.professional_id === body.professional_id;

    if (!isAdmin && !isShopManager && !isOwnerBarber) {
      return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 });
    }

    const result = await supabaseAdmin
      .from('time_blocks')
      .insert({
        barbershop_id: professional.data.barbershop_id,
        professional_id: body.professional_id,
        block_date: body.block_date,
        start_time: body.start_time,
        end_time: body.end_time,
        reason: body.reason || null,
      })
      .select('*')
      .single();

    if (!result.data) {
      return NextResponse.json(
        { error: 'Erro ao salvar bloqueio.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, message: 'Bloqueio salvo.' });
  } catch (error) {
    console.error('Erro ao criar bloqueio:', error);
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
  }
}