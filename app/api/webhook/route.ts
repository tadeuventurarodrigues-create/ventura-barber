import { NextResponse } from 'next/server';
import { normalizePhone, onlyDigits } from '@/lib/phone';
import { sendWhatsAppMessage } from '@/lib/whatsapp';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const APP_TIMEZONE = 'America/Fortaleza';

type EvolutionConfig = {
  apiUrl: string;
  instance: string;
  apiKey: string;
};

function getNowPartsInTimezone(timeZone: string) {
  const now = new Date();

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '00';

  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
  };
}

function getTodayIso(timeZone = APP_TIMEZONE) {
  const { year, month, day } = getNowPartsInTimezone(timeZone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function addDaysIso(baseIso: string, days: number) {
  const date = new Date(`${baseIso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDateBR(value: string) {
  if (!value) return value;
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function normalizeText(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function getPath(obj: any, path: string[]) {
  return path.reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function extractFromMe(payload: any) {
  const candidates = [
    getPath(payload, ['data', 'key', 'fromMe']),
    getPath(payload, ['key', 'fromMe']),
    payload?.fromMe,
    getPath(payload, ['data', 'fromMe']),
  ];
  return candidates.some(Boolean);
}

function extractRemoteJid(payload: any) {
  return (
    getPath(payload, ['data', 'key', 'remoteJid']) ||
    getPath(payload, ['key', 'remoteJid']) ||
    payload?.remoteJid ||
    getPath(payload, ['data', 'remoteJid']) ||
    ''
  );
}

function extractSenderJid(payload: any) {
  const remoteJid = extractRemoteJid(payload);
  const participant =
    getPath(payload, ['data', 'key', 'participant']) ||
    getPath(payload, ['key', 'participant']) ||
    payload?.participant ||
    getPath(payload, ['data', 'participant']) ||
    '';

  return String(participant || remoteJid || '');
}

function extractInstanceName(payload: any) {
  return (
    payload?.instance ||
    payload?.instanceName ||
    getPath(payload, ['data', 'instance']) ||
    getPath(payload, ['data', 'instanceName']) ||
    getPath(payload, ['sender', 'instance']) ||
    ''
  );
}

function extractSenderPushName(payload: any) {
  return (
    payload?.pushName ||
    getPath(payload, ['data', 'pushName']) ||
    getPath(payload, ['data', 'push_name']) ||
    getPath(payload, ['sender', 'pushName']) ||
    ''
  );
}

function extractText(payload: any): string {
  const candidates = [
    getPath(payload, ['data', 'message', 'conversation']),
    getPath(payload, ['message', 'conversation']),
    getPath(payload, ['data', 'message', 'extendedTextMessage', 'text']),
    getPath(payload, ['message', 'extendedTextMessage', 'text']),
    getPath(payload, ['data', 'message', 'imageMessage', 'caption']),
    getPath(payload, ['message', 'imageMessage', 'caption']),
    getPath(payload, ['data', 'message', 'videoMessage', 'caption']),
    getPath(payload, ['message', 'videoMessage', 'caption']),
    payload?.text,
    getPath(payload, ['data', 'text']),
  ];

  const value = candidates.find((item) => typeof item === 'string' && item.trim());
  return String(value || '');
}

function isGroupJid(value: string) {
  return String(value || '').endsWith('@g.us');
}

function buildPhoneCandidates(value: string) {
  const normalized = normalizePhone(value || '');
  const digits = onlyDigits(value || '');
  const out = new Set<string>();

  if (normalized) out.add(normalized);
  if (digits) out.add(digits);
  if (digits.startsWith('55')) out.add(digits.slice(2));
  if (normalized.startsWith('55')) out.add(normalized.slice(2));

  const base = normalized.startsWith('55') ? normalized.slice(2) : normalized;
  if (base.length === 10) out.add(`55${base.slice(0, 2)}9${base.slice(2)}`);
  if (base.length === 11 && base[2] === '9') out.add(`55${base.slice(0, 2)}${base.slice(3)}`);

  return Array.from(out).filter(Boolean);
}

function buildJidCandidates(value: string) {
  const phoneCandidates = buildPhoneCandidates(value);
  const out = new Set<string>();

  for (const phone of phoneCandidates) {
    out.add(`${phone}@s.whatsapp.net`);
  }

  if (value) out.add(value);

  return Array.from(out).filter(Boolean);
}

function extractBookingCode(text: string, command: string) {
  const escaped = command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(`^${escaped}\\s+(\\d+)$`, 'i'));
  return match?.[1] || '';
}

function getRelationItem<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function getEvolutionConfigFromProfessional(professional: any): EvolutionConfig | null {
  if (
    professional?.evolution_enabled &&
    professional?.evolution_api_url &&
    professional?.evolution_instance &&
    professional?.evolution_api_key
  ) {
    return {
      apiUrl: professional.evolution_api_url,
      instance: professional.evolution_instance,
      apiKey: professional.evolution_api_key,
    };
  }

  return null;
}

function resolveDateToken(token?: string) {
  const normalized = normalizeText(token || '');
  if (!normalized) return getTodayIso();
  if (normalized === 'hoje') return getTodayIso();
  if (normalized === 'amanha') return addDaysIso(getTodayIso(), 1);
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
  return '';
}

async function attachCustomerIdentity(senderNumber: string, remoteJid: string) {
  try {
    if (!senderNumber) return;

    const phoneCandidates = buildPhoneCandidates(senderNumber);
    const jidCandidates = buildJidCandidates(remoteJid);

    const { data: customers } = await supabaseAdmin
      .from('customers')
      .select('id, whatsapp_number, whatsapp_jid')
      .in('whatsapp_number', phoneCandidates);

    for (const customer of customers || []) {
      const needsJid = remoteJid && customer.whatsapp_jid !== remoteJid;
      const needsPhone = senderNumber && customer.whatsapp_number !== senderNumber;

      if (!needsJid && !needsPhone) continue;

      await supabaseAdmin
        .from('customers')
        .update({
          whatsapp_number: senderNumber || customer.whatsapp_number,
          whatsapp_jid: remoteJid || customer.whatsapp_jid,
        })
        .eq('id', customer.id);
    }

    const { data: bookings } = await supabaseAdmin
      .from('bookings')
      .select('id, customer_whatsapp, customer_jid, status')
      .in('customer_whatsapp', phoneCandidates)
      .in('status', ['pending', 'confirmed']);

    for (const booking of bookings || []) {
      const needsJid = remoteJid && booking.customer_jid !== remoteJid;
      const needsPhone = senderNumber && booking.customer_whatsapp !== senderNumber;

      if (!needsJid && !needsPhone) continue;

      await supabaseAdmin
        .from('bookings')
        .update({
          customer_whatsapp: senderNumber || booking.customer_whatsapp,
          customer_jid: remoteJid || booking.customer_jid,
        })
        .eq('id', booking.id);
    }

    void jidCandidates;
  } catch (error) {
    console.error('Erro ao vincular identidade do cliente:', error);
  }
}

async function requestBookingCancellationByCode(code: string, senderNumber: string, remoteJid: string) {
  const { data: booking } = await supabaseAdmin
    .from('bookings')
    .select('id, customer_whatsapp, customer_jid, status')
    .eq('daily_order_number', Number(code))
    .eq('status', 'confirmed')
    .or(`customer_whatsapp.eq.${senderNumber},customer_jid.eq.${remoteJid}`)
    .order('booking_date', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!booking) return { ok: false };

  await supabaseAdmin
    .from('bookings')
    .update({
      cancel_confirmation_pending: true,
      cancel_confirmation_requested_at: new Date().toISOString(),
    })
    .eq('id', booking.id);

  return { ok: true, bookingId: booking.id };
}

async function confirmBookingCancellationByCode(code: string, remoteJid: string) {
  const { data: booking } = await supabaseAdmin
    .from('bookings')
    .select('id')
    .eq('daily_order_number', Number(code))
    .eq('cancel_confirmation_pending', true)
    .eq('customer_jid', remoteJid)
    .order('booking_date', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!booking) return { ok: false };

  await supabaseAdmin
    .from('bookings')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancellation_reason: 'Cancelado pelo cliente via WhatsApp',
      cancel_confirmation_pending: false,
      cancel_confirmation_requested_at: null,
    })
    .eq('id', booking.id);

  return { ok: true };
}

async function cancelPendingCancellationRequestByCode(code: string, remoteJid: string) {
  const { data: booking } = await supabaseAdmin
    .from('bookings')
    .select('id')
    .eq('daily_order_number', Number(code))
    .eq('cancel_confirmation_pending', true)
    .eq('customer_jid', remoteJid)
    .order('booking_date', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!booking) return { ok: false };

  await supabaseAdmin
    .from('bookings')
    .update({
      cancel_confirmation_pending: false,
      cancel_confirmation_requested_at: null,
    })
    .eq('id', booking.id);

  return { ok: true };
}

async function requestBookingCancellationByCustomer(senderNumber: string, remoteJid: string) {
  const { data: booking } = await supabaseAdmin
    .from('bookings')
    .select('id')
    .eq('customer_whatsapp', senderNumber)
    .eq('status', 'confirmed')
    .gte('booking_date', getTodayIso())
    .order('booking_date', { ascending: true })
    .order('start_time', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!booking) return { ok: false };

  await supabaseAdmin
    .from('bookings')
    .update({
      customer_jid: remoteJid || null,
      cancel_confirmation_pending: true,
      cancel_confirmation_requested_at: new Date().toISOString(),
    })
    .eq('id', booking.id);

  return { ok: true, bookingId: booking.id };
}

async function confirmBookingCancellationByCustomer(senderNumber: string, remoteJid: string) {
  const { data: booking } = await supabaseAdmin
    .from('bookings')
    .select('id')
    .eq('customer_whatsapp', senderNumber)
    .eq('cancel_confirmation_pending', true)
    .or(`customer_jid.eq.${remoteJid},customer_whatsapp.eq.${senderNumber}`)
    .order('booking_date', { ascending: true })
    .order('start_time', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!booking) return { ok: false };

  await supabaseAdmin
    .from('bookings')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancellation_reason: 'Cancelado pelo cliente via WhatsApp',
      cancel_confirmation_pending: false,
      cancel_confirmation_requested_at: null,
    })
    .eq('id', booking.id);

  return { ok: true };
}

async function cancelPendingCancellationRequestByCustomer(senderNumber: string, remoteJid: string) {
  const { data: booking } = await supabaseAdmin
    .from('bookings')
    .select('id')
    .eq('customer_whatsapp', senderNumber)
    .eq('cancel_confirmation_pending', true)
    .or(`customer_jid.eq.${remoteJid},customer_whatsapp.eq.${senderNumber}`)
    .order('booking_date', { ascending: true })
    .order('start_time', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!booking) return { ok: false };

  await supabaseAdmin
    .from('bookings')
    .update({
      cancel_confirmation_pending: false,
      cancel_confirmation_requested_at: null,
    })
    .eq('id', booking.id);

  return { ok: true };
}

async function tryHandleInboundAutoReply(
  payload: any,
  senderNumber: string,
  remoteJid: string,
  senderPushName: string
) {
  try {
    const instanceName = extractInstanceName(payload);
    const { data: professional } = await supabaseAdmin
      .from('professionals')
      .select(`
        id,
        barbershop_id,
        name,
        auto_reply_enabled,
        auto_reply_message,
        evolution_enabled,
        evolution_api_url,
        evolution_instance,
        evolution_api_key
      `)
      .eq('evolution_instance', instanceName)
      .maybeSingle();

    if (!professional?.auto_reply_enabled || !professional?.auto_reply_message) {
      return { handled: false as const };
    }

    const { data: existingLog } = await supabaseAdmin
      .from('whatsapp_auto_reply_logs')
      .select('id, last_sent_at')
      .eq('professional_id', professional.id)
      .eq('customer_phone', senderNumber)
      .maybeSingle();

    const now = Date.now();
    const lastSent = existingLog?.last_sent_at ? new Date(existingLog.last_sent_at).getTime() : 0;
    const cooldownMs = 12 * 60 * 60 * 1000;

    if (lastSent && now - lastSent < cooldownMs) {
      return { handled: false as const };
    }

    const evolutionConfig = getEvolutionConfigFromProfessional(professional);
    const message = professional.auto_reply_message
      .replace(/\{nome\}/gi, senderPushName || 'cliente')
      .replace(/\{telefone\}/gi, senderNumber || '')
      .replace(/\{jid\}/gi, remoteJid || '');

    await sendWhatsAppMessage(senderNumber, message, evolutionConfig);

    if (existingLog?.id) {
      await supabaseAdmin
        .from('whatsapp_auto_reply_logs')
        .update({
          customer_jid: remoteJid || null,
          last_sent_at: new Date().toISOString(),
        })
        .eq('id', existingLog.id);
    } else {
      await supabaseAdmin.from('whatsapp_auto_reply_logs').insert({
        barbershop_id: professional.barbershop_id,
        professional_id: professional.id,
        customer_phone: senderNumber,
        customer_jid: remoteJid || null,
        last_sent_at: new Date().toISOString(),
      });
    }

    return { handled: true as const, action: 'auto-reply-sent' };
  } catch (error) {
    console.error('Erro na resposta automática inbound:', error);
    return { handled: false as const };
  }
}

async function findProfessionalByWhatsapp(senderNumber: string) {
  const phoneCandidates = buildPhoneCandidates(senderNumber);

  const { data } = await supabaseAdmin
    .from('professionals')
    .select(`
      id,
      name,
      whatsapp_number,
      evolution_enabled,
      evolution_api_url,
      evolution_instance,
      evolution_api_key
    `)
    .in('whatsapp_number', phoneCandidates)
    .maybeSingle();

  return data;
}

async function getBookingsText(professionalId: string, targetDate: string, title: string) {
  const { data: bookings } = await supabaseAdmin
    .from('bookings')
    .select(`
      id,
      start_time,
      daily_order_number,
      customer_name,
      status,
      services(name)
    `)
    .eq('professional_id', professionalId)
    .eq('booking_date', targetDate)
    .in('status', ['pending', 'confirmed', 'completed'])
    .order('start_time', { ascending: true });

  const rows = (bookings || []).map((booking: any) => {
    const service = getRelationItem<{ name?: string }>(booking.services);
    return `${booking.start_time} - Nº ${booking.daily_order_number || '-'} - ${booking.customer_name || 'Cliente'} - ${service?.name || 'Serviço'}`;
  });

  if (!rows.length) {
    return `${title}\n${formatDateBR(targetDate)}\n\nNenhum agendamento encontrado.`;
  }

  return `${title}\n${formatDateBR(targetDate)}\n\n${rows.join('\n')}`;
}

async function findBookingByDailyNumber(professionalId: string, targetDate: string, number: number) {
  return supabaseAdmin
    .from('bookings')
    .select(`
      id,
      status,
      start_time,
      booking_date,
      customer_name,
      customer_whatsapp,
      customers(name, whatsapp_number, phone),
      services(name)
    `)
    .eq('professional_id', professionalId)
    .eq('booking_date', targetDate)
    .eq('daily_order_number', number)
    .maybeSingle();
}

export async function POST(req: Request) {
  try {
    if (process.env.ENABLE_WHATSAPP_INBOUND_AUTOMATION !== 'true') {
      return NextResponse.json({ ok: true, ignored: 'inbound-automation-disabled' });
    }

    const payload = await req.json();

    console.log('WEBHOOK_PAYLOAD:', JSON.stringify(payload, null, 2));

    const fromMe = extractFromMe(payload);
    const senderJid = extractSenderJid(payload);
    const remoteJid = extractRemoteJid(payload);
    const instanceName = extractInstanceName(payload);
    const senderPushName = extractSenderPushName(payload);
    const rawText = extractText(payload);
    const normalizedText = normalizeText(rawText);

    console.log('WEBHOOK_DEBUG:', {
      fromMe,
      senderJid,
      remoteJid,
      rawText,
      normalizedText,
      event: payload?.event,
      instanceName,
      senderPushName,
    });

    if (fromMe) {
      return NextResponse.json({ ok: true, ignored: 'fromMe' });
    }

    if (!senderJid || isGroupJid(senderJid)) {
      return NextResponse.json({ ok: true, ignored: 'group-or-empty' });
    }

    const senderNumber = normalizePhone(senderJid);

    console.log('WEBHOOK_NORMALIZED:', {
      senderJid,
      remoteJid,
      instanceName,
      senderNumber,
      text: normalizedText,
      phoneCandidates: buildPhoneCandidates(senderJid),
      jidCandidates: buildJidCandidates(remoteJid),
    });

    if (!senderNumber || !normalizedText) {
      return NextResponse.json({ ok: true, ignored: 'empty-message' });
    }

    await attachCustomerIdentity(senderNumber, remoteJid);

    const cancelCode = extractBookingCode(normalizedText, 'cancelar');
    const confirmCode = extractBookingCode(normalizedText, 'sim');
    const abortCode = extractBookingCode(normalizedText, 'nao');

    if (cancelCode) {
      const result = await requestBookingCancellationByCode(cancelCode, senderNumber, remoteJid);

      if (result.ok) {
        return NextResponse.json({ ok: true, action: 'customer-cancel-requested-by-code' });
      }

      return NextResponse.json({
        ok: true,
        action: 'customer-cancel-code-not-found',
        reason: 'Nenhum agendamento futuro confirmado encontrado para este código.',
        code: cancelCode,
      });
    }

    if (confirmCode) {
      const result = await confirmBookingCancellationByCode(confirmCode, remoteJid);

      if (result.ok) {
        return NextResponse.json({ ok: true, action: 'customer-cancel-confirmed-by-code' });
      }

      return NextResponse.json({
        ok: true,
        action: 'customer-cancel-confirm-code-not-found',
        reason: 'Nenhum pedido de cancelamento pendente encontrado para este código.',
        code: confirmCode,
      });
    }

    if (abortCode) {
      const result = await cancelPendingCancellationRequestByCode(abortCode, remoteJid);

      if (result.ok) {
        return NextResponse.json({ ok: true, action: 'customer-cancel-aborted-by-code' });
      }

      return NextResponse.json({
        ok: true,
        action: 'customer-cancel-abort-code-not-found',
        reason: 'Nenhum pedido de cancelamento pendente encontrado para este código.',
        code: abortCode,
      });
    }

    if (normalizedText === 'cancelar') {
      const result = await requestBookingCancellationByCustomer(senderNumber, remoteJid);

      if (result.ok) {
        return NextResponse.json({ ok: true, action: 'customer-cancel-requested' });
      }

      return NextResponse.json({
        ok: true,
        action: 'customer-cancel-not-found',
        reason: 'Nenhum agendamento futuro confirmado encontrado para este número.',
        senderNumber,
        remoteJid,
      });
    }

    if (normalizedText === 'sim') {
      const result = await confirmBookingCancellationByCustomer(senderNumber, remoteJid);

      if (result.ok) {
        return NextResponse.json({ ok: true, action: 'customer-cancel-confirmed' });
      }

      return NextResponse.json({
        ok: true,
        action: 'customer-cancel-confirm-not-found',
        reason: 'Nenhum pedido de cancelamento pendente encontrado para este número.',
        senderNumber,
        remoteJid,
      });
    }

    if (normalizedText === 'nao') {
      const result = await cancelPendingCancellationRequestByCustomer(senderNumber, remoteJid);

      if (result.ok) {
        return NextResponse.json({ ok: true, action: 'customer-cancel-aborted' });
      }

      return NextResponse.json({
        ok: true,
        action: 'customer-cancel-abort-not-found',
        reason: 'Nenhum pedido de cancelamento pendente encontrado para este número.',
        senderNumber,
        remoteJid,
      });
    }

    const inboundAutoReply = await tryHandleInboundAutoReply(
      payload,
      senderNumber,
      remoteJid,
      senderPushName
    );

    if (inboundAutoReply.handled) {
      return NextResponse.json({
        ok: true,
        action: inboundAutoReply.action,
        instanceName,
      });
    }

    const professional = await findProfessionalByWhatsapp(senderNumber);
    if (!professional) {
      return NextResponse.json({ ok: true, ignored: 'unauthorized-number' });
    }

    const evolutionConfig = getEvolutionConfigFromProfessional(professional);

    if (normalizedText === 'agendamentos hoje' || normalizedText === 'agenda hoje') {
      const today = getTodayIso();
      const replyText = await getBookingsText(professional.id, today, 'Agendamentos de hoje');
      await sendWhatsAppMessage(senderNumber, replyText, evolutionConfig);
      return NextResponse.json({ ok: true, action: 'bookings-today' });
    }

    if (normalizedText === 'agendamentos amanha' || normalizedText === 'agenda amanha') {
      const tomorrow = addDaysIso(getTodayIso(), 1);
      const replyText = await getBookingsText(professional.id, tomorrow, 'Agendamentos de amanhã');
      await sendWhatsAppMessage(senderNumber, replyText, evolutionConfig);
      return NextResponse.json({ ok: true, action: 'bookings-tomorrow' });
    }

    if (normalizedText.startsWith('cancelar ')) {
      const parts = normalizedText.split(/\s+/);
      const number = Number(parts[1]);
      const dateToken = parts[2];

      if (!number || Number.isNaN(number)) {
        await sendWhatsAppMessage(
          senderNumber,
          `Use:\n- cancelar 1\n- cancelar 1 amanha\n- cancelar 1 2026-04-10`,
          evolutionConfig
        );
        return NextResponse.json({ ok: true, action: 'cancel-help' });
      }

      const targetDate = resolveDateToken(dateToken);
      if (!targetDate) {
        await sendWhatsAppMessage(
          senderNumber,
          `Data inválida.\n\nUse:\n- cancelar 1\n- cancelar 1 amanha\n- cancelar 1 2026-04-10`,
          evolutionConfig
        );
        return NextResponse.json({ ok: true, action: 'cancel-invalid-date' });
      }

      const { data: booking, error: findError } = await findBookingByDailyNumber(
        professional.id,
        targetDate,
        number
      );

      if (findError || !booking) {
        await sendWhatsAppMessage(
          senderNumber,
          `Agendamento ${number} não encontrado em ${formatDateBR(targetDate)}.`,
          evolutionConfig
        );
        return NextResponse.json({ ok: true, action: 'cancel-not-found' });
      }

      if (booking.status === 'cancelled') {
        await sendWhatsAppMessage(
          senderNumber,
          `Agendamento ${number} já está cancelado.`,
          evolutionConfig
        );
        return NextResponse.json({ ok: true, action: 'cancel-already' });
      }

      const { error: updateError } = await supabaseAdmin
        .from('bookings')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancellation_reason: 'Cancelado pelo barbeiro via WhatsApp',
          cancel_confirmation_pending: false,
          cancel_confirmation_requested_at: null,
        })
        .eq('id', booking.id);

      if (updateError) {
        await sendWhatsAppMessage(senderNumber, 'Erro ao cancelar agendamento.', evolutionConfig);
        return NextResponse.json({ ok: true, action: 'cancel-error' });
      }

      await sendWhatsAppMessage(
        senderNumber,
        `Agendamento ${number} de ${formatDateBR(targetDate)} cancelado com sucesso.`,
        evolutionConfig
      );

      const customer = getRelationItem<{ name?: string; whatsapp_number?: string; phone?: string }>(
        (booking as any)?.customers
      );
      const service = getRelationItem<{ name?: string }>((booking as any)?.services);

      const customerPhone = normalizePhone(
        customer?.whatsapp_number || customer?.phone || (booking as any)?.customer_whatsapp || ''
      );

      if (customerPhone) {
        await sendWhatsAppMessage(
          customerPhone,
          `Olá, ${customer?.name || (booking as any)?.customer_name || 'cliente'}.\n\nSeu agendamento de ${service?.name || 'serviço'} em ${formatDateBR(targetDate)} às ${(booking as any).start_time} foi cancelado pela barbearia.`,
          evolutionConfig
        );
      }

      return NextResponse.json({ ok: true, action: 'cancelled-by-barber' });
    }

    return NextResponse.json({ ok: true, ignored: 'unknown-command' });
  } catch (error) {
    console.error('Erro no webhook:', error);
    return NextResponse.json({ ok: false, error: 'Erro interno.' }, { status: 500 });
  }
}
