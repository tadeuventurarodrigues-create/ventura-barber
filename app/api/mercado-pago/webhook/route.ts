import { NextResponse } from 'next/server';
import { getPayment, verifyMercadoPagoSignature } from '@/lib/mercado-pago';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { markSubscriptionPaid } from '@/lib/subscriptions';

function getPaymentId(url: URL, body: any) {
  return (
    body?.data?.id ||
    body?.id ||
    url.searchParams.get('data.id') ||
    url.searchParams.get('id') ||
    ''
  );
}

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const body = await req.json().catch(() => ({}));
    const paymentId = String(getPaymentId(url, body));
    const topic = String(body?.type || body?.topic || url.searchParams.get('topic') || '');

    if (!paymentId || (topic && topic !== 'payment')) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const signatureOk = verifyMercadoPagoSignature({
      xSignature: req.headers.get('x-signature'),
      xRequestId: req.headers.get('x-request-id'),
      dataId: paymentId,
    });

    if (!signatureOk) {
      return NextResponse.json({ error: 'Assinatura invalida.' }, { status: 401 });
    }

    const payment = await getPayment(paymentId);
    const externalReference = String(payment.external_reference || '');
    const paymentRowId = externalReference.startsWith('subscription:')
      ? externalReference.replace('subscription:', '')
      : '';

    if (!paymentRowId) {
      return NextResponse.json({ ok: true, ignored: 'unknown-reference' });
    }

    const { data: paymentRow, error: paymentError } = await supabaseAdmin
      .from('subscription_payments')
      .select('*')
      .eq('id', paymentRowId)
      .maybeSingle();

    if (paymentError || !paymentRow) {
      return NextResponse.json({ ok: true, ignored: 'payment-row-not-found' });
    }

    const status = String(payment.status || 'pending');
    const paidAt = payment.date_approved || payment.money_release_date || null;

    await supabaseAdmin
      .from('subscription_payments')
      .update({
        provider_payment_id: String(payment.id || paymentId),
        status: status === 'approved' ? 'approved' : status === 'cancelled' ? 'cancelled' : status === 'rejected' ? 'rejected' : 'pending',
        paid_at: status === 'approved' ? paidAt || new Date().toISOString() : null,
      })
      .eq('id', paymentRow.id);

    if (status === 'approved') {
      await markSubscriptionPaid({
        barbershopId: paymentRow.barbershop_id,
        subscriptionId: paymentRow.subscription_id,
        paymentId: String(payment.id || paymentId),
        amount: Number(payment.transaction_amount || paymentRow.amount || 30),
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Erro no webhook Mercado Pago:', error);
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
  }
}
