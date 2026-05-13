import { notFound } from 'next/navigation';
import { SiteHeader } from '@/components/site-header';
import { ShopDashboard } from '@/components/shop-dashboard';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireShopAccess } from '@/lib/auth';

export default async function ShopPage() {
  const profile = await requireShopAccess();

  if (!profile?.barbershop_id) {
    notFound();
  }

  const { data: barbershop } = await supabaseAdmin
    .from('barbershops')
    .select('id, name, slug')
    .eq('id', profile.barbershop_id)
    .maybeSingle();

  if (!barbershop) {
    notFound();
  }

  const isManager = profile.role === 'shop_manager';

  const professionalsRes = await supabaseAdmin
    .from('professionals')
    .select('id, name')
    .eq('barbershop_id', profile.barbershop_id)
    .order('created_at', { ascending: true });

  const servicesRes = await supabaseAdmin
    .from('services')
    .select('id, barbershop_id, name, description, price, duration_minutes, is_active')
    .eq('barbershop_id', profile.barbershop_id)
    .order('created_at', { ascending: true });

  const bookingsBaseQuery = supabaseAdmin
    .from('bookings')
    .select(`
      id,
      daily_order_number,
      customer_name,
      customer_whatsapp,
      booking_date,
      start_time,
      end_time,
      status,
      professional_id,
      service_id,
      price,
      services (
        id,
        name,
        duration_minutes,
        price
      ),
      professionals (
        id,
        name
      )
    `)
    .eq('barbershop_id', profile.barbershop_id)
    .order('booking_date', { ascending: true })
    .order('start_time', { ascending: true });

  const bookingsRes =
    isManager || !profile.professional_id
      ? await bookingsBaseQuery
      : await bookingsBaseQuery.eq('professional_id', profile.professional_id);

  const bookings = (bookingsRes.data || []).map((item: any) => ({
    id: item.id,
    daily_order_number: item.daily_order_number ?? null,
    customer_name: item.customer_name || 'Cliente',
    customer_whatsapp: item.customer_whatsapp || null,
    booking_date: item.booking_date,
    start_time: item.start_time,
    end_time: item.end_time,
    status: item.status,
    professional_id: item.professional_id,
    service_id: item.service_id || item.services?.id || null,
    service_name: item.services?.name || null,
    service: item.services
      ? {
          id: item.services.id,
          name: item.services.name,
          duration_minutes: item.services.duration_minutes,
        }
      : null,
    professional: item.professionals
      ? {
          id: item.professionals.id,
          name: item.professionals.name,
        }
      : null,
    price: Number(item.price ?? item.services?.price ?? 0),
  }));

  const workingHoursBaseQuery = supabaseAdmin
    .from('working_hours')
    .select(
      'id, professional_id, weekday, start_time, end_time, slot_interval_minutes, is_active'
    )
    .eq('barbershop_id', profile.barbershop_id)
    .order('weekday', { ascending: true });

  const workingHoursRes =
    isManager || !profile.professional_id
      ? await workingHoursBaseQuery
      : await workingHoursBaseQuery.eq('professional_id', profile.professional_id);

  const fullProfile = {
    id: profile.id,
    name: profile.name ?? null,
    email: profile.email,
    role: profile.role as 'admin' | 'shop_manager' | 'shop_barber',
    barbershop_id: profile.barbershop_id,
    professional_id: profile.professional_id,
  };

  return (
    <main>
      <SiteHeader />
      <section className="mx-auto max-w-7xl px-6 py-10">
        <ShopDashboard
          profile={fullProfile}
          barbershop={barbershop}
          professionals={professionalsRes.data || []}
          bookings={bookings}
          workingHours={workingHoursRes.data || []}
          services={servicesRes.data || []}
        />
      </section>
    </main>
  );
}