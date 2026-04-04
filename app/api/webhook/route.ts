import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { normalizePhone } from '@/lib/phone';
import { sendWhatsAppMessage } from '@/lib/whatsapp';

function extractText(payload: any) {
  return (
    payload?.data?.message?.conversation ||
    payload?.data?.message?.extendedTextMessage?.text ||
    payload?.data?.message?.imageMessage?.caption ||
    payload?.data?.message?.videoMessage?.caption ||
    payload?.data?.body ||
    ''
  );
}

function extractRemoteJid(payload: any) {
  return payload?.data?.key?.remoteJid || payload?.data?.message?.key?.remoteJid || '';
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

function isValidTimeString(value: string) {
  return /^\d{2}:\d{2}$/.test(value);
}

function resolveDateToken(token?: string) {
  if (!token) return getTodayIso();
  if (token === 'hoje') return getTodayIso();
  if (token === 'amanha' || token === 'amanhã') return addDaysIso(getTodayIso(), 1);
  if (isValidDateString(token)) return token;
  return null;
}

function timeToMinutes(time: string) {
  const [h, m] = String(time || '00:00').split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes: number) {
  const h = String(Math.floor(minutes / 60)).padStart(2, '0');
  const m = String(minutes % 60).padStart(2, '0');
  return `${h}:${m}`;
}

async function findProfessionalByWhatsapp(phone: string) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

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
    .eq('whatsapp_number', normalized)
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
    const serviceName = booking?.services?.name || 'Serviço';
    const number = booking?.daily_order_number ? `#${booking.daily_order_number} • ` : '';
    return `${number}${booking.customer_name} — ${booking.start_time} — ${serviceName}`;
  });

  return `${title} (${formatDateBR(bookingDate)})

${lines.join('
')}`;
}

async function findNextBookingByCustomerWhatsapp(phone: string) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  const today = getTodayIso();

  const { data: bookings, error } = await supabaseAdmin
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
    .eq('customer_whatsapp', normalized)
    .eq('status', 'confirmed')
    .gte('booking_date', today)
    .order('booking_date', { ascending: true })
    .order('start_time', { ascending: true });

  if (error || !bookings?.length) return null;

  const now = new Date();
  const next = bookings.find((booking: any) => {
    const bookingDt = combineDateTime(booking.booking_date, booking.start_time);
    return bookingDt.getTime() > now.getTime();
  });

  return next || null;
}

async function cancelBookingByCustomerWhatsapp(phone: string) {
  const booking = await findNextBookingByCustomerWhatsapp(phone);

  if (!booking) {
    return { ok: false, reason: 'not-found' as const };
  }

  const { error: updateError } = await supabaseAdmin
    .from('bookings')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancellation_reason: 'Cancelado pelo cliente via WhatsApp',
      cancelled_by_customer_via_whatsapp: true,
    })
    .eq('id', booking.id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  const customerPhone = normalizePhone(
    booking?.customer?.whatsapp_number || booking?.customer?.phone || booking?.customer_whatsapp || ''
  );

  const barberPhone = normalizePhone(
    booking?.professional?.whatsapp_number || booking?.barbershop?.whatsapp_number || ''
  );

  const evolutionConfig = getEvolutionConfigFromProfessional(booking?.professional);

  if (customerPhone) {
    await sendWhatsAppMessage(
      customerPhone,
      `Olá, ${booking?.customer?.name || booking?.customer_name || 'cliente'}.

Seu agendamento em ${booking?.barbershop?.name || 'nossa barbearia'} foi cancelado com sucesso.

Serviço: ${booking?.service?.name || 'Serviço'}
Profissional: ${booking?.professional?.name || 'Barbeiro'}
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

Cliente: ${booking?.customer?.name || booking?.customer_name || 'Cliente'}
Serviço: ${booking?.service?.name || 'Serviço'}
Data: ${formatDateBR(booking?.booking_date)}
Hora: ${booking?.start_time}

O cliente cancelou pelo WhatsApp e o horário já foi liberado.`,
        evolutionConfig
      );
    } catch (err) {
      console.error('Erro ao avisar barbeiro sobre cancelamento automático:', err);
    }
  }

  return { ok: true, booking };
}

