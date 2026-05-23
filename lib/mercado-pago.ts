import { createHmac, timingSafeEqual } from 'crypto';

const MP_API_BASE = 'https://api.mercadopago.com';

function getAccessToken() {
  const token = process.env.MERCADO_PAGO_ACCESS_TOKEN || '';

  if (!token) {
    throw new Error('MERCADO_PAGO_ACCESS_TOKEN nao configurado.');
  }

  return token;
}

function getWebhookSecret() {
  return process.env.MERCADO_PAGO_WEBHOOK_SECRET || '';
}

export function getMercadoPagoWebhookUrl(req: Request) {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return `${process.env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, '')}/api/mercado-pago/webhook`;
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}/api/mercado-pago/webhook`;
  }

  return `${new URL(req.url).origin}/api/mercado-pago/webhook`;
}

export async function createPixPayment(input: {
  amount: number;
  description: string;
  externalReference: string;
  payerEmail: string;
  notificationUrl: string;
}) {
  const response = await fetch(`${MP_API_BASE}/v1/payments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getAccessToken()}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': input.externalReference,
    },
    body: JSON.stringify({
      transaction_amount: Number(input.amount.toFixed(2)),
      description: input.description,
      payment_method_id: 'pix',
      external_reference: input.externalReference,
      notification_url: input.notificationUrl,
      payer: {
        email: input.payerEmail,
      },
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.message || data?.error || 'Erro ao criar Pix no Mercado Pago.');
  }

  return data;
}

export async function getPayment(paymentId: string) {
  const response = await fetch(`${MP_API_BASE}/v1/payments/${paymentId}`, {
    headers: {
      Authorization: `Bearer ${getAccessToken()}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.message || data?.error || 'Erro ao buscar pagamento no Mercado Pago.');
  }

  return data;
}

export function verifyMercadoPagoSignature(input: {
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string | null;
}) {
  const secret = getWebhookSecret();

  if (!secret) {
    return true;
  }

  if (!input.xSignature || !input.xRequestId || !input.dataId) {
    return false;
  }

  const parts = input.xSignature.split(',').reduce<Record<string, string>>((acc, part) => {
    const [key, value] = part.split('=').map((item) => item.trim());
    if (key && value) acc[key] = value;
    return acc;
  }, {});

  const ts = parts.ts;
  const received = parts.v1;

  if (!ts || !received) {
    return false;
  }

  const manifest = `id:${input.dataId};request-id:${input.xRequestId};ts:${ts};`;
  const expected = createHmac('sha256', secret).update(manifest).digest('hex');
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);

  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}
