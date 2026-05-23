import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export type AppRole = 'admin' | 'shop_manager' | 'shop_barber';

export const ADMIN_SECRET_PATH = '/09fjf889n3bvy9332';

export type AppProfile = {
  id: string;
  email: string;
  name: string | null;
  role: AppRole;
  barbershop_id: string | null;
  professional_id: string | null;
  created_at: string;
  updated_at: string;
};

export async function getCurrentUser() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

export async function getCurrentProfile(): Promise<AppProfile | null> {
  const supabase = await createClient();
  const user = await getCurrentUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error || !data) return null;

  return data as AppProfile;
}

export function getRedirectPathForProfile(profile: AppProfile) {
  if (profile.role === 'admin') return ADMIN_SECRET_PATH;
  return '/shop';
}

export async function requireAdmin() {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect('/login');
  }

  if (profile.role !== 'admin') {
    redirect('/unauthorized');
  }

  return profile;
}

export async function requireShopAccess() {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect('/login');
  }

  if (profile.role !== 'shop_manager' && profile.role !== 'shop_barber') {
    redirect('/unauthorized');
  }

  return profile;
}
