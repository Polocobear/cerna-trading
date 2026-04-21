import { NextRequest, NextResponse } from 'next/server';
import { fetchNews } from '@/lib/yahoo/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get('ticker')?.trim().toUpperCase();
  const count = Number(request.nextUrl.searchParams.get('count') ?? '3');

  if (!ticker) {
    return NextResponse.json({ error: 'Ticker is required' }, { status: 400 });
  }

  const news = await fetchNews(ticker, Number.isFinite(count) ? count : 3);
  return NextResponse.json({ news });
}
