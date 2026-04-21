import { NextRequest, NextResponse } from 'next/server';
import { fetchQuotes } from '@/lib/yahoo/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseTickers(raw: string | null): string[] {
  return (raw ?? '')
    .split(',')
    .map((ticker) => ticker.trim().toUpperCase())
    .filter(Boolean);
}

export async function GET(request: NextRequest) {
  const tickers = parseTickers(request.nextUrl.searchParams.get('tickers'));
  const exchange = request.nextUrl.searchParams.get('exchange') ?? 'ASX';

  if (tickers.length === 0) {
    return NextResponse.json({ quotes: [] });
  }

  const quotes = await fetchQuotes(tickers, exchange);
  return NextResponse.json({ quotes });
}
