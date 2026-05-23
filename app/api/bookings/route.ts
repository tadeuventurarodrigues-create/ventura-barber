import { NextResponse } from 'next/server';
import {
  ACTIVE_BOOKING_STATUSES,
  getAllowedDateRange,
  getWeekdayFromDate,
  isAlignedToSlot,
  isInsideBreak,
  isTooCloseToStart,
  overlapsAny,
  toMinutes,
  toTime,
} from '@/lib/booking-rules';
import { createBookingCancelUrl } from '@/lib/booking-cancel-token';
import { normalizePhone } from '@/lib/phone';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendWhatsAppMessage } from '@/lib/whatsapp';

function formatDateBR(date: string) {
  const [year, month, day] = date.split('-');
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

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      barbershop_id,
      service_id,
      professional_id,
      customer_name,
      customer_whatsapp,
      booking_date,
      start_time,
    } = body;

    if (
      !barbershop_id ||
      !service_id ||
      !professional_id ||
      !customer_name ||
      !customer_whatsapp ||
      !booking_date ||
      !start_time
    ) {
      return NextResponse.json({ error: 'Dados obrigatorios faltando.' }, { status: 400 });
    }

    const normalizedCustomerWhatsapp = normalizePhone(customer_whatsapp);

    if (!normalizedCustomerWhatsapp || normalizedCustomerWhatsapp.length < 12) {
      return NextResponse.json({ error: 'WhatsApp do cliente invalido.' }, { status: 400 });
    }

    const { today, maxDate } = getAllowedDateRange();

    if (booking_date < today || booking_date > maxDate) {
      return NextResponse.json(
        { error: `A data permitida deve estar entre ${today} e ${maxDate}.` },
        { status: 400 }
      );
    }

    const [{ data: service }, { data: professional }, { data: barbershop }, { data: loyalty }] =
      await Promise.all([
        supabaseAdmin
          .from('services')
          .select('id, barbershop_id, name, duration_minutes, price, is_active')
          .eq('id', service_id)
          .single(),
        supabaseAdmin
          .from('professionals')
          .select(`
            id,
            name,
            barbershop_id,
            whatsapp_number,
            is_active,
            accepts_booking,
            evolution_enabled,
            evolution_api_url,
            evolution_instance,
            evolution_api_key
          `)
          .eq('id', professional_id)
          .single(),
        supabaseAdmin
          .from('barbershops')
          .select('id, name, whatsapp_number, status')
          .eq('id', barbershop_id)
          .single(),
        supabaseAdmin
          .from('loyalty_settings')
          .select('*')
          .eq('barbershop_id', barbershop_id)
          .maybeSingle(),
      ]);

    if (!service || !professional || !barbershop) {
      return NextResponse.json({ error: 'Dados da barbearia nao encontrados.' }, { status: 404 });
    }

    if (barbershop.status && barbershop.status !== 'active') {
      return NextResponse.json({ error: 'Barbearia indisponivel para agendamentos.' }, { status: 403 });
    }

    if (service.barbershop_id !== barbershop_id || !service.is_active) {
      return NextResponse.json({ error: 'Servico indisponivel para agendamento.' }, { status: 400 });
    }

    if (
      professional.barbershop_id !== barbershop_id ||
      professional.is_active === false ||
      professional.accepts_booking === false
    ) {
      return NextResponse.json({ error: 'Profissional indisponivel para agendamento.' }, { status: 400 });
    }

    const serviceDuration = Number(service.duration_minutes || 30);
    const bookingStartMinutes = toMinutes(start_time);
    const bookingEndMinutes = bookingStartMinutes + serviceDuration;
    const end_time = toTime(bookingEndMinutes);
    const bookingPrice = Number(service.price || 0);

    if (isTooCloseToStart(booking_date, bookingStartMinutes)) {
      return NextResponse.json(
        { error: 'Esse horario nao esta mais disponivel.' },
        { status: 409 }
      );
    }

    const weekday = getWeekdayFromDate(booking_date);
    const { data: workingHour, error: workingHourError } = await supabaseAdmin
      .from('working_hours')
      .select('start_time, end_time, break_start_time, break_end_time, slot_interval_minutes, is_active')
      .eq('professional_id', professional_id)
      .eq('weekday', weekday)
      .maybeSingle();

    if (workingHourError) {
      return NextResponse.json({ error: 'Erro ao validar horario de trabalho.' }, { status: 500 });
    }

    if (!workingHour || workingHour.is_active === false) {
      return NextResponse.json({ error: 'Profissional nao atende nessa data.' }, { status: 400 });
    }

    const workingStart = toMinutes(workingHour.start_time);
    const workingEnd = toMinutes(workingHour.end_time);
    const slotMinutes = Number(workingHour.slot_interval_minutes || 30);
    const candidateRange = { start: bookingStartMinutes, end: bookingEndMinutes };

    if (bookingStartMinutes < workingStart || bookingEndMinutes > workingEnd) {
      return NextResponse.json({ error: 'Horario fora do expediente.' }, { status: 400 });
    }

    if (!isAlignedToSlot(bookingStartMinutes, workingStart, slotMinutes)) {
      return NextResponse.json({ error: 'Horario indisponivel para agendamento.' }, { status: 400 });
    }

    const breakStart = workingHour.break_start_time ? toMinutes(workingHour.break_start_time) : null;
    const breakEnd = workingHour.break_end_time ? toMinutes(workingHour.break_end_time) : null;

    if (isInsideBreak(candidateRange, breakStart, breakEnd)) {
      return NextResponse.json({ error: 'Horario indisponivel no intervalo do profissional.' }, { status: 400 });
    }

    const customerRes = await supabaseAdmin
      .from('customers')
      .select('*')
      .eq('barbershop_id', barbershop_id)
      .eq('whatsapp_number', normalizedCustomerWhatsapp)
      .maybeSingle();

    let customerId = customerRes.data?.id;
    let customerTotalBookings = Number(customerRes.data?.total_bookings || 0);

    if (!customerId) {
      const insertCustomer = await supabaseAdmin
        .from('customers')
        .insert({
          barbershop_id,
          name: customer_name,
          phone: normalizedCustomerWhatsapp,
          whatsapp_number: normalizedCustomerWhatsapp,
          total_bookings: 0,
        })
        .select('id')
        .single();

      if (!insertCustomer.data) {
        return NextResponse.json({ error: 'Erro ao criar cliente.' }, { status: 500 });
      }

      customerId = insertCustomer.data.id;
    }

    const conflicts = await supabaseAdmin
      .from('bookings')
      .select('id, start_time, end_time')
      .eq('professional_id', professional_id)
      .eq('booking_date', booking_date)
      .in('status', ACTIVE_BOOKING_STATUSES);

    const blocks = await supabaseAdmin
      .from('time_blocks')
      .select('id, start_time, end_time')
      .eq('professional_id', professional_id)
      .eq('block_date', booking_date);

    if (conflicts.error || blocks.error) {
      return NextResponse.json({ error: 'Erro ao validar disponibilidade.' }, { status: 500 });
    }

    const existingRanges = [
      ...(conflicts.data || []).map((item: any) => ({
        start: toMinutes(item.start_time),
        end: toMinutes(item.end_time),
      })),
      ...(blocks.data || []).map((item: any) => ({
        start: toMinutes(item.start_time),
        end: toMinutes(item.end_time),
      })),
    ];

    if (overlapsAny(candidateRange, existingRanges)) {
      return NextResponse.json(
        { error: 'Esse horario ja esta ocupado ou bloqueado.' },
        { status: 409 }
      );
    }

    const sameDay = await supabaseAdmin
      .from('bookings')
      .select('daily_order_number')
      .eq('barbershop_id', barbershop_id)
      .eq('booking_date', booking_date)
      .order('daily_order_number', { ascending: false })
      .limit(1);

    const daily_order_number = sameDay.data?.length
      ? Number(sameDay.data[0].daily_order_number) + 1
      : 1;

    const bookingRes = await supabaseAdmin
      .from('bookings')
      .insert({
        barbershop_id,
        customer_id: customerId,
        professional_id,
        service_id,
        booking_date,
        start_time,
        end_time,
        daily_order_number,
        status: 'confirmed',
        source: 'public_site',
        price: bookingPrice,
        customer_name,
        customer_whatsapp: normalizedCustomerWhatsapp,
      })
      .select('*')
      .single();

    if (!bookingRes.data) {
      return NextResponse.json({ error: 'Erro ao salvar agendamento.' }, { status: 500 });
    }

    customerTotalBookings += 1;

    await supabaseAdmin
      .from('customers')
      .update({
        total_bookings: customerTotalBookings,
        last_booking_at: new Date().toISOString(),
      })
      .eq('id', customerId);

    const barberEvolutionConfig = getEvolutionConfigFromProfessional(professional);
    const notifyPhone = normalizePhone(
      professional.whatsapp_number || barbershop.whatsapp_number || ''
    );

    if (notifyPhone) {
      try {
        await sendWhatsAppMessage(
          notifyPhone,
          `Novo agendamento

Barbearia: ${barbershop.name}
Cliente: ${customer_name}
WhatsApp: ${normalizedCustomerWhatsapp}
Servico: ${service.name}
Profissional: ${professional.name}
Data: ${formatDateBR(booking_date)}
Hora: ${start_time}
No: ${daily_order_number}`,
          barberEvolutionConfig
        );
      } catch (error) {
        console.error('Erro ao avisar barbeiro/loja sobre novo agendamento:', error);
      }
    }

    try {
      const cancelUrl = createBookingCancelUrl(bookingRes.data.id, req);

      await sendWhatsAppMessage(
        normalizedCustomerWhatsapp,
        `Ola, ${customer_name}.

Seu agendamento em ${barbershop.name} foi confirmado.

Servico: ${service.name}
Profissional: ${professional.name}
Data: ${formatDateBR(booking_date)}
Hora: ${start_time}

Para cancelar, acesse:
${cancelUrl}

Qualquer duvida, responda esta mensagem.`,
        barberEvolutionConfig
      );
    } catch (error) {
      console.error('Erro ao enviar confirmacao ao cliente:', error);
    }

    if (loyalty?.enabled && loyalty.visits_required && customerTotalBookings >= Number(loyalty.visits_required)) {
      try {
        await sendWhatsAppMessage(
          normalizedCustomerWhatsapp,
          loyalty.reward_message ||
            `Parabens! Voce alcancou a meta do cartao fidelidade e ganhou ${loyalty.reward_label || 'um premio'}.`,
          barberEvolutionConfig
        );
      } catch (error) {
        console.error('Erro ao enviar mensagem de fidelidade:', error);
      }
    }

    return NextResponse.json({ success: true, booking: bookingRes.data });
  } catch (error) {
    console.error('Erro em /api/bookings:', error);
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 });
  }
}
