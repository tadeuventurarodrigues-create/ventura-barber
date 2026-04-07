import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendWhatsAppMessage } from '@/lib/whatsapp';
import { normalizePhone } from '@/lib/phone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const APP_TIMEZONE = 'America/Fortaleza';

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

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const expected = `Bearer ${process.env.CRON_SECRET || ''}`;

    if (!process.env.CRON_SECRET || authHeader !== expected) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    const todayIso = getTodayIso(APP_TIMEZONE);
    const now = new Date();

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
        late_reminder_sent_at,
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
      .is('late_reminder_sent_at', null)
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

      const bookingDateTime = combineDateTime(booking.booking_date, booking.start_time);
      const diffMinutes = Math.round(
        (now.getTime() - bookingDateTime.getTime()) / 60000
      );

      // envia aviso quando já tiver 10 min de atraso ou mais
      if (diffMinutes < 10) {
        skipped++;
        debug.push({
          bookingId: booking.id,
          customer: booking.customer_name,
          reason: 'ainda_nao_atrasou_10min',
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

Seu horário em ${barbershop?.name || 'nossa barbearia'} já passou do horário previsto.

Serviço: ${service?.name || 'Serviço'}
Profissional: ${professional?.name || 'Barbeiro'}
Data: ${formatDateBR(booking.booking_date)}
Hora: ${booking.start_time}

Se ainda for comparecer, responda esta mensagem.
Se quiser remarcar, responda:
remarcar`;

      try {
        await sendWhatsAppMessage(customerPhone, message, evolutionConfig);

        await supabaseAdmin
          .from('bookings')
          .update({
            late_reminder_sent_at: new Date().toISOString(),
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
        console.error('Erro ao enviar aviso de atraso:', err);
        debug.push({
          bookingId: booking.id,
          customer: booking.customer_name,
          reason: 'erro_envio',
          diffMinutes,
        });
      }
    }

    return NextResponse.json({
      buildTag: 'jobs-v2',
      ok: true,
      type: 'late_check',
      sent,
      skipped,
      processedIds,
      debug,
    });
  } catch (error) {
    console.error('Erro em /api/jobs/check-late-bookings:', error);
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 });
  }
}