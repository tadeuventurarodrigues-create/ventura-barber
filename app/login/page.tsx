import { redirect } from 'next/navigation';
import { SiteHeader } from '@/components/site-header';
import { LoginForm } from '@/components/login-form';
import { getCurrentProfile, getRedirectPathForProfile } from '@/lib/auth';

export default async function LoginPage() {
  const profile = await getCurrentProfile();

  if (profile) {
    redirect(getRedirectPathForProfile(profile));
  }

  return (
    <main>
      <SiteHeader />
      <section className="mx-auto max-w-md px-6 py-16">
        <LoginForm />
      </section>
    </main>
  );
}