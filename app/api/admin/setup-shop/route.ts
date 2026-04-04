import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getCurrentProfile } from '@/lib/auth';
import { normalizePhone } from '@/lib/phone';

function clean(value: FormDataEntryValue | string | null | undefined) {
  return String(value || '').trim();
}

function normalizeEvolutionUrl(value: string) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function slugify(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function buildUniqueSlug(desiredSlug: string, shopName: string) {
  const base = slugify(desiredSlug || shopName) || 'barbearia';
  let candidate = base;
  let counter = 2;

  while (true) {
    const existing = await supabaseAdmin
      .from('barbershops')
      .select('id')
      .eq('slug', candidate)
      .maybeSingle();

    if (!existing.data) return candidate;

    candidate = `${base}-${counter}`;
    counter += 1;
  }
}

export async function POST(req: Request) {
  try {
    const currentProfile = await getCurrentProfile();

    if (!currentProfile || currentProfile.role !== 'admin') {
      return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 });
    }

    const body = await req.json();

    const shop = body.barbershop || body.shop || {};
    const manager = body.shopManager || {};
    const loyalty = body.loyalty || {};
    const barber = body.firstBarber || body.barber || {};
    const firstService = body.firstService || body.service || {};
    const firstBarberWorkingHours = Array.isArray(body.firstBarberWorkingHours)
      ? body.firstBarberWorkingHours
      : [];

    const shopName = clean(shop.name);
    const requestedSlug = clean(shop.slug).toLowerCase();
    const shopWhatsapp = normalizePhone(clean(shop.whatsapp_number));
    const shopAddress = clean(shop.address);
    const shopDescription = clean(shop.description);
    const shopLogoUrl = clean(shop.logo_url);
    const shopCoverUrl = clean(shop.cover_image_url || shop.cover_url);
    const shopPrimaryColor = clean(shop.primary_color) || '#d4a15a';
    const shopOpeningHoursText = clean(shop.opening_hours_text);

    if (!shopName) {
      return NextResponse.json({ error: 'Nome da barbearia é obrigatório.' }, { status: 400 });
    }

    if (!manager.name || !manager.email || !manager.password) {
      return NextResponse.json(
        { error: 'Nome, email e senha da conta da barbearia são obrigatórios.' },
        { status: 400 }
      );
    }

    if (String(manager.password).length < 6) {
      return NextResponse.json(
        { error: 'A senha da barbearia deve ter pelo menos 6 caracteres.' },
        { status: 400 }
      );
    }

    const shopSlug = await buildUniqueSlug(requestedSlug, shopName);

    const existingManager = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', clean(manager.email).toLowerCase())
      .maybeSingle();

    if (existingManager.data) {
      return NextResponse.json(
        { error: 'Já existe um perfil com esse email da barbearia.' },
        { status: 409 }
      );
    }

    const shopResult = await supabaseAdmin
      .from('barbershops')
      .insert({
        name: shopName,
        slug: shopSlug,
        whatsapp_number: shopWhatsapp || null,
        address: shopAddress || null,
        description: shopDescription || null,
        logo_url: shopLogoUrl || null,
        cover_image_url: shopCoverUrl || null,
        primary_color: shopPrimaryColor,
        opening_hours_text: shopOpeningHoursText || null,
      })
      .select('*')
      .single();

    if (shopResult.error || !shopResult.data) {
      return NextResponse.json(
        { error: shopResult.error?.message || 'Erro ao criar barbearia.' },
        { status: 500 }
      );
    }

    const barbershop = shopResult.data;

    const managerEmail = clean(manager.email).toLowerCase();
    const managerAuth = await supabaseAdmin.auth.admin.createUser({
      email: managerEmail,
      password: String(manager.password),
      email_confirm: true,
      user_metadata: {
        name: clean(manager.name),
        role: 'shop_manager',
      },
    });

    if (managerAuth.error || !managerAuth.data.user) {
      await supabaseAdmin.from('barbershops').delete().eq('id', barbershop.id);
      return NextResponse.json(
        { error: managerAuth.error?.message || 'Erro ao criar login da barbearia.' },
        { status: 500 }
      );
    }

    const managerProfile = await supabaseAdmin
      .from('profiles')
      .insert({
        id: managerAuth.data.user.id,
        email: managerEmail,
        name: clean(manager.name),
        role: 'shop_manager',
        barbershop_id: barbershop.id,
        professional_id: null,
      })
      .select('*')
      .single();

    if (managerProfile.error || !managerProfile.data) {
      await supabaseAdmin.auth.admin.deleteUser(managerAuth.data.user.id);
      await supabaseAdmin.from('barbershops').delete().eq('id', barbershop.id);
      return NextResponse.json({ error: 'Erro ao criar perfil da barbearia.' }, { status: 500 });
    }

    let createdProfessional: any = null;
    let createdBarberProfile: any = null;

    if (barber?.name && barber?.email && barber?.password) {
      const barberName = clean(barber.name);
      const barberEmail = clean(barber.email).toLowerCase();
      const barberPassword = clean(barber.password);
      const barberSpecialty = clean(barber.specialty);
      const barberDescription = clean(barber.description);
      const barberWhatsapp = normalizePhone(clean(barber.whatsapp_number));
      const barberPhotoUrl = clean(barber.photo_url);
      const evolutionEnabled = Boolean(barber.evolution_enabled);
      const evolutionApiUrl = normalizeEvolutionUrl(barber.evolution_api_url || '');
      const evolutionInstance = clean(barber.evolution_instance);
      const evolutionApiKey = clean(barber.evolution_api_key);

      if (barberPassword.length < 6) {
        return NextResponse.json(
          { error: 'A senha do primeiro barbeiro deve ter pelo menos 6 caracteres.' },
          { status: 400 }
        );
      }

      if (evolutionEnabled && (!evolutionApiUrl || !evolutionInstance || !evolutionApiKey)) {
        return NextResponse.json(
          {
            error:
              'No primeiro barbeiro, quando a Evolution estiver ativada, URL, instância e API Key são obrigatórios.',
          },
          { status: 400 }
        );
      }

      const existingBarber = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('email', barberEmail)
        .maybeSingle();

      if (existingBarber.data) {
        return NextResponse.json(
          { error: 'Já existe um perfil com esse email do barbeiro.' },
          { status: 409 }
        );
      }

      const authResult = await supabaseAdmin.auth.admin.createUser({
        email: barberEmail,
        password: barberPassword,
        email_confirm: true,
        user_metadata: {
          name: barberName,
          role: 'shop_barber',
        },
      });

      if (authResult.error || !authResult.data.user) {
        return NextResponse.json(
          { error: authResult.error?.message || 'Erro ao criar login do barbeiro.' },
          { status: 500 }
        );
      }

      const professionalResult = await supabaseAdmin
        .from('professionals')
        .insert({
          barbershop_id: barbershop.id,
          name: barberName,
          specialty: barberSpecialty || null,
          description: barberDescription || null,
          whatsapp_number: barberWhatsapp || null,
          photo_url: barberPhotoUrl || null,
          is_active: true,
          accepts_booking: true,
          evolution_enabled: evolutionEnabled,
          evolution_api_url: evolutionApiUrl || null,
          evolution_instance: evolutionInstance || null,
          evolution_api_key: evolutionApiKey || null,
        })
        .select('*')
        .single();

      if (!professionalResult.data) {
        await supabaseAdmin.auth.admin.deleteUser(authResult.data.user.id);
        return NextResponse.json({ error: 'Erro ao criar primeiro barbeiro.' }, { status: 500 });
      }

      createdProfessional = professionalResult.data;

      const profileResult = await supabaseAdmin
        .from('profiles')
        .insert({
          id: authResult.data.user.id,
          email: barberEmail,
          name: barberName,
          role: 'shop_barber',
          barbershop_id: barbershop.id,
          professional_id: createdProfessional.id,
        })
        .select('*')
        .single();

      if (!profileResult.data) {
        await supabaseAdmin.from('professionals').delete().eq('id', createdProfessional.id);
        await supabaseAdmin.auth.admin.deleteUser(authResult.data.user.id);
        return NextResponse.json(
          { error: 'Erro ao criar profile do primeiro barbeiro.' },
          { status: 500 }
        );
      }

      createdBarberProfile = profileResult.data;

      if (firstBarberWorkingHours.length) {
        const rows = firstBarberWorkingHours
          .filter((item: any) => item && Number(item.weekday) >= 0 && Number(item.weekday) <= 6)
          .map((item: any) => ({
            barbershop_id: barbershop.id,
            professional_id: createdProfessional.id,
            weekday: Number(item.weekday),
            start_time: item.enabled ? clean(item.start_time) || '08:00' : '00:00',
            end_time: item.enabled ? clean(item.end_time) || '18:00' : '00:00',
            break_start_time:
              item.enabled && clean(item.break_start_time) ? clean(item.break_start_time) : null,
            break_end_time:
              item.enabled && clean(item.break_end_time) ? clean(item.break_end_time) : null,
            slot_interval_minutes: Number(item.slot_interval_minutes || 30),
            is_active: Boolean(item.enabled),
          }));

        if (rows.length) {
          await supabaseAdmin.from('working_hours').insert(rows);
        }
      }
    }

    let createdService: any = null;
    if (firstService?.name) {
      const serviceName = clean(firstService.name);
      const servicePrice = Number(firstService.price || 0);
      const serviceDuration = Number(firstService.duration_minutes || 30);
      const serviceDescription = clean(firstService.description);

      if (serviceName) {
        const serviceResult = await supabaseAdmin
          .from('services')
          .insert({
            barbershop_id: barbershop.id,
            name: serviceName,
            price: servicePrice,
            duration_minutes: serviceDuration,
            description: serviceDescription || null,
            is_active: true,
          })
          .select('*')
          .single();
        createdService = serviceResult.data || null;
      }
    }

    await supabaseAdmin.from('loyalty_settings').upsert(
      {
        barbershop_id: barbershop.id,
        enabled: Boolean(loyalty.enabled),
        visits_required: Number(loyalty.visits_required || 10),
        reward_label: loyalty.reward_label || 'Corte grátis',
        rules_text: loyalty.rules_text || null,
        reward_message: loyalty.reward_message || null,
      },
      { onConflict: 'barbershop_id' }
    );

    return NextResponse.json({
      ok: true,
      message: `Barbearia criada com sucesso. Slug criado: ${shopSlug}`,
      barbershop,
      shopManager: managerProfile.data,
      professional: createdProfessional,
      profile: createdBarberProfile,
      service: createdService,
    });
  } catch (error) {
    console.error('Erro em setup-shop:', error);
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
  }
}