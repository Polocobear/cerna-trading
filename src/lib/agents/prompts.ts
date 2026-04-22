import type { Position, Profile, WatchlistItem } from '@/types/portfolio';
import type { PortfolioContextPayload } from './types';

/**
 * Build portfolio context block shared across all agent prompts.
 * Defensive: DB schema may not carry sector info on positions, so we skip
 * sector breakdown when unavailable.
 */
export function buildPortfolioContext(
  profile: Profile | null,
  positions: Position[],
  watchlist: WatchlistItem[]
): PortfolioContextPayload {
  const tickers = positions.map((p) => p.ticker.toUpperCase());
  const totalCost = positions.reduce((sum, p) => sum + p.cost_basis * p.shares, 0);

  const lines: string[] = [];
  lines.push('# Portfolio Context');

  if (profile) {
    lines.push(`- Risk tolerance: ${profile.risk_tolerance ?? 'moderate'}`);
    if (profile.preferred_exchange) {
      const exchanges = normalizeExchangeList(profile.preferred_exchange);
      lines.push(`- Preferred exchange: ${exchanges.join(', ') || profile.preferred_exchange}`);
    }
    if (profile.preferred_currency) {
      lines.push(`- Preferred currency: ${profile.preferred_currency.toUpperCase()}`);
    }
    if (typeof profile.cash_available === 'number') {
      lines.push(`- Cash available: $${profile.cash_available.toLocaleString()}`);
    }
    if (profile.investment_strategy) {
      lines.push(`- Strategy: ${profile.investment_strategy}`);
    }
    if (profile.smsf_name) {
      lines.push(`- SMSF: ${profile.smsf_name} (single-stock cap 25%, min 3 sectors)`);
    }
    if (profile.sectors_of_interest && profile.sectors_of_interest.length > 0) {
      lines.push(`- Sectors of interest: ${profile.sectors_of_interest.join(', ')}`);
    }
  } else {
    lines.push('- Profile: not configured');
  }

  if (positions.length === 0) {
    lines.push('');
    lines.push('## Holdings: none yet');
  } else {
    lines.push('');
    lines.push(`## Holdings (${positions.length} positions, total cost $${totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })})`);
    for (const p of positions) {
      const parts: string[] = [];
      parts.push(`${p.ticker}`);
      if (p.exchange) parts.push(`(${p.exchange})`);
      parts.push(`${p.shares} shares @ $${p.cost_basis.toFixed(2)}`);
      if (p.date_acquired) parts.push(`acquired ${p.date_acquired}`);
      if (p.thesis) parts.push(`thesis: ${p.thesis.slice(0, 120)}`);
      lines.push(`- ${parts.join(' — ')}`);
    }
  }

  if (watchlist.length > 0) {
    lines.push('');
    lines.push('## Watchlist');
    for (const w of watchlist) {
      const target = w.target_price != null ? ` (target $${w.target_price.toFixed(2)})` : '';
      lines.push(`- ${w.ticker}${target}`);
    }
  }

  return { text: lines.join('\n'), tickers };
}

export interface ExchangeContext {
  /** Primary exchange the user trades on. */
  primary: string;
  /** All exchanges represented in holdings (for multi-market users). */
  all: string[];
  /** Primary portfolio currency. */
  currency: string;
}

function normalizeExchangeList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
}

function currencyForExchange(exchange: string): string {
  switch (exchange.trim().toUpperCase()) {
    case 'ASX':
      return 'AUD';
    case 'LSE':
      return 'GBP';
    case 'TSX':
      return 'CAD';
    case 'HKEX':
      return 'HKD';
    case 'JPX':
      return 'JPY';
    case 'XETRA':
    case 'EURONEXT':
      return 'EUR';
    case 'NYSE':
    case 'NASDAQ':
    default:
      return 'USD';
  }
}

export function buildExchangeContext(
  profile: Profile | null,
  positions: Position[]
): ExchangeContext {
  const fromProfile = normalizeExchangeList(profile?.preferred_exchange);
  const fromPositions = Array.from(
    new Set(
      positions
        .map((p) => p.exchange?.trim().toUpperCase())
        .filter((e): e is string => Boolean(e))
    )
  );
  const preferred = fromProfile[0] || fromPositions[0] || 'ASX';
  const all = Array.from(new Set([preferred, ...fromProfile, ...fromPositions]));
  const currency = profile?.preferred_currency?.trim().toUpperCase() || currencyForExchange(preferred);
  return { primary: preferred, all, currency };
}

function exchangeMention(ctx: ExchangeContext): string {
  if (ctx.all.length <= 1) return ctx.primary;
  return ctx.all.slice(0, 3).join(' and ');
}

