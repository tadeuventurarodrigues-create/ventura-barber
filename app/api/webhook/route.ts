import { NextResponse } from 'next/server';
export async function POST(req: Request) {
  try {
    // Bloqueio correto: dentro do POST
    if (process.env.ENABLE_WHATSAPP_INBOUND_AUTOMATION !== 'true') {
      return NextResponse.json({ ok: true, ignored: 'inbound-automation-disabled' });
    }

    const payload = await req.json();

    console.log('WEBHOOK_PAYLOAD:', JSON.stringify(payload, null, 2));

    const fromMe = extractFromMe(payload);
    const senderJid = extractSenderJid(payload);
    const remoteJid = extractRemoteJid(payload);
    const instanceName = extractInstanceName(payload);
    const senderPushName = extractSenderPushName(payload);
    const rawText = extractText(payload);
    const normalizedText = normalizeText(rawText);

    console.log('WEBHOOK_DEBUG:', {
      fromMe,
      senderJid,
      remoteJid,
      rawText,
      normalizedText,
      event: payload?.event,
      instanceName,
      senderPushName,
    });

    if (fromMe) {
      return NextResponse.json({ ok: true, ignored: 'fromMe' });
    }

    if (!senderJid || isGroupJid(senderJid)) {
      return NextResponse.json({ ok: true, ignored: 'group-or-empty' });
    }

    const senderNumber = normalizePhone(senderJid);

    console.log('WEBHOOK_NORMALIZED:', {
      senderJid,
      remoteJid,
      instanceName,
      senderNumber,
      text: normalizedText,
      phoneCandidates: buildPhoneCandidates(senderJid),
      jidCandidates: buildJidCandidates(remoteJid),
    });

    if (!senderNumber || !normalizedText) {
      return NextResponse.json({ ok: true, ignored: 'empty-message' });
    }

    await attachCustomerIdentity(senderNumber, remoteJid);

    // Se você quiser desligar totalmente qualquer ação de entrada,
    // pode descomentar esta linha:
    // return NextResponse.json({ ok: true, inbound_disabled: true });

    const cancelCode = extractBookingCode(normalizedText, 'cancelar');
    const confirmCode = extractBookingCode(normalizedText, 'sim');
    const abortCode = extractBookingCode(normalizedText, 'nao');

    if (cancelCode) {
      const result = await requestBookingCancellationByCode(cancelCode, senderNumber, remoteJid);

      if (result.ok) {
        return NextResponse.json({ ok: true, action: 'customer-cancel-requested-by-code' });
      }

      return NextResponse.json({
        ok: true,
        action: 'customer-cancel-code-not-found',
        reason: 'Nenhum agendamento futuro confirmado encontrado para este código.',
        code: cancelCode,
      });
    }

    if (confirmCode) {
      const result = await confirmBookingCancellationByCode(confirmCode, remoteJid);

      if (result.ok) {
        return NextResponse.json({ ok: true, action: 'customer-cancel-confirmed-by-code' });
      }

      return NextResponse.json({
        ok: true,
        action: 'customer-cancel-confirm-code-not-found',
        reason: 'Nenhum pedido de cancelamento pendente encontrado para este código.',
        code: confirmCode,
      });
    }

    if (abortCode) {
      const result = await cancelPendingCancellationRequestByCode(abortCode, remoteJid);

      if (result.ok) {
        return NextResponse.json({ ok: true, action: 'customer-cancel-aborted-by-code' });
      }

      return NextResponse.json({
        ok: true,
        action: 'customer-cancel-abort-code-not-found',
        reason: 'Nenhum pedido de cancelamento pendente encontrado para este código.',
        code: abortCode,
      });
    }

    if (normalizedText === 'cancelar') {
      const result = await requestBookingCancellationByCustomer(senderNumber, remoteJid);

      if (result.ok) {
        return NextResponse.json({ ok: true, action: 'customer-cancel-requested' });
      }

      return NextResponse.json({
        ok: true,
        action: 'customer-cancel-not-found',
        reason: 'Nenhum agendamento futuro confirmado encontrado para este número.',
        senderNumber,
        remoteJid,
      });
    }

    if (normalizedText === 'sim') {
      const result = await confirmBookingCancellationByCustomer(senderNumber, remoteJid);

      if (result.ok) {
        return NextResponse.json({ ok: true, action: 'customer-cancel-confirmed' });
      }

      return NextResponse.json({
        ok: true,
        action: 'customer-cancel-confirm-not-found',
        reason: 'Nenhum pedido de cancelamento pendente encontrado para este número.',
        senderNumber,
        remoteJid,
      });
    }

    if (normalizedText === 'nao') {
      const result = await cancelPendingCancellationRequestByCustomer(senderNumber, remoteJid);

      if (result.ok) {
        return NextResponse.json({ ok: true, action: 'customer-cancel-aborted' });
      }

      return NextResponse.json({
        ok: true,
        action: 'customer-cancel-abort-not-found',
        reason: 'Nenhum pedido de cancelamento pendente encontrado para este número.',
        senderNumber,
        remoteJid,
      });
    }

    const inboundAutoReply = await tryHandleInboundAutoReply(
      payload,
      senderNumber,
      remoteJid,
      senderPushName
    );

    if (inboundAutoReply.handled) {
      return NextResponse.json({
        ok: true,
        action: inboundAutoReply.action,
        instanceName,
      });
    }

    const professional = await findProfessionalByWhatsapp(senderNumber);
    if (!professional) {
      return NextResponse.json({ ok: true, ignored: 'unauthorized-number' });
    }

    const evolutionConfig = getEvolutionConfigFromProfessional(professional);

    if (normalizedText === 'agendamentos hoje' || normalizedText === 'agenda hoje') {
      const today = getTodayIso();
      const replyText = await getBookingsText(professional.id, today, 'Agendamentos de hoje');
      await sendWhatsAppMessage(senderNumber, replyText, evolutionConfig);
      return NextResponse.json({ ok: true, action: 'bookings-today' });
    }

    if (
      normalizedText === 'agendamentos amanha' ||
      normalizedText === 'agenda amanha'
    ) {
      const tomorrow = addDaysIso(getTodayIso(), 1);
      const replyText = await getBookingsText(professional.id, tomorrow, 'Agendamentos de amanhã');
      await sendWhatsAppMessage(senderNumber, replyText, evolutionConfig);
      return NextResponse.json({ ok: true, action: 'bookings-tomorrow' });
    }

    if (normalizedText.startsWith('cancelar ')) {
      const parts = normalizedText.split(/\s+/);
      const number = Number(parts[1]);
      const dateToken = parts[2];

      if (!number || Number.isNaN(number)) {
        await sendWhatsAppMessage(
          senderNumber,
          `Use:
- cancelar 1
- cancelar 1 amanha
- cancelar 1 2026-04-10`,
          evolutionConfig
        );
        return NextResponse.json({ ok: true, action: 'cancel-help' });
      }

      const targetDate = resolveDateToken(dateToken);
      if (!targetDate) {
        await sendWhatsAppMessage(
          senderNumber,
          `Data inválida.

Use:
- cancelar 1
- cancelar 1 amanha
- cancelar 1 2026-04-10`,
          evolutionConfig
        );
        return NextResponse.json({ ok: true, action: 'cancel-invalid-date' });
      }

      const { data: booking, error: findError } = await findBookingByDailyNumber(
        professional.id,
        targetDate,
        number
      );

      if (findError || !booking) {
        await sendWhatsAppMessage(
          senderNumber,
          `Agendamento ${number} não encontrado em ${formatDateBR(targetDate)}.`,
          evolutionConfig
        );
        return NextResponse.json({ ok: true, action: 'cancel-not-found' });
      }

      if (booking.status === 'cancelled') {
        await sendWhatsAppMessage(
          senderNumber,
          `Agendamento ${number} já está cancelado.`,
          evolutionConfig
        );
        return NextResponse.json({ ok: true, action: 'cancel-already' });
      }

      const { error: updateError } = await supabaseAdmin
        .from('bookings')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancellation_reason: 'Cancelado pelo barbeiro via WhatsApp',
          cancel_confirmation_pending: false,
          cancel_confirmation_requested_at: null,
        })
        .eq('id', booking.id);

      if (updateError) {
        await sendWhatsAppMessage(
          senderNumber,
          'Erro ao cancelar agendamento.',
          evolutionConfig
        );
        return NextResponse.json({ ok: true, action: 'cancel-error' });
      }

      await sendWhatsAppMessage(
        senderNumber,
        `Agendamento ${number} de ${formatDateBR(targetDate)} cancelado com sucesso.`,
        evolutionConfig
      );

      const customer = getRelationItem<{ name?: string; whatsapp_number?: string; phone?: string }>(
        booking?.customers
      );
      const service = getRelationItem<{ name?: string }>(booking?.services);

      const customerPhone = normalizePhone(
        customer?.whatsapp_number || customer?.phone || booking?.customer_whatsapp || ''
      );

      if (customerPhone) {
        await sendWhatsAppMessage(
          customerPhone,
          `Olá, ${customer?.name || booking?.customer_name || 'cliente'}.

Seu agendamento de ${service?.name || 'serviço'} em ${formatDateBR(targetDate)} às ${booking.start_time} foi cancelado pela barbearia.`,
          evolutionConfig
        );
      }

      return NextResponse.json({ ok: true, action: 'cancelled-by-barber' });
    }

    return NextResponse.json({ ok: true, ignored: 'unknown-command' });
  } catch (error) {
    console.error('Erro no webhook:', error);
    return NextResponse.json({ ok: false, error: 'Erro interno.' }, { status: 500 });
  }
}