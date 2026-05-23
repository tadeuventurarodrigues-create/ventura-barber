'use client';

import { useState } from 'react';

type PixResponse = {
  qrCode?: string | null;
  qrCodeBase64?: string | null;
  error?: string;
};

export function SubscriptionPixButton() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [pix, setPix] = useState<PixResponse | null>(null);

  async function generatePix() {
    setLoading(true);
    setMessage('');

    try {
      const res = await fetch('/api/subscriptions/pix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();

      if (!res.ok) {
        setMessage(data.error || 'Nao foi possivel gerar o Pix.');
        return;
      }

      setPix(data);
      setMessage('Pix gerado. A liberacao acontece automaticamente apos a confirmacao.');
    } catch {
      setMessage('Erro ao gerar Pix.');
    } finally {
      setLoading(false);
    }
  }

  async function copyPix() {
    if (!pix?.qrCode) return;
    await navigator.clipboard.writeText(pix.qrCode);
    setMessage('Codigo Pix copiado.');
  }

  return (
    <div className="space-y-3">
      <button type="button" className="btn btn-primary" onClick={generatePix} disabled={loading}>
        {loading ? 'Gerando Pix...' : 'Pagar agora com Pix'}
      </button>

      {pix?.qrCodeBase64 ? (
        <img
          src={`data:image/png;base64,${pix.qrCodeBase64}`}
          alt="QR Code Pix"
          className="h-40 w-40 rounded-2xl border border-white/10 bg-white p-2"
        />
      ) : null}

      {pix?.qrCode ? (
        <div className="space-y-2">
          <textarea className="field min-h-24 text-xs" readOnly value={pix.qrCode} />
          <button type="button" className="btn btn-dark" onClick={copyPix}>
            Copiar Pix
          </button>
        </div>
      ) : null}

      {message ? <p className="text-xs text-white/70">{message}</p> : null}
    </div>
  );
}
