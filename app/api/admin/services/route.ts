import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

function parseMoney(value: unknown) {
  return Number(String(value || '0').replace(',', '.'));
}

async function canManageServiceBarbershop(profile: Awaited<ReturnType<typeof getCurrentProfile>>, barbershopId: string) {
  if (!profile) return false;
  if (profile.role === 'admin') return true;

  if ((profile.role === 'shop_manager' || profile.role === 'shop_barber') && profile.barbershop_id) {
    return profile.barbershop_id === barbershopId;
  }

  return false;
}

async function getServiceBarbershopId(serviceId: string) {
  const result = await supabaseAdmin
    .from('services')
    .select('id, barbershop_id')
    .eq('id', serviceId)
    .maybeSingle();

  return result.data || null;
}

export async function POST(req: Request) {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 });
    }

    const body = await req.json();
    const barbershopId = String(body.barbershop_id || '').trim();
    const name = String(body.name || '').trim();
    const description = String(body.description || '').trim();
    const price = parseMoney(body.price);
    const duration = Number(body.duration_minutes || 0);
    const isActive = body.is_active === undefined ? true : Boolean(body.is_active);

    if (!barbershopId || !name || !price || !duration) {
      return NextResponse.json(
        { error: 'Barbearia, nome, valor e duração são obrigatórios.' },
        { status: 400 }
      );
    }

    const allowed = await canManageServiceBarbershop(profile, barbershopId);
    if (!allowed) {
      return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 });
    }

    const result = await supabaseAdmin
      .from('services')
      .insert({
        barbershop_id: barbershopId,
        name,
        description: description || null,
        price,
        duration_minutes: duration,
        is_active: isActive,
      })
      .select('*')
      .single();

    if (result.error || !result.data) {
      return NextResponse.json(
        { error: result.error?.message || 'Erro ao adicionar serviço.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, message: 'Serviço adicionado.', service: result.data });
  } catch (error) {
    console.error('Erro ao criar serviço:', error);
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 });
    }

    const body = await req.json();
    const id = String(body.id || '').trim();
    const name = String(body.name || '').trim();
    const description = String(body.description || '').trim();
    const price = parseMoney(body.price);
    const duration = Number(body.duration_minutes || 0);
    const isActive = Boolean(body.is_active);

    if (!id || !name || !price || !duration) {
      return NextResponse.json(
        { error: 'ID, nome, valor e duração são obrigatórios.' },
        { status: 400 }
      );
    }

    const existing = await getServiceBarbershopId(id);
    if (!existing) {
      return NextResponse.json({ error: 'Serviço não encontrado.' }, { status: 404 });
    }

    const allowed = await canManageServiceBarbershop(profile, existing.barbershop_id);
    if (!allowed) {
      return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 });
    }

    const result = await supabaseAdmin
      .from('services')
      .update({
        name,
        description: description || null,
        price,
        duration_minutes: duration,
        is_active: isActive,
      })
      .eq('id', id)
      .select('*')
      .single();

    if (result.error || !result.data) {
      return NextResponse.json(
        { error: result.error?.message || 'Erro ao atualizar serviço.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, message: 'Serviço atualizado.', service: result.data });
  } catch (error) {
    console.error('Erro ao atualizar serviço:', error);
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 });
    }

    const body = await req.json();
    const id = String(body.id || '').trim();

    if (!id) {
      return NextResponse.json({ error: 'ID do serviço é obrigatório.' }, { status: 400 });
    }

    const existing = await getServiceBarbershopId(id);
    if (!existing) {
      return NextResponse.json({ error: 'Serviço não encontrado.' }, { status: 404 });
    }

    const allowed = await canManageServiceBarbershop(profile, existing.barbershop_id);
    if (!allowed) {
      return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 });
    }

    const bookings = await supabaseAdmin.from('bookings').select('id').eq('service_id', id).limit(1);
    if (bookings.data?.length) {
      return NextResponse.json(
        { error: 'Esse serviço já possui agendamentos. Desative em vez de excluir.' },
        { status: 409 }
      );
    }

    await supabaseAdmin.from('professional_services').delete().eq('service_id', id);

    const result = await supabaseAdmin.from('services').delete().eq('id', id).select('id').single();
    if (result.error || !result.data) {
      return NextResponse.json(
        { error: result.error?.message || 'Erro ao excluir serviço.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, message: 'Serviço excluído.', id });
  } catch (error) {
    console.error('Erro ao excluir serviço:', error);
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
  }
}
