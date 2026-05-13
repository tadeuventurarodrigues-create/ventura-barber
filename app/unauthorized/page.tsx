import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';

export default function UnauthorizedPage() {
  return (
    <main>
      <SiteHeader />
      <section className="mx-auto max-w-xl px-6 py-16">
        <div className="panel p-6 space-y-4">
          <h1 className="text-2xl font-bold">Acesso não autorizado</h1>
          <p className="text-white/70">
            Sua conta existe, mas não tem permissão para entrar nessa área.
          </p>

          <div className="flex gap-3">
            <Link href="/login" className="btn btn-primary">
              Ir para login
            </Link>
            <Link href="/" className="btn btn-dark">
              Voltar ao início
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}