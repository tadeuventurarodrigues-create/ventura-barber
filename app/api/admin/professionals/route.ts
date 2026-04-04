import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { normalizePhone } from '@/lib/phone';
import { getCurrentProfile } from '@/lib/auth';

function normalizeEvolutionUrl(value: string) {
  return String(value || '').trim().replace(/\/+$/, '');
}

async function replaceProfessionalServices(professionalId: string, serviceIds: string[]) {
  await supabaseAdmin.from('professional_services').delete().eq('professional_id', professionalId);

  const uniqueIds = [...new Set((serviceIds || []).filter(Boolean))];
  if (!uniqueIds.length) return [];

  const payload = uniqueIds.map((serviceId) => ({
    professional_id: professionalId,
    service_id: serviceId,
  }));

  const result = await supabaseAdmin
    .from('professional_services')
    .insert(payload)
    .select('id, professional_id, service_id, custom_price, custom_duration_minutes');

  return result.data || [];
}

export async function POST(req: Request) {
  try {
    const currentProfile = await getCurrentProfile();

    if (!currentProfile || currentProfile.role !== 'admin') {
      return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 });
    }

    const body = await req.json();

    const barbershopId = String(body.barbershop_id || '').trim();
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '').trim();
    const specialty = String(body.specialty || '').trim();
    const description = String(body.description || '').trim();
    const whatsappNumber = normalizePhone(String(body.whatsapp_number || '').trim());
    const photoUrl = String(body.photo_url || '').trim();
    const isActive = body.is_active === undefined ? true : Boolean(body.is_active);
    const acceptsBooking = body.accepts_booking === undefined ? true : Boolean(body.accepts_booking);
    const serviceIds = Array.isArray(body.service_ids) ? body.service_ids : [];

    const evolutionEnabled = Boolean(body.evolution_enabled);
    const evolutionApiUrl = normalizeEvolutionUrl(body.evolution_api_url || '');
    const evolutionInstance = String(body.evolution_instance || '').trim();
    const evolutionApiKey = String(body.evolution_api_key || '').trim();

    if (!barbershopId || !name || !email || !password) {
      return NextResponse.json(
        { error: 'Barbearia, nome, email e senha são obrigatórios.' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'A senha inicial deve ter pelo menos 6 caracteres.' },
        { status: 400 }
      );
    }

    if (evolutionEnabled && (!evolutionApiUrl || !evolutionInstance || !evolutionApiKey)) {
      return NextResponse.json(
        {
          error:
            'Quando a Evolution do barbeiro estiver ativada, URL, instância e API Key são obrigatórios.',
        },
        { status: 400 }
      );
    }

    const authResult = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name,
        role: 'shop_barber',
      },
    });

    if (authResult.error || !authResult.data.user) {
      return NextResponse.json(
        { error: authResult.error?.message || 'Erro ao criar usuário de login.' },
        { status: 500 }
      );
    }

    const authUser = authResult.data.user;

    const professionalResult = await supabaseAdmin
      .from('professionals')
      .insert({
        barbershop_id: barbershopId,
        name,
        specialty: specialty || null,
        description: description || null,
        whatsapp_number: whatsappNumber || null,
        photo_url: photoUrl || null,
        is_active: isActive,
        accepts_booking: acceptsBooking,
        evolution_enabled: evolutionEnabled,
        evolution_api_url: evolutionApiUrl || null,
        evolution_instance: evolutionInstance || null,
        evolution_api_key: evolutionApiKey || null,
      })
      .select('*')
      .single();

    if (!professionalResult.data) {
      await supabaseAdmin.auth.admin.deleteUser(authUser.id);
      return NextResponse.json({ error: 'Erro ao criar barbeiro.' }, { status: 500 });
    }

    const professional = professionalResult.data;

    const profileResult = await supabaseAdmin
      .from('profiles')
      .insert({
        id: authUser.id,
        email,
        name,
        role: 'shop_barber',
        barbershop_id: barbershopId,
        professional_id: professional.id,
      })
      .select('*')
      .single();

    if (!profileResult.data) {
      await supabaseAdmin.from('professionals').delete().eq('id', professional.id);
      await supabaseAdmin.auth.admin.deleteUser(authUser.id);
      return NextResponse.json({ error: 'Erro ao criar profile do barbeiro.' }, { status: 500 });
    }

    const assignments = await replaceProfessionalServices(professional.id, serviceIds);

    return NextResponse.json({
      ok: true,
      message: 'Barbeiro criado com sucesso.',
      professional,
      profile: profileResult.data,
      professional_services: assignments,
    });
  } catch (error) {
    console.error('Erro ao adicionar barbeiro:', error);
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const currentProfile = await getCurrentProfile();

    if (
      !currentProfile ||
      (currentProfile.role !== 'admin' &&
        currentProfile.role !== 'shop_manager' &&
        currentProfile.role !== 'shop_barber')
    ) {
      return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 });
    }

    const body = await req.json();

    if (!body.id) {
      return NextResponse.json({ error: 'ID do barbeiro é obrigatório.' }, { status: 400 });
    }

    const isAdmin = currentProfile.role === 'admin';
    const isShopManager = currentProfile.role === 'shop_manager';
    const isOwnerBarber =
      currentProfile.role === 'shop_barber' && currentProfile.professional_id === body.id;

    if (!isAdmin && !isShopManager && !isOwnerBarber) {
      return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 });
    }

    const evolutionEnabled = Boolean(body.evolution_enabled);
    const evolutionApiUrl = normalizeEvolutionUrl(body.evolution_api_url || '');
    const evolutionInstance = String(body.evolution_instance || '').trim();
    const evolutionApiKey = String(body.evolution_api_key || '').trim();
    const serviceIds = Array.isArray(body.service_ids) ? body.service_ids : [];

    if (evolutionEnabled && (!evolutionApiUrl || !evolutionInstance || !evolutionApiKey)) {
      return NextResponse.json(
        {
          error:
            'Quando a Evolution do barbeiro estiver ativada, URL, instância e API Key são obrigatórios.',
        },
        { status: 400 }
      );
    }

    const result = await supabaseAdmin
      .from('professionals')
      .update({
        name: body.name,
        specialty: body.specialty || null,
        description: body.description || null,
        whatsapp_number: normalizePhone(body.whatsapp_number || ''),
        photo_url: body.photo_url || null,
        is_active: body.is_active === undefined ? true : Boolean(body.is_active),
        accepts_booking: body.accepts_booking === undefined ? true : Boolean(body.accepts_booking),
        evolution_enabled: evolutionEnabled,
        evolution_api_url: evolutionApiUrl || null,
        evolution_instance: evolutionInstance || null,
        evolution_api_key: evolutionApiKey || null,
      })
      .eq('id', body.id)
      .select('*')
      .single();

    if (!result.data) {
      return NextResponse.json({ error: 'Erro ao atualizar barbeiro.' }, { status: 500 });
    }

    if (body.name || body.email) {
      await supabaseAdmin
        .from('profiles')
        .update({
          name: body.name || null,
          email: body.email ? String(body.email).trim().toLowerCase() : undefined,
        })
        .eq('professional_id', body.id);
    }

    const profileRes = await supabaseAdmin
      .from('profiles')
      .select('id, email, name, role, barbershop_id, professional_id')
      .eq('professional_id', body.id)
      .maybeSingle();

    const assignments = await replaceProfessionalServices(body.id, serviceIds);

    return NextResponse.json({
      ok: true,
      message: 'Barbeiro atualizado.',
      professional: result.data,
      profile: profileRes.data || null,
      professional_services: assignments,
    });
  } catch (error) {
    console.error('Erro ao atualizar barbeiro:', error);
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const currentProfile = await getCurrentProfile();

    if (!currentProfile || currentProfile.role !== 'admin') {
      return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 });
    }

    const body = await req.json();
    const id = String(body.id || '').trim();

    if (!id) {
      return NextResponse.json({ error: 'ID do barbeiro é obrigatório.' }, { status: 400 });
    }

    const bookings = await supabaseAdmin.from('bookings').select('id').eq('professional_id', id).limit(1);
    if (bookings.data?.length) {
      return NextResponse.json({ error: 'Esse barbeiro já possui agendamentos. Desative em vez de excluir.' }, { status: 409 });
    }

    const profileRes = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('professional_id', id)
      .maybeSingle();

    await supabaseAdmin.from('professional_services').delete().eq('professional_id', id);
    await supabaseAdmin.from('working_hours').delete().eq('professional_id', id);
    await supabaseAdmin.from('profiles').delete().eq('professional_id', id);
    const result = await supabaseAdmin.from('professionals').delete().eq('id', id).select('id').single();

    if (profileRes.data?.id) {
      await supabaseAdmin.auth.admin.deleteUser(profileRes.data.id);
    }

    if (result.error || !result.data) {
      return NextResponse.json({ error: result.error?.message || 'Erro ao excluir barbeiro.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: 'Barbeiro excluído.', id });
  } catch (error) {
    console.error('Erro ao excluir barbeiro:', error);
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
  }
}
