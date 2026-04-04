import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

type AppProfile = {
  id: string;
  role: 'admin' | 'shop_manager' | 'shop_barber';
  barbershop_id: string | null;
  professional_id: string | null;
};

function toBoolean(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return value === 'true' || value === '1';
  }
  return false;
}

function canManageWorkingHours(
  profile: AppProfile,
  targetBarbershopId: string,
  targetProfessionalId: string
) {
  if (profile.role === 'admin') return true;

  if (profile.role === 'shop_manager' && profile.barbershop_id === targetBarbershopId) {
    return true;
  }

  if (
    profile.role === 'shop_barber' &&
    profile.barbershop_id === targetBarbershopId &&
    profile.professional_id === targetProfessionalId
  ) {
    return true;
  }

  return false;
}

export async function POST(req: Request) {
  try {
    const profile = (await getCurrentProfile()) as AppProfile | null;

    if (!profile) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
    }

    const body = await req.json();

    const professionalId = String(body.professional_id || '').trim();
    const weekday = Number(body.weekday);
    const startTime = String(body.start_time || '').trim();
    const endTime = String(body.end_time || '').trim();
    const breakStartTime = String(body.break_start_time || '').trim();
    const breakEndTime = String(body.break_end_time || '').trim();
    const slotIntervalMinutes = Number(body.slot_interval_minutes || 30);
    const isActive = toBoolean(body.is_active);

    if (!professionalId) {
      return NextResponse.json({ error: 'professional_id é obrigatório.' }, { status: 400 });
    }

    if (Number.isNaN(weekday) || weekday < 0 || weekday > 6) {
      return NextResponse.json({ error: 'weekday inválido. Use 0 a 6.' }, { status: 400 });
    }

    if (isActive) {
      if (!startTime || !endTime) {
        return NextResponse.json({ error: 'start_time e end_time são obrigatórios.' }, { status: 400 });
      }

      if (startTime >= endTime) {
        return NextResponse.json({ error: 'A hora inicial deve ser menor que a hora final.' }, { status: 400 });
      }

      if ((breakStartTime && !breakEndTime) || (!breakStartTime && breakEndTime)) {
        return NextResponse.json({ error: 'Preencha início e fim da pausa de almoço.' }, { status: 400 });
      }

      if (breakStartTime && breakEndTime) {
        if (breakStartTime >= breakEndTime) {
          return NextResponse.json({ error: 'O início da pausa deve ser menor que o fim da pausa.' }, { status: 400 });
        }

        if (breakStartTime <= startTime || breakEndTime >= endTime) {
          return NextResponse.json({ error: 'A pausa de almoço deve ficar dentro do expediente.' }, { status: 400 });
        }
      }
    }

    const professionalRes = await supabaseAdmin
      .from('professionals')
      .select('id, barbershop_id')
      .eq('id', professionalId)
      .maybeSingle();

    if (professionalRes.error) {
      console.error('Erro ao buscar professional:', professionalRes.error);
      return NextResponse.json(
        { error: professionalRes.error.message || 'Erro ao buscar barbeiro.' },
        { status: 500 }
      );
    }

    if (!professionalRes.data) {
      return NextResponse.json({ error: 'Barbeiro não encontrado.' }, { status: 404 });
    }

    const targetBarbershopId = professionalRes.data.barbershop_id;
    const allowed = canManageWorkingHours(profile, targetBarbershopId, professionalId);

    if (!allowed) {
      return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 });
    }

    const existingRes = await supabaseAdmin
      .from('working_hours')
      .select('id')
      .eq('professional_id', professionalId)
      .eq('weekday', weekday)
      .maybeSingle();

    if (existingRes.error) {
      console.error('Erro ao buscar working_hours existente:', existingRes.error);
      return NextResponse.json(
        { error: existingRes.error.message || 'Erro ao buscar horário existente.' },
        { status: 500 }
      );
    }

    const payload = {
      barbershop_id: targetBarbershopId,
      professional_id: professionalId,
      weekday,
      start_time: isActive ? startTime : '00:00',
      end_time: isActive ? endTime : '00:00',
      break_start_time: isActive && breakStartTime ? breakStartTime : null,
      break_end_time: isActive && breakEndTime ? breakEndTime : null,
      slot_interval_minutes: slotIntervalMinutes,
      is_active: isActive,
    };

    let result;

    if (existingRes.data?.id) {
      result = await supabaseAdmin
        .from('working_hours')
        .update(payload)
        .eq('id', existingRes.data.id)
        .select(
          'id, barbershop_id, professional_id, weekday, start_time, end_time, break_start_time, break_end_time, slot_interval_minutes, is_active'
        )
        .maybeSingle();
    } else {
      result = await supabaseAdmin
        .from('working_hours')
        .insert(payload)
        .select(
          'id, barbershop_id, professional_id, weekday, start_time, end_time, break_start_time, break_end_time, slot_interval_minutes, is_active'
        )
        .maybeSingle();
    }

    if (result.error) {
      console.error('Erro ao salvar working_hours:', result.error, payload);
      return NextResponse.json(
        { error: result.error.message || 'Erro ao salvar horário.' },
        { status: 500 }
      );
    }

    if (!result.data) {
      return NextResponse.json({ error: 'Horário não retornado após salvar.' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      message: 'Horário salvo com sucesso.',
      working_hour: result.data,
    });
  } catch (error) {
    console.error('Erro interno em /api/admin/working-hours:', error);
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 });
  }
}
