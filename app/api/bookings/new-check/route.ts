import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

// GET /api/bookings/new-check?professional_id=xxx&barbershop_id=xxx&last_id=xxx
// Rota leve chamada pelo Service Worker a cada 30s para detectar novos agendamentos
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const professionalId = searchParams.get('professional_id');
  const barbershopId = searchParams.get('barbershop_id');
  const lastId = searchParams.get('last_id');

  if (!professionalId || !barbershopId) {
    return NextResponse.json({ newBookings: [] });
  }

  try {
    // Busca agendamentos das últimas 2 horas para não sobrecarregar
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    let query = supabaseAdmin
      .from('bookings')
      .select(`
        id,
        customer_name,
        booking_date,
        start_time,
        created_at,
        services ( name )
      `)
      .eq('professional_id', professionalId)
      .eq('barbershop_id', barbershopId)
      .in('status', ['confirmed', 'pending'])
      .gte('created_at', twoHoursAgo)
      .order('created_at', { ascending: false })
      .limit(5);

    const { data, error } = await query;
    if (error) return NextResponse.json({ newBookings: [] });

    const bookings = (data || []).map((b: any) => ({
      id: b.id,
      customer_name: b.customer_name,
      booking_date: b.booking_date,
      start_time: b.start_time,
      service_name: b.services?.name || 'Serviço',
      created_at: b.created_at,
    }));

    // Filtra só os que vieram depois do último ID conhecido
    const newBookings = lastId
      ? bookings.filter((b) => b.id !== lastId && bookings.indexOf(b) < bookings.findIndex((x) => x.id === lastId))
      : bookings.slice(0, 1); // primeira vez: só o mais recente

    return NextResponse.json({ newBookings });
  } catch {
    return NextResponse.json({ newBookings: [] });
  }
}
