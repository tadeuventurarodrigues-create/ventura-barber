import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ensureBarbershopSubscription } from '@/lib/subscriptions';

function addDaysIso(baseIso: string, days: number) {
  const [y, m, d] = baseIso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function todayIso() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function requireAdminProfile() {
  const profile = await getCurrentProfile();

  if (!profile || profile.role !== 'admin') {
    return null;
  }

  return profile;
}

export async function POST(req: Request) {
  try {
    const profile = await requireAdminProfile();

    if (!profile) {
      return NextResponse.json({ error: 'Sem permissao.' }, { status: 403 });
    }

    const body = await req.json();
    const barbershopId = String(body.barbershop_id || '');
    const action = String(body.action || '');

    if (!barbershopId) {
      return NextResponse.json({ error: 'barbershop_id e obrigatorio.' }, { status: 400 });
    }

    await ensureBarbershopSubscription(barbershopId);

    const today = todayIso();
    const updates: Record<string, unknown> = {};

    if (action === 'activate_30_days') {
      updates.status = 'active';
      updates.end_date = addDaysIso(today, 30);
      updates.billing_day = Number(String(updates.end_date).split('-')[2]);
      updates.last_payment_at = new Date().toISOString();
      updates.blocked_at = null;
      updates.trial_ends_at = null;
      updates.notes = 'Liberado manualmente pelo admin por 30 dias.';
    } else if (action === 'start_trial_30_days') {
      updates.status = 'trial';
      updates.end_date = addDaysIso(today, 30);
      updates.billing_day = Number(String(updates.end_date).split('-')[2]);
      updates.trial_ends_at = updates.end_date;
      updates.blocked_at = null;
      updates.notes = 'Trial de 30 dias iniciado manualmente pelo admin.';
    } else if (action === 'block') {
      updates.status = 'overdue';
      updates.end_date = addDaysIso(today, -1);
      updates.blocked_at = new Date().toISOString();
      updates.notes = 'Bloqueado manualmente pelo admin.';
    } else if (action === 'due_today') {
      updates.status = 'active';
      updates.end_date = today;
      updates.billing_day = Number(today.split('-')[2]);
      updates.blocked_at = null;
      updates.trial_ends_at = null;
      updates.notes = 'Vencimento ajustado para hoje pelo admin para teste.';
    } else if (action === 'cancel') {
      updates.status = 'cancelled';
      updates.blocked_at = new Date().toISOString();
      updates.notes = 'Cancelado manualmente pelo admin.';
    } else {
      return NextResponse.json({ error: 'Acao invalida.' }, { status: 400 });
    }

    const updated = await supabaseAdmin
      .from('subscriptions')
      .update(updates)
      .eq('barbershop_id', barbershopId)
      .select('*')
      .single();

    if (updated.error || !updated.data) {
      return NextResponse.json(
        { error: updated.error?.message || 'Erro ao atualizar assinatura.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, subscription: updated.data });
  } catch (error) {
    console.error('Erro em /api/admin/subscriptions:', error);
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
  }
}
