create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  name text,
  role text not null check (role in ('admin', 'barber')),
  barbershop_id uuid references public.barbershops(id) on delete set null,
  professional_id uuid references public.professionals(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_profiles_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_profiles_updated_at on public.profiles;

create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_profiles_updated_at();

alter table public.profiles enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;

create policy "Users can read own profile"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

create policy "Users can update own profile"
on public.profiles
for update
to authenticated
using (auth.uid() = id);

-- =========================================================
-- COMO CRIAR O PRIMEIRO ADMIN
-- 1. Vá no Supabase > Authentication > Users
-- 2. Crie o usuário com email e senha
-- 3. Pegue o UUID criado em auth.users
-- 4. Rode um insert como este:
--
-- insert into public.profiles (id, email, name, role)
-- values (
--   'UUID_DO_AUTH_USER_AQUI',
--   'seuemail@exemplo.com',
--   'Tadeu',
--   'admin'
-- );
--
-- =========================================================
-- COMO CRIAR UM BARBEIRO COM LOGIN
-- 1. Crie o usuário em Authentication > Users
-- 2. Pegue o UUID dele
-- 3. Descubra o id da barbearia e o id do professional
-- 4. Rode:
--
-- insert into public.profiles (
--   id,
--   email,
--   name,
--   role,
--   barbershop_id,
--   professional_id
-- )
-- values (
--   'UUID_DO_AUTH_USER_AQUI',
--   'barbeiro@exemplo.com',
--   'Nome do Barbeiro',
--   'barber',
--   'BARBERSHOP_ID_AQUI',
--   'PROFESSIONAL_ID_AQUI'
-- );