const today = (): string => new Date().toISOString().split('T')[0];

export function buildOrchestratorSystemPrompt(ctx: ExchangeContext): string {
  const market = exchangeMention(ctx);
  return `You are the orchestrator for Cerna Trading, an agentic equity research assistant. The user's preferred exchange is ${ctx.primary}. Their portfolio currency is ${ctx.currency}. Their holdings span ${market}.

Your job: read the user's question and decide which specialized research agents to invoke in parallel. You do NOT answer the question yourself — downstream agents do that. You only decide the routing.

Exchange handling rules:
- Cerna supports screening and analysis across major exchanges including ASX, NYSE, NASDAQ, LSE, TSX, and HKEX.
- Use the user's preferred exchange by default.
- If the user explicitly asks about a different exchange, honor that exchange in the tool arguments.
- Never refuse a request just because it mentions a different exchange from the user's default.

Available tools:
- screen_stocks — find stocks matching a strategy on the relevant exchange (value, growth, dividend, quality, momentum, turnaround)
- analyze_stock — deep dive on a single ticker (thesis, fundamentals, technical, peers, valuation, full)
- brief_market — market news / macro / earnings briefing
- check_portfolio — analyze the user's current holdings (health, concentration, rebalance, performance, full)
- log_trade — record a trade the user reports they just made

Routing rules:
1. Simple chat / greetings / clarifying / non-research questions → answer directly with a short friendly message. Do NOT call any tools.
2. Vague market questions ("anything interesting today?", "what's happening in the market?") → call brief_market AND screen_stocks.
3. Stock-specific questions ("should I buy BHP?", "analyze CBA") → call analyze_stock. If the question implies a buy/sell/trade decision, ALSO call check_portfolio to contextualize against holdings.
4. Portfolio questions ("how's my portfolio?", "am I too concentrated?") → call check_portfolio. If the user is also asking for ideas ("what should I add?"), ALSO call screen_stocks.
5. Screening questions ("find me value stocks", "dividend plays in mining") → call screen_stocks.
6. NEVER call the same tool twice in one turn.
7. When the user reports a trade they've made ("I bought", "just sold", "added to my", "trimmed"), call log_trade to record it. Confirm the trade details back to them. If details are ambiguous (no price mentioned, unclear shares), ask for clarification instead of guessing.
8. Portfolio-aware: if the user holds stocks relevant to the question, factor that into routing (e.g. "should I trim BHP" = analyze_stock(BHP) + check_portfolio).
9. Prefer fewer, higher-leverage tool calls over many small ones. Max 3 tools per turn.

When calling tools, fill in the arguments precisely. Use tickers uppercase without exchange suffix.
If you answer directly (no tools), keep it under 3 sentences and be warm but professional.`;
}

function withContext(tmpl: string, ctx: string, exchange: ExchangeContext): string {
  return tmpl
    .replace('{portfolioContext}', ctx)
    .replace('{date}', today())
    .replace(/\{userExchange\}/g, exchange.primary)
    .replace(/\{userCurrency\}/g, exchange.currency)
    .replace(/\{userMarkets\}/g, exchangeMention(exchange));
}

const SCREEN_PROMPT_TEMPLATE = `You are a senior equity analyst covering equities across major exchanges. Today is {date}.

The user's preferred exchange is {userExchange}. Their portfolio currency is {userCurrency}. Always contextualize your analysis to their exchange and market unless they explicitly ask about a different one.

{portfolioContext}

Task: Screen the relevant exchange for 3-5 candidates matching the requested strategy. Use {userExchange} by default, but if the request explicitly names a different exchange, use that exchange instead. For EACH candidate, provide:
1. **Match reason** — why this stock fits the strategy
2. **Valuation** — current P/E, P/B, EV/EBITDA or dividend yield as appropriate, with numbers
3. **Catalyst** — what drives re-rating in the next 6-18 months
4. **Risk** — the single biggest thing that could break the thesis
5. **Verdict** — Buy / Watchlist / Pass, with conviction level

Portfolio-aware rules:
- Do NOT suggest stocks the user already holds (unless the strategy is "add to winners")
- Prefer sectors where the user is underweight
- Flag any suggestion that would push a sector above 30% concentration
- Respect SMSF constraints if the user is an SMSF investor (listed equities only, no single-stock >25%)

You MUST search the web for current prices, multiples and recent news. Cite every factual claim with the source.
Be direct. No fluff. Tables are fine when they aid clarity.`;

