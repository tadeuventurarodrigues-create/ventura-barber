import { NextResponse } from 'next/server';
import {
  ACTIVE_BOOKING_STATUSES,
  getAllowedDateRange,
  getWeekdayFromDate,
  isInsideBreak,
  isTooCloseToStart,
  overlapsAny,
  toMinutes,
  toTime,
} from '@/lib/booking-rules';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const serviceId = searchParams.get('service_id');
    const professionalId = searchParams.get('professional_id');
    const bookingDate = searchParams.get('booking_date');

    if (!serviceId || !professionalId || !bookingDate) {
      return NextResponse.json(
        { error: 'service_id, professional_id e booking_date são obrigatórios.' },
        { status: 400 }
      );
    }

    const { today, maxDate } = getAllowedDateRange();

    if (bookingDate < today || bookingDate > maxDate) {
      return NextResponse.json({
        times: [],
        error: `A data permitida deve estar entre ${today} e ${maxDate}.`,
      });
    }

    const { data: service, error: serviceError } = await supabaseAdmin
      .from('services')
      .select('id, duration_minutes')
      .eq('id', serviceId)
      .maybeSingle();

    if (serviceError || !service) {
      return NextResponse.json({ error: 'Serviço não encontrado.' }, { status: 404 });
    }

    const weekday = getWeekdayFromDate(bookingDate);

    const { data: workingHour, error: workingHourError } = await supabaseAdmin
      .from('working_hours')
      .select('start_time, end_time, break_start_time, break_end_time, slot_interval_minutes, is_active')
      .eq('professional_id', professionalId)
      .eq('weekday', weekday)
      .maybeSingle();

    if (workingHourError) {
      return NextResponse.json({ error: 'Erro ao buscar horário de trabalho.' }, { status: 500 });
    }

    if (!workingHour || workingHour.is_active === false) {
      return NextResponse.json({ times: [] });
    }

    const { data: bookings, error: bookingsError } = await supabaseAdmin
      .from('bookings')
      .select('start_time, end_time, status')
      .eq('professional_id', professionalId)
      .eq('booking_date', bookingDate)
      .in('status', ACTIVE_BOOKING_STATUSES);

    if (bookingsError) {
      return NextResponse.json({ error: 'Erro ao buscar agendamentos.' }, { status: 500 });
    }

    const { data: blocks, error: blocksError } = await supabaseAdmin
      .from('time_blocks')
      .select('start_time, end_time')
      .eq('professional_id', professionalId)
      .eq('block_date', bookingDate);

    if (blocksError) {
      return NextResponse.json({ error: 'Erro ao buscar bloqueios de horário.' }, { status: 500 });
    }

    const startMinutes = toMinutes(workingHour.start_time);
    const endMinutes = toMinutes(workingHour.end_time);
    const breakStartMinutes = workingHour.break_start_time ? toMinutes(workingHour.break_start_time) : null;
    const breakEndMinutes = workingHour.break_end_time ? toMinutes(workingHour.break_end_time) : null;
    const duration = Number(service.duration_minutes || 30);
    const slot = Number(workingHour.slot_interval_minutes || 30);

    const occupiedRanges = [
      ...(bookings || []).map((item) => ({
        start: toMinutes(item.start_time),
        end: toMinutes(item.end_time),
      })),
      ...(blocks || []).map((item) => ({
        start: toMinutes(item.start_time),
        end: toMinutes(item.end_time),
      })),
    ];

    const times: string[] = [];
    for (let current = startMinutes; current + duration <= endMinutes; current += slot) {
      const candidateStart = current;
      const candidateEnd = current + duration;
      const candidateRange = { start: candidateStart, end: candidateEnd };

      if (isTooCloseToStart(bookingDate, candidateStart)) {
        continue;
      }

      if (isInsideBreak(candidateRange, breakStartMinutes, breakEndMinutes)) {
        continue;
      }

      if (!overlapsAny(candidateRange, occupiedRanges)) {
        times.push(toTime(candidateStart));
      }
    }

    return NextResponse.json({ times });
  } catch (error) {
    console.error('Erro em /api/available-times:', error);
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 });
  }
}
