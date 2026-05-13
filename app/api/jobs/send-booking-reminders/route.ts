import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendWhatsAppMessage } from '@/lib/whatsapp';
import { normalizePhone } from '@/lib/phone';

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

    const todayIso = getTodayIso();
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

    for (const booking of bookings || []) {
      const service = firstItem(booking.service);
      const professional = firstItem(booking.professional);
      const barbershop = firstItem(booking.barbershop);

      const bookingDateTime = combineDateTime(booking.booking_date, booking.start_time);
      const diffMinutes = Math.round((bookingDateTime.getTime() - now.getTime()) / 60000);

      // envia entre 55 e 65 minutos antes
      if (diffMinutes < 55 || diffMinutes > 65) {
        skipped++;
        continue;
      }

      const customerPhone = normalizePhone(booking.customer_whatsapp || '');

      if (!customerPhone) {
        skipped++;
        continue;
      }

      const evolutionConfig = getEvolutionConfigFromProfessional(professional);

      const message = `Olá, ${booking.customer_name || 'cliente'}.

Falta 1 hora para seu agendamento em ${barbershop?.name || 'nossa barbearia'}.

Serviço: ${service?.name || 'Serviço'}
Profissional: ${professional?.name || 'Barbeiro'}
Data: ${formatDateBR(booking.booking_date)}
Hora: ${booking.start_time}

Se você deseja cancelar, responda com:
cancelar

Se for comparecer, pode ignorar esta mensagem.`;

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
      } catch (err) {
        console.error('Erro ao enviar lembrete de 1 hora:', err);
      }
    }

    return NextResponse.json({
      ok: true,
      sent,
      skipped,
      processedIds,
    });
  } catch (error) {
    console.error('Erro em /api/jobs/send-booking-reminders:', error);
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 });
  }
}