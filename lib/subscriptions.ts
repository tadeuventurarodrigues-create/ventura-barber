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
