import { createServiceClient } from '@/lib/supabase/service';
import { callGeminiV2WithRetry } from '@/lib/gemini/client';
import { fetchPricesForTickers } from '@/lib/prices/server-fetch';
import type { AlertType, AlertPriority } from '@/lib/memory/types';

interface DbPosition {
  ticker: string;
  exchange: string | null;
  shares: number;
  cost_basis: number;
}

interface DbWatchlistItem {
  ticker: string;
  exchange: string | null;
  target_price: number | null;
}

interface DbDecision {
  id: string;
  ticker: string;
  decision_type: string;
  reasoning: string;
  price_at_decision: number | null;
  timeframe: string | null;
  created_at: string;
}

interface NewAlert {
  user_id: string;
  alert_type: AlertType;
  title: string;
  body: string;
  ticker: string | null;
  priority: AlertPriority;
  expires_at: string | null;
}

function isDbPosition(obj: unknown): obj is DbPosition {
  return typeof obj === 'object' && obj !== null && 'ticker' in obj && 'shares' in obj;
}

function isDbWatchlistItem(obj: unknown): obj is DbWatchlistItem {
  return typeof obj === 'object' && obj !== null && 'ticker' in obj;
}

function isDbDecision(obj: unknown): obj is DbDecision {
  return typeof obj === 'object' && obj !== null && 'id' in obj && 'ticker' in obj;
}

async function alertExists(
  userId: string,
  alertType: AlertType,
  ticker: string | null,
  supabase: ReturnType<typeof createServiceClient>
): Promise<boolean> {
  const query = supabase
    .from('proactive_alerts')
    .select('id')
    .eq('user_id', userId)
    .eq('alert_type', alertType)
    .eq('is_read', false)
    .eq('is_dismissed', false);

  if (ticker) {
    const { data } = await query.eq('ticker', ticker).limit(1);
    return Array.isArray(data) && data.length > 0;
  } else {
    const { data } = await query.limit(1);
    return Array.isArray(data) && data.length > 0;
  }
}

async function saveAlerts(
  alerts: NewAlert[],
  supabase: ReturnType<typeof createServiceClient>
): Promise<void> {
  if (alerts.length === 0) return;
  await supabase.from('proactive_alerts').insert(alerts);
}

