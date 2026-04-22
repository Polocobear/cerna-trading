import {
  callGeminiV2,
  sanitizeGeminiError,
  type GeminiFunctionDeclaration,
  type GeminiV2NonStreamResult,
} from '@/lib/gemini/client';
import { buildOrchestratorSystemPrompt, type ExchangeContext } from './prompts';
import type { ToolCall, ToolName } from './types';

const VALID_TOOLS: ReadonlySet<ToolName> = new Set<ToolName>([
  'screen_stocks',
  'analyze_stock',
  'brief_market',
  'check_portfolio',
  'log_trade',
]);

const TOOL_DECLARATIONS: GeminiFunctionDeclaration[] = [
  {
    name: 'screen_stocks',
    description:
      "Screen for stocks matching criteria. Supports major exchanges including ASX, NYSE, NASDAQ, LSE, TSX, and HKEX. Use the user's preferred exchange unless they explicitly ask for a different one.",
    parameters: {
      type: 'OBJECT',
      properties: {
        strategy: {
          type: 'STRING',
          enum: ['value', 'growth', 'dividend', 'quality', 'momentum', 'turnaround'],
          description: 'The screening strategy to apply',
        },
        sector: {
          type: 'STRING',
          description: 'Optional sector filter (e.g. "mining", "financials", "healthcare")',
        },
        market_cap: {
          type: 'STRING',
          enum: ['large', 'mid', 'small', 'all'],
          description: 'Optional market cap tier',
        },
        exchange: {
          type: 'STRING',
          description:
            'Optional explicit exchange override (e.g. ASX, NYSE, NASDAQ, LSE, TSX, HKEX). Use when the user names a specific exchange.',
        },
        additional_criteria: {
          type: 'STRING',
          description: 'Any extra qualitative constraints from the user',
        },
      },
      required: ['strategy'],
    },
  },
  {
    name: 'analyze_stock',
    description:
      'Deep institutional analysis of a single ticker. Use for "analyze X", "should I buy X", "thoughts on X".',
    parameters: {
      type: 'OBJECT',
      properties: {
        ticker: { type: 'STRING', description: 'Ticker symbol, uppercase, no exchange suffix' },
        analysis_type: {
          type: 'STRING',
          enum: ['thesis', 'fundamentals', 'technical', 'peers', 'valuation', 'full'],
          description: 'Depth and angle of analysis',
        },
        context: {
          type: 'STRING',
          description: 'Optional extra context from the user query',
        },
      },
      required: ['ticker', 'analysis_type'],
    },
  },
  {
    name: 'brief_market',
    description:
      'Produce a market briefing. Use for "what happened today?", "anything interesting?", macro/news questions.',
    parameters: {
      type: 'OBJECT',
      properties: {
        focus: {
          type: 'STRING',
          enum: ['general', 'portfolio_relevant', 'sector', 'macro', 'earnings'],
          description: 'Briefing angle',
        },
        sector: {
          type: 'STRING',
          description: 'Sector to spotlight, if applicable',
        },
      },
      required: ['focus'],
    },
  },
  {
    name: 'check_portfolio',
    description:
      'Analyze the user\'s current holdings. Use for "how\'s my portfolio", concentration/rebalance/performance questions.',
    parameters: {
      type: 'OBJECT',
      properties: {
        check_type: {
          type: 'STRING',
          enum: ['health', 'concentration', 'rebalance', 'performance', 'full'],
          description: 'Type of portfolio check',
        },
      },
      required: ['check_type'],
    },
  },
  {
    name: 'log_trade',
    description:
      'Log a trade the user has made or is reporting. Use when the user says they bought, sold, added to, or trimmed a position. Parse the trade details from their message.',
    parameters: {
      type: 'OBJECT',
      properties: {
        ticker: {
          type: 'STRING',
          description: "Stock ticker symbol, e.g. 'BHP', 'AAPL', 'CBA'",
        },
        action: {
          type: 'STRING',
          enum: ['buy', 'sell', 'add', 'trim'],
          description:
            "The trade action: 'buy' opens a new position, 'add' increases an existing one, 'sell' closes, 'trim' reduces.",
        },
        shares: {
          type: 'NUMBER',
          description: 'Number of shares traded',
        },
        price: {
          type: 'NUMBER',
          description: 'Per-share price paid or received',
        },
        exchange: {
          type: 'STRING',
          description:
            'Exchange if mentioned (ASX, NYSE, NASDAQ, etc). Infer from ticker if not stated.',
        },
        currency: {
          type: 'STRING',
          description: 'Currency if mentioned. Infer from exchange if not stated.',
        },
      },
      required: ['ticker', 'action', 'shares', 'price'],
    },
  },
];

