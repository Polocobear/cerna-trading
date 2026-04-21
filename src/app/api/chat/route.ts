import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { callGemini, sanitizeGeminiError } from '@/lib/gemini/client';
import { transformGeminiStream, type ParsedCitation } from '@/lib/gemini/stream';
import { buildSystemPrompt, buildDefaultUserMessage } from '@/lib/gemini/prompts';
import { routeToTier } from '@/lib/gemini/tier-router';
import {
  canUseDeepTier,
  recordDeepUsage,
  getDeepUsageRemaining,
} from '@/lib/gemini/deep-usage';
import { classifyAskIntent } from '@/features/modes/ask/ask-prompt';
import type { ChatRequest } from '@/types/chat';
import type { Position, Profile, WatchlistItem } from '@/types/portfolio';
import { getCachedPrice, setCachedPrice } from '@/lib/prices/cache';
import { checkRateLimit } from '@/lib/rate-limit';

async function enrichWithPrices(positions: Position[]): Promise<Position[]> {
  if (positions.length === 0) return positions;
  const uncached = positions.filter((p) => !getCachedPrice(p.ticker));
  if (uncached.length > 0) {
    try {
      const symbols = uncached.map((p) => `${p.ticker}.AX`).join(',');
      const res = await fetch(
        `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}`,
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
          },
        }
      );
      if (res.ok) {
        const data = (await res.json()) as {
          quoteResponse?: {
            result?: Array<{
              symbol: string;
              regularMarketPrice?: number;
              regularMarketChange?: number;
              regularMarketChangePercent?: number;
              currency?: string;
              marketState?: string;
            }>;
          };
        };
        for (const q of data.quoteResponse?.result ?? []) {
          if (q.regularMarketPrice == null) continue;
          const ticker = q.symbol.replace(/\.AX$/, '');
          setCachedPrice(ticker, {
            price: q.regularMarketPrice,
            change: q.regularMarketChange ?? 0,
            changePercent: q.regularMarketChangePercent ?? 0,
            currency: q.currency ?? 'AUD',
            marketState: q.marketState ?? 'CLOSED',
          });
        }
      }
    } catch {
      // graceful degradation
    }
  }
  return positions.map((p) => {
    const cached = getCachedPrice(p.ticker);
    return cached
      ? ({ ...p, _current_price: cached.price, _current_change: cached.change } as Position & {
          _current_price?: number;
          _current_change?: number;
        })
      : p;
  });
}

export type EnrichedPosition = Position & { _current_price?: number; _current_change?: number };

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const body = (await req.json()) as ChatRequest;
  const { mode, controls, sessionId } = body;

  if (!mode || !sessionId) {
    return NextResponse.json({ error: 'mode and sessionId are required' }, { status: 400 });
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rate = checkRateLimit(user.id);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment.' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfter ?? 30) } }
    );
  }

  const [positionsRes, profileRes, watchlistRes, messagesRes] = await Promise.all([
    supabase.from('positions').select('*').eq('user_id', user.id).eq('status', 'open'),
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    supabase.from('watchlist').select('*').eq('user_id', user.id),
    supabase
      .from('chat_messages')
      .select('role, content')
      .eq('user_id', user.id)
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  const rawPortfolio = (positionsRes.data ?? []) as Position[];
  const portfolio = await enrichWithPrices(rawPortfolio);
  const profile = (profileRes.data ?? null) as Profile | null;
  const watchlist = (watchlistRes.data ?? []) as WatchlistItem[];
  const recent = ((messagesRes.data ?? []) as Array<{ role: 'user' | 'assistant'; content: string }>).reverse();

  const userMessage = body.message?.trim() || buildDefaultUserMessage(mode, controls);
  const systemPrompt = buildSystemPrompt({ mode, controls, message: userMessage, portfolio, watchlist, profile });

  const priceLines = (portfolio as EnrichedPosition[])
    .filter((p) => typeof p._current_price === 'number')
    .map((p) => {
      const pnlPct = p.cost_basis > 0 ? (((p._current_price ?? 0) - p.cost_basis) / p.cost_basis) * 100 : 0;
      return `${p.ticker}: $${(p._current_price ?? 0).toFixed(2)} (cost $${p.cost_basis.toFixed(2)}, ${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%)`;
    });
  const enrichedUserMessage =
    priceLines.length > 0
      ? `${userMessage}\n\nCurrent portfolio prices:\n${priceLines.join('\n')}`
      : userMessage;

  await supabase.from('chat_messages').insert({
    user_id: user.id,
    session_id: sessionId,
    mode,
    role: 'user',
    content: userMessage,
  });

  let tier = routeToTier({ mode, controls });
  if (mode === 'ask' && classifyAskIntent(userMessage) === 'DECIDE') {
    tier = 'deep';
  }
  if (tier === 'deep') {
    if (!canUseDeepTier(user.id)) {
      tier = 'standard';
    } else {
      recordDeepUsage(user.id);
    }
  }

  const geminiResponse = await callGemini({
    systemPrompt,
    tier,
    messages: [
      ...recent.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user' as const, content: enrichedUserMessage },
    ],
  });

  if (!geminiResponse.ok || !geminiResponse.body) {
    const errText = await geminiResponse.text().catch(() => 'Gemini error');
    console.error('[api/chat] Gemini request failed', {
      status: geminiResponse.status,
      body: errText,
    });
    const status =
      geminiResponse.status === 429
        ? 429
        : geminiResponse.status === 503 || geminiResponse.status >= 500
        ? 503
        : 502;
    return NextResponse.json(
      { error: sanitizeGeminiError(geminiResponse.status, errText) },
      { status }
    );
  }

  const transformed = transformGeminiStream(geminiResponse.body);
  const [forClient, forPersist] = transformed.tee();

  void (async () => {
    const reader = forPersist.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    let citations: ParsedCitation[] = [];
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          try {
            const evt = JSON.parse(line.slice(5).trim()) as {
              type: string;
              content?: string;
              citations?: ParsedCitation[];
            };
            if (evt.type === 'done' && evt.content) fullText = evt.content;
            if (evt.type === 'citations' && evt.citations) citations = evt.citations;
          } catch {
            // ignore
          }
        }
      }
      if (fullText) {
        await supabase.from('chat_messages').insert({
          user_id: user.id,
          session_id: sessionId,
          mode,
          role: 'assistant',
          content: fullText,
          citations,
        });
      }
    } catch {
      // persist failures should not break the stream
    }
  })();

  return new Response(forClient, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Model-Tier': tier,
      'X-Deep-Remaining': String(getDeepUsageRemaining(user.id)),
    },
  });
}
