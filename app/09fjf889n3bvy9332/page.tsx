import Link from 'next/link';
import { AdminPanel } from '@/components/admin-panel';
import { LoginForm } from '@/components/login-form';
import { SiteHeader } from '@/components/site-header';
import { getCurrentProfile } from '@/lib/auth';

export default async function SecretAdminPage() {
  const profile = await getCurrentProfile();

  if (!profile) {
    return (
      <main>
        <SiteHeader />
        <section className="mx-auto max-w-md px-6 py-16">
          <LoginForm mode="admin" />
        </section>
      </main>
    );
  }

  if (profile.role !== 'admin') {
    return (
      <main>
        <SiteHeader />
        <section className="mx-auto max-w-xl px-6 py-16">
          <div className="panel p-6 space-y-4">
            <h1 className="text-2xl font-bold">Acesso negado</h1>
            <p className="text-white/70">
              Esta area e exclusiva para administradores do sistema.
            </p>
            <Link href="/shop" className="btn btn-primary">
              Voltar ao painel da barbearia
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main>
      <SiteHeader />
      <section className="mx-auto max-w-7xl px-6 py-10">
        <AdminPanel />
      </section>
    </main>
  );
}
