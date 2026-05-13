import { NextResponse } from 'next/server';
import { normalizePhone } from '@/lib/phone';
import { supabaseAdmin } from '@/lib/supabase-admin';

function onlyDigits(value: string) {
  return String(value || '').replace(/\D/g, '');
}

function isValidBrazilWhatsapp11Digits(value: string) {
  const digits = onlyDigits(value);

  if (digits.length !== 11) return false;

  return digits.charAt(2) === '9';
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const barbershopId = searchParams.get('barbershop_id') || '';
    const whatsapp = searchParams.get('whatsapp') || '';

    if (!barbershopId || !whatsapp) {
      return NextResponse.json(
        { error: 'barbershop_id e whatsapp são obrigatórios.' },
        { status: 400 }
      );
    }

    if (!isValidBrazilWhatsapp11Digits(whatsapp)) {
      return NextResponse.json(
        { error: 'Informe o WhatsApp com DDD + dígito 9 + número.' },
        { status: 400 }
      );
    }

    const normalizedWhatsapp = normalizePhone(whatsapp);

    const { data: customer, error } = await supabaseAdmin
      .from('customers')
      .select('id, name, whatsapp_number, phone, total_bookings, last_booking_at')
      .eq('barbershop_id', barbershopId)
      .eq('whatsapp_number', normalizedWhatsapp)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: 'Erro ao consultar cliente.' },
        { status: 500 }
      );
    }

    if (!customer) {
      return NextResponse.json({
        found: false,
        customer: null,
      });
    }

    return NextResponse.json({
      found: true,
      customer,
    });
  } catch (error) {
    console.error('Erro em /api/public/customer:', error);

    return NextResponse.json(
      { error: 'Erro interno do servidor.' },
      { status: 500 }
    );
  }
}