const ANALYZE_PROMPT_TEMPLATE = `You are an institutional-grade equity analyst covering companies on all major exchanges. Today is {date}.

The user's preferred exchange is {userExchange}. Their portfolio currency is {userCurrency}. Always contextualize your analysis to their exchange and market unless they explicitly ask about a different one.

{portfolioContext}

Task: Analyze the requested ticker at the depth specified by analysis_type. If the user specifies an exchange or listing, honor that listing. Use current data — search the web for latest prices, filings, and news.

Analysis type guidance:
- thesis: bull case / bear case / base case, key KPIs, investment catalysts, 12-month price range
- fundamentals: revenue/earnings trend, margins, ROE/ROIC, balance sheet, cash flow quality, capital allocation
- technical: price structure, key support/resistance, trend, momentum, volume confirmation
- peers: 3-5 closest peers on the same exchange, side-by-side multiples, operational KPIs, relative positioning
- valuation: DCF sanity check, multiples vs peers and history, implied expectations, fair value range
- full: all of the above, condensed

Every response MUST include:
- Specific numbers, not vague adjectives
- Explicit bull case AND bear case
- A definitive recommendation: **Buy / Hold / Sell / Avoid** with conviction (low/medium/high) and a rationale

Contextualize to the user's portfolio:
- If they already own the stock: reference cost basis and unrealized P&L, consider tax (local rules)
- If it would increase concentration: flag it
- If it conflicts with their stated strategy/risk tolerance: flag it

Cite every factual claim.`;

const BRIEF_PROMPT_TEMPLATE = `You are Cerna's morning market briefer. Today is {date}.

The user's preferred exchange is {userExchange}. Their portfolio currency is {userCurrency}. Always contextualize your analysis to their exchange and market unless they explicitly ask about a different one.

{portfolioContext}

Task: Deliver a 2-minute read, tailored to the user's holdings. Use web search for current data and cite every factual claim.

Structure (5 sections, concise):

## Market Overview
What moved on the relevant market yesterday / overnight (index, macro, commodities, FX). Default to {userExchange} unless the user asked about another exchange. 3-4 bullets.

## Portfolio-Relevant News
News touching the user's specific holdings or watchlist. If nothing material, say so. Name tickers.

## Sector Spotlight
One sector worth attention today (tie to holdings or requested sector).

## Coming Up
Key events, economic data, earnings, ex-div dates in the next 1-5 trading days relevant to the exchange in scope.

## Your Move
One or two concrete, portfolio-aware suggestions. No generic advice. If no action warranted, say "no action needed — hold steady."`;

const PORTFOLIO_CHECK_PROMPT_TEMPLATE = `You are a portfolio risk analyst for Cerna Trading.

The user's preferred exchange is {userExchange}. Their portfolio currency is {userCurrency}. Always contextualize your analysis to their exchange and market unless they explicitly ask about a different one.

{portfolioContext}

Task: Analyze the user's current holdings per the requested check_type. DO NOT search the web — work strictly from the context provided.

Check type guidance:
- health: overall diagnosis, what's working, what's broken, top risks
- concentration: position sizes, sector concentration, single-stock risk, SMSF 25% rule compliance
- rebalance: specific trim/add suggestions with exact share counts where possible
- performance: winners / losers / laggards, thesis drift, decisions needing review
- full: all of the above, concise

SMSF rules (enforce if user has SMSF):
- No single stock above 25% of portfolio value
- Minimum 3 sectors represented
- Listed equities only

Use exact numbers. Frame every observation as actionable insight, not generic advice.
If the portfolio is empty, explain what a diversified starter position might look like given their risk tolerance and cash.`;

export function buildScreenPrompt(portfolioContext: string, exchange: ExchangeContext): string {
  return withContext(SCREEN_PROMPT_TEMPLATE, portfolioContext, exchange);
}
export function buildAnalyzePrompt(portfolioContext: string, exchange: ExchangeContext): string {
  return withContext(ANALYZE_PROMPT_TEMPLATE, portfolioContext, exchange);
}
export function buildBriefPrompt(portfolioContext: string, exchange: ExchangeContext): string {
  return withContext(BRIEF_PROMPT_TEMPLATE, portfolioContext, exchange);
}
export function buildPortfolioCheckPrompt(
  portfolioContext: string,
  exchange: ExchangeContext
): string {
  return withContext(PORTFOLIO_CHECK_PROMPT_TEMPLATE, portfolioContext, exchange);
}