const EXCHANGE_CODES = ['ASX', 'NYSE', 'NASDAQ', 'LSE', 'TSX', 'HKEX', 'JPX', 'XETRA', 'EURONEXT'];

const TICKER_BLACKLIST = new Set([
  'A',
  'AI',
  'ALL',
  'AND',
  'ANY',
  'ASX',
  'AUD',
  'BUY',
  'CAD',
  'CEO',
  'CFO',
  'ETF',
  'EUR',
  'GBP',
  'HKD',
  'HOLD',
  'HOW',
  'IDEA',
  'JPX',
  'LSE',
  'NASDAQ',
  'NEWS',
  'NYSE',
  'SELL',
  'SMSF',
  'STOCK',
  'STOCKS',
  'TODAY',
  'TRIM',
  'TSX',
  'USD',
  'WANT',
]);

const SECTOR_KEYWORDS: Array<{ pattern: RegExp; value: string }> = [
  { pattern: /\bmining\b|\bminers\b|\bmaterials\b|\bresources\b/, value: 'materials' },
  { pattern: /\bbank(?:s|ing)?\b|\bfinancials?\b|\binsurance\b/, value: 'financials' },
  { pattern: /\bhealth ?care\b|\bhealthcare\b|\bbiotech\b|\bpharma\b/, value: 'healthcare' },
  { pattern: /\btech\b|\btechnology\b|\bsoftware\b|\bsemis?\b/, value: 'technology' },
  { pattern: /\benergy\b|\boil\b|\bgas\b/, value: 'energy' },
  { pattern: /\bproperty\b|\breit\b|\breal estate\b/, value: 'real estate' },
  { pattern: /\bconsumer\b|\bretail\b/, value: 'consumer' },
  { pattern: /\bindustrials?\b|\binfrastructure\b/, value: 'industrials' },
  { pattern: /\butilities\b/, value: 'utilities' },
];

type OrchestratorContext = {
  exchangeCtx: ExchangeContext;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  investmentStrategy?: string | null;
};

function inferDefaultStrategy(investmentStrategy?: string | null):
  | 'value'
  | 'growth'
  | 'dividend'
  | 'quality'
  | 'momentum'
  | 'turnaround' {
  const normalized = investmentStrategy?.trim().toLowerCase() ?? '';
  if (normalized.includes('value')) return 'value';
  if (normalized.includes('growth')) return 'growth';
  if (normalized.includes('dividend') || normalized.includes('income')) return 'dividend';
  if (normalized.includes('momentum')) return 'momentum';
  if (normalized.includes('turnaround') || normalized.includes('recovery')) return 'turnaround';
  return 'quality';
}

function inferStrategy(
  message: string,
  investmentStrategy?: string | null
): 'value' | 'growth' | 'dividend' | 'quality' | 'momentum' | 'turnaround' {
  const normalized = message.toLowerCase();
  if (
    normalized.includes('undervalued') ||
    normalized.includes('value stock') ||
    normalized.includes('value stocks') ||
    normalized.includes('cheap')
  ) {
    return 'value';
  }
  if (normalized.includes('growth')) return 'growth';
  if (
    normalized.includes('dividend') ||
    normalized.includes('yield') ||
    normalized.includes('income')
  ) {
    return 'dividend';
  }
  if (normalized.includes('momentum') || normalized.includes('breakout')) return 'momentum';
  if (
    normalized.includes('turnaround') ||
    normalized.includes('recovery') ||
    normalized.includes('beaten down')
  ) {
    return 'turnaround';
  }
  if (normalized.includes('quality')) return 'quality';
  return inferDefaultStrategy(investmentStrategy);
}

