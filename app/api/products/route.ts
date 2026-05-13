import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getCurrentProfile } from '@/lib/auth';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const barbershopId = searchParams.get('barbershop_id');
  const category = searchParams.get('category');
  const activeOnly = searchParams.get('active_only') !== 'false';

  if (!barbershopId) {
    return NextResponse.json({ error: 'barbershop_id obrigatório.' }, { status: 400 });
  }

  let query = supabaseAdmin
    .from('barber_products')
    .select('*')
    .eq('barbershop_id', barbershopId)
    .order('category')
    .order('name');

  if (activeOnly) query = query.eq('is_active', true);
  if (category && category !== 'Todos') query = query.eq('category', category);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ products: data || [] });
}

export async function POST(req: NextRequest) {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
    }
    if (profile.role !== 'admin' && profile.role !== 'shop_manager' && profile.role !== 'shop_barber') {
      return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 });
    }

    const body = await req.json();
    const { barbershop_id, professional_id, name, description, price, category, image_url, external_link, is_active } = body;

    if (!barbershop_id || !name || !category) {
      return NextResponse.json({ error: 'barbershop_id, name e category são obrigatórios.' }, { status: 400 });
    }

    if (profile.role === 'shop_barber' && profile.barbershop_id !== barbershop_id) {
      return NextResponse.json({ error: 'Sem permissão para esta barbearia.' }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin
      .from('barber_products')
      .insert({
        barbershop_id,
        professional_id: professional_id || null,
        name: name.trim(),
        description: description?.trim() || null,
        price: parseFloat(price) || 0,
        category: category.trim(),
        image_url: image_url?.trim() || null,
        external_link: external_link?.trim() || null,
        is_active: is_active !== false,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ product: data, message: 'Produto criado com sucesso.' });
  } catch {
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
  }
}
