-- Safe, idempotent migration for booking reminders and cancellation metadata.
-- Run in Supabase SQL Editor before enabling duplicated reminder protection by separate windows.

alter table public.bookings add column if not exists reminder_1h_sent_at timestamptz;
alter table public.bookings add column if not exists reminder_10m_sent_at timestamptz;
alter table public.bookings add column if not exists reminder_sent_at timestamptz;
alter table public.bookings add column if not exists cancelled_at timestamptz;
alter table public.bookings add column if not exists cancellation_reason text;
alter table public.bookings add column if not exists cancelled_by_customer_via_link boolean not null default false;
alter table public.bookings add column if not exists cancelled_by_customer_via_whatsapp boolean not null default false;

create index if not exists idx_bookings_reminders_today
  on public.bookings (booking_date, status, start_time);

create index if not exists idx_bookings_customer_whatsapp_status_date
  on public.bookings (customer_whatsapp, status, booking_date);
