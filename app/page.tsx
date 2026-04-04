import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';

export default function HomePage() {
  return (
    <main>
      <SiteHeader />
      <section className="mx-auto max-w-7xl px-6 py-16">
        <div className="mb-12 max-w-3xl">
          <span className="badge mb-4">Ventura Barber · 3 sites em 1</span>
          <h1 className="text-5xl font-bold leading-tight">Admin, painel da barbearia e site do cliente no mesmo projeto.</h1>
          <p className="mt-4 text-lg text-white/70">Cadastre a barbearia, personalize nome, logo, cores, horários, serviços, fidelidade e gerencie tudo com WhatsApp automático.</p>
        </div>
        <div className="grid-cards">
          <div className="panel p-6"><div className="mb-3 text-sm text-white/60">Site 1</div><h2 className="text-2xl font-bold">Painel admin</h2><p className="mt-3 text-white/70">Criação da barbearia, identidade visual, serviços, barbeiros, horários e fidelidade.</p><Link className="btn btn-primary mt-6 inline-flex" href="/admin">Abrir painel admin</Link></div>
          <div className="panel p-6"><div className="mb-3 text-sm text-white/60">Site 2</div><h2 className="text-2xl font-bold">Painel do barbeiro</h2><p className="mt-3 text-white/70">Ver agenda por horário, cancelar, remarcar, bloquear horários e acompanhar clientes e financeiro.</p><Link className="btn btn-primary mt-6 inline-flex" href="/shop">Abrir painel do barbeiro</Link></div>
          <div className="panel p-6"><div className="mb-3 text-sm text-white/60">Site 3</div><h2 className="text-2xl font-bold">Site do cliente</h2><p className="mt-3 text-white/70">Página pública com nome, logo, cores e agenda online para os clientes do barbeiro.</p><Link className="btn btn-primary mt-6 inline-flex" href="/demo-barber">Abrir site do cliente</Link></div>
        </div>
      </section>
    </main>
  );
}