async function findBookingByDailyNumber(professionalId: string, bookingDate: string, dailyOrderNumber: number) {
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

    const fromMe = Boolean(payload?.data?.key?.fromMe);
    if (fromMe) {
      return NextResponse.json({ ok: true, ignored: 'fromMe' });
    }

    const remoteJid = extractRemoteJid(payload);
    if (!remoteJid || isGroupJid(remoteJid)) {
      return NextResponse.json({ ok: true, ignored: 'group-or-empty' });
    }

    const senderNumber = normalizePhone(remoteJid);
    const rawText = extractText(payload);
    const text = String(rawText || '').trim().toLowerCase();

    if (!senderNumber || !text) {
      return NextResponse.json({ ok: true, ignored: 'empty-message' });
    }

    if (text === 'cancelar') {
      const customerCancellation = await cancelBookingByCustomerWhatsapp(senderNumber);
      if (customerCancellation.ok) {
        return NextResponse.json({ ok: true, action: 'customer-cancelled' });
      }
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

    if (text === 'agendamentos amanhã' || text === 'agendamentos amanha' || text === 'agenda amanhã' || text === 'agenda amanha') {
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
          'Use:
- cancelar 1
- cancelar 1 amanhã
- cancelar 1 2026-04-10',
          evolutionConfig
        );
        return NextResponse.json({ ok: true, action: 'cancel-help' });
      }

      const targetDate = resolveDateToken(dateToken);
      if (!targetDate) {
        await sendWhatsAppMessage(
          senderNumber,
          'Data inválida.

Use:
- cancelar 1
- cancelar 1 amanhã
- cancelar 1 2026-04-10',
          evolutionConfig
        );
        return NextResponse.json({ ok: true, action: 'cancel-invalid-date' });
      }

      const { data: booking, error: findError } = await findBookingByDailyNumber(professional.id, targetDate, number);
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

      const customerPhone = normalizePhone(
        booking?.customers?.whatsapp_number || booking?.customers?.phone || booking?.customer_whatsapp || ''
      );
      if (customerPhone) {
        await sendWhatsAppMessage(
          customerPhone,
          `Olá, ${booking?.customers?.name || booking?.customer_name || 'cliente'}.

Seu agendamento de ${booking?.services?.name || 'serviço'} em ${formatDateBR(targetDate)} às ${booking.start_time} foi cancelado pela barbearia.

Se quiser, entre em contato para remarcar.`,
          evolutionConfig
        );
      }

      return NextResponse.json({ ok: true, action: 'cancelled-by-barber' });
    }

    if (text.startsWith('remarcar')) {
      const match = text.match(/^remarcar\s+(\d+)(?:\s+(hoje|amanha|amanhã|\d{4}-\d{2}-\d{2}))?\s+para\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})$/);

      if (!match) {
        await sendWhatsAppMessage(
          senderNumber,
          'Use:
- remarcar 1 para 2026-04-12 14:00
- remarcar 1 amanhã para 2026-04-12 14:00
- remarcar 1 2026-04-10 para 2026-04-12 14:00',
          evolutionConfig
        );
        return NextResponse.json({ ok: true, action: 'reschedule-help' });
      }

      const bookingNumber = Number(match[1]);
      const oldDateToken = match[2];
      const newDate = match[3];
      const newStartTime = match[4];
      const oldDate = resolveDateToken(oldDateToken || 'hoje');

      if (!oldDate) {
        await sendWhatsAppMessage(senderNumber, 'Data original inválida.', evolutionConfig);
        return NextResponse.json({ ok: true, action: 'reschedule-invalid-old-date' });
      }

      if (!isValidDateString(newDate) || !isValidTimeString(newStartTime)) {
        await sendWhatsAppMessage(
          senderNumber,
          'Nova data ou hora inválida.
Exemplo: remarcar 1 para 2026-04-12 14:00',
          evolutionConfig
        );
        return NextResponse.json({ ok: true, action: 'reschedule-invalid-new-date' });
      }

      const { data: booking, error: bookingError } = await findBookingByDailyNumber(professional.id, oldDate, bookingNumber);
      if (bookingError || !booking) {
        await sendWhatsAppMessage(
          senderNumber,
          `Agendamento ${bookingNumber} não encontrado em ${formatDateBR(oldDate)}.`,
          evolutionConfig
        );
        return NextResponse.json({ ok: true, action: 'reschedule-not-found' });
      }

      if (booking.status === 'cancelled') {
        await sendWhatsAppMessage(
          senderNumber,
          `Agendamento ${bookingNumber} está cancelado e não pode ser remarcado.`,
          evolutionConfig
        );
        return NextResponse.json({ ok: true, action: 'reschedule-already-cancelled' });
      }

      const service = booking.services;
      if (!service) {
        await sendWhatsAppMessage(senderNumber, 'Serviço do agendamento não encontrado.', evolutionConfig);
        return NextResponse.json({ ok: true, action: 'reschedule-no-service' });
      }

      const newEndMinutes = timeToMinutes(newStartTime) + Number(service.duration_minutes || 30);
      const newEndTime = minutesToTime(newEndMinutes);

      const { data: conflicts, error: conflictError } = await supabaseAdmin
        .from('bookings')
        .select('id, start_time, end_time, status')
        .eq('professional_id', professional.id)
        .eq('booking_date', newDate)
        .in('status', ['pending', 'confirmed'])
        .neq('id', booking.id);

      if (conflictError) {
        await sendWhatsAppMessage(senderNumber, 'Erro ao verificar conflitos.', evolutionConfig);
        return NextResponse.json({ ok: true, action: 'reschedule-conflict-error' });
      }

      const { data: blocks, error: blocksError } = await supabaseAdmin
        .from('time_blocks')
        .select('start_time, end_time')
        .eq('professional_id', professional.id)
        .eq('block_date', newDate);

      if (blocksError) {
        await sendWhatsAppMessage(senderNumber, 'Erro ao verificar bloqueios.', evolutionConfig);
        return NextResponse.json({ ok: true, action: 'reschedule-block-error' });
      }

      const occupiedRanges = [
        ...(conflicts || []).map((item: any) => ({
          start: timeToMinutes(item.start_time),
          end: timeToMinutes(item.end_time),
        })),
        ...(blocks || []).map((item: any) => ({
          start: timeToMinutes(item.start_time),
          end: timeToMinutes(item.end_time),
        })),
      ];

      const hasConflict = occupiedRanges.some((range) => {
        return timeToMinutes(newStartTime) < range.end && newEndMinutes > range.start;
      });

      if (hasConflict) {
        await sendWhatsAppMessage(
          senderNumber,
          `Conflito de horário. Já existe outro agendamento em ${formatDateBR(newDate)} às ${newStartTime}.`,
          evolutionConfig
        );
        return NextResponse.json({ ok: true, action: 'reschedule-conflict' });
      }

      const { data: sameDayBookings } = await supabaseAdmin
        .from('bookings')
        .select('daily_order_number')
        .eq('professional_id', professional.id)
        .eq('booking_date', newDate)
        .neq('id', booking.id)
        .order('daily_order_number', { ascending: false })
        .limit(1);

      const newDailyOrderNumber = sameDayBookings?.length
        ? Number(sameDayBookings[0].daily_order_number) + 1
        : 1;

      const { error: updateError } = await supabaseAdmin
        .from('bookings')
        .update({
          booking_date: newDate,
          start_time: newStartTime,
          end_time: newEndTime,
          daily_order_number: newDailyOrderNumber,
          status: 'confirmed',
        })
        .eq('id', booking.id);

      if (updateError) {
        await sendWhatsAppMessage(senderNumber, 'Erro ao remarcar agendamento.', evolutionConfig);
        return NextResponse.json({ ok: true, action: 'reschedule-error' });
      }

      await sendWhatsAppMessage(
        senderNumber,
        `Agendamento ${bookingNumber} remarcado com sucesso.

De: ${formatDateBR(oldDate)} ${booking.start_time}
Para: ${formatDateBR(newDate)} ${newStartTime}`,
        evolutionConfig
      );

      const customerPhone = normalizePhone(
        booking?.customers?.whatsapp_number || booking?.customers?.phone || booking?.customer_whatsapp || ''
      );
      if (customerPhone) {
        await sendWhatsAppMessage(
          customerPhone,
          `Olá, ${booking?.customers?.name || booking?.customer_name || 'cliente'}.

Seu agendamento de ${service.name || 'serviço'} foi remarcado.

Data anterior: ${formatDateBR(oldDate)} às ${booking.start_time}
Nova data: ${formatDateBR(newDate)} às ${newStartTime}

Qualquer dúvida, fale com a barbearia.`,
          evolutionConfig
        );
      }

      return NextResponse.json({ ok: true, action: 'rescheduled-by-barber' });
    }

    return NextResponse.json({ ok: true, ignored: 'unknown-command' });
  } catch (error) {
    console.error('Erro no webhook:', error);
    return NextResponse.json({ ok: false, error: 'Erro interno.' }, { status: 500 });
  }
}
