import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { normalizePhone } from '@/lib/phone';
import { sendWhatsAppMessage } from '@/lib/whatsapp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function extractText(payload: any) {
  return (
    payload?.data?.message?.conversation ||
    payload?.data?.message?.extendedTextMessage?.text ||
    payload?.data?.message?.imageMessage?.caption ||
    payload?.data?.message?.videoMessage?.caption ||
    payload?.data?.body ||
    payload?.body ||
    payload?.text ||
    payload?.message?.conversation ||
    payload?.message?.extendedTextMessage?.text ||
    payload?.message?.imageMessage?.caption ||
    payload?.message?.videoMessage?.caption ||
    payload?.content ||
    ''
  );
}

function extractRemoteJid(payload: any) {
  return (
    payload?.data?.key?.remoteJid ||
    payload?.data?.message?.key?.remoteJid ||
    payload?.key?.remoteJid ||
    payload?.remoteJid ||
    payload?.jid ||
    ''
  );
}

function extractFromMe(payload: any) {
  return Boolean(
    payload?.data?.key?.fromMe ??
      payload?.key?.fromMe ??
      payload?.fromMe ??
      false
  );
}

function isGroupJid(remoteJid: string) {
  return String(remoteJid || '').endsWith('@g.us');
}

function formatDateBR(value: string) {
  if (!value) return value;
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function getTodayIso() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDaysIso(baseIso: string, days: number) {
  const [y, m, d] = baseIso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);

  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function combineDateTime(dateStr: string, timeStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = String(timeStr || '00:00:00')
    .split(':')
    .map(Number);

  return new Date(year, month - 1, day, hour || 0, minute || 0, 0, 0);
}

function getEvolutionConfigFromProfessional(professional: any) {
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

function isValidDateString(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function resolveDateToken(token?: string) {
  if (!token) return getTodayIso();
  if (token === 'hoje') return getTodayIso();
  if (token === 'amanha' || token === 'amanhã') return addDaysIso(getTodayIso(), 1);
  if (isValidDateString(token)) return token;
  return null;
}

function getRelationItem<T = any>(value: any): T | null {
  if (Array.isArray(value)) {
    return value[0] || null;
  }
  return value || null;
}

function buildPhoneCandidates(phone: string) {
  const normalized = normalizePhone(phone || '');
  if (!normalized) return [];

  const set = new Set<string>();
  set.add(normalized);

  if (normalized.startsWith('55')) {
    const withoutCountry = normalized.slice(2);
    set.add(withoutCountry);

    if (withoutCountry.length >= 10) {
      const ddd = withoutCountry.slice(0, 2);
      const local = withoutCountry.slice(2);

      if (local.length === 9 && local.startsWith('9')) {
        set.add(`55${ddd}${local.slice(1)}`);
        set.add(`${ddd}${local.slice(1)}`);
      }

      if (local.length === 8) {
        set.add(`55${ddd}9${local}`);
        set.add(`${ddd}9${local}`);
      }
    }
  }

  return Array.from(set);
}

async function findProfessionalByWhatsapp(phone: string) {
  const candidates = buildPhoneCandidates(phone);
  if (!candidates.length) return null;

  const { data } = await supabaseAdmin
    .from('professionals')
    .select(`
      id,
      name,
      barbershop_id,
      whatsapp_number,
      evolution_enabled,
      evolution_api_url,
      evolution_instance,
      evolution_api_key,
      barbershops (
        id,
        name
      )
    `)
    .in('whatsapp_number', candidates)
    .maybeSingle();

  return data || null;
}

async function getBookingsText(professionalId: string, bookingDate: string, title: string) {
  const { data: bookings, error } = await supabaseAdmin
    .from('bookings')
    .select(`
      id,
      daily_order_number,
      customer_name,
      booking_date,
      start_time,
      status,
      services (
        name
      )
    `)
    .eq('professional_id', professionalId)
    .eq('booking_date', bookingDate)
    .neq('status', 'cancelled')
    .order('start_time', { ascending: true });

  if (error) {
    console.error('Erro ao buscar agendamentos:', error);
    return 'Erro ao buscar agendamentos.';
  }

  if (!bookings || bookings.length === 0) {
    return `Nenhum agendamento encontrado para ${formatDateBR(bookingDate)}.`;
  }

  const lines = bookings.map((booking: any) => {
    const service = getRelationItem<{ name?: string }>(booking?.services);
    const serviceName = service?.name || 'Serviço';
    const number = booking?.daily_order_number ? `#${booking.daily_order_number} • ` : '';
    return `${number}${booking.customer_name} — ${booking.start_time} — ${serviceName}`;
  });

  return `${title} (${formatDateBR(bookingDate)})

${lines.join('\n')}`;
}

async function findCustomerUpcomingBookings(phone: string, pendingOnly = false) {
  const candidates = buildPhoneCandidates(phone);
  if (!candidates.length) return [];

  const today = getTodayIso();

  let query = supabaseAdmin
    .from('bookings')
    .select(`
      *,
      service:services(id, name),
      professional:professionals(
        id,
        name,
        whatsapp_number,
        evolution_enabled,
        evolution_api_url,
        evolution_instance,
        evolution_api_key
      ),
      customer:customers(id, name, whatsapp_number, phone),
      barbershop:barbershops(id, name, whatsapp_number)
    `)
    .in('customer_whatsapp', candidates)
    .eq('status', 'confirmed')
    .gte('booking_date', today)
    .order('booking_date', { ascending: true })
    .order('start_time', { ascending: true });

  if (pendingOnly) {
    query = query.eq('cancel_confirmation_pending', true);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Erro ao buscar agendamentos do cliente:', error);
    return [];
  }

  if (!data?.length) return [];

  const now = new Date();

  return data.filter((booking: any) => {
    const bookingDt = combineDateTime(booking.booking_date, booking.start_time);
    return bookingDt.getTime() > now.getTime();
  });
}

async function findNextBookingByCustomerWhatsapp(phone: string) {
  const list = await findCustomerUpcomingBookings(phone, false);
  return list[0] || null;
}

async function findNextBookingPendingCancellationByCustomerWhatsapp(phone: string) {
  const list = await findCustomerUpcomingBookings(phone, true);
  return list[0] || null;
}

async function requestBookingCancellationByCustomerWhatsapp(phone: string) {
  const booking = await findNextBookingByCustomerWhatsapp(phone);

  if (!booking) {
    return { ok: false, reason: 'not-found' as const };
  }

  const professional = getRelationItem<any>(booking?.professional);
  const service = getRelationItem<{ name?: string }>(booking?.service);
  const barbershop = getRelationItem<{ name?: string }>(booking?.barbershop);

  const { error: updateError } = await supabaseAdmin
    .from('bookings')
    .update({
      cancel_confirmation_pending: true,
      cancel_confirmation_requested_at: new Date().toISOString(),
    })
    .eq('id', booking.id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  const evolutionConfig = getEvolutionConfigFromProfessional(professional);

  await sendWhatsAppMessage(
    normalizePhone(phone) || phone,
    `Recebemos seu pedido de cancelamento.

Agendamento:
Barbearia: ${barbershop?.name || 'nossa barbearia'}
Serviço: ${service?.name || 'Serviço'}
Data: ${formatDateBR(booking?.booking_date)}
Hora: ${booking?.start_time}

Se você realmente deseja cancelar, responda:
sim

Se não quiser cancelar mais, responda:
não`,
    evolutionConfig
  );

  return { ok: true, booking };
}

async function confirmBookingCancellationByCustomerWhatsapp(phone: string) {
  const booking = await findNextBookingPendingCancellationByCustomerWhatsapp(phone);

  if (!booking) {
    return { ok: false, reason: 'not-found' as const };
  }

  const customer = getRelationItem<{ name?: string; whatsapp_number?: string; phone?: string }>(booking?.customer);
  const professional = getRelationItem<any>(booking?.professional);
  const service = getRelationItem<{ name?: string }>(booking?.service);
  const barbershop = getRelationItem<{ name?: string; whatsapp_number?: string }>(booking?.barbershop);

  const { error: updateError } = await supabaseAdmin
    .from('bookings')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancellation_reason: 'Cancelado pelo cliente via WhatsApp com confirmação',
      cancelled_by_customer_via_whatsapp: true,
      cancel_confirmation_pending: false,
      cancel_confirmation_requested_at: null,
    })
    .eq('id', booking.id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  const customerPhone = normalizePhone(
    customer?.whatsapp_number || customer?.phone || booking?.customer_whatsapp || ''
  );

  const barberPhone = normalizePhone(
    professional?.whatsapp_number || barbershop?.whatsapp_number || ''
  );

  const evolutionConfig = getEvolutionConfigFromProfessional(professional);

  if (customerPhone) {
    await sendWhatsAppMessage(
      customerPhone,
      `Olá, ${customer?.name || booking?.customer_name || 'cliente'}.

Seu agendamento em ${barbershop?.name || 'nossa barbearia'} foi cancelado com sucesso.

Serviço: ${service?.name || 'Serviço'}
Profissional: ${professional?.name || 'Barbeiro'}
Data: ${formatDateBR(booking?.booking_date)}
Hora: ${booking?.start_time}

Seu horário foi liberado no sistema.`,
      evolutionConfig
    );
  }

  if (barberPhone) {
    try {
      await sendWhatsAppMessage(
        barberPhone,
        `📌 Cancelamento automático

Cliente: ${customer?.name || booking?.customer_name || 'Cliente'}
Serviço: ${service?.name || 'Serviço'}
Data: ${formatDateBR(booking?.booking_date)}
Hora: ${booking?.start_time}

O cliente cancelou pelo WhatsApp e confirmou o cancelamento.`,
        evolutionConfig
      );
    } catch (err) {
      console.error('Erro ao avisar barbeiro sobre cancelamento automático:', err);
    }
  }

  return { ok: true, booking };
}

async function cancelPendingCancellationRequestByCustomerWhatsapp(phone: string) {
  const booking = await findNextBookingPendingCancellationByCustomerWhatsapp(phone);

  if (!booking) {
    return { ok: false, reason: 'not-found' as const };
  }

  const professional = getRelationItem<any>(booking?.professional);
  const evolutionConfig = getEvolutionConfigFromProfessional(professional);

  const { error: updateError } = await supabaseAdmin
    .from('bookings')
    .update({
      cancel_confirmation_pending: false,
      cancel_confirmation_requested_at: null,
    })
    .eq('id', booking.id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  await sendWhatsAppMessage(
    normalizePhone(phone) || phone,
    `Tudo certo. Seu agendamento continua confirmado.`,
    evolutionConfig
  );

  return { ok: true, booking };
}

async function findBookingByDailyNumber(
  professionalId: string,
  bookingDate: string,
  dailyOrderNumber: number
) {
  return await supabaseAdmin
    .from('bookings')
    .select(`
      id,
      barbershop_id,
      customer_id,
      professional_id,
      service_id,
      customer_name,
      customer_whatsapp,
      booking_date,
      start_time,
      end_time,
      daily_order_number,
      status,
      customers (
        id,
        name,
        whatsapp_number,
        phone
      ),
      services (
        id,
        name,
        duration_minutes
      ),
      professionals (
        id,
        name,
        whatsapp_number,
        evolution_enabled,
        evolution_api_url,
        evolution_instance,
        evolution_api_key
      )
    `)
    .eq('professional_id', professionalId)
    .eq('booking_date', bookingDate)
    .eq('daily_order_number', dailyOrderNumber)
    .maybeSingle();
}

export async function POST(req: Request) {
  try {
    const payload = await req.json();

    console.log('WEBHOOK_PAYLOAD:', JSON.stringify(payload, null, 2));

    const fromMe = extractFromMe(payload);
    const remoteJid = extractRemoteJid(payload);
    const rawText = extractText(payload);

    console.log('WEBHOOK_DEBUG:', {
      fromMe,
      remoteJid,
      rawText,
    });

    if (fromMe) {
      return NextResponse.json({ ok: true, ignored: 'fromMe' });
    }

    if (!remoteJid || isGroupJid(remoteJid)) {
      return NextResponse.json({ ok: true, ignored: 'group-or-empty' });
    }

    const senderNumber = normalizePhone(remoteJid);
    const text = String(rawText || '').trim().toLowerCase();

    console.log('WEBHOOK_NORMALIZED:', {
      senderNumber,
      text,
      phoneCandidates: buildPhoneCandidates(remoteJid),
    });

    if (!senderNumber || !text) {
      return NextResponse.json({ ok: true, ignored: 'empty-message' });
    }

    if (text === 'cancelar') {
      const result = await requestBookingCancellationByCustomerWhatsapp(senderNumber);

      if (result.ok) {
        return NextResponse.json({ ok: true, action: 'customer-cancel-requested' });
      }

      return NextResponse.json({
        ok: true,
        action: 'customer-cancel-not-found',
        reason: 'Nenhum agendamento futuro confirmado encontrado para este número.',
        senderNumber,
      });
    }

    if (text === 'sim') {
      const result = await confirmBookingCancellationByCustomerWhatsapp(senderNumber);

      if (result.ok) {
        return NextResponse.json({ ok: true, action: 'customer-cancel-confirmed' });
      }

      return NextResponse.json({
        ok: true,
        action: 'customer-cancel-confirm-not-found',
        reason: 'Nenhum pedido de cancelamento pendente encontrado para este número.',
        senderNumber,
      });
    }

    if (text === 'não' || text === 'nao') {
      const result = await cancelPendingCancellationRequestByCustomerWhatsapp(senderNumber);

      if (result.ok) {
        return NextResponse.json({ ok: true, action: 'customer-cancel-aborted' });
      }

      return NextResponse.json({
        ok: true,
        action: 'customer-cancel-abort-not-found',
        reason: 'Nenhum pedido de cancelamento pendente encontrado para este número.',
        senderNumber,
      });
    }

    const professional = await findProfessionalByWhatsapp(senderNumber);
    if (!professional) {
      return NextResponse.json({ ok: true, ignored: 'unauthorized-number' });
    }

    const evolutionConfig = getEvolutionConfigFromProfessional(professional);

    if (text === 'agendamentos hoje' || text === 'agenda hoje') {
      const today = getTodayIso();
      const replyText = await getBookingsText(professional.id, today, 'Agendamentos de hoje');
      await sendWhatsAppMessage(senderNumber, replyText, evolutionConfig);
      return NextResponse.json({ ok: true, action: 'bookings-today' });
    }

    if (
      text === 'agendamentos amanhã' ||
      text === 'agendamentos amanha' ||
      text === 'agenda amanhã' ||
      text === 'agenda amanha'
    ) {
      const tomorrow = addDaysIso(getTodayIso(), 1);
      const replyText = await getBookingsText(professional.id, tomorrow, 'Agendamentos de amanhã');
      await sendWhatsAppMessage(senderNumber, replyText, evolutionConfig);
      return NextResponse.json({ ok: true, action: 'bookings-tomorrow' });
    }

    if (text.startsWith('cancelar ')) {
      const parts = text.split(/\s+/);
      const number = Number(parts[1]);
      const dateToken = parts[2];

      if (!number || Number.isNaN(number)) {
        await sendWhatsAppMessage(
          senderNumber,
          `Use:
- cancelar 1
- cancelar 1 amanhã
- cancelar 1 2026-04-10`,
          evolutionConfig
        );
        return NextResponse.json({ ok: true, action: 'cancel-help' });
      }

      const targetDate = resolveDateToken(dateToken);
      if (!targetDate) {
        await sendWhatsAppMessage(
          senderNumber,
          `Data inválida.

Use:
- cancelar 1
- cancelar 1 amanhã
- cancelar 1 2026-04-10`,
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
        await sendWhatsAppMessage(
          senderNumber,
          'Erro ao cancelar agendamento.',
          evolutionConfig
        );
        return NextResponse.json({ ok: true, action: 'cancel-error' });
      }

      await sendWhatsAppMessage(
        senderNumber,
        `Agendamento ${number} de ${formatDateBR(targetDate)} cancelado com sucesso.`,
        evolutionConfig
      );

      const customer = getRelationItem<{ name?: string; whatsapp_number?: string; phone?: string }>(booking?.customers);
      const service = getRelationItem<{ name?: string }>(booking?.services);

      const customerPhone = normalizePhone(
        customer?.whatsapp_number || customer?.phone || booking?.customer_whatsapp || ''
      );

      if (customerPhone) {
        await sendWhatsAppMessage(
          customerPhone,
          `Olá, ${customer?.name || booking?.customer_name || 'cliente'}.

Seu agendamento de ${service?.name || 'serviço'} em ${formatDateBR(targetDate)} às ${booking.start_time} foi cancelado pela barbearia.`,
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