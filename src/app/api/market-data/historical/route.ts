import { NextRequest, NextResponse } from 'next/server';
import { fetchHistorical } from '@/lib/yahoo/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get('ticker')?.trim().toUpperCase();
  const exchange = request.nextUrl.searchParams.get('exchange') ?? 'ASX';

  if (!ticker) {
    return NextResponse.json({ error: 'Ticker is required' }, { status: 400 });
  }

  const historical = await fetchHistorical(ticker, exchange);
  return NextResponse.json({ historical });
}
