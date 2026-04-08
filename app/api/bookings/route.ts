import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { sendWhatsAppMessage } from '@/lib/whatsapp';
import { normalizePhone } from '@/lib/phone';
import { supabaseAdmin } from '@/lib/supabase-admin';

function toMinutes(time: string) {
  const [hour, minute] = String(time || '00:00')
    .split(':')
    .map(Number);
  return hour * 60 + minute;
}

function toTime(totalMinutes: number) {
  const h = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const m = String(totalMinutes % 60).padStart(2, '0');
  return `${h}:${m}`;
}

function formatDateBR(date: string) {
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
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
      return NextResponse.json({ error: 'Dados obrigatórios faltando.' }, { status: 400 });
    }

    const normalizedCustomerWhatsapp = normalizePhone(customer_whatsapp);

    if (!normalizedCustomerWhatsapp || normalizedCustomerWhatsapp.length < 12) {
      return NextResponse.json({ error: 'WhatsApp do cliente inválido.' }, { status: 400 });
    }

    const { data: service } = await supabaseAdmin
      .from('services')
      .select('id, name, duration_minutes, price')
      .eq('id', service_id)
      .single();

    const { data: professional } = await supabaseAdmin
      .from('professionals')
      .select(`
        id,
        name,
        barbershop_id,
        whatsapp_number,
        evolution_enabled,
        evolution_api_url,
        evolution_instance,
        evolution_api_key
      `)
      .eq('id', professional_id)
      .single();

    const { data: barbershop } = await supabaseAdmin
      .from('barbershops')
      .select('id, name, whatsapp_number')
      .eq('id', barbershop_id)
      .single();

    const { data: loyalty } = await supabaseAdmin
      .from('loyalty_settings')
      .select('*')
      .eq('barbershop_id', barbershop_id)
      .maybeSingle();

    if (!service || !professional || !barbershop) {
      return NextResponse.json({ error: 'Dados da barbearia não encontrados.' }, { status: 404 });
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
          whatsapp_jid: null,
          total_bookings: 0,
        })
        .select('id')
        .single();

      if (!insertCustomer.data) {
        return NextResponse.json({ error: 'Erro ao criar cliente.' }, { status: 500 });
      }

      customerId = insertCustomer.data.id;
    }

    const serviceDuration = Number(service.duration_minutes || 30);
    const bookingStartMinutes = toMinutes(start_time);
    const bookingEndMinutes = bookingStartMinutes + serviceDuration;
    const end_time = toTime(bookingEndMinutes);
    const bookingPrice = Number(service.price || 0);

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

    const conflicts = await supabaseAdmin
      .from('bookings')
      .select('id, start_time, end_time')
      .eq('professional_id', professional_id)
      .eq('booking_date', booking_date)
      .in('status', ['pending', 'confirmed']);

    const blocks = await supabaseAdmin
      .from('time_blocks')
      .select('id, start_time, end_time')
      .eq('professional_id', professional_id)
      .eq('block_date', booking_date);

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

    const overlap = existingRanges.some((range) => {
      return bookingStartMinutes < range.end && bookingEndMinutes > range.start;
    });

    if (overlap) {
      return NextResponse.json(
        { error: 'Esse horário já está ocupado ou bloqueado.' },
        { status: 409 }
      );
    }

    const cancelToken = randomUUID();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
    const cancelUrl = `${appUrl}/cancelar/${cancelToken}`;

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
        customer_jid: null,
        cancel_confirmation_pending: false,
        cancel_token: cancelToken,
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

    const barberEvolutionConfig =
      professional.evolution_enabled &&
      professional.evolution_api_url &&
      professional.evolution_instance &&
      professional.evolution_api_key
        ? {
            apiUrl: professional.evolution_api_url,
            instance: professional.evolution_instance,
            apiKey: professional.evolution_api_key,
          }
        : null;

    const notifyPhone = normalizePhone(
      professional.whatsapp_number || barbershop.whatsapp_number || ''
    );

    if (notifyPhone) {
      try {
        await sendWhatsAppMessage(
          notifyPhone,
          `📅 Novo agendamento

Barbearia: ${barbershop.name}
Cliente: ${customer_name}
WhatsApp: ${normalizedCustomerWhatsapp}
Serviço: ${service.name}
Profissional: ${professional.name}
Data: ${formatDateBR(booking_date)}
Hora: ${start_time}
Nº: ${daily_order_number}`,
          barberEvolutionConfig
        );
      } catch (error) {
        console.error('Erro ao avisar barbeiro/loja sobre novo agendamento:', error);
      }
    }

    try {
      await sendWhatsAppMessage(
        normalizedCustomerWhatsapp,
        `Olá, ${customer_name}.

Seu agendamento em ${barbershop.name} foi confirmado.

Serviço: ${service.name}
Profissional: ${professional.name}
Data: ${formatDateBR(booking_date)}
Hora: ${start_time}
Código: ${daily_order_number}

Para cancelar seu agendamento, clique no link abaixo:
${cancelUrl}`,
        barberEvolutionConfig
      );
    } catch (error) {
      console.error('Erro ao enviar confirmação ao cliente:', error);
    }

    if (
      loyalty?.enabled &&
      loyalty.visits_required &&
      customerTotalBookings >= Number(loyalty.visits_required)
    ) {
      try {
        await sendWhatsAppMessage(
          normalizedCustomerWhatsapp,
          loyalty.reward_message ||
            `Parabéns! Você alcançou a meta do cartão fidelidade e ganhou ${loyalty.reward_label || 'um prêmio'}.`,
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