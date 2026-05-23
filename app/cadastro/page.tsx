import Link from 'next/link';
import { BarbershopSignupForm } from '@/components/barbershop-signup-form';

export default function CadastroPage() {
  return (
    <main className="min-h-screen bg-[#080808]">
      <section className="mx-auto grid min-h-screen max-w-7xl gap-10 px-6 py-10 lg:grid-cols-[1fr_520px] lg:items-center">
        <div>
          <Link href="/" className="badge mb-8">Ventura Barber</Link>
          <div className="badge mb-4 border-amber-400/30 bg-amber-400/10 text-amber-100">
            30 dias gratis para novos usuarios
          </div>
          <h1 className="max-w-3xl text-5xl font-bold leading-tight">
            Comece sua agenda online hoje, sem instalacao complicada.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-white/70">
            Seu cadastro cria painel, site de agendamento, profissional inicial, horarios padrao
            e trial automatico. Depois voce ajusta tudo no painel.
          </p>
          <div className="mt-8 grid gap-3 text-sm text-white/75 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/[.03] p-4">Agenda com horarios disponiveis em tempo real.</div>
            <div className="rounded-2xl border border-white/10 bg-white/[.03] p-4">Avisos e lembretes pelo WhatsApp.</div>
            <div className="rounded-2xl border border-white/10 bg-white/[.03] p-4">Shop do barbeiro para vender produtos.</div>
            <div className="rounded-2xl border border-white/10 bg-white/[.03] p-4">Assinatura mensal automatica por Pix.</div>
          </div>
        </div>

        <BarbershopSignupForm />
      </section>
    </main>
  );
}
