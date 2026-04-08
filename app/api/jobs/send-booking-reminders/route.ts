import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendWhatsAppMessage } from '@/lib/whatsapp';
import { normalizePhone } from '@/lib/phone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const APP_TIMEZONE = 'America/Fortaleza';
const BUILD_TAG = 'jobs-v3';

function formatDateBR(value: string) {
  if (!value) return value;
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

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

  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value || '00';

  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    second: Number(get('second')),
  };
}

function getTodayIso(timeZone = APP_TIMEZONE) {
  const { year, month, day } = getNowPartsInTimezone(timeZone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function toLocalComparableMinutes(dateStr: string, timeStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = String(timeStr || '00:00:00')
    .split(':')
    .map(Number);

  // número absoluto em minutos, sem depender do timezone do servidor
  const dayKey = year * 372 + month * 31 + day;
  return dayKey * 1440 + (hour || 0) * 60 + (minute || 0);
}

function getCurrentComparableMinutes(timeZone = APP_TIMEZONE) {
  const { year, month, day, hour, minute } = getNowPartsInTimezone(timeZone);
  const dayKey = year * 372 + month * 31 + day;
  return dayKey * 1440 + hour * 60 + minute;
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

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const expected = `Bearer ${process.env.CRON_SECRET || ''}`;

    if (!process.env.CRON_SECRET || authHeader !== expected) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    const todayIso = getTodayIso(APP_TIMEZONE);
    const nowComparable = getCurrentComparableMinutes(APP_TIMEZONE);

    const { data: bookings, error } = await supabaseAdmin
      .from('bookings')
      .select(`
        id,
        booking_date,
        start_time,
        end_time,
        status,
        customer_name,
        customer_whatsapp,
        reminder_sent_at,
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
      `)
      .eq('booking_date', todayIso)
      .eq('status', 'confirmed')
      .is('reminder_sent_at', null)
      .order('start_time', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let sent = 0;
    let skipped = 0;
    const processedIds: string[] = [];
    const debug: any[] = [];

    for (const booking of bookings || []) {
      const service = firstItem(booking.service);
      const professional = firstItem(booking.professional);
      const barbershop = firstItem(booking.barbershop);

      const bookingComparable = toLocalComparableMinutes(
        booking.booking_date,
        booking.start_time
      );

      const diffMinutes = bookingComparable - nowComparable;

      if (diffMinutes > 60 || diffMinutes < 0) {
        skipped++;
        debug.push({
          bookingId: booking.id,
          customer: booking.customer_name,
          reason: 'fora_da_janela_1h',
          diffMinutes,
          start_time: booking.start_time,
        });
        continue;
      }

      const customerPhone = normalizePhone(booking.customer_whatsapp || '');

      if (!customerPhone) {
        skipped++;
        debug.push({
          bookingId: booking.id,
          customer: booking.customer_name,
          reason: 'telefone_invalido',
          rawPhone: booking.customer_whatsapp,
        });
        continue;
      }

      const evolutionConfig = getEvolutionConfigFromProfessional(professional);

      const message = `Olá, ${booking.customer_name || 'cliente'}.

Falta cerca de 1 hora para seu agendamento em ${barbershop?.name || 'nossa barbearia'}.

Serviço: ${service?.name || 'Serviço'}
Profissional: ${professional?.name || 'Barbeiro'}
Data: ${formatDateBR(booking.booking_date)}
Hora: ${booking.start_time}

Se deseja cancelar, responda:
cancelar

Se deseja remarcar, responda:
remarcar`;

      try {
        await sendWhatsAppMessage(customerPhone, message, evolutionConfig);

        await supabaseAdmin
          .from('bookings')
          .update({
            reminder_sent_at: new Date().toISOString(),
          })
          .eq('id', booking.id);

        processedIds.push(booking.id);
        sent++;
        debug.push({
          bookingId: booking.id,
          customer: booking.customer_name,
          reason: 'enviado',
          diffMinutes,
          phone: customerPhone,
        });
      } catch (err) {
        console.error('Erro ao enviar lembrete de 1 hora:', err);
        debug.push({
          bookingId: booking.id,
          customer: booking.customer_name,
          reason: 'erro_envio',
          diffMinutes,
        });
      }
    }

    return NextResponse.json({
      buildTag: BUILD_TAG,
      ok: true,
      type: '1h_reminder',
      sent,
      skipped,
      processedIds,
      debug,
    });
  } catch (error) {
    console.error('Erro em /api/jobs/send-booking-reminders:', error);
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 });
  }
}