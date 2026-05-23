import { NextResponse } from 'next/server';
import { verifyBookingCancelToken } from '@/lib/booking-cancel-token';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendWhatsAppMessage } from '@/lib/whatsapp';
import { normalizePhone } from '@/lib/phone';

function combineDateTime(dateStr: string, timeStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = String(timeStr || '00:00').split(':').map(Number);
  return new Date(year, month - 1, day, hour || 0, minute || 0, 0, 0);
}

function formatDateBR(value: string) {
  const [year, month, day] = String(value || '').split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
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

async function cancelBooking(id: string) {
  const payload = {
    status: 'cancelled',
    cancelled_at: new Date().toISOString(),
    cancellation_reason: 'Cancelado pelo cliente via link',
    cancelled_by_customer_via_link: true,
  };

  const fullUpdate = await supabaseAdmin.from('bookings').update(payload).eq('id', id);

  if (!fullUpdate.error) {
    return fullUpdate;
  }

  console.error('Erro no update completo de cancelamento; tentando fallback:', fullUpdate.error);

  return supabaseAdmin.from('bookings').update({ status: 'cancelled' }).eq('id', id);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const verified = verifyBookingCancelToken(String(body.token || ''));

    if (!verified) {
      return NextResponse.json({ error: 'Link de cancelamento invalido.' }, { status: 400 });
    }

    const { data: booking, error } = await supabaseAdmin
      .from('bookings')
      .select(`
        id,
        barbershop_id,
        professional_id,
        customer_name,
        customer_whatsapp,
        booking_date,
        start_time,
        status,
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
        barbershop:barbershops(id, name, whatsapp_number)
      `)
      .eq('id', verified.bookingId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: 'Erro ao buscar agendamento.' }, { status: 500 });
    }

    if (!booking) {
      return NextResponse.json({ error: 'Agendamento nao encontrado.' }, { status: 404 });
    }

    if (booking.status === 'cancelled') {
      return NextResponse.json({ ok: true, message: 'Este agendamento ja estava cancelado.' });
    }

    const bookingDateTime = combineDateTime(booking.booking_date, booking.start_time);
    if (bookingDateTime.getTime() <= Date.now()) {
      return NextResponse.json({ error: 'Nao e possivel cancelar um horario passado.' }, { status: 400 });
    }

    const update = await cancelBooking(booking.id);

    if (update.error) {
      return NextResponse.json({ error: 'Erro ao cancelar agendamento.' }, { status: 500 });
    }

    const professional = Array.isArray(booking.professional)
      ? booking.professional[0]
      : booking.professional;
    const barbershop = Array.isArray(booking.barbershop) ? booking.barbershop[0] : booking.barbershop;
    const service = Array.isArray(booking.service) ? booking.service[0] : booking.service;
    const barberPhone = normalizePhone(professional?.whatsapp_number || barbershop?.whatsapp_number || '');
    const evolutionConfig = getEvolutionConfigFromProfessional(professional);

    if (barberPhone) {
      try {
        await sendWhatsAppMessage(
          barberPhone,
          `Cancelamento pelo cliente

Cliente: ${booking.customer_name || 'Cliente'}
Servico: ${service?.name || 'Servico'}
Data: ${formatDateBR(booking.booking_date)}
Hora: ${booking.start_time}

O horario foi liberado na agenda.`,
          evolutionConfig
        );
      } catch (err) {
        console.error('Erro ao avisar barbeiro sobre cancelamento via link:', err);
      }
    }

    await supabaseAdmin.from('booking_cancellations').insert({
      booking_id: booking.id,
      barbershop_id: booking.barbershop_id,
      professional_id: booking.professional_id,
      cancelled_by_type: 'client',
      reason: 'Cancelado pelo cliente via link',
    });

    return NextResponse.json({
      ok: true,
      message: 'Agendamento cancelado com sucesso. O horario foi liberado na agenda.',
    });
  } catch (error) {
    console.error('Erro em /api/cancel-booking:', error);
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 });
  }
}
