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

function extractSenderJid(payload: any) {
  return (
    payload?.sender ||
    payload?.data?.sender ||
    payload?.data?.key?.participant ||
    payload?.participant ||
    payload?.data?.participant ||
    ''
  );
}

function extractRemoteJid(payload: any) {
  return (
    payload?.data?.key?.remoteJid ||
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

function isGroupJid(jid: string) {
  return String(jid || '').endsWith('@g.us');
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

function buildJidCandidates(jid: string) {
  const set = new Set<string>();
  if (jid) set.add(String(jid));
  return Array.from(set);
}

function normalizeText(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function extractBookingCode(text: string, command: string) {
  const normalized = normalizeText(text);
  const regex = new RegExp(`^${command}\\s+(\\d+)$`);
  const match = normalized.match(regex);
  if (!match) return null;
  return Number(match[1]);
}

async function attachCustomerIdentity(phone: string, remoteJid: string) {
  const phoneCandidates = buildPhoneCandidates(phone);
  if (!phoneCandidates.length && !remoteJid) return;

  const { data: customer } = await supabaseAdmin
    .from('customers')
    .select('id, whatsapp_number, whatsapp_jid')
    .in('whatsapp_number', phoneCandidates)
    .maybeSingle();

  if (customer?.id) {
    await supabaseAdmin
      .from('customers')
      .update({
        whatsapp_jid: remoteJid || customer.whatsapp_jid || null,
      })
      .eq('id', customer.id);

    await supabaseAdmin
      .from('bookings')
      .update({
        customer_jid: remoteJid || null,
      })
      .eq('customer_whatsapp', customer.whatsapp_number)
      .in('status', ['confirmed', 'pending']);
  }
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

async function findCustomerUpcomingBookings(phone: string, remoteJid: string, pendingOnly = false) {
  const phoneCandidates = buildPhoneCandidates(phone);
  const jidCandidates = buildJidCandidates(remoteJid);
  const today = getTodayIso();

  const results: any[] = [];

  if (phoneCandidates.length) {
    let phoneQuery = supabaseAdmin
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
        customer:customers(id, name, whatsapp_number, phone, whatsapp_jid),
        barbershop:barbershops(id, name, whatsapp_number)
      `)
      .in('customer_whatsapp', phoneCandidates)
      .eq('status', 'confirmed')
      .gte('booking_date', today)
      .order('booking_date', { ascending: true })
      .order('start_time', { ascending: true });

    if (pendingOnly) {
      phoneQuery = phoneQuery.eq('cancel_confirmation_pending', true);
    }

    const { data } = await phoneQuery;
    if (data?.length) results.push(...data);
  }

  if (jidCandidates.length) {
    let jidQuery = supabaseAdmin
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
        customer:customers(id, name, whatsapp_number, phone, whatsapp_jid),
        barbershop:barbershops(id, name, whatsapp_number)
      `)
      .in('customer_jid', jidCandidates)
      .eq('status', 'confirmed')
      .gte('booking_date', today)
      .order('booking_date', { ascending: true })
      .order('start_time', { ascending: true });

    if (pendingOnly) {
      jidQuery = jidQuery.eq('cancel_confirmation_pending', true);
    }

    const { data } = await jidQuery;
    if (data?.length) results.push(...data);
  }

  const uniqueMap = new Map<string, any>();
  for (const item of results) {
    uniqueMap.set(item.id, item);
  }

  const uniqueResults = Array.from(uniqueMap.values());
  const now = new Date();

  return uniqueResults
    .filter((booking: any) => {
      const bookingDt = combineDateTime(booking.booking_date, booking.start_time);
      return bookingDt.getTime() > now.getTime();
    })
    .sort((a: any, b: any) => {
      if (a.booking_date !== b.booking_date) {
        return a.booking_date.localeCompare(b.booking_date);
      }
      return String(a.start_time).localeCompare(String(b.start_time));
    });
}

async function findNextBookingByCustomer(phone: string, remoteJid: string) {
  const list = await findCustomerUpcomingBookings(phone, remoteJid, false);
  return list[0] || null;
}

async function findNextPendingCancellationByCustomer(phone: string, remoteJid: string) {
  const list = await findCustomerUpcomingBookings(phone, remoteJid, true);
  return list[0] || null;
}

async function findConfirmedBookingByCode(code: number) {
  const today = getTodayIso();

  const { data, error } = await supabaseAdmin
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
      customer:customers(id, name, whatsapp_number, phone, whatsapp_jid),
      barbershop:barbershops(id, name, whatsapp_number)
    `)
    .eq('daily_order_number', code)
    .eq('status', 'confirmed')
    .gte('booking_date', today)
    .order('booking_date', { ascending: true })
    .order('start_time', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Erro ao buscar agendamento por código:', error);
    return null;
  }

  return data || null;
}

async function findPendingCancellationByCode(code: number) {
  const today = getTodayIso();

  const { data, error } = await supabaseAdmin
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
      customer:customers(id, name, whatsapp_number, phone, whatsapp_jid),
      barbershop:barbershops(id, name, whatsapp_number)
    `)
    .eq('daily_order_number', code)
    .eq('status', 'confirmed')
    .eq('cancel_confirmation_pending', true)
    .gte('booking_date', today)
    .order('booking_date', { ascending: true })
    .order('start_time', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Erro ao buscar cancelamento pendente por código:', error);
    return null;
  }

  return data || null;
}

async function requestBookingCancellationByCustomer(phone: string, remoteJid: string) {
  const booking = await findNextBookingByCustomer(phone, remoteJid);

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
      customer_jid: remoteJid || booking.customer_jid || null,
    })
    .eq('id', booking.id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  if (booking.customer_id) {
    await supabaseAdmin
      .from('customers')
      .update({
        whatsapp_jid: remoteJid || null,
      })
      .eq('id', booking.customer_id);
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
Código: ${booking?.daily_order_number}

Se você realmente deseja cancelar, responda:
sim ${booking?.daily_order_number}

Se não quiser cancelar mais, responda:
nao ${booking?.daily_order_number}`,
    evolutionConfig
  );

  return { ok: true, booking };
}

async function requestBookingCancellationByCode(code: number, phone: string, remoteJid: string) {
  const booking = await findConfirmedBookingByCode(code);

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
      customer_jid: remoteJid || booking.customer_jid || null,
    })
    .eq('id', booking.id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  if (booking.customer_id) {
    await supabaseAdmin
      .from('customers')
      .update({
        whatsapp_jid: remoteJid || null,
      })
      .eq('id', booking.customer_id);
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
Código: ${booking?.daily_order_number}

Se você realmente deseja cancelar, responda:
sim ${booking?.daily_order_number}

Se não quiser cancelar mais, responda:
nao ${booking?.daily_order_number}`,
    evolutionConfig
  );

  return { ok: true, booking };
}

async function confirmBookingCancellationByCustomer(phone: string, remoteJid: string) {
  const booking = await findNextPendingCancellationByCustomer(phone, remoteJid);

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
      customer_jid: remoteJid || booking.customer_jid || null,
    })
    .eq('id', booking.id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  if (booking.customer_id) {
    await supabaseAdmin
      .from('customers')
      .update({
        whatsapp_jid: remoteJid || null,
      })
      .eq('id', booking.customer_id);
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
Código: ${booking?.daily_order_number}

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
Código: ${booking?.daily_order_number}

O cliente cancelou pelo WhatsApp e confirmou o cancelamento.`,
        evolutionConfig
      );
    } catch (err) {
      console.error('Erro ao avisar barbeiro sobre cancelamento automático:', err);
    }
  }

  return { ok: true, booking };
}

async function confirmBookingCancellationByCode(code: number, remoteJid: string) {
  const booking = await findPendingCancellationByCode(code);

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
      cancellation_reason: 'Cancelado pelo cliente via WhatsApp com confirmação por código',
      cancelled_by_customer_via_whatsapp: true,
      cancel_confirmation_pending: false,
      cancel_confirmation_requested_at: null,
      customer_jid: remoteJid || booking.customer_jid || null,
    })
    .eq('id', booking.id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  if (booking.customer_id) {
    await supabaseAdmin
      .from('customers')
      .update({
        whatsapp_jid: remoteJid || null,
      })
      .eq('id', booking.customer_id);
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
Código: ${booking?.daily_order_number}

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
Código: ${booking?.daily_order_number}

O cliente cancelou pelo WhatsApp e confirmou o cancelamento.`,
        evolutionConfig
      );
    } catch (err) {
      console.error('Erro ao avisar barbeiro sobre cancelamento automático:', err);
    }
  }

  return { ok: true, booking };
}

