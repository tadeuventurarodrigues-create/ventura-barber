'use client';

import { useState } from 'react';

type Props = {
  token: string;
};

export function CancelBookingForm({ token }: Props) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(false);

  async function handleCancel() {
    setLoading(true);
    setMessage('');

    try {
      const res = await fetch('/api/cancel-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data.error || 'Nao foi possivel cancelar o agendamento.');
        return;
      }

      setDone(true);
      setMessage(data.message || 'Agendamento cancelado com sucesso.');
    } catch {
      setMessage('Erro ao cancelar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="panel p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Cancelar agendamento</h1>
        <p className="mt-2 text-sm text-white/70">
          Confirme abaixo se deseja liberar este horario na agenda.
        </p>
      </div>

      <button className="btn btn-danger w-full" onClick={handleCancel} disabled={loading || done}>
        {loading ? 'Cancelando...' : done ? 'Agendamento cancelado' : 'Confirmar cancelamento'}
      </button>

      {message ? <p className="text-sm text-white/80">{message}</p> : null}
    </div>
  );
}
