alter table public.professionals
  add column if not exists auto_reply_enabled boolean not null default false,
  add column if not exists auto_reply_message text;

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

create or replace trigger trg_whatsapp_auto_reply_logs_updated_at
before update on public.whatsapp_auto_reply_logs
for each row execute function public.set_updated_at();
