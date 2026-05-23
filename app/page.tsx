import Link from 'next/link';

const benefits = [
  'Agenda online com horarios reais',
  'Lembretes e avisos pelo WhatsApp',
  'Link de cancelamento automatico',
  'Shop do barbeiro integrado',
  'Painel financeiro e relatorios',
  'Pix para assinatura mensal',
];

const featureCards = [
  {
    title: 'Agenda sem confusao',
    text: 'Horarios cancelados voltam para a agenda, bloqueios sao respeitados e o cliente agenda sozinho pelo link.',
  },
  {
    title: 'WhatsApp trabalhando junto',
    text: 'Confirmacoes, lembretes, avisos e cancelamentos podem chegar direto no numero do cliente.',
  },
  {
    title: 'Loja dentro da experiencia',
    text: 'Mostre produtos depois do agendamento e prepare sua barbearia para vender mais no digital.',
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#070707] text-white">
      <section className="mx-auto max-w-7xl px-6 py-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <Link href="/" className="text-xl font-bold">Ventura Barber</Link>
          <nav className="flex items-center gap-3">
            <Link className="btn btn-dark" href="/login">Login</Link>
            <Link className="btn btn-primary" href="/cadastro">Cadastrar</Link>
          </nav>
        </header>

        <div className="grid gap-12 py-16 lg:grid-cols-[1.05fr_.95fr] lg:items-center">
          <div>
            <div className="badge mb-5 border-amber-400/30 bg-amber-400/10 text-amber-100">
              30 dias gratis para novos usuarios
            </div>
            <h1 className="max-w-4xl text-5xl font-bold leading-tight md:text-6xl">
              O gestor de agendamentos feito para barbeiros venderem, lembrarem e lotarem a agenda.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-white/70">
              Painel da barbearia, site de agendamento, WhatsApp, avisos, loja e assinatura em
              uma plataforma preparada para crescer com seus clientes.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="btn btn-primary px-6 py-4" href="/cadastro">Comecar 30 dias gratis</Link>
              <Link className="btn btn-dark px-6 py-4" href="/login">Entrar no painel</Link>
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/[.04] p-5 shadow-2xl">
            <div className="rounded-3xl bg-[#101010] p-5">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                  <div className="text-sm text-white/50">Hoje</div>
                  <div className="text-2xl font-bold">Agenda cheia, rotina leve</div>
                </div>
                <span className="badge bg-emerald-400/10 text-emerald-200">Online</span>
              </div>
              <div className="mt-5 space-y-3">
                {['08:00 Corte + barba', '09:30 Degrade', '11:00 Barba completa'].map((item) => (
                  <div key={item} className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/30 p-4">
                    <span>{item}</span>
                    <span className="text-sm text-amber-200">Confirmado</span>
                  </div>
                ))}
              </div>
              <div className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100">
                Lembrete automatico enviado 1h antes com link de cancelamento.
              </div>
            </div>
          </div>
        </div>

        <section className="grid gap-4 md:grid-cols-3">
          {featureCards.map((card) => (
            <div key={card.title} className="panel p-6">
              <h2 className="text-xl font-bold">{card.title}</h2>
              <p className="mt-3 text-sm leading-6 text-white/70">{card.text}</p>
            </div>
          ))}
        </section>

        <section className="py-16">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {benefits.map((benefit) => (
              <div key={benefit} className="rounded-2xl border border-white/10 bg-white/[.03] p-4 text-sm text-white/75">
                {benefit}
              </div>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
