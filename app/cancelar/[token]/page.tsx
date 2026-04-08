'use client';

import { useEffect, useState } from 'react';

type BookingData = {
  id: string;
  customer_name: string;
  booking_date: string;
  start_time: string;
  daily_order_number: number;
  status: string;
  service?: { name?: string } | null;
  professional?: { name?: string } | null;
  barbershop?: { name?: string } | null;
};

function formatDateBR(value: string) {
  if (!value) return value;
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

type CancelBookingPageProps = {
  params: Promise<{ token: string }>;
};

export default function CancelBookingPage({ params }: CancelBookingPageProps) {
  const [token, setToken] = useState('');
  const [booking, setBooking] = useState<BookingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function resolveParamsAndLoad() {
      try {
        const resolved = await params;
        setToken(resolved.token);

        const res = await fetch(`/api/cancel-booking/${resolved.token}`, {
          cache: 'no-store',
        });

        const json = await res.json();

        if (!res.ok) {
          setError(json.error || 'Agendamento não encontrado.');
          return;
        }

        setBooking(json.booking);
      } catch {
        setError('Erro ao carregar agendamento.');
      } finally {
        setLoading(false);
      }
    }

    resolveParamsAndLoad();
  }, [params]);

  async function handleCancel() {
    if (!token) return;

    try {
      setSubmitting(true);

      const res = await fetch(`/api/cancel-booking/${token}`, {
        method: 'POST',
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error || 'Erro ao cancelar.');
        return;
      }

      setDone(true);
    } catch {
      setError('Erro ao cancelar agendamento.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#0b0b0b',
        color: '#fff',
        padding: '24px',
      }}
    >
      <div
        style={{
          maxWidth: 520,
          margin: '40px auto',
          background: '#151515',
          border: '1px solid #2a2a2a',
          borderRadius: 16,
          padding: 24,
        }}
      >
        <h1 style={{ marginBottom: 16, fontSize: 28 }}>Cancelar agendamento</h1>

        {loading && <p>Carregando...</p>}

        {!loading && error && <p style={{ color: '#ff7b7b' }}>{error}</p>}

        {!loading && booking && !done && (
          <>
            <div style={{ lineHeight: 1.8, marginBottom: 24 }}>
              <div>
                <strong>Barbearia:</strong> {booking.barbershop?.name || '-'}
              </div>
              <div>
                <strong>Cliente:</strong> {booking.customer_name || '-'}
              </div>
              <div>
                <strong>Serviço:</strong> {booking.service?.name || '-'}
              </div>
              <div>
                <strong>Profissional:</strong> {booking.professional?.name || '-'}
              </div>
              <div>
                <strong>Data:</strong> {formatDateBR(booking.booking_date)}
              </div>
              <div>
                <strong>Hora:</strong> {booking.start_time}
              </div>
              <div>
                <strong>Código:</strong> {booking.daily_order_number}
              </div>
              <div>
                <strong>Status:</strong> {booking.status}
              </div>
            </div>

            <button
              onClick={handleCancel}
              disabled={submitting || booking.status === 'cancelled'}
              style={{
                width: '100%',
                padding: '14px 16px',
                borderRadius: 12,
                border: 'none',
                background: booking.status === 'cancelled' ? '#555' : '#c62828',
                color: '#fff',
                fontWeight: 700,
                cursor: booking.status === 'cancelled' ? 'not-allowed' : 'pointer',
              }}
            >
              {booking.status === 'cancelled'
                ? 'Agendamento já cancelado'
                : submitting
                ? 'Cancelando...'
                : 'Confirmar cancelamento'}
            </button>
          </>
        )}

        {!loading && done && (
          <div>
            <p style={{ color: '#8cff8c', fontWeight: 700 }}>
              Agendamento cancelado com sucesso.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}