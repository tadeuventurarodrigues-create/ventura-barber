import { SiteHeader } from '@/components/site-header';
import { AdminSingleForm } from '@/components/admin-single-form';
import { requireAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export default async function AdminPage() {
  await requireAdmin();

  const [barbershopsRes, profilesRes, professionalsRes, servicesRes, loyaltyRes, workingHoursRes, professionalServicesRes] = await Promise.all([
    supabaseAdmin.from('barbershops').select('*').order('created_at', { ascending: false }),
    supabaseAdmin
      .from('profiles')
      .select('id, email, name, role, barbershop_id, professional_id')
      .in('role', ['shop_manager', 'shop_barber']),
    supabaseAdmin
      .from('professionals')
      .select('id, barbershop_id, name, specialty, description, whatsapp_number, photo_url, is_active, accepts_booking, evolution_enabled, evolution_api_url, evolution_instance, evolution_api_key')
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('services')
      .select('id, barbershop_id, name, description, price, duration_minutes, is_active')
      .order('created_at', { ascending: false }),
    supabaseAdmin.from('loyalty_settings').select('*'),
    supabaseAdmin
      .from('working_hours')
      .select('id, barbershop_id, professional_id, weekday, start_time, end_time, slot_interval_minutes, is_active')
      .order('weekday', { ascending: true }),
    supabaseAdmin
      .from('professional_services')
      .select('id, professional_id, service_id, custom_price, custom_duration_minutes'),
  ]);

  return (
    <main>
      <SiteHeader />
      <section className="mx-auto max-w-7xl px-6 py-10">
        <AdminSingleForm
          initialBarbershops={barbershopsRes.data || []}
          initialProfiles={profilesRes.data || []}
          initialProfessionals={professionalsRes.data || []}
          initialServices={servicesRes.data || []}
          initialLoyaltySettings={loyaltyRes.data || []}
          initialWorkingHours={workingHoursRes.data || []}
          initialProfessionalServices={professionalServicesRes.data || []}
        />
      </section>
    </main>
  );
}
