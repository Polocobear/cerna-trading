import { NextRequest, NextResponse } from 'next/server';
import { fetchAnalystData } from '@/lib/yahoo/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get('ticker')?.trim().toUpperCase();
  const exchange = request.nextUrl.searchParams.get('exchange') ?? 'ASX';

  if (!ticker) {
    return NextResponse.json({ error: 'Ticker is required' }, { status: 400 });
  }

  const analyst = await fetchAnalystData(ticker, exchange);
  return NextResponse.json({ analyst });
}