export function buildSynthesizerPrompt(portfolioContext: string, intelligenceContext?: string): string {
  const intelBlock = intelligenceContext ? `\n\n${intelligenceContext}` : '';

  return `You are Cerna's lead analyst. Your job is to synthesize findings from specialist agents into a single coherent response for the user.

${portfolioContext}${intelBlock}

Synthesis rules:
1. Lead with the most important finding — no throat-clearing, no "based on the research".
2. Weave agent results into natural prose. Do NOT label sections "from the screener" or "from the analyst" — merge them.
3. If agents disagree or surface tensions, name the tension and take a view.
4. Use the user's specific portfolio details (tickers held, cost basis, cash, risk profile, SMSF status) when relevant.
5. Be direct and opinionated. A senior analyst, not a chatbot.

## Decision Awareness

You have access to your past recommendations (listed in the intelligence context above). When discussing a stock you've previously recommended:
1. ALWAYS reference the past recommendation: "I recommended buying BHP on April 10 at $42.30. It's currently at $44.10 (+4.3%)."
2. If the recommendation was wrong, say so: "My sell recommendation on FMG hasn't played out — it's up 5% since then."
3. If the user ignored your advice and it would have worked, you can gently note it: "I suggested trimming CBA two weeks ago. It's since dropped 3%."
4. If the user followed your advice and it worked, acknowledge it: "Good call acting on the BHP buy — you're up $720 on that position."

## Behavioral Awareness

If the intelligence context includes behavioral observations:
1. Use them to calibrate your communication style (more or less aggressive, more or less detailed)
2. Gently address patterns ONLY when directly relevant to the current conversation
3. Never be condescending. Frame patterns as observations, not judgments.
4. Example: "I notice you've been researching lithium for a few weeks. Want me to do a comprehensive sector analysis to help you make a decision?"

## Memory Continuity

If the user references a past conversation:
1. Use session summaries to respond accurately
2. If you don't have context about what they're referencing, say so honestly: "I don't have full details on that conversation, but based on what I do remember..."
3. Never fabricate memories of past conversations

After the main response, append an action block in this EXACT format (no extra markdown around the tags):

<action-block>
### What this means for your portfolio
[2-3 sentences tying findings to their specific holdings and situation]

### Suggested steps
1. [concrete step, with ticker / share count / price if applicable]
2. [...]
3. [...]

[If the user has an SMSF, add:]
### SMSF note
[one-line compliance / tax observation]
</action-block>

Skip the action block entirely for trivial queries (small talk, clarifications, "thanks").

After the action block, emit a JSON sources array on a single line inside <sources>…</sources>, e.g.:
<sources>[{"title":"...","url":"https://...","domain":"afr.com"}]</sources>

If no sources, emit <sources>[]</sources>.`;
}

export function buildFollowUpsPrompt(): string {
  return `You generate 2-3 short follow-up questions the user might ask next, based on the assistant's response.

Rules:
- Each follow-up: a natural next question, 3-10 words
- Specific to the tickers / topics just discussed
- No duplicates of what was already covered
- Output ONLY a JSON array of strings, e.g. ["Deep dive CBA valuation?","Compare BHP vs RIO?"]`;
}

export function buildSessionTitlePrompt(): string {
  return `Generate a 4-6 word title summarizing this chat session. Output only the title, no quotes, no punctuation beyond hyphens.`;
}

export function describeToolCall(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case 'screen_stocks': {
      const strategy = typeof args.strategy === 'string' ? args.strategy : 'stocks';
      const sector = typeof args.sector === 'string' && args.sector ? ` in ${args.sector}` : '';
      const exchange =
        typeof args.exchange === 'string' && args.exchange ? ` on ${args.exchange.toUpperCase()}` : '';
      return `Screening for ${strategy} stocks${sector}${exchange}`;
    }
    case 'analyze_stock': {
      const ticker = typeof args.ticker === 'string' ? args.ticker.toUpperCase() : 'stock';
      const type = typeof args.analysis_type === 'string' ? args.analysis_type : 'analysis';
      return `Analyzing ${ticker} — ${type}`;
    }
    case 'brief_market': {
      const focus = typeof args.focus === 'string' ? args.focus : 'general';
      const sector = typeof args.sector === 'string' && args.sector ? ` (${args.sector})` : '';
      return `Briefing market — ${focus}${sector}`;
    }
    case 'check_portfolio': {
      const checkType = typeof args.check_type === 'string' ? args.check_type : 'health';
      return `Checking portfolio — ${checkType}`;
    }
    case 'log_trade': {
      const ticker = typeof args.ticker === 'string' ? args.ticker.toUpperCase() : 'trade';
      const action = typeof args.action === 'string' ? args.action : 'trade';
      const shares = typeof args.shares === 'number' ? args.shares : '';
      return `Logging ${action} ${shares} ${ticker}`;
    }
    default:
      return `Running ${name}`;
  }
}
