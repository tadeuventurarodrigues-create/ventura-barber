'use client';

import { useState } from 'react';

type Booking = {
  id: string;
  daily_order_number: number;
  booking_date: string;
  start_time: string;
  end_time?: string;
  status: string;
  customer_name: string;
  service_name: string;
};

type Professional = {
  id: string;
  name: string;
  description?: string | null;
  photo_url?: string | null;
  specialty?: string | null;
  whatsapp_number?: string | null;
};

type Summary = {
  customers: number;
  revenue: number;
  bookings: number;
};

type Props = {
  professional: Professional;
  barbershopSlug: string;
  bookings: Booking[];
  summary: Summary;
};

export function BarberDashboard({
  professional,
  barbershopSlug,
  bookings,
  summary,
}: Props) {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function patchBooking(id: string, payload: Record<string, unknown>) {
    setLoading(true);
    setMessage('');

    const res = await fetch(`/api/bookings/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    setLoading(false);
    setMessage(data.message || (res.ok ? 'Atualizado.' : data.error || 'Erro.'));

    if (res.ok) window.location.reload();
  }

  async function createBlock(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    setLoading(true);

    const res = await fetch('/api/admin/time-blocks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        professional_id: professional.id,
        block_date: fd.get('block_date'),
        start_time: fd.get('start_time'),
        end_time: fd.get('end_time'),
        reason: fd.get('reason'),
      }),
    });

    const data = await res.json();
    setLoading(false);
    setMessage(data.message || (res.ok ? 'Bloqueio salvo.' : data.error || 'Erro.'));

    if (res.ok) window.location.reload();
  }

  async function updateProfile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    setLoading(true);

    const res = await fetch('/api/admin/professionals', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: professional.id,
        name: fd.get('name'),
        specialty: fd.get('specialty'),
        whatsapp_number: fd.get('whatsapp_number'),
        photo_url: fd.get('photo_url'),
        description: fd.get('description'),
      }),
    });

    const data = await res.json();
    setLoading(false);
    setMessage(data.message || (res.ok ? 'Perfil atualizado.' : data.error || 'Erro.'));

    if (res.ok) window.location.reload();
  }

  return (
    <div className="space-y-8">
      <section className="grid gap-4 md:grid-cols-3">
        <div className="panel p-5">
          <div className="text-sm text-white/60">Clientes</div>
          <div className="mt-2 text-3xl font-bold">{summary.customers}</div>
        </div>

        <div className="panel p-5">
          <div className="text-sm text-white/60">Financeiro</div>
          <div className="mt-2 text-3xl font-bold">
            R$ {Number(summary.revenue).toFixed(2)}
          </div>
        </div>

        <div className="panel p-5">
          <div className="text-sm text-white/60">Agendamentos</div>
          <div className="mt-2 text-3xl font-bold">{summary.bookings}</div>
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-[1.4fr_.9fr]">
        <div className="panel p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">Painel do barbeiro</h2>
              <p className="text-sm text-white/70">
                Aqui o barbeiro vê só os próprios agendamentos, por ordem de horário.
              </p>
            </div>

            <a className="badge" href={`/${barbershopSlug}`} target="_blank">
              Abrir site do cliente
            </a>
          </div>

          <div className="space-y-3">
            {bookings.map((booking) => (
              <div
                key={booking.id}
                className="rounded-2xl border border-white/10 bg-black/20 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold">
                      #{booking.daily_order_number} — {booking.customer_name}
                    </div>
                    <div className="text-sm text-white/70">
                      {booking.booking_date} às {booking.start_time} · {booking.service_name}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      className="btn btn-dark"
                      disabled={loading}
                      onClick={() => patchBooking(booking.id, { action: 'cancel' })}
                    >
                      Cancelar
                    </button>

                    <button
                      className="btn btn-primary"
                      disabled={loading}
                      onClick={() => {
                        const newDate = window.prompt(
                          'Nova data (YYYY-MM-DD):',
                          booking.booking_date
                        );
                        const newTime = window.prompt(
                          'Novo horário (HH:MM):',
                          booking.start_time
                        );

                        if (newDate && newTime) {
                          patchBooking(booking.id, {
                            action: 'reschedule',
                            booking_date: newDate,
                            start_time: newTime,
                          });
                        }
                      }}
                    >
                      Remarcar
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {!bookings.length ? (
              <div className="rounded-2xl border border-white/10 p-6 text-white/65">
                Nenhum agendamento encontrado para este barbeiro.
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-8">
          <form className="panel p-6 space-y-3" onSubmit={updateProfile}>
            <h3 className="text-lg font-semibold">Perfil do barbeiro</h3>

            <input className="field" name="name" defaultValue={professional.name} />
            <input
              className="field"
              name="specialty"
              defaultValue={professional.specialty || ''}
              placeholder="Especialidade"
            />
            <input
              className="field"
              name="whatsapp_number"
              defaultValue={professional.whatsapp_number || ''}
              placeholder="Número do barbeiro"
            />
            <input
              className="field"
              name="photo_url"
              defaultValue={professional.photo_url || ''}
              placeholder="URL da foto"
            />
            <textarea
              className="field min-h-24"
              name="description"
              defaultValue={professional.description || ''}
              placeholder="Bio"
            />

            <button className="btn btn-primary" disabled={loading}>
              Salvar perfil
            </button>
          </form>

          <form className="panel p-6 space-y-3" onSubmit={createBlock}>
            <h3 className="text-lg font-semibold">Fechar agendamentos</h3>

            <input className="field" type="date" name="block_date" required />

            <div className="grid gap-3 md:grid-cols-2">
              <input className="field" type="time" name="start_time" required />
              <input className="field" type="time" name="end_time" required />
            </div>

            <input className="field" name="reason" placeholder="Motivo do bloqueio" />

            <button className="btn btn-primary" disabled={loading}>
              Salvar bloqueio
            </button>
          </form>
        </div>
      </section>

      {message ? <p className="text-sm text-emerald-300">{message}</p> : null}
    </div>
  );
}