function inferAnalysisType(
  message: string
): 'thesis' | 'fundamentals' | 'technical' | 'peers' | 'valuation' | 'full' {
  const normalized = message.toLowerCase();
  if (normalized.includes('valuation') || normalized.includes('fair value')) return 'valuation';
  if (
    normalized.includes('technical') ||
    normalized.includes('chart') ||
    normalized.includes('support') ||
    normalized.includes('resistance')
  ) {
    return 'technical';
  }
  if (normalized.includes('peer') || normalized.includes('compare')) return 'peers';
  if (
    normalized.includes('fundamental') ||
    normalized.includes('balance sheet') ||
    normalized.includes('earnings')
  ) {
    return 'fundamentals';
  }
  if (normalized.includes('thesis')) return 'thesis';
  return 'full';
}

function inferPortfolioCheckType(message: string): 'health' | 'concentration' | 'rebalance' | 'performance' | 'full' {
  const normalized = message.toLowerCase();
  if (
    normalized.includes('concentration') ||
    normalized.includes('too concentrated') ||
    normalized.includes('overweight')
  ) {
    return 'concentration';
  }
  if (normalized.includes('rebalance') || normalized.includes('reallocate')) return 'rebalance';
  if (
    normalized.includes('performance') ||
    normalized.includes('how am i doing') ||
    normalized.includes('how is my portfolio doing')
  ) {
    return 'performance';
  }
  if (normalized.includes('full')) return 'full';
  return 'health';
}

function inferBriefFocus(message: string, hasSector: boolean): 'general' | 'portfolio_relevant' | 'sector' | 'macro' | 'earnings' {
  const normalized = message.toLowerCase();
  if (normalized.includes('earnings')) return 'earnings';
  if (
    normalized.includes('macro') ||
    normalized.includes('inflation') ||
    normalized.includes('rates') ||
    normalized.includes('fed') ||
    normalized.includes('rba') ||
    normalized.includes('economy')
  ) {
    return 'macro';
  }
  if (hasSector) return 'sector';
  if (
    normalized.includes('my holdings') ||
    normalized.includes('my watchlist') ||
    normalized.includes('my portfolio')
  ) {
    return 'portfolio_relevant';
  }
  return 'general';
}

function extractExchange(message: string): string | undefined {
  const upper = message.toUpperCase();
  return EXCHANGE_CODES.find((exchange) => new RegExp(`\\b${exchange}\\b`).test(upper));
}

function extractSector(message: string): string | undefined {
  const normalized = message.toLowerCase();
  return SECTOR_KEYWORDS.find((entry) => entry.pattern.test(normalized))?.value;
}

function extractTicker(message: string): string | null {
  const dollarMatch = message.match(/\$([A-Za-z]{1,5})\b/);
  if (dollarMatch) {
    const ticker = dollarMatch[1].toUpperCase();
    if (!TICKER_BLACKLIST.has(ticker)) return ticker;
  }

  const contextualMatch = message.match(
    /\b(?:analyze|analysis of|thoughts on|look at|look into|review|on|buy|sell|trim|add|holding|holdings in)\s+([A-Za-z]{1,5})\b/i
  );
  if (contextualMatch) {
    const ticker = contextualMatch[1].toUpperCase();
    if (!TICKER_BLACKLIST.has(ticker) && !EXCHANGE_CODES.includes(ticker)) return ticker;
  }

  const upperTokens = message.match(/\b[A-Z]{1,5}\b/g) ?? [];
  for (const token of upperTokens) {
    if (!TICKER_BLACKLIST.has(token) && !EXCHANGE_CODES.includes(token)) return token;
  }

  return null;
}

