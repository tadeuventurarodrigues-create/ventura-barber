import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { normalizePhone } from '@/lib/phone';
import { sendWhatsAppMessage } from '@/lib/whatsapp';

function formatDateBR(value: string) {
  if (!value) return value;
  const [year, month, day] = value.split('-');
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

function firstItem<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

type RouteContext = {
  params: Promise<{ token: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  try {
    const { token } = await context.params;

    const { data: booking, error } = await supabaseAdmin
      .from('bookings')
      .select(`
        id,
        customer_name,
        booking_date,
        start_time,
        daily_order_number,
        status,
        service:services(name),
        professional:professionals(name),
        barbershop:barbershops(name)
      `)
      .eq('cancel_token', token)
      .maybeSingle();

    if (error || !booking) {
      return NextResponse.json({ error: 'Agendamento não encontrado.' }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      booking: {
        ...booking,
        service: firstItem(booking.service),
        professional: firstItem(booking.professional),
        barbershop: firstItem(booking.barbershop),
      },
    });
  } catch (error) {
    console.error('Erro ao buscar cancelamento:', error);
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
  }
}

export async function POST(_: Request, context: RouteContext) {
  try {
    const { token } = await context.params;

    const { data: booking, error } = await supabaseAdmin
      .from('bookings')
      .select(`
        id,
        customer_name,
        customer_whatsapp,
        booking_date,
        start_time,
        daily_order_number,
        status,
        service:services(name),
        professional:professionals(
          name,
          whatsapp_number,
          evolution_enabled,
          evolution_api_url,
          evolution_instance,
          evolution_api_key
        ),
        barbershop:barbershops(name, whatsapp_number)
      `)
      .eq('cancel_token', token)
      .maybeSingle();

    if (error || !booking) {
      return NextResponse.json({ error: 'Agendamento não encontrado.' }, { status: 404 });
    }

    if (booking.status === 'cancelled') {
      return NextResponse.json({ ok: true, alreadyCancelled: true });
    }

    const professional = firstItem(booking.professional);
    const barbershop = firstItem(booking.barbershop);
    const service = firstItem(booking.service);
    const evolutionConfig = getEvolutionConfigFromProfessional(professional);

    const { error: updateError } = await supabaseAdmin
      .from('bookings')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancellation_reason: 'Cancelado pelo link',
        cancel_confirmation_pending: false,
        cancel_confirmation_requested_at: null,
      })
      .eq('id', booking.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const customerPhone = normalizePhone(booking.customer_whatsapp || '');
    const barberPhone = normalizePhone(
      professional?.whatsapp_number || barbershop?.whatsapp_number || ''
    );

    if (customerPhone) {
      try {
        await sendWhatsAppMessage(
          customerPhone,
          `Olá, ${booking.customer_name || 'cliente'}.

Seu agendamento em ${barbershop?.name || 'nossa barbearia'} foi cancelado com sucesso.

Serviço: ${service?.name || 'Serviço'}
Profissional: ${professional?.name || 'Barbeiro'}
Data: ${formatDateBR(booking.booking_date)}
Hora: ${booking.start_time}
Código: ${booking.daily_order_number}`,
          evolutionConfig
        );
      } catch (error) {
        console.error('Erro ao avisar cliente sobre cancelamento por link:', error);
      }
    }

    if (barberPhone) {
      try {
        await sendWhatsAppMessage(
          barberPhone,
          `📌 Cancelamento pelo link

Cliente: ${booking.customer_name || 'Cliente'}
Serviço: ${service?.name || 'Serviço'}
Data: ${formatDateBR(booking.booking_date)}
Hora: ${booking.start_time}
Código: ${booking.daily_order_number}`,
          evolutionConfig
        );
      } catch (error) {
        console.error('Erro ao avisar barbeiro sobre cancelamento por link:', error);
      }
    }

    return NextResponse.json({ ok: true, cancelled: true });
  } catch (error) {
    console.error('Erro ao cancelar por link:', error);
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
  }
}