create extension if not exists "pgcrypto";

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  price_monthly numeric(10,2) not null default 0,
  max_professionals integer not null default 1,
  max_users integer not null default 1,
  whatsapp_enabled boolean not null default false,
  commands_enabled boolean not null default false,
  reports_enabled boolean not null default false,
  custom_branding_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.barbershops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  logo_url text,
  cover_image_url text,
  primary_color text default '#c49b63',
  address text,
  city text,
  state text,
  whatsapp_number text,
  instagram_username text,
  opening_hours_text text,
  status text not null default 'active' check (status in ('active', 'inactive', 'blocked')),
  plan_id uuid references public.plans(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid references public.barbershops(id) on delete cascade,
  name text not null,
  email text not null unique,
  phone text,
  password_hash text,
  role text not null check (role in ('super_admin', 'shop_admin', 'professional')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.professionals (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  name text not null,
  photo_url text,
  description text,
  specialty text,
  phone text,
  whatsapp_number text,
  is_active boolean not null default true,
  accepts_booking boolean not null default true,
  auto_reply_enabled boolean not null default false,
  auto_reply_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  name text not null,
  description text,
  price numeric(10,2) not null default 0,
  duration_minutes integer not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.professional_services (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professionals(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  custom_price numeric(10,2),
  custom_duration_minutes integer,
  created_at timestamptz not null default now(),
  unique (professional_id, service_id)
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  name text not null,
  phone text,
  whatsapp_number text,
  notes text,
  total_bookings integer not null default 0,
  last_booking_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.working_hours (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  professional_id uuid references public.professionals(id) on delete cascade,
  weekday integer not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  break_start_time time,
  break_end_time time,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.time_blocks (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  professional_id uuid references public.professionals(id) on delete cascade,
  block_date date not null,
  start_time time not null,
  end_time time not null,
  reason text,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  professional_id uuid not null references public.professionals(id) on delete restrict,
  service_id uuid not null references public.services(id) on delete restrict,
  booking_date date not null,
  start_time time not null,
  end_time time not null,
  daily_order_number integer not null,
  status text not null default 'confirmed' check (status in ('pending', 'confirmed', 'cancelled', 'completed', 'rescheduled')),
  source text not null default 'public_site' check (source in ('public_site', 'admin_panel', 'whatsapp')),
  notes text,
  cancelled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (barbershop_id, booking_date, daily_order_number)
);

create table if not exists public.booking_reschedules (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  old_booking_date date not null,
  old_start_time time not null,
  old_end_time time not null,
  new_booking_date date not null,
  new_start_time time not null,
  new_end_time time not null,
  changed_by_user_id uuid references public.users(id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.booking_cancellations (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  cancelled_by_user_id uuid references public.users(id) on delete set null,
  cancelled_by_type text not null check (cancelled_by_type in ('client', 'professional', 'admin', 'whatsapp_command')),
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.whatsapp_connections (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null unique references public.barbershops(id) on delete cascade,
  provider text not null default 'evolution',
  phone_number text,
  instance_name text,
  webhook_url text,
  is_connected boolean not null default false,
  commands_enabled boolean not null default false,
  notifications_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  direction text not null check (direction in ('inbound', 'outbound')),
  message_type text not null check (message_type in ('notification', 'command', 'reminder', 'confirmation')),
  phone_number text not null,
  content text not null,
  provider_message_id text,
  status text,
  created_at timestamptz not null default now()
);


create table if not exists public.whatsapp_auto_reply_logs (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  professional_id uuid not null references public.professionals(id) on delete cascade,
  customer_phone text not null,
  customer_jid text,
  last_sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (professional_id, customer_phone)
);

create index if not exists idx_whatsapp_auto_reply_logs_professional_phone
  on public.whatsapp_auto_reply_logs (professional_id, customer_phone);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null unique references public.barbershops(id) on delete cascade,
  plan_id uuid not null references public.plans(id) on delete restrict,
  status text not null default 'trial' check (status in ('active', 'overdue', 'cancelled', 'trial')),
  start_date date not null default current_date,
  end_date date,
  billing_day integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid references public.barbershops(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata_json jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create or replace trigger trg_plans_updated_at
before update on public.plans
for each row execute function public.set_updated_at();

create or replace trigger trg_barbershops_updated_at
before update on public.barbershops
for each row execute function public.set_updated_at();

create or replace trigger trg_users_updated_at
before update on public.users
for each row execute function public.set_updated_at();

create or replace trigger trg_professionals_updated_at
before update on public.professionals
for each row execute function public.set_updated_at();

create or replace trigger trg_services_updated_at
before update on public.services
for each row execute function public.set_updated_at();

create or replace trigger trg_customers_updated_at
before update on public.customers
for each row execute function public.set_updated_at();

create or replace trigger trg_working_hours_updated_at
before update on public.working_hours
for each row execute function public.set_updated_at();

create or replace trigger trg_whatsapp_connections_updated_at
before update on public.whatsapp_connections
for each row execute function public.set_updated_at();

create or replace trigger trg_whatsapp_auto_reply_logs_updated_at
before update on public.whatsapp_auto_reply_logs
for each row execute function public.set_updated_at();

create or replace trigger trg_subscriptions_updated_at
before update on public.subscriptions
for each row execute function public.set_updated_at();

create or replace function public.prevent_booking_overlap()
returns trigger as $$
begin
  if exists (
    select 1
    from public.bookings b
    where b.professional_id = new.professional_id
      and b.booking_date = new.booking_date
      and b.status in ('pending', 'confirmed', 'completed')
      and b.id <> coalesce(new.id, gen_random_uuid())
      and (new.start_time, new.end_time) overlaps (b.start_time, b.end_time)
  ) then
    raise exception 'Já existe um agendamento nesse horário para este profissional.';
  end if;

  return new;
end;
$$ language plpgsql;

create or replace trigger trg_prevent_booking_overlap
before insert or update on public.bookings
for each row execute function public.prevent_booking_overlap();

insert into public.plans (name, slug, price_monthly, max_professionals, max_users, whatsapp_enabled, commands_enabled, reports_enabled, custom_branding_enabled)
values
  ('Básico', 'basico', 49.90, 1, 1, false, false, false, true),
  ('Profissional', 'profissional', 99.90, 5, 3, true, true, false, true),
  ('Premium', 'premium', 149.90, 20, 10, true, true, true, true)
on conflict (slug) do nothing;


create table if not exists public.loyalty_settings (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null unique references public.barbershops(id) on delete cascade,
  enabled boolean not null default false,
  visits_required integer not null default 10,
  reward_label text default 'Corte grátis',
  reward_message text,
  rules_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace trigger trg_loyalty_settings_updated_at
before update on public.loyalty_settings
for each row execute function public.set_updated_at();

alter table public.barbershops add column if not exists background_pattern_url text;
alter table public.professionals add column if not exists banner_url text;

alter table public.barbershops enable row level security;
alter table public.services enable row level security;
alter table public.professionals enable row level security;
alter table public.loyalty_settings enable row level security;

drop policy if exists "Public can read barbershops" on public.barbershops;
drop policy if exists "Public can read services" on public.services;
drop policy if exists "Public can read professionals" on public.professionals;
drop policy if exists "Public can read loyalty_settings" on public.loyalty_settings;

create policy "Public can read barbershops" on public.barbershops for select to anon using (true);
create policy "Public can read services" on public.services for select to anon using (true);
create policy "Public can read professionals" on public.professionals for select to anon using (true);
create policy "Public can read loyalty_settings" on public.loyalty_settings for select to anon using (true);

insert into public.barbershops (name, slug, description, primary_color, whatsapp_number, opening_hours_text)
select 'Demo Barber', 'demo-barber', 'Barbearia demo pronta para testar o Ventura Barber.', '#c49b63', '558894824897', 'Seg a sáb · 08:00 às 18:00'
where not exists (select 1 from public.barbershops where slug = 'demo-barber');

insert into public.professionals (barbershop_id, name, specialty, description, whatsapp_number)
select b.id, 'Barbeiro Demo', 'Degradê e navalhado', 'Perfil demo para testes do painel do barbeiro.', '558894824897'
from public.barbershops b
where b.slug = 'demo-barber'
and not exists (select 1 from public.professionals p where p.barbershop_id = b.id and p.name = 'Barbeiro Demo');

insert into public.services (barbershop_id, name, description, price, duration_minutes)
select b.id, 'Corte tradicional', 'Corte masculino com acabamento.', 35, 30
from public.barbershops b
where b.slug = 'demo-barber'
and not exists (select 1 from public.services s where s.barbershop_id = b.id and s.name = 'Corte tradicional');

insert into public.services (barbershop_id, name, description, price, duration_minutes)
select b.id, 'Barba completa', 'Barba modelada na toalha quente.', 25, 20
from public.barbershops b
where b.slug = 'demo-barber'
and not exists (select 1 from public.services s where s.barbershop_id = b.id and s.name = 'Barba completa');

insert into public.working_hours (barbershop_id, professional_id, weekday, start_time, end_time, break_start_time, break_end_time, is_active)
select b.id, p.id, d.weekday, '08:00', '18:00', '12:00', '13:00', true
from public.barbershops b
join public.professionals p on p.barbershop_id = b.id and p.name = 'Barbeiro Demo'
cross join (values (1),(2),(3),(4),(5),(6)) as d(weekday)
where b.slug = 'demo-barber'
and not exists (
  select 1 from public.working_hours wh where wh.professional_id = p.id and wh.weekday = d.weekday
);

insert into public.loyalty_settings (barbershop_id, enabled, visits_required, reward_label, reward_message, rules_text)
select b.id, true, 10, '1 corte grátis', 'Parabéns! Você ganhou 1 corte grátis no cartão fidelidade.', 'A cada 10 visitas confirmadas, o cliente ganha 1 corte grátis.'
from public.barbershops b
where b.slug = 'demo-barber'
and not exists (select 1 from public.loyalty_settings l where l.barbershop_id = b.id);
