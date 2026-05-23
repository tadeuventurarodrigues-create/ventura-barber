-- Automatic subscription creation for scale.
-- Safe/idempotent: existing subscriptions are preserved.

create or replace function public.get_ventura_monthly_plan_id()
returns uuid as $$
declare
  result uuid;
begin
  select id into result
  from public.plans
  where slug = 'ventura-barber-mensal-30'
  limit 1;

  if result is null then
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
    returning id into result;
  end if;

  return result;
end;
$$ language plpgsql;

create or replace function public.ensure_barbershop_subscription()
returns trigger as $$
begin
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
  values (
    new.id,
    public.get_ventura_monthly_plan_id(),
    'trial',
    current_date,
    current_date + interval '30 days',
    extract(day from (current_date + interval '30 days'))::int,
    30.00,
    current_date + interval '30 days',
    'Assinatura criada automaticamente com 30 dias gratis.'
  )
  on conflict (barbershop_id) do nothing;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_ensure_barbershop_subscription on public.barbershops;

create trigger trg_ensure_barbershop_subscription
after insert on public.barbershops
for each row execute function public.ensure_barbershop_subscription();

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
  b.id,
  public.get_ventura_monthly_plan_id(),
  case
    when lower(b.name) = lower('CL Barbeiro') or b.slug in ('cl-barbeiro', 'clbarbeiro')
      then 'active'
    else 'trial'
  end,
  current_date,
  case
    when lower(b.name) = lower('CL Barbeiro') or b.slug in ('cl-barbeiro', 'clbarbeiro')
      then case
        when extract(day from current_date)::int <= 30
          then (date_trunc('month', current_date)::date + interval '29 days')::date
        else (date_trunc('month', current_date)::date + interval '1 month' + interval '29 days')::date
      end
    else current_date + interval '30 days'
  end,
  case
    when lower(b.name) = lower('CL Barbeiro') or b.slug in ('cl-barbeiro', 'clbarbeiro')
      then 30
    else extract(day from (current_date + interval '30 days'))::int
  end,
  30.00,
  case
    when lower(b.name) = lower('CL Barbeiro') or b.slug in ('cl-barbeiro', 'clbarbeiro')
      then null
    else current_date + interval '30 days'
  end,
  case
    when lower(b.name) = lower('CL Barbeiro') or b.slug in ('cl-barbeiro', 'clbarbeiro')
      then 'Migrado como cliente ativo/pagante. Nao iniciar trial gratis.'
    else 'Assinatura criada automaticamente para barbearia existente.'
  end
from public.barbershops b
where not exists (
  select 1 from public.subscriptions s where s.barbershop_id = b.id
);
