import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth';
import { createPixPayment, getMercadoPagoWebhookUrl } from '@/lib/mercado-pago';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSubscriptionForBarbershop } from '@/lib/subscriptions';

export async function POST(req: Request) {
  try {
    const profile = await getCurrentProfile();

    if (!profile || !profile.barbershop_id || (profile.role !== 'shop_manager' && profile.role !== 'shop_barber')) {
      return NextResponse.json({ error: 'Sem permissao.' }, { status: 403 });
    }

    const subscription = await getSubscriptionForBarbershop(profile.barbershop_id);
    const amount = Number(subscription.amount_monthly || 30);

    const pendingPayment = await supabaseAdmin
      .from('subscription_payments')
      .select('*')
      .eq('subscription_id', subscription.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pendingPayment.data?.pix_qr_code) {
      return NextResponse.json({
        ok: true,
        payment: pendingPayment.data,
        qrCode: pendingPayment.data.pix_qr_code,
        qrCodeBase64: pendingPayment.data.pix_qr_code_base64,
      });
    }

    const paymentInsert = await supabaseAdmin
      .from('subscription_payments')
      .insert({
        subscription_id: subscription.id,
        barbershop_id: profile.barbershop_id,
        amount,
        status: 'pending',
        provider: 'mercado_pago',
      })
      .select('*')
      .single();

    if (paymentInsert.error || !paymentInsert.data) {
      return NextResponse.json(
        { error: paymentInsert.error?.message || 'Erro ao registrar cobranca.' },
        { status: 500 }
      );
    }

    const mpPayment = await createPixPayment({
      amount,
      description: 'Assinatura mensal Ventura Barber',
      externalReference: `subscription:${paymentInsert.data.id}`,
      payerEmail: profile.email,
      notificationUrl: getMercadoPagoWebhookUrl(req),
    });

    const transactionData = mpPayment?.point_of_interaction?.transaction_data || {};
    const updatedPayment = await supabaseAdmin
      .from('subscription_payments')
      .update({
        provider_payment_id: String(mpPayment.id || ''),
        pix_qr_code: transactionData.qr_code || null,
        pix_qr_code_base64: transactionData.qr_code_base64 || null,
      })
      .eq('id', paymentInsert.data.id)
      .select('*')
      .single();

    if (updatedPayment.error || !updatedPayment.data) {
      return NextResponse.json({ error: 'Erro ao salvar dados do Pix.' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      payment: updatedPayment.data,
      qrCode: transactionData.qr_code || null,
      qrCodeBase64: transactionData.qr_code_base64 || null,
    });
  } catch (error) {
    console.error('Erro em /api/subscriptions/pix:', error);
    return NextResponse.json({ error: 'Erro ao gerar Pix.' }, { status: 500 });
  }
}
