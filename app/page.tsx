import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';

export default function HomePage() {
  return (
    <main>
      <SiteHeader />
      <section className="mx-auto max-w-7xl px-6 py-16">
        <div className="mb-12 max-w-3xl">
          <span className="badge mb-4">Ventura Barber</span>
          <h1 className="text-5xl font-bold leading-tight">
            Painel da barbearia e site de agendamento no mesmo projeto.
          </h1>
          <p className="mt-4 text-lg text-white/70">
            Gerencie agenda, servicos, clientes, horarios e WhatsApp automatico com uma
            experiencia simples para o cliente agendar.
          </p>
        </div>

        <div className="grid-cards">
          <div className="panel p-6">
            <div className="mb-3 text-sm text-white/60">Barbearia</div>
            <h2 className="text-2xl font-bold">Painel do barbeiro</h2>
            <p className="mt-3 text-white/70">
              Ver agenda por horario, cancelar, remarcar, bloquear horarios e acompanhar
              clientes e financeiro.
            </p>
            <Link className="btn btn-primary mt-6 inline-flex" href="/shop">
              Abrir painel do barbeiro
            </Link>
          </div>

          <div className="panel p-6">
            <div className="mb-3 text-sm text-white/60">Cliente</div>
            <h2 className="text-2xl font-bold">Site de agendamento</h2>
            <p className="mt-3 text-white/70">
              Pagina publica com nome, logo, cores e agenda online para os clientes do barbeiro.
            </p>
            <Link className="btn btn-primary mt-6 inline-flex" href="/demo-barber">
              Abrir site do cliente
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
