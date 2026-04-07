import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    ok: true,
    buildTag: 'ventura-barber-jobs-v2',
    checkedAt: new Date().toISOString(),
  });
}
