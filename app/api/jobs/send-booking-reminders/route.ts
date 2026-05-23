import { NextResponse } from 'next/server';
import { createBookingCancelUrl } from '@/lib/booking-cancel-token';
import { getTodayIso } from '@/lib/booking-rules';
import { normalizePhone } from '@/lib/phone';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendWhatsAppMessage } from '@/lib/whatsapp';

type ReminderWindow = '1h' | '10m';

function formatDateBR(value: string) {
  if (!value) return value;
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
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

function firstItem<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] || null;
  }
  return value || null;
}

function isMissingColumnError(error: any) {
  const message = String(error?.message || '').toLowerCase();
  return error?.code === '42703' || message.includes('column') || message.includes('schema cache');
}

async function loadTodayBookings(todayIso: string) {
  const baseSelect = `
    id,
    booking_date,
    start_time,
    end_time,
    status,
    customer_name,
    customer_whatsapp,
    service:services(
      id,
      name
    ),
    professional:professionals(
      id,
      name,
      whatsapp_number,
      evolution_enabled,
      evolution_api_url,
      evolution_instance,
      evolution_api_key
    ),
    barbershop:barbershops(
      id,
      name,
      whatsapp_number
    )
  `;

  const modern = await supabaseAdmin
    .from('bookings')
    .select(`
      ${baseSelect},
      reminder_sent_at,
      reminder_1h_sent_at,
      reminder_10m_sent_at
    `)
    .eq('booking_date', todayIso)
    .eq('status', 'confirmed')
    .order('start_time', { ascending: true });

  if (!modern.error) {
    return { bookings: modern.data || [], hasModernReminderColumns: true };
  }

  if (!isMissingColumnError(modern.error)) {
    throw new Error(modern.error.message);
  }

  const legacy = await supabaseAdmin
    .from('bookings')
    .select(`
      ${baseSelect},
      reminder_sent_at
    `)
    .eq('booking_date', todayIso)
    .eq('status', 'confirmed')
    .order('start_time', { ascending: true });

  if (legacy.error) {
    throw new Error(legacy.error.message);
  }

  return { bookings: legacy.data || [], hasModernReminderColumns: false };
}

function getReminderWindow(diffMinutes: number): ReminderWindow | null {
  if (diffMinutes >= 55 && diffMinutes <= 65) return '1h';
  if (diffMinutes >= 8 && diffMinutes <= 12) return '10m';
  return null;
}

function wasReminderSent(booking: any, window: ReminderWindow, hasModernReminderColumns: boolean) {
  if (window === '1h') {
    return Boolean(booking.reminder_1h_sent_at || booking.reminder_sent_at);
  }

  if (!hasModernReminderColumns) {
    return true;
  }

  return Boolean(booking.reminder_10m_sent_at);
}

async function markReminderSent(bookingId: string, window: ReminderWindow, hasModernReminderColumns: boolean) {
  const now = new Date().toISOString();

  if (!hasModernReminderColumns) {
    if (window === '1h') {
      await supabaseAdmin.from('bookings').update({ reminder_sent_at: now }).eq('id', bookingId);
    }
    return;
  }

  const payload =
    window === '1h'
      ? { reminder_1h_sent_at: now, reminder_sent_at: now }
      : { reminder_10m_sent_at: now };

  await supabaseAdmin.from('bookings').update(payload).eq('id', bookingId);
}

function buildReminderMessage(booking: any, window: ReminderWindow, req: Request) {
  const service = firstItem(booking.service);
  const professional = firstItem(booking.professional);
  const barbershop = firstItem(booking.barbershop);
  const cancelUrl = createBookingCancelUrl(booking.id, req);
  const timeText = window === '1h' ? 'Falta 1 hora' : 'Faltam 10 minutos';

  return `${timeText} para seu agendamento em ${barbershop?.name || 'nossa barbearia'}.

Ola, ${booking.customer_name || 'cliente'}.

Servico: ${service?.name || 'Servico'}
Profissional: ${professional?.name || 'Barbeiro'}
Data: ${formatDateBR(booking.booking_date)}
Hora: ${booking.start_time}

Para cancelar, acesse:
${cancelUrl}

Se for comparecer, pode ignorar esta mensagem.`;
}

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const expected = `Bearer ${process.env.CRON_SECRET || ''}`;

    if (!process.env.CRON_SECRET || authHeader !== expected) {
      return NextResponse.json({ error: 'Nao autorizado.' }, { status: 401 });
    }

    const todayIso = getTodayIso();
    const now = new Date();
    const { bookings, hasModernReminderColumns } = await loadTodayBookings(todayIso);

    let sent1h = 0;
    let sent10m = 0;
    let skipped = 0;
    const processedIds: string[] = [];

    for (const booking of bookings || []) {
      const bookingDateTime = combineDateTime(booking.booking_date, booking.start_time);
      const diffMinutes = Math.round((bookingDateTime.getTime() - now.getTime()) / 60000);
      const window = getReminderWindow(diffMinutes);

      if (!window || wasReminderSent(booking, window, hasModernReminderColumns)) {
        skipped++;
        continue;
      }

      const customerPhone = normalizePhone(booking.customer_whatsapp || '');

      if (!customerPhone) {
        skipped++;
        continue;
      }

      const professional = firstItem(booking.professional);
      const evolutionConfig = getEvolutionConfigFromProfessional(professional);

      try {
        await sendWhatsAppMessage(customerPhone, buildReminderMessage(booking, window, req), evolutionConfig);
        await markReminderSent(booking.id, window, hasModernReminderColumns);

        processedIds.push(booking.id);
        if (window === '1h') sent1h++;
        if (window === '10m') sent10m++;
      } catch (err) {
        console.error(`Erro ao enviar lembrete de ${window}:`, err);
      }
    }

    return NextResponse.json({
      ok: true,
      sent1h,
      sent10m,
      skipped,
      processedIds,
      modernReminderColumns: hasModernReminderColumns,
    });
  } catch (error) {
    console.error('Erro em /api/jobs/send-booking-reminders:', error);
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 });
  }
}
