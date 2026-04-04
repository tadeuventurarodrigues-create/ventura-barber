import Link from 'next/link';
import { getCurrentProfile } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { AuthButtons } from '@/components/auth-buttons';

export async function SiteHeader() {
  const profile = await getCurrentProfile();

  let publicShopLink = '/';
  let panelLink = '/login';
  let panelLabel = 'Login';

  if (profile?.barbershop_id) {
    const { data: barbershop } = await supabaseAdmin
      .from('barbershops')
      .select('slug')
      .eq('id', profile.barbershop_id)
      .maybeSingle();

    if (barbershop?.slug) {
      publicShopLink = `/${barbershop.slug}`;
    }
  }

  if (profile?.role === 'admin') {
    panelLink = '/admin';
    panelLabel = 'Admin';
  }

  if (profile?.role === 'shop_manager' || profile?.role === 'shop_barber') {
    panelLink = '/shop';
    panelLabel = 'Painel da barbearia';
  }

  return (
    <header className="border-b border-white/10 bg-black/40 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-xl font-bold">
          Ventura Barber
        </Link>

        <nav className="flex items-center gap-3 text-sm text-white/80">
          <Link href={panelLink} className="badge">
            {panelLabel}
          </Link>

          <Link href={publicShopLink} className="badge">
            Site do cliente
          </Link>

          {profile ? <AuthButtons /> : null}
        </nav>
      </div>
    </header>
  );
}