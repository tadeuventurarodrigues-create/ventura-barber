import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getCurrentProfile } from '@/lib/auth';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type ProductRouteContext = {
  params: Promise<{ id: string }>;
};

async function checkPermission() {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, status: 401, error: 'Não autenticado.' };
  if (profile.role !== 'admin' && profile.role !== 'shop_manager' && profile.role !== 'shop_barber') {
    return { ok: false, status: 403, error: 'Sem permissão.' };
  }
  return { ok: true, profile };
}

export async function PUT(req: NextRequest, { params }: ProductRouteContext) {
  const perm = await checkPermission();
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  try {
    const { id } = await params;
    const body = await req.json();
    const { name, description, price, category, image_url, external_link, is_active } = body;

    const { data, error } = await supabaseAdmin
      .from('barber_products')
      .update({
        name: name?.trim(),
        description: description?.trim() || null,
        price: parseFloat(price) || 0,
        category: category?.trim(),
        image_url: image_url?.trim() || null,
        external_link: external_link?.trim() || null,
        is_active: is_active !== false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ product: data, message: 'Produto atualizado.' });
  } catch {
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: ProductRouteContext) {
  const perm = await checkPermission();
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  const { id } = await params;
  const { error } = await supabaseAdmin.from('barber_products').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ message: 'Produto excluído.' });
}

export async function PATCH(req: NextRequest, { params }: ProductRouteContext) {
  const perm = await checkPermission();
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  try {
    const { id } = await params;
    const body = await req.json();
    const { data, error } = await supabaseAdmin
      .from('barber_products')
      .update({ is_active: body.is_active, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ product: data, message: 'Status atualizado.' });
  } catch {
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
  }
}