async function cancelPendingCancellationRequestByCustomer(phone: string, remoteJid: string) {
  const booking = await findNextPendingCancellationByCustomer(phone, remoteJid);

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
      customer_jid: remoteJid || booking.customer_jid || null,
    })
    .eq('id', booking.id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  if (booking.customer_id) {
    await supabaseAdmin
      .from('customers')
      .update({
        whatsapp_jid: remoteJid || null,
      })
      .eq('id', booking.customer_id);
  }

  await sendWhatsAppMessage(
    normalizePhone(phone) || phone,
    `Tudo certo. Seu agendamento continua confirmado.`,
    evolutionConfig
  );

  return { ok: true, booking };
}

async function cancelPendingCancellationRequestByCode(code: number, remoteJid: string) {
  const booking = await findPendingCancellationByCode(code);

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
      customer_jid: remoteJid || booking.customer_jid || null,
    })
    .eq('id', booking.id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  if (booking.customer_id) {
    await supabaseAdmin
      .from('customers')
      .update({
        whatsapp_jid: remoteJid || null,
      })
      .eq('id', booking.customer_id);
  }

  const customerPhone = normalizePhone(
    booking?.customer_whatsapp || ''
  );

  if (customerPhone) {
    await sendWhatsAppMessage(
      customerPhone,
      `Tudo certo. Seu agendamento de código ${booking?.daily_order_number} continua confirmado.`,
      evolutionConfig
    );
  }

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
      customer_jid,
      booking_date,
      start_time,
      end_time,
      daily_order_number,
      status,
      customers (
        id,
        name,
        whatsapp_number,
        phone,
        whatsapp_jid
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
    const senderJid = extractSenderJid(payload);
    const remoteJid = extractRemoteJid(payload);
    const rawText = extractText(payload);
    const normalizedText = normalizeText(rawText);

    console.log('WEBHOOK_DEBUG:', {
      fromMe,
      senderJid,
      remoteJid,
      rawText,
      normalizedText,
      event: payload?.event,
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

    if (
      normalizedText === 'agendamentos amanha' ||
      normalizedText === 'agenda amanha'
    ) {
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
          `Use:
- cancelar 1
- cancelar 1 amanha
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
- cancelar 1 amanha
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