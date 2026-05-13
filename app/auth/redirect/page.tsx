import { redirect } from 'next/navigation';
import { getCurrentProfile, getRedirectPathForProfile } from '@/lib/auth';

export default async function AuthRedirectPage() {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect('/unauthorized');
  }

  redirect(getRedirectPathForProfile(profile));
}