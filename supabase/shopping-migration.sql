-- =============================================
-- SHOPPING DO BARBEIRO — Migração Supabase
-- Execute este arquivo no SQL Editor do Supabase
-- =============================================

-- Tabela de categorias de produtos
create table if not exists public.barber_product_categories (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid references public.barbershops(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

-- Tabela de produtos
create table if not exists public.barber_products (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  professional_id uuid references public.professionals(id) on delete set null,
  name text not null,
  description text,
  price numeric(10,2) not null default 0,
  category text not null default 'Outros',
  image_url text,
  external_link text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Trigger para updated_at
create or replace trigger trg_barber_products_updated_at
before update on public.barber_products
for each row execute function public.set_updated_at();

-- RLS: leitura pública dos produtos ativos
alter table public.barber_products enable row level security;
alter table public.barber_product_categories enable row level security;

drop policy if exists "Public can read active products" on public.barber_products;
create policy "Public can read active products"
  on public.barber_products for select to anon
  using (is_active = true);

drop policy if exists "Public can read categories" on public.barber_product_categories;
create policy "Public can read categories"
  on public.barber_product_categories for select to anon
  using (true);

-- Dados de exemplo para a barbearia demo
insert into public.barber_products
  (barbershop_id, name, description, price, category, image_url, is_active)
select
  b.id,
  'Pomada Modeladora Matte',
  'Fixação forte com efeito seco. Ideal para penteados modernos e degradê.',
  45.00, 'Pomadas',
  'https://images.unsplash.com/photo-1585751119414-ef2636f8aede?w=400',
  true
from public.barbershops b where b.slug = 'demo-barber'
and not exists (select 1 from public.barber_products p where p.barbershop_id = b.id and p.name = 'Pomada Modeladora Matte');

insert into public.barber_products
  (barbershop_id, name, description, price, category, image_url, is_active)
select
  b.id,
  'Óleo para Barba Premium',
  'Hidrata e amacia a barba, deixando-a macia e com brilho natural.',
  38.00, 'Barba',
  'https://images.unsplash.com/photo-1621607512022-6aecc4fed814?w=400',
  true
from public.barbershops b where b.slug = 'demo-barber'
and not exists (select 1 from public.barber_products p where p.barbershop_id = b.id and p.name = 'Óleo para Barba Premium');

insert into public.barber_products
  (barbershop_id, name, description, price, category, image_url, is_active)
select
  b.id,
  'Shampoo Anticaspa',
  'Fórmula especial para couro cabeludo oleoso. Uso diário.',
  32.00, 'Shampoos',
  'https://images.unsplash.com/photo-1556228578-8c89e6adf883?w=400',
  true
from public.barbershops b where b.slug = 'demo-barber'
and not exists (select 1 from public.barber_products p where p.barbershop_id = b.id and p.name = 'Shampoo Anticaspa');

insert into public.barber_products
  (barbershop_id, name, description, price, category, image_url, is_active)
select
  b.id,
  'Kit Barba Completo',
  'Kit com óleo, balm e pente de madeira. Presente perfeito.',
  95.00, 'Kits',
  'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=400',
  true
from public.barbershops b where b.slug = 'demo-barber'
and not exists (select 1 from public.barber_products p where p.barbershop_id = b.id and p.name = 'Kit Barba Completo');
