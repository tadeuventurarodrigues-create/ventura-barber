import { normalizePhone } from '@/lib/phone';

type EvolutionConfig = {
  apiUrl?: string | null;
  instance?: string | null;
  apiKey?: string | null;
};

function getDefaultEvolutionConfig(): EvolutionConfig {
  return {
    apiUrl: process.env.EVOLUTION_API_URL || '',
    instance: process.env.EVOLUTION_INSTANCE || '',
    apiKey: process.env.EVOLUTION_API_KEY || '',
  };
}

function resolveEvolutionConfig(config?: EvolutionConfig | null): EvolutionConfig {
  const fallback = getDefaultEvolutionConfig();

  return {
    apiUrl: String(config?.apiUrl || fallback.apiUrl || '').trim().replace(/\/+$/, ''),
    instance: String(config?.instance || fallback.instance || '').trim(),
    apiKey: String(config?.apiKey || fallback.apiKey || '').trim(),
  };
}

export async function sendWhatsAppMessage(
  to: string,
  message: unknown,
  config?: EvolutionConfig | null
) {
  const cleanNumber = normalizePhone(to);

  if (!cleanNumber) {
    throw new Error('Número de WhatsApp inválido.');
  }

  const finalMessage = typeof message === 'string' ? message.trim() : JSON.stringify(message ?? '');

  if (!finalMessage) {
    throw new Error('Mensagem de WhatsApp vazia ou inválida.');
  }

  const evolution = resolveEvolutionConfig(config);

  if (!evolution.apiUrl || !evolution.instance || !evolution.apiKey) {
    throw new Error('Configuração da Evolution não encontrada.');
  }

  const url = `${evolution.apiUrl}/message/sendText/${evolution.instance}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: evolution.apiKey,
    },
    body: JSON.stringify({
      number: cleanNumber,
      text: finalMessage,
    }),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Evolution retornou ${response.status}: ${text}`);
  }

  console.log('WA status', response.status, text);
}
