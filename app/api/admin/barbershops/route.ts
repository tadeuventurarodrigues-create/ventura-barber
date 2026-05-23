import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { normalizePhone } from '@/lib/phone';
import { ensureBarbershopSubscription } from '@/lib/subscriptions';

function normalizeEmail(value: string) {
  return String(value || '').trim().toLowerCase();
}

export async function PUT(req: Request) {
  try {
    const profile = await getCurrentProfile();

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 });
    }

    const body = await req.json();

    if (!body.id) {
      return NextResponse.json(
        { error: 'ID da barbearia é obrigatório.' },
        { status: 400 }
      );
    }

    const shop = body.barbershop || {};
    const manager = body.shopManager || {};
    const loyalty = body.loyalty || {};

    if (!shop.name || !shop.slug) {
      return NextResponse.json(
        { error: 'Nome e slug são obrigatórios.' },
        { status: 400 }
      );
    }

    if (!manager.name || !manager.email) {
      return NextResponse.json(
        { error: 'Nome e email da conta da barbearia são obrigatórios.' },
        { status: 400 }
      );
    }

    if (manager.password && String(manager.password).length < 6) {
      return NextResponse.json(
        { error: 'A nova senha da barbearia deve ter pelo menos 6 caracteres.' },
        { status: 400 }
      );
    }

    const existingSlug = await supabaseAdmin
      .from('barbershops')
      .select('id')
      .eq('slug', shop.slug)
      .neq('id', body.id)
      .maybeSingle();

    if (existingSlug.data) {
      return NextResponse.json(
        { error: 'Já existe outra barbearia com esse slug.' },
        { status: 409 }
      );
    }

    const currentShop = await supabaseAdmin
      .from('barbershops')
      .select('id')
      .eq('id', body.id)
      .maybeSingle();

    if (!currentShop.data) {
      return NextResponse.json(
        { error: 'Barbearia não encontrada.' },
        { status: 404 }
      );
    }

    const normalizedManagerEmail = normalizeEmail(manager.email);

    const duplicateManagerProfile = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', normalizedManagerEmail)
      .neq('id', manager.profile_id || '00000000-0000-0000-0000-000000000000')
      .maybeSingle();

    if (duplicateManagerProfile.data) {
      return NextResponse.json(
        { error: 'Já existe outro perfil com esse email.' },
        { status: 409 }
      );
    }

    const shopUpdate = await supabaseAdmin
      .from('barbershops')
      .update({
        name: shop.name,
        slug: shop.slug,
        description: shop.description || null,
        logo_url: shop.logo_url || null,
        cover_image_url: shop.cover_image_url || null,
        primary_color: shop.primary_color || '#c49b63',
        whatsapp_number: normalizePhone(shop.whatsapp_number || '') || null,
        address: shop.address || null,
        opening_hours_text: shop.opening_hours_text || null,
      })
      .eq('id', body.id)
      .select('*')
      .single();

    if (shopUpdate.error || !shopUpdate.data) {
      return NextResponse.json(
        { error: shopUpdate.error?.message || 'Erro ao atualizar barbearia.' },
        { status: 500 }
      );
    }

    try {
      await ensureBarbershopSubscription(body.id);
    } catch (error) {
      console.error('Erro ao garantir assinatura da barbearia:', error);
    }

    let managerProfileId = manager.profile_id || null;

    if (managerProfileId) {
      const authPayload: {
        email?: string;
        password?: string;
        user_metadata?: {
          name: string;
          role: 'shop_manager';
        };
      } = {
        email: normalizedManagerEmail,
        user_metadata: {
          name: manager.name,
          role: 'shop_manager',
        },
      };

      if (manager.password) {
        authPayload.password = String(manager.password);
      }

      const authUpdate = await supabaseAdmin.auth.admin.updateUserById(
        managerProfileId,
        authPayload
      );

      if (authUpdate.error) {
        return NextResponse.json(
          { error: authUpdate.error.message || 'Erro ao atualizar login da barbearia.' },
          { status: 500 }
        );
      }

      const profileUpdate = await supabaseAdmin
        .from('profiles')
        .update({
          name: manager.name || null,
          email: normalizedManagerEmail,
          role: 'shop_manager',
          barbershop_id: body.id,
          professional_id: null,
        })
        .eq('id', managerProfileId);

      if (profileUpdate.error) {
        return NextResponse.json(
          { error: profileUpdate.error.message || 'Erro ao atualizar perfil da barbearia.' },
          { status: 500 }
        );
      }
    } else {
      const existingManagerForShop = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('barbershop_id', body.id)
        .eq('role', 'shop_manager')
        .maybeSingle();

      if (existingManagerForShop.data?.id) {
        managerProfileId = existingManagerForShop.data.id;

        const authPayload: {
          email?: string;
          password?: string;
          user_metadata?: {
            name: string;
            role: 'shop_manager';
          };
        } = {
          email: normalizedManagerEmail,
          user_metadata: {
            name: manager.name,
            role: 'shop_manager',
          },
        };

        if (manager.password) {
          authPayload.password = String(manager.password);
        }

        const authUpdate = await supabaseAdmin.auth.admin.updateUserById(
          managerProfileId,
          authPayload
        );

        if (authUpdate.error) {
          return NextResponse.json(
            { error: authUpdate.error.message || 'Erro ao atualizar login da barbearia.' },
            { status: 500 }
          );
        }

        const profileUpdate = await supabaseAdmin
          .from('profiles')
          .update({
            name: manager.name || null,
            email: normalizedManagerEmail,
            role: 'shop_manager',
            barbershop_id: body.id,
            professional_id: null,
          })
          .eq('id', managerProfileId);

        if (profileUpdate.error) {
          return NextResponse.json(
            { error: profileUpdate.error.message || 'Erro ao atualizar perfil da barbearia.' },
            { status: 500 }
          );
        }
      } else {
        if (!manager.password) {
          return NextResponse.json(
            {
              error:
                'Essa barbearia ainda não tem conta de acesso. Informe uma senha para criar o login.',
            },
            { status: 400 }
          );
        }

        const createAuth = await supabaseAdmin.auth.admin.createUser({
          email: normalizedManagerEmail,
          password: String(manager.password),
          email_confirm: true,
          user_metadata: {
            name: manager.name,
            role: 'shop_manager',
          },
        });

        if (createAuth.error || !createAuth.data.user) {
          return NextResponse.json(
            {
              error:
                createAuth.error?.message || 'Erro ao criar login da barbearia.',
            },
            { status: 500 }
          );
        }

        managerProfileId = createAuth.data.user.id;

        const createProfile = await supabaseAdmin
          .from('profiles')
          .insert({
            id: createAuth.data.user.id,
            email: normalizedManagerEmail,
            name: manager.name,
            role: 'shop_manager',
            barbershop_id: body.id,
            professional_id: null,
          })
          .select('id')
          .single();

        if (createProfile.error || !createProfile.data) {
          await supabaseAdmin.auth.admin.deleteUser(createAuth.data.user.id);

          return NextResponse.json(
            { error: 'Erro ao criar perfil da barbearia.' },
            { status: 500 }
          );
        }
      }
    }

    const loyaltyUpsert = await supabaseAdmin.from('loyalty_settings').upsert(
      {
        barbershop_id: body.id,
        enabled: Boolean(loyalty.enabled),
        visits_required: Number(loyalty.visits_required || 10),
        reward_label: loyalty.reward_label || 'Corte grátis',
        rules_text: loyalty.rules_text || null,
        reward_message: loyalty.reward_message || null,
      },
      { onConflict: 'barbershop_id' }
    );

    if (loyaltyUpsert.error) {
      return NextResponse.json(
        { error: loyaltyUpsert.error.message || 'Erro ao salvar fidelidade.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: 'Barbearia atualizada com sucesso.',
      barbershop: shopUpdate.data,
      shopManager: {
        id: managerProfileId,
        email: normalizedManagerEmail,
      },
    });
  } catch (error) {
    console.error('Erro ao atualizar barbearia:', error);
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const profile = await getCurrentProfile();

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 });
    }

    const body = await req.json();

    if (!body.id) {
      return NextResponse.json(
        { error: 'ID da barbearia é obrigatório.' },
        { status: 400 }
      );
    }

    const barbershopId = String(body.id);

    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('barbershop_id', barbershopId);

    const authUserIds = (profiles || []).map((item) => item.id);

    await supabaseAdmin.from('booking_reschedules').delete().in(
      'booking_id',
      (
        await supabaseAdmin
          .from('bookings')
          .select('id')
          .eq('barbershop_id', barbershopId)
      ).data?.map((b) => b.id) || ['00000000-0000-0000-0000-000000000000']
    );

    await supabaseAdmin.from('booking_cancellations').delete().in(
      'booking_id',
      (
        await supabaseAdmin
          .from('bookings')
          .select('id')
          .eq('barbershop_id', barbershopId)
      ).data?.map((b) => b.id) || ['00000000-0000-0000-0000-000000000000']
    );

    await supabaseAdmin.from('time_blocks').delete().eq('barbershop_id', barbershopId);
    await supabaseAdmin.from('working_hours').delete().eq('barbershop_id', barbershopId);
    await supabaseAdmin.from('loyalty_visits').delete().eq('barbershop_id', barbershopId);
    await supabaseAdmin.from('loyalty_settings').delete().eq('barbershop_id', barbershopId);
    await supabaseAdmin.from('bookings').delete().eq('barbershop_id', barbershopId);
    await supabaseAdmin.from('services').delete().eq('barbershop_id', barbershopId);
    await supabaseAdmin.from('professionals').delete().eq('barbershop_id', barbershopId);
    await supabaseAdmin.from('profiles').delete().eq('barbershop_id', barbershopId);
    await supabaseAdmin.from('barbershops').delete().eq('id', barbershopId);

    for (const userId of authUserIds) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
    }

    return NextResponse.json({
      ok: true,
      message: 'Barbearia excluída com sucesso.',
    });
  } catch (error) {
    console.error('Erro ao excluir barbearia:', error);
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
  }
}