function parseTradeAction(message: string): 'buy' | 'sell' | 'add' | 'trim' | null {
  const normalized = message.toLowerCase();
  if (/\b(?:i\s+)?bought\b|\bbuy\b/.test(normalized)) return 'buy';
  if (/\b(?:i\s+)?sold\b|\bsell\b/.test(normalized)) return 'sell';
  if (/\b(?:i\s+)?added\b|\badd to\b/.test(normalized)) return 'add';
  if (/\b(?:i\s+)?trimmed\b|\btrim\b/.test(normalized)) return 'trim';
  return null;
}

function parseTrade(message: string): {
  ticker: string;
  action: 'buy' | 'sell' | 'add' | 'trim';
  shares: number;
  price: number;
} | null {
  const action = parseTradeAction(message);
  if (!action) return null;

  const patterns = [
    /\b(?:bought|sold|added|trimmed|buy|sell|add|trim)\s+(\d+(?:\.\d+)?)\s+([A-Za-z]{1,5})\s+(?:at\s+)?\$?(\d+(?:\.\d+)?)/i,
    /\b([A-Za-z]{1,5})\s+(?:at\s+)?\$?(\d+(?:\.\d+)?)\s+(?:for\s+)?(\d+(?:\.\d+)?)\s+shares\b/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (!match) continue;
    const maybeTicker = pattern === patterns[0] ? match[2] : match[1];
    const ticker = maybeTicker.toUpperCase();
    if (TICKER_BLACKLIST.has(ticker) || EXCHANGE_CODES.includes(ticker)) continue;
    const shares = Number(pattern === patterns[0] ? match[1] : match[3]);
    const price = Number(pattern === patterns[0] ? match[3] : match[2]);
    if (Number.isFinite(shares) && Number.isFinite(price) && shares > 0 && price > 0) {
      return { ticker, action, shares, price };
    }
  }

  return null;
}

function isGreetingOnly(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return /^(hi|hello|hey|morning|good morning|afternoon|good afternoon|evening|good evening)\b[!. ]*$/.test(
    normalized
  );
}

