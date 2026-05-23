import { supabaseAdmin } from '@/lib/supabase-admin';

export type SubscriptionAccessStatus = {
  known: boolean;
  status: 'active' | 'trial' | 'overdue' | 'cancelled' | 'none';
  blocked: boolean;
  daysUntilDue: number | null;
  endDate: string | null;
  billingDay: number | null;
  amountMonthly: number;
  message: string | null;
};

const DEFAULT_STATUS: SubscriptionAccessStatus = {
  known: false,
  status: 'none',
  blocked: false,
  daysUntilDue: null,
  endDate: null,
  billingDay: null,
  amountMonthly: 30,
  message: null,
};

function todayIso() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function diffDays(fromIso: string, toIso: string) {
  const [fy, fm, fd] = fromIso.split('-').map(Number);
  const [ty, tm, td] = toIso.split('-').map(Number);
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.ceil((to - from) / 86400000);
}

export async function getBarbershopSubscriptionStatus(
  barbershopId: string | null | undefined
): Promise<SubscriptionAccessStatus> {
  if (!barbershopId) {
    return DEFAULT_STATUS;
  }

  const { data, error } = await supabaseAdmin
    .from('subscriptions')
    .select('status, end_date, billing_day, amount_monthly')
    .eq('barbershop_id', barbershopId)
    .maybeSingle();

  if (error) {
    console.error('Erro ao buscar assinatura; liberando acesso por seguranca:', error);
    return DEFAULT_STATUS;
  }

  if (!data) {
    return DEFAULT_STATUS;
  }

  const current = todayIso();
  const endDate = data.end_date || null;
  const daysUntilDue = endDate ? diffDays(current, endDate) : null;
  const blocked =
    data.status === 'cancelled' ||
    data.status === 'overdue' ||
    (daysUntilDue !== null && daysUntilDue < 0);

  let message: string | null = null;

  if (blocked) {
    message =
      'Seu sistema esta bloqueado. Regularize o pagamento para voltar a acessar agenda, clientes e recursos pendentes.';
  } else if (daysUntilDue === 0) {
    message = 'Seu gestor de agendamentos vence hoje.';
  } else if (daysUntilDue !== null && daysUntilDue <= 5) {
    message = `Seu gestor de agendamentos vence em ${daysUntilDue} dia${daysUntilDue === 1 ? '' : 's'}.`;
  }

  return {
    known: true,
    status: data.status || 'active',
    blocked,
    daysUntilDue,
    endDate,
    billingDay: data.billing_day ?? null,
    amountMonthly: Number(data.amount_monthly || 30),
    message,
  };
}

