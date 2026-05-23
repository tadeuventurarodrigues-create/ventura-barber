import { NextResponse } from 'next/server';
import { normalizePhone } from '@/lib/phone';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ensureBarbershopSubscription } from '@/lib/subscriptions';

function clean(value: unknown) {
  return String(value || '').trim();
}

function normalizeEmail(value: unknown) {
  return clean(value).toLowerCase();
}

function slugify(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function buildUniqueSlug(shopName: string) {
  const base = slugify(shopName) || 'barbearia';
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
  let createdAuthUserId: string | null = null;
  let createdBarbershopId: string | null = null;

  try {
    const body = await req.json();
    const ownerName = clean(body.owner_name);
    const shopName = clean(body.shop_name);
    const city = clean(body.city);
    const whatsapp = normalizePhone(clean(body.whatsapp));
    const email = normalizeEmail(body.email);
    const password = clean(body.password);

    if (!ownerName || !shopName || !city || !whatsapp || !email || !password) {
      return NextResponse.json({ error: 'Preencha todos os campos obrigatorios.' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'A senha precisa ter pelo menos 6 caracteres.' }, { status: 400 });
    }

    const existingProfile = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existingProfile.data) {
      return NextResponse.json({ error: 'Ja existe uma conta com esse email.' }, { status: 409 });
    }

    const slug = await buildUniqueSlug(shopName);
    const shop = await supabaseAdmin
      .from('barbershops')
      .insert({
        name: shopName,
        slug,
        city,
        whatsapp_number: whatsapp,
        description: `Agende seu horario na ${shopName}.`,
        primary_color: '#c49b63',
        opening_hours_text: 'Seg a sabado, 08:00 as 18:00',
      })
      .select('*')
      .single();

    if (shop.error || !shop.data) {
      return NextResponse.json({ error: shop.error?.message || 'Erro ao criar barbearia.' }, { status: 500 });
    }

    createdBarbershopId = shop.data.id;

    const auth = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name: ownerName,
        role: 'shop_manager',
      },
    });

    if (auth.error || !auth.data.user) {
      throw new Error(auth.error?.message || 'Erro ao criar login.');
    }

    createdAuthUserId = auth.data.user.id;

    const professional = await supabaseAdmin
      .from('professionals')
      .insert({
        barbershop_id: shop.data.id,
        name: ownerName,
        whatsapp_number: whatsapp,
        is_active: true,
        accepts_booking: true,
      })
      .select('id')
      .single();

    if (professional.error || !professional.data) {
      throw new Error(professional.error?.message || 'Erro ao criar profissional.');
    }

    const profile = await supabaseAdmin
      .from('profiles')
      .insert({
        id: auth.data.user.id,
        email,
        name: ownerName,
        role: 'shop_manager',
        barbershop_id: shop.data.id,
        professional_id: null,
      })
      .select('id')
      .single();

    if (profile.error || !profile.data) {
      throw new Error(profile.error?.message || 'Erro ao criar perfil.');
    }

    await ensureBarbershopSubscription(shop.data.id);

    const weekdays = [1, 2, 3, 4, 5, 6];
    await supabaseAdmin.from('working_hours').insert(
      weekdays.map((weekday) => ({
        barbershop_id: shop.data.id,
        professional_id: professional.data.id,
        weekday,
        start_time: '08:00',
        end_time: '18:00',
        break_start_time: '12:00',
        break_end_time: '13:00',
        slot_interval_minutes: 30,
        is_active: true,
      }))
    );

    await supabaseAdmin.from('services').insert({
      barbershop_id: shop.data.id,
      name: 'Corte masculino',
      description: 'Servico inicial criado automaticamente. Edite no painel.',
      price: 30,
      duration_minutes: 30,
      is_active: true,
    });

    return NextResponse.json({
      ok: true,
      message: 'Barbearia criada com 30 dias gratis.',
      loginUrl: '/login',
      siteUrl: `/${slug}`,
    });
  } catch (error) {
    console.error('Erro em cadastro publico:', error);

    if (createdAuthUserId) {
      await supabaseAdmin.auth.admin.deleteUser(createdAuthUserId);
    }

    if (createdBarbershopId) {
      await supabaseAdmin.from('barbershops').delete().eq('id', createdBarbershopId);
    }

    return NextResponse.json({ error: 'Erro ao criar cadastro.' }, { status: 500 });
  }
}
