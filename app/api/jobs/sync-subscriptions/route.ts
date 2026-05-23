import { NextResponse } from 'next/server';
import { syncOverdueSubscriptions } from '@/lib/subscriptions';

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const expected = `Bearer ${process.env.CRON_SECRET || ''}`;

    if (!process.env.CRON_SECRET || authHeader !== expected) {
      return NextResponse.json({ error: 'Nao autorizado.' }, { status: 401 });
    }

    const result = await syncOverdueSubscriptions();

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    console.error('Erro em /api/jobs/sync-subscriptions:', error);
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 });
  }
}