function addDaysIso(baseIso: string, days: number) {
  const [y, m, d] = baseIso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function nextBillingDay30() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();
  const due = day <= 30 ? new Date(year, month, 30) : new Date(year, month + 1, 30);
  const yy = due.getFullYear();
  const mm = String(due.getMonth() + 1).padStart(2, '0');
  const dd = String(due.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export async function getOrCreateMonthlyPlanId() {
  const existing = await supabaseAdmin
    .from('plans')
    .select('id')
    .eq('slug', 'ventura-barber-mensal-30')
    .maybeSingle();

  if (existing.data?.id) {
    return existing.data.id as string;
  }

  const created = await supabaseAdmin
    .from('plans')
    .insert({
      name: 'Ventura Barber Mensal',
      slug: 'ventura-barber-mensal-30',
      price_monthly: 30,
      max_professionals: 20,
      max_users: 20,
      whatsapp_enabled: true,
      commands_enabled: true,
      reports_enabled: true,
      custom_branding_enabled: true,
    })
    .select('id')
    .single();

  if (created.error || !created.data?.id) {
    throw new Error(created.error?.message || 'Erro ao criar plano mensal.');
  }

  return created.data.id as string;
}

export async function ensureBarbershopSubscription(
  barbershopId: string,
  options?: {
    existingPaidClient?: boolean;
    notes?: string;
  }
) {
  const current = await supabaseAdmin
    .from('subscriptions')
    .select('id')
    .eq('barbershop_id', barbershopId)
    .maybeSingle();

  if (current.data?.id) {
    return current.data.id as string;
  }

  const planId = await getOrCreateMonthlyPlanId();
  const startDate = todayIso();
  const isPaid = Boolean(options?.existingPaidClient);
  const endDate = isPaid ? nextBillingDay30() : addDaysIso(startDate, 30);

  const created = await supabaseAdmin
    .from('subscriptions')
    .insert({
      barbershop_id: barbershopId,
      plan_id: planId,
      status: isPaid ? 'active' : 'trial',
      start_date: startDate,
      end_date: endDate,
      billing_day: isPaid ? 30 : Number(endDate.split('-')[2]),
      amount_monthly: 30,
      trial_ends_at: isPaid ? null : endDate,
      notes:
        options?.notes ||
        (isPaid
          ? 'Migrado como cliente ativo/pagante. Nao iniciar trial gratis.'
          : 'Assinatura criada automaticamente com 30 dias gratis.'),
    })
    .select('id')
    .single();

  if (created.error || !created.data?.id) {
    throw new Error(created.error?.message || 'Erro ao criar assinatura.');
  }

  return created.data.id as string;
}

export async function getSubscriptionForBarbershop(barbershopId: string) {
  await ensureBarbershopSubscription(barbershopId);

  const { data, error } = await supabaseAdmin
    .from('subscriptions')
    .select('*')
    .eq('barbershop_id', barbershopId)
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Assinatura nao encontrada.');
  }

  return data;
}

export function getNextSubscriptionEndDate(currentEndDate?: string | null) {
  const current = todayIso();
  const base = currentEndDate && currentEndDate > current ? currentEndDate : current;
  return addDaysIso(base, 30);
}

export async function markSubscriptionPaid(input: {
  barbershopId: string;
  subscriptionId?: string | null;
  paymentId?: string | null;
  amount?: number | null;
}) {
  const subscription = input.subscriptionId
    ? (
        await supabaseAdmin
          .from('subscriptions')
          .select('*')
          .eq('id', input.subscriptionId)
          .single()
      ).data
    : await getSubscriptionForBarbershop(input.barbershopId);

  if (!subscription) {
    throw new Error('Assinatura nao encontrada.');
  }

  const nextEndDate = getNextSubscriptionEndDate(subscription.end_date);

  const updated = await supabaseAdmin
    .from('subscriptions')
    .update({
      status: 'active',
      end_date: nextEndDate,
      billing_day: Number(nextEndDate.split('-')[2]),
      amount_monthly: input.amount || subscription.amount_monthly || 30,
      last_payment_at: new Date().toISOString(),
      blocked_at: null,
      trial_ends_at: null,
      notes: input.paymentId
        ? `Pagamento Mercado Pago aprovado: ${input.paymentId}`
        : 'Pagamento aprovado.',
    })
    .eq('id', subscription.id)
    .select('*')
    .single();

  if (updated.error || !updated.data) {
    throw new Error(updated.error?.message || 'Erro ao liberar assinatura.');
  }

  return updated.data;
}

export async function syncOverdueSubscriptions() {
  const today = todayIso();
  const now = new Date().toISOString();

  const overdue = await supabaseAdmin
    .from('subscriptions')
    .update({
      status: 'overdue',
      blocked_at: now,
      notes: 'Bloqueado automaticamente por vencimento.',
    })
    .in('status', ['active', 'trial'])
    .lt('end_date', today)
    .select('id, barbershop_id, end_date');

  if (overdue.error) {
    throw new Error(overdue.error.message);
  }

  return {
    today,
    blockedCount: overdue.data?.length || 0,
    blockedSubscriptions: overdue.data || [],
  };
}
