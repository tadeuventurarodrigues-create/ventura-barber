-- Safe subscription foundation for Ventura Barber.
-- This migration does not delete data and keeps existing shops active unless a known subscription is overdue.

alter table public.subscriptions add column if not exists amount_monthly numeric(10,2) not null default 30.00;
alter table public.subscriptions add column if not exists trial_ends_at date;
alter table public.subscriptions add column if not exists last_payment_at timestamptz;
alter table public.subscriptions add column if not exists blocked_at timestamptz;
alter table public.subscriptions add column if not exists notes text;

create table if not exists public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid references public.subscriptions(id) on delete set null,
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  amount numeric(10,2) not null default 30.00,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled', 'refunded')),
  provider text not null default 'manual' check (provider in ('manual', 'mercado_pago')),
  provider_payment_id text,
  pix_qr_code text,
  pix_qr_code_base64 text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace trigger trg_subscription_payments_updated_at
before update on public.subscription_payments
for each row execute function public.set_updated_at();

create index if not exists idx_subscriptions_barbershop_status
  on public.subscriptions (barbershop_id, status, end_date);

create index if not exists idx_subscription_payments_barbershop
  on public.subscription_payments (barbershop_id, created_at desc);

insert into public.plans (
  name,
  slug,
  price_monthly,
  max_professionals,
  max_users,
  whatsapp_enabled,
  commands_enabled,
  reports_enabled,
  custom_branding_enabled
)
values (
  'Ventura Barber Mensal',
  'ventura-barber-mensal-30',
  30.00,
  20,
  20,
  true,
  true,
  true,
  true
)
on conflict (slug) do update set
  name = excluded.name,
  price_monthly = excluded.price_monthly,
  whatsapp_enabled = excluded.whatsapp_enabled,
  commands_enabled = excluded.commands_enabled,
  reports_enabled = excluded.reports_enabled,
  custom_branding_enabled = excluded.custom_branding_enabled;

with cl_shop as (
  select id
  from public.barbershops
  where lower(name) = lower('CL Barbeiro')
     or slug in ('cl-barbeiro', 'clbarbeiro')
  order by created_at asc
  limit 1
),
mensal_plan as (
  select id
  from public.plans
  where slug = 'ventura-barber-mensal-30'
  limit 1
),
due_date as (
  select case
    when extract(day from current_date)::int <= 30
      then (date_trunc('month', current_date)::date + interval '29 days')::date
    else (date_trunc('month', current_date)::date + interval '1 month' + interval '29 days')::date
  end as value
)
insert into public.subscriptions (
  barbershop_id,
  plan_id,
  status,
  start_date,
  end_date,
  billing_day,
  amount_monthly,
  trial_ends_at,
  notes
)
select
  cl_shop.id,
  mensal_plan.id,
  'active',
  current_date,
  due_date.value,
  30,
  30.00,
  null,
  'Migrado como cliente ativo/pagante. Nao iniciar trial gratis.'
from cl_shop, mensal_plan, due_date
on conflict (barbershop_id) do update set
  plan_id = excluded.plan_id,
  status = 'active',
  billing_day = 30,
  amount_monthly = 30.00,
  trial_ends_at = null,
  blocked_at = null,
  notes = excluded.notes,
  end_date = case
    when public.subscriptions.end_date is null or public.subscriptions.end_date < current_date
      then excluded.end_date
    else public.subscriptions.end_date
  end;
