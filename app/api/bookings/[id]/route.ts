import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendWhatsAppMessage } from '@/lib/whatsapp';
import { normalizePhone } from '@/lib/phone';

function timeToMinutes(value: string) {
  const [h, m] = String(value || '00:00').split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(total: number) {
  const hours = Math.floor(total / 60)
    .toString()
    .padStart(2, '0');
  const minutes = (total % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

function formatDateBR(value: string) {
  if (!value) return value;
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

async function canManageBooking(profile: any, booking: any) {
  if (!profile || !booking) return false;

  if (profile.role === 'admin') return true;

  if (profile.role === 'shop_manager' && profile.barbershop_id === booking.barbershop_id) {
    return true;
  }

  if (
    profile.role === 'shop_barber' &&
    profile.barbershop_id === booking.barbershop_id &&
    profile.professional_id === booking.professional_id
  ) {
    return true;
  }

  return false;
}

async function getBookingById(id: string) {
  const { data, error } = await supabaseAdmin
    .from('bookings')
    .select(`
      *,
      service:services(id, name, duration_minutes),
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
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
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

async function notifyCancellation(booking: any, reason: string) {
  const customerPhone = normalizePhone(
    booking?.customer?.whatsapp_number || booking?.customer?.phone || booking?.customer_whatsapp || ''
  );

  const evolutionConfig = getEvolutionConfigFromProfessional(booking?.professional);

  if (!customerPhone) {
    console.log('Cancelamento sem WhatsApp do cliente, ignorando envio.');
    return;
  }

  const message = `Olá, ${booking?.customer?.name || booking?.customer_name || 'cliente'}.

Seu agendamento em ${booking?.barbershop?.name || 'nossa barbearia'} foi cancelado.

Serviço: ${booking?.service?.name || 'Serviço'}
Profissional: ${booking?.professional?.name || 'Barbeiro'}
Data: ${formatDateBR(booking?.booking_date)}
Hora: ${booking?.start_time}

Motivo: ${reason}`;

  await sendWhatsAppMessage(customerPhone, message, evolutionConfig);
  console.log('Mensagem de cancelamento enviada para o cliente.');
}

async function notifyReschedule(booking: any, newDate: string, newStartTime: string) {
  const customerPhone = normalizePhone(
    booking?.customer?.whatsapp_number || booking?.customer?.phone || booking?.customer_whatsapp || ''
  );

  const evolutionConfig = getEvolutionConfigFromProfessional(booking?.professional);

  if (!customerPhone) {
    console.log('Remarcação sem WhatsApp do cliente, ignorando envio.');
    return;
  }

  const message = `Olá, ${booking?.customer?.name || booking?.customer_name || 'cliente'}.

Seu agendamento em ${booking?.barbershop?.name || 'nossa barbearia'} foi remarcado.

Serviço: ${booking?.service?.name || 'Serviço'}
Profissional: ${booking?.professional?.name || 'Barbeiro'}

Data anterior: ${formatDateBR(booking?.booking_date)}
Hora anterior: ${booking?.start_time}

Nova data: ${formatDateBR(newDate)}
Novo horário: ${newStartTime}

Qualquer dúvida, responda esta mensagem.`;

  await sendWhatsAppMessage(customerPhone, message, evolutionConfig);
  console.log('Mensagem de remarcação enviada para o cliente.');
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const profile = await getCurrentProfile();

    if (!profile) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await req.json();
    const action = String(body.action || '').trim();

    const booking = await getBookingById(id);

    if (!booking) {
      return NextResponse.json({ error: 'Agendamento não encontrado.' }, { status: 404 });
    }

    const allowed = await canManageBooking(profile, booking);

    if (!allowed) {
      return NextResponse.json({ error: 'Sem permissão para este agendamento.' }, { status: 403 });
    }

    if (action === 'cancel') {
      if (booking.status === 'cancelled') {
        return NextResponse.json({ error: 'Este agendamento já foi cancelado.' }, { status: 400 });
      }

      const cancelReason = String(body.reason || '').trim() || 'Cancelado pelo painel da barbearia';

      const { error: updateError } = await supabaseAdmin
        .from('bookings')
        .update({
          status: 'cancelled',
          cancellation_reason: cancelReason,
          cancelled_at: new Date().toISOString(),
        })
        .eq('id', booking.id);

      if (updateError) {
        return NextResponse.json(
          { error: updateError.message || 'Erro ao cancelar agendamento.' },
          { status: 500 }
        );
      }

      const cancellationInsert = await supabaseAdmin.from('booking_cancellations').insert({
        booking_id: booking.id,
        barbershop_id: booking.barbershop_id,
        professional_id: booking.professional_id,
        cancelled_by_profile_id: profile.id,
        reason: cancelReason,
      });

      if (cancellationInsert.error) {
        console.error('Erro ao registrar cancellation log:', cancellationInsert.error);
      }

      try {
        await notifyCancellation(booking, cancelReason);
      } catch (err) {
        console.error('Erro ao enviar mensagem de cancelamento:', err);
      }

      return NextResponse.json({
        ok: true,
        message: 'Agendamento cancelado com sucesso.',
      });
    }

    if (action === 'reschedule') {
      if (booking.status === 'cancelled') {
        return NextResponse.json(
          { error: 'Não é possível remarcar um agendamento cancelado.' },
          { status: 400 }
        );
      }

      const bookingDate = String(body.booking_date || '').trim();
      const startTime = String(body.start_time || '').trim();

      if (!bookingDate || !startTime) {
        return NextResponse.json(
          { error: 'Nova data e novo horário são obrigatórios.' },
          { status: 400 }
        );
      }

      const durationMinutes =
        Number(booking?.service?.duration_minutes || booking.duration_minutes || 30) || 30;

      const endTime = minutesToTime(timeToMinutes(startTime) + durationMinutes);

      const { data: conflictingBooking, error: conflictError } = await supabaseAdmin
        .from('bookings')
        .select('id, start_time, end_time')
        .eq('barbershop_id', booking.barbershop_id)
        .eq('professional_id', booking.professional_id)
        .eq('booking_date', bookingDate)
        .neq('id', booking.id)
        .in('status', ['confirmed', 'pending'])
        .lt('start_time', endTime)
        .gt('end_time', startTime)
        .maybeSingle();

      if (conflictError) {
        return NextResponse.json(
          { error: conflictError.message || 'Erro ao validar conflito de horário.' },
          { status: 500 }
        );
      }

      if (conflictingBooking) {
        return NextResponse.json(
          { error: 'Já existe outro agendamento neste horário.' },
          { status: 409 }
        );
      }

      const oldDate = booking.booking_date;
      const oldStartTime = booking.start_time;
      const oldEndTime = booking.end_time;

      const { error: updateError } = await supabaseAdmin
        .from('bookings')
        .update({
          booking_date: bookingDate,
          start_time: startTime,
          end_time: endTime,
          status: 'confirmed',
          rescheduled_at: new Date().toISOString(),
        })
        .eq('id', booking.id);

      if (updateError) {
        return NextResponse.json(
          { error: updateError.message || 'Erro ao remarcar agendamento.' },
          { status: 500 }
        );
      }

      const rescheduleInsert = await supabaseAdmin.from('booking_reschedules').insert({
        booking_id: booking.id,
        barbershop_id: booking.barbershop_id,
        professional_id: booking.professional_id,
        changed_by_profile_id: profile.id,
        old_booking_date: oldDate,
        old_start_time: oldStartTime,
        old_end_time: oldEndTime,
        new_booking_date: bookingDate,
        new_start_time: startTime,
        new_end_time: endTime,
      });

      if (rescheduleInsert.error) {
        console.error('Erro ao registrar reschedule log:', rescheduleInsert.error);
      }

      try {
        await notifyReschedule(booking, bookingDate, startTime);
      } catch (err) {
        console.error('Erro ao enviar mensagem de remarcação:', err);
      }

      return NextResponse.json({
        ok: true,
        message: 'Agendamento remarcado com sucesso.',
      });
    }

    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
  } catch (error) {
    console.error('Erro em PATCH /api/bookings/[id]:', error);
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 });
  }
}