export async function generateAlerts(userId: string): Promise<number> {
  const supabase = createServiceClient();
  const alerts: NewAlert[] = [];

  // Load user data
  const [positionsRes, watchlistRes, decisionsRes] = await Promise.all([
    supabase
      .from('positions')
      .select('ticker, exchange, shares, cost_basis')
      .eq('user_id', userId)
      .eq('status', 'open'),
    supabase
      .from('watchlist')
      .select('ticker, exchange, target_price')
      .eq('user_id', userId),
    supabase
      .from('decisions')
      .select('id, ticker, decision_type, reasoning, price_at_decision, timeframe, created_at')
      .eq('user_id', userId)
      .eq('outcome_status', 'pending')
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  const positions = Array.isArray(positionsRes.data)
    ? positionsRes.data.filter(isDbPosition)
    : [];
  const watchlist = Array.isArray(watchlistRes.data)
    ? watchlistRes.data.filter(isDbWatchlistItem)
    : [];
  const decisions = Array.isArray(decisionsRes.data)
    ? decisionsRes.data.filter(isDbDecision)
    : [];

  if (positions.length === 0 && watchlist.length === 0 && decisions.length === 0) {
    return 0;
  }

  // Gather all tickers
  const allTickers = [
    ...new Set([
      ...positions.map((p) => p.ticker.toUpperCase()),
      ...watchlist.map((w) => w.ticker.toUpperCase()),
      ...decisions.map((d) => d.ticker.toUpperCase()),
    ]),
  ];

  // Fetch current prices
  const priceEntries = [
    ...positions.map((p) => ({ ticker: p.ticker, exchange: p.exchange })),
    ...watchlist.map((w) => ({ ticker: w.ticker, exchange: w.exchange })),
  ];
  const prices = allTickers.length > 0
    ? await fetchPricesForTickers(priceEntries)
    : {};

  // === 1. SIGNIFICANT MOVE (>5% daily change) ===
  for (const pos of positions) {
    const ticker = pos.ticker.toUpperCase();
    const price = prices[ticker];
    if (!price) continue;

    const absChange = Math.abs(price.changePercent);
    if (absChange < 5) continue;

    const exists = await alertExists(userId, 'significant_move', ticker, supabase);
    if (exists) continue;

    const direction = price.changePercent > 0 ? 'up' : 'down';
    const posValue = pos.shares * price.price;
    const pnlDollar = pos.shares * (price.price - pos.cost_basis);
    const sign = pnlDollar >= 0 ? '+' : '';

    alerts.push({
      user_id: userId,
      alert_type: 'significant_move',
      title: `${ticker} moved ${price.changePercent > 0 ? '+' : ''}${price.changePercent.toFixed(1)}% today`,
      body: `${ticker} is ${direction} ${absChange.toFixed(1)}% to $${price.price.toFixed(2)}. Your ${pos.shares} shares are worth $${posValue.toLocaleString(undefined, { maximumFractionDigits: 0 })} (${sign}$${Math.abs(pnlDollar).toLocaleString(undefined, { maximumFractionDigits: 0 })} total P&L).`,
      ticker,
      priority: absChange >= 8 ? 'high' : 'medium',
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
  }

  // === 2. PRICE TARGET HIT (watchlist target reached) ===
  for (const item of watchlist) {
    const ticker = item.ticker.toUpperCase();
    const price = prices[ticker];
    if (!price || item.target_price == null) continue;

    // For watchlist buy targets: alert when price ≤ target
    if (price.price > item.target_price) continue;

    const exists = await alertExists(userId, 'price_target_hit', ticker, supabase);
    if (exists) continue;

    alerts.push({
      user_id: userId,
      alert_type: 'price_target_hit',
      title: `${ticker} hit your $${item.target_price.toFixed(2)} target`,
      body: `${ticker} is now trading at $${price.price.toFixed(2)}, at or below your target of $${item.target_price.toFixed(2)}. This may be your entry point.`,
      ticker,
      priority: 'high',
      expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    });
  }

  // === 3. CONCENTRATION WARNING (>20% of portfolio) ===
  const totalPortfolioValue = positions.reduce((sum, p) => {
    const price = prices[p.ticker.toUpperCase()];
    return sum + (price ? p.shares * price.price : p.shares * p.cost_basis);
  }, 0);

  if (totalPortfolioValue > 0) {
    for (const pos of positions) {
      const ticker = pos.ticker.toUpperCase();
      const price = prices[ticker];
      const posValue = price ? pos.shares * price.price : pos.shares * pos.cost_basis;
      const pct = (posValue / totalPortfolioValue) * 100;

      if (pct <= 20) continue;

      const exists = await alertExists(userId, 'concentration_warning', ticker, supabase);
      if (exists) continue;

      alerts.push({
        user_id: userId,
        alert_type: 'concentration_warning',
        title: `${ticker} is ${pct.toFixed(0)}% of your portfolio`,
        body: `${ticker} now represents ${pct.toFixed(1)}% of your portfolio ($${posValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}). Consider trimming to reduce concentration risk below 20%.`,
        ticker,
        priority: pct >= 30 ? 'high' : 'medium',
        expires_at: null,
      });
    }
  }

  // === 4. DECISION REVIEW (expired timeframe decisions) ===
  for (const d of decisions) {
    if (!d.timeframe || !d.price_at_decision) continue;

    const match = d.timeframe.match(/(\d+)\s*(day|week|month)/i);
    if (!match) continue;

    const n = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    let days = n;
    if (unit.startsWith('w')) days = n * 7;
    else if (unit.startsWith('m')) days = n * 30;

    const createdAt = new Date(d.created_at).getTime();
    const ageDays = (Date.now() - createdAt) / (1000 * 60 * 60 * 24);

    if (ageDays < days) continue;

    const ticker = d.ticker.toUpperCase();
    const exists = await alertExists(userId, 'decision_review', ticker, supabase);
    if (exists) continue;

    const currentPrice = prices[ticker];
    let returnStr = '';
    if (currentPrice) {
      const pct = ((currentPrice.price - d.price_at_decision) / d.price_at_decision) * 100;
      const sign = pct >= 0 ? '+' : '';
      returnStr = ` It's now $${currentPrice.price.toFixed(2)} (${sign}${pct.toFixed(1)}%).`;
    }

    const date = new Date(d.created_at).toLocaleDateString('en-AU', { month: 'short', day: 'numeric' });
    alerts.push({
      user_id: userId,
      alert_type: 'decision_review',
      title: `Time to review ${ticker} ${d.decision_type} recommendation`,
      body: `On ${date} I recommended ${d.decision_type.toUpperCase()} ${ticker} at $${d.price_at_decision.toFixed(2)}.${returnStr} The ${d.timeframe} timeframe has elapsed — time to reassess.`,
      ticker,
      priority: 'medium',
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
  }

  // === 5. EARNINGS UPCOMING ===
  // Use Gemini with search grounding to find upcoming earnings for top 5 holdings
  const topHoldings = positions
    .sort((a, b) => {
      const va = prices[a.ticker.toUpperCase()]?.price ?? a.cost_basis;
      const vb = prices[b.ticker.toUpperCase()]?.price ?? b.cost_basis;
      return (vb * b.shares) - (va * a.shares);
    })
    .slice(0, 5);

  if (topHoldings.length > 0) {
    try {
      const tickerList = topHoldings.map((p) => p.ticker).join(', ');
      const earningsResult = await callGeminiV2WithRetry({
        model: 'gemini-2.5-flash',
        systemPrompt: 'You check upcoming earnings dates for stocks. Output only valid JSON. Be concise.',
        userMessage: `Which of these stocks have earnings reports within the next 5 trading days (from today ${new Date().toISOString().split('T')[0]})? Stocks: ${tickerList}\n\nRespond ONLY with JSON: [{"ticker": "XYZ", "earnings_date": "YYYY-MM-DD", "eps_estimate": "...", "note": "..."}]\nReturn empty array [] if none have upcoming earnings.`,
        temperature: 0.1,
        maxOutputTokens: 512,
        enableSearchGrounding: true,
        responseMimeType: 'application/json',
      });

      const parsed: unknown = JSON.parse(earningsResult.text.trim());
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (typeof item !== 'object' || item === null) continue;
          const obj = item as Record<string, unknown>;
          const ticker = String(obj.ticker ?? '').toUpperCase();
          if (!ticker) continue;

          const pos = positions.find((p) => p.ticker.toUpperCase() === ticker);
          const exists = await alertExists(userId, 'earnings_upcoming', ticker, supabase);
          if (exists) continue;

          const date = String(obj.earnings_date ?? '');
          const epsEst = obj.eps_estimate ? ` Analyst EPS estimate: ${obj.eps_estimate}.` : '';
          const sharesHeld = pos ? ` You hold ${pos.shares} shares.` : '';

          alerts.push({
            user_id: userId,
            alert_type: 'earnings_upcoming',
            title: `${ticker} reports earnings${date ? ` on ${date}` : ' soon'}`,
            body: `${ticker} has an earnings report coming up.${epsEst}${sharesHeld}`,
            ticker,
            priority: 'high',
            expires_at: date
              ? new Date(new Date(date).getTime() + 24 * 60 * 60 * 1000).toISOString()
              : new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
          });
        }
      }
    } catch {
      // Earnings check is best-effort; don't block other alerts
    }
  }

  await saveAlerts(alerts, supabase);
  return alerts.length;
}