function buildFallbackPlan(
  userMessage: string,
  context: OrchestratorContext
): { toolCalls: ToolCall[]; directReply: string | null } {
  const normalized = userMessage.trim().toLowerCase();
  const exchange = extractExchange(userMessage);
  const sector = extractSector(userMessage);
  const ticker = extractTicker(userMessage);
  const trade = parseTrade(userMessage);
  const toolCalls: ToolCall[] = [];

  const addTool = (name: ToolName, args: Record<string, unknown>) => {
    if (toolCalls.some((tool) => tool.name === name)) return;
    if (toolCalls.length >= 3) return;
    toolCalls.push({ name, arguments: args });
  };

  if (isGreetingOnly(userMessage)) {
    return {
      toolCalls: [],
      directReply: 'Morning. Want me to look for ideas, check the market, or dig into a stock?',
    };
  }

  if ((normalized.includes('analyze it') || normalized.includes('look at it')) && !ticker) {
    return {
      toolCalls: [],
      directReply: 'If you mean a specific stock, send the ticker and I will dig into it.',
    };
  }

  if (trade) {
    addTool('log_trade', {
      ticker: trade.ticker,
      action: trade.action,
      shares: trade.shares,
      price: trade.price,
      ...(exchange ? { exchange } : {}),
    });
    return { toolCalls, directReply: null };
  }

  if (
    parseTradeAction(userMessage) &&
    !trade &&
    !normalized.includes('should i') &&
    !normalized.includes('worth')
  ) {
    return {
      toolCalls: [],
      directReply: 'I can log that. Send the ticker, shares, and price and I will record it.',
    };
  }

  const mentionsBuySellDecision =
    normalized.includes('should i buy') ||
    normalized.includes('should i sell') ||
    normalized.includes('buy or sell') ||
    normalized.includes('worth buying') ||
    normalized.includes('worth selling') ||
    normalized.includes('should i add') ||
    normalized.includes('should i trim');

  if (ticker) {
    addTool('analyze_stock', {
      ticker,
      analysis_type: inferAnalysisType(userMessage),
      ...(mentionsBuySellDecision ? { context: userMessage.trim() } : {}),
    });
    if (mentionsBuySellDecision) {
      addTool('check_portfolio', { check_type: 'health' });
    }
    return { toolCalls, directReply: null };
  }

  const wantsPortfolio =
    normalized.includes('portfolio') ||
    normalized.includes('holdings') ||
    normalized.includes('concentration') ||
    normalized.includes('rebalance') ||
    normalized.includes('allocation') ||
    normalized.includes('position sizing');
  const wantsIdeas =
    normalized.includes('invest') ||
    normalized.includes('opportunit') ||
    normalized.includes('screen') ||
    normalized.includes('stocks') ||
    normalized.includes('shares') ||
    normalized.includes('what should i buy') ||
    normalized.includes('undervalued') ||
    normalized.includes('ideas');
  const wantsMarket =
    normalized.includes("what's happening") ||
    normalized.includes('what is happening') ||
    normalized.includes('what happened') ||
    normalized.includes('market') ||
    normalized.includes('news') ||
    normalized.includes('macro') ||
    normalized.includes('earnings') ||
    normalized.includes('interesting today');

  if (wantsPortfolio) {
    addTool('check_portfolio', { check_type: inferPortfolioCheckType(userMessage) });
  }

  if (wantsMarket) {
    addTool('brief_market', {
      focus: inferBriefFocus(userMessage, Boolean(sector)),
      ...(sector ? { sector } : {}),
    });
  }

  if (wantsIdeas) {
    addTool('screen_stocks', {
      strategy: inferStrategy(userMessage, context.investmentStrategy),
      ...(sector ? { sector } : {}),
      ...(exchange ? { exchange } : {}),
    });
  }

  if (toolCalls.length > 0) return { toolCalls, directReply: null };

  return {
    toolCalls: [],
    directReply: 'Tell me what you want to look at and I will route it. A ticker, your portfolio, or fresh ideas all work.',
  };
}

export async function runOrchestrator(
  userMessage: string,
  context: OrchestratorContext
): Promise<{ toolCalls: ToolCall[]; directReply: string | null; deep?: boolean }> {
  const history = context.history ?? [];
  const messages = [
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: 'user' as const, content: userMessage },
  ];

  let result: GeminiV2NonStreamResult;
  try {
    result = await callGeminiV2({
      model: 'gemini-2.5-flash',
      systemPrompt: buildOrchestratorSystemPrompt(context.exchangeCtx),
      messages,
      tools: TOOL_DECLARATIONS,
      temperature: 0.2,
      maxOutputTokens: 2048,
      requestTimeoutMs: 15000,
      retryOptions: {
        maxRetries: 1,
        backoffMs: 1000,
      },
    });
  } catch (err) {
    const geminiError = err as Error & { status?: number; rawText?: string };
    console.warn('[orchestrator] Falling back to heuristic routing', {
      message: userMessage,
      status: geminiError.status,
      error: err instanceof Error ? err.message : String(err),
    });
    return buildFallbackPlan(userMessage, context);
  }

  const seen = new Set<string>();
  const toolCalls: ToolCall[] = [];
  for (const fc of result.functionCalls) {
    if (!VALID_TOOLS.has(fc.name as ToolName)) continue;
    const key = `${fc.name}:${JSON.stringify(fc.args ?? {})}`;
    if (seen.has(key)) continue;
    const nameSeen = toolCalls.some((t) => t.name === fc.name);
    if (nameSeen) continue;
    seen.add(key);
    toolCalls.push({ name: fc.name as ToolName, arguments: fc.args ?? {} });
    if (toolCalls.length >= 3) break;
  }

  if (toolCalls.length === 0) {
    const trimmed = result.text.trim();
    return { directReply: trimmed || 'How can I help with your portfolio today?', toolCalls: [] };
  }

  return { toolCalls, directReply: null };
}
