import { APIError } from '@anthropic-ai/sdk';
import {
  callClaude,
  CLAUDE_HAIKU,
  isClaudeApiError,
  parseClaudeJson,
} from '@/lib/claude/client';
import type { Profile } from '@/types/portfolio';
import {
  buildOrchestratorSystemPrompt,
  type ExchangeContext,
  type ResearchUserContext,
} from './prompts';
import type { ToolCall, ToolName } from './types';
import type { TradeCheckInit, TradeCheckRequestedAction } from './trade-check-types';

const VALID_TOOLS: ReadonlySet<ToolName> = new Set<ToolName>([
  'screen_stocks',
  'analyze_stock',
  'brief_market',
  'check_portfolio',
  'log_trade',
]);

const ROUTING_RESPONSE_INSTRUCTION = `Return JSON only with this exact shape:
{
  "directReply": string | null,
  "tradeCheck": {
    "ticker": string,
    "requestedAction": "buy" | "sell" | "add" | "trim" | "hold" | "unknown",
    "userMessage": string
  } | null,
  "toolCalls": [
    {
      "name": "screen_stocks" | "analyze_stock" | "brief_market" | "check_portfolio" | "log_trade",
      "arguments": { ... }
    }
  ],
  "deep": boolean
}

Rules:
- If you return one or more tool calls, set "directReply" to null.
- If you return a tradeCheck object, set "directReply" to null and "toolCalls" to [].
- If you reply directly, set "toolCalls" to [].
- Use at most 3 tool calls.
- Never wrap the JSON in markdown fences.
- Tickers must be uppercase with no exchange suffix.
- Omit optional arguments unless the user actually provided them or they are clearly implied.`;

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
  profile?: Profile | null;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  investmentStrategy?: string | null;
  deadlineMs?: number;
};

// INTENT CLASSIFICATION lives in the shared orchestrator prompt, and the
// fallback heuristics below mirror it so vague intent still triggers
// clarification when Claude is unavailable.
const VAGUE_INTENT_REPLY =
  "Happy to help. Are you leaning more toward steady income, growth, or shorter-term trades? Any sectors or themes you want me to focus on, or should I scan broadly?";

function latestUserMessages(
  userMessage: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }> = []
): string[] {
  return [
    userMessage,
    ...history
      .filter((entry) => entry.role === 'user' && typeof entry.content === 'string')
      .slice(-10)
      .reverse()
      .map((entry) => entry.content),
  ];
}

function findFirstMatch<T>(
  messages: string[],
  matcher: (message: string) => T | undefined
): T | undefined {
  for (const message of messages) {
    const match = matcher(message);
    if (match !== undefined) return match;
  }
  return undefined;
}

function extractExperienceLevel(messages: string[]): ResearchUserContext['experienceLevel'] {
  return findFirstMatch(messages, (message) => {
    const normalized = message.toLowerCase();
    if (
      /\b(new to investing|new investor|beginner|just starting|first time investing|no experience)\b/.test(
        normalized
      )
    ) {
      return 'beginner';
    }
    if (
      /\b(trading for years|investing for years|experienced investor|experienced trader|advanced trader|advanced investor)\b/.test(
        normalized
      )
    ) {
      return 'advanced';
    }
    if (/\b(some experience|intermediate)\b/.test(normalized)) {
      return 'intermediate';
    }
    return undefined;
  });
}

function extractAccountType(
  messages: string[],
  profile?: Profile | null
): ResearchUserContext['accountType'] {
  const explicit = findFirstMatch(messages, (message) => {
    const normalized = message.toLowerCase();
    if (/\bsmsf\b/.test(normalized)) return 'smsf';
    if (/\bpersonal account\b|\bpersonal portfolio\b|\bmy own account\b/.test(normalized)) {
      return 'personal';
    }
    if (/\btrust\b/.test(normalized)) return 'trust';
    if (/\bcompany account\b|\bcompany portfolio\b|\bcorporate account\b/.test(normalized)) {
      return 'company';
    }
    return undefined;
  });

  if (explicit) return explicit;
  if (profile?.smsf_name) return 'smsf';
  return 'unknown';
}

function extractRiskTolerance(
  messages: string[],
  profile?: Profile | null
): ResearchUserContext['riskTolerance'] {
  const explicit = findFirstMatch(messages, (message) => {
    const normalized = message.toLowerCase();
    if (/\b(conservative|safe|low risk|defensive)\b/.test(normalized)) return 'conservative';
    if (/\b(aggressive|high risk|speculative|swing for the fences)\b/.test(normalized)) {
      return 'aggressive';
    }
    if (/\b(moderate|balanced)\b/.test(normalized)) return 'moderate';
    return undefined;
  });

  return explicit ?? profile?.risk_tolerance ?? 'unknown';
}

function normalizeInvestmentGoal(raw?: string | null): ResearchUserContext['investmentGoal'] {
  const normalized = raw?.trim().toLowerCase() ?? '';
  if (!normalized) return undefined;
  if (normalized.includes('income') || normalized.includes('dividend')) return 'income';
  if (normalized.includes('growth')) return 'growth';
  if (
    normalized.includes('trade') ||
    normalized.includes('trading') ||
    normalized.includes('momentum') ||
    normalized.includes('make money')
  ) {
    return 'trading';
  }
  return undefined;
}

function extractCapitalBase(messages: string[]): number | null {
  const amountRegex =
    /(?:\$\s*([0-9][0-9,]*(?:\.[0-9]+)?)|(?:^|[\s(])([0-9]+(?:\.[0-9]+)?)\s*([km])\b)/gi;

  for (const message of messages) {
    let match: RegExpExecArray | null;
    while ((match = amountRegex.exec(message)) !== null) {
      if (match[1]) {
        const amount = Number(match[1].replace(/,/g, ''));
        if (Number.isFinite(amount) && amount >= 1000) {
          return amount;
        }
      }
      if (match[2] && match[3]) {
        const base = Number(match[2]);
        if (!Number.isFinite(base)) continue;
        const multiplier = match[3].toLowerCase() === 'm' ? 1_000_000 : 1_000;
        const amount = base * multiplier;
        if (amount >= 1000) return amount;
      }
    }
  }
  return null;
}

function buildResearchUserContext(
  userMessage: string,
  context: OrchestratorContext
): ResearchUserContext {
  const messages = latestUserMessages(userMessage, context.history);
  const investmentGoal =
    findFirstMatch(messages, (message) => normalizeInvestmentGoal(message)) ??
    normalizeInvestmentGoal(context.profile?.investment_strategy) ??
    normalizeInvestmentGoal(context.investmentStrategy) ??
    'unknown';

  return {
    experienceLevel: extractExperienceLevel(messages) ?? 'unknown',
    accountType: extractAccountType(messages, context.profile),
    riskTolerance: extractRiskTolerance(messages, context.profile),
    investmentGoal,
    capitalBase: extractCapitalBase(messages),
  };
}

function isVagueIntentMessage(message: string, ticker: string | null, sector?: string): boolean {
  const normalized = message.trim().toLowerCase();
  if (ticker || sector || extractExchange(message)) return false;
  if (
    normalized.includes('portfolio') ||
    normalized.includes('holdings') ||
    normalized.includes('rebalance') ||
    normalized.includes('market') ||
    normalized.includes('news') ||
    normalized.includes('earnings')
  ) {
    return false;
  }

  return (
    normalized === 'stocks' ||
    normalized === 'shares' ||
    normalized === 'invest' ||
    normalized === 'i want to invest' ||
    normalized === 'what should i buy' ||
    normalized === 'help me make money' ||
    normalized === 'help me invest' ||
    normalized === 'any ideas' ||
    normalized === 'opportunities' ||
    (/\b(invest|ideas|opportunities|what should i buy|help me make money)\b/.test(normalized) &&
      !/\b(value|growth|dividend|income|momentum|turnaround|quality|under \$|\bunder\b|over \$|\bover\b)\b/.test(
        normalized
      ))
  );
}

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

function parseTradeCheckRequestedAction(message: string): TradeCheckRequestedAction {
  const normalized = message.toLowerCase();
  if (/\bshould i hold\b|\bkeep holding\b|\bhold it\b/.test(normalized)) return 'hold';
  return parseTradeAction(message) ?? 'unknown';
}

function isTradeCheckMessage(message: string, ticker: string | null): boolean {
  if (!ticker) return false;
  const normalized = message.trim().toLowerCase();

  return (
    /\btrade check\b|\bchecklist\b|\bwalk me through\b|\btalk me through\b/.test(normalized) ||
    /\bshould i (buy|sell|add|trim|hold)\b/.test(normalized) ||
    /\bworth (buying|selling|adding)\b/.test(normalized) ||
    /\bis (this|it|[a-z]{1,5}) a buy\b/.test(normalized) ||
    /\bentry\b/.test(normalized)
  );
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
): { toolCalls: ToolCall[]; directReply: string | null; tradeCheck: TradeCheckInit | null } {
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
      tradeCheck: null,
    };
  }

  if ((normalized.includes('analyze it') || normalized.includes('look at it')) && !ticker) {
    return {
      toolCalls: [],
      directReply: 'If you mean a specific stock, send the ticker and I will dig into it.',
      tradeCheck: null,
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
    return { toolCalls, directReply: null, tradeCheck: null };
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
      tradeCheck: null,
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

  if (isTradeCheckMessage(userMessage, ticker)) {
    return {
      toolCalls: [],
      directReply: null,
      tradeCheck: {
        ticker: ticker ?? '',
        requestedAction: parseTradeCheckRequestedAction(userMessage),
        userMessage: userMessage.trim(),
      },
    };
  }

  if (ticker) {
    addTool('analyze_stock', {
      ticker,
      analysis_type: inferAnalysisType(userMessage),
      ...(mentionsBuySellDecision ? { context: userMessage.trim() } : {}),
    });
    if (mentionsBuySellDecision) {
      addTool('check_portfolio', { check_type: 'health' });
    }
    return { toolCalls, directReply: null, tradeCheck: null };
  }

  if (isVagueIntentMessage(userMessage, ticker, sector)) {
    return {
      toolCalls: [],
      directReply: VAGUE_INTENT_REPLY,
      tradeCheck: null,
    };
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

  if (toolCalls.length > 0) return { toolCalls, directReply: null, tradeCheck: null };

  return {
    toolCalls: [],
    directReply: 'Tell me what you want to look at and I will route it. A ticker, your portfolio, or fresh ideas all work.',
    tradeCheck: null,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseToolCallsFromResponse(text: string): {
  toolCalls: ToolCall[];
  directReply: string | null;
  tradeCheck: TradeCheckInit | null;
  deep?: boolean;
} | null {
  const parsed = parseClaudeJson<unknown>(text);
  if (!isPlainObject(parsed)) return null;

  const rawToolCalls = Array.isArray(parsed.toolCalls) ? parsed.toolCalls : [];
  const toolCalls: ToolCall[] = [];
  const seen = new Set<string>();

  for (const rawToolCall of rawToolCalls) {
    if (!isPlainObject(rawToolCall)) continue;
    const name = rawToolCall.name;
    const args = rawToolCall.arguments;
    if (typeof name !== 'string' || !VALID_TOOLS.has(name as ToolName)) continue;
    if (!isPlainObject(args)) continue;

    const key = `${name}:${JSON.stringify(args)}`;
    if (seen.has(key)) continue;
    if (toolCalls.some((tool) => tool.name === name)) continue;
    seen.add(key);
    toolCalls.push({ name: name as ToolName, arguments: args });

    if (toolCalls.length >= 3) break;
  }

  const directReply =
    typeof parsed.directReply === 'string' && parsed.directReply.trim().length > 0
      ? parsed.directReply.trim()
      : null;
  const tradeCheck: TradeCheckInit | null =
    isPlainObject(parsed.tradeCheck) &&
    typeof parsed.tradeCheck.ticker === 'string' &&
    typeof parsed.tradeCheck.userMessage === 'string'
      ? {
          ticker: parsed.tradeCheck.ticker.toUpperCase(),
          requestedAction:
            parsed.tradeCheck.requestedAction === 'buy' ||
            parsed.tradeCheck.requestedAction === 'sell' ||
            parsed.tradeCheck.requestedAction === 'add' ||
            parsed.tradeCheck.requestedAction === 'trim' ||
            parsed.tradeCheck.requestedAction === 'hold'
              ? parsed.tradeCheck.requestedAction
              : 'unknown',
          userMessage: parsed.tradeCheck.userMessage,
        }
      : null;
  const deep = typeof parsed.deep === 'boolean' ? parsed.deep : undefined;

  return {
    toolCalls,
    directReply: toolCalls.length > 0 || tradeCheck ? null : directReply,
    tradeCheck: tradeCheck && tradeCheck.ticker ? tradeCheck : null,
    ...(deep !== undefined ? { deep } : {}),
  };
}

export async function runOrchestrator(
  userMessage: string,
  context: OrchestratorContext
): Promise<{
  toolCalls: ToolCall[];
  directReply: string | null;
  tradeCheck: TradeCheckInit | null;
  deep?: boolean;
  userContext: ResearchUserContext;
}> {
  const userContext = buildResearchUserContext(userMessage, context);
  try {
    const response = await callClaude({
      model: CLAUDE_HAIKU,
      systemPrompt: `${buildOrchestratorSystemPrompt(context.exchangeCtx)}\n\n${ROUTING_RESPONSE_INSTRUCTION}`,
      userMessage,
      conversationHistory: context.history ?? [],
      useWebSearch: false,
      maxTokens: 2048,
      thinkingBudget: 0,
      temperature: 1,
    });

    const parsed = parseToolCallsFromResponse(response.text);
    if (!parsed) {
      throw new Error('Claude returned an unparseable routing response');
    }
    if (parsed.tradeCheck) {
      return {
        toolCalls: [],
        directReply: null,
        tradeCheck: parsed.tradeCheck,
        deep: parsed.deep,
        userContext,
      };
    }
    if (parsed.toolCalls.length === 0) {
      return {
        toolCalls: [],
        directReply: parsed.directReply || 'How can I help with your portfolio today?',
        tradeCheck: null,
        deep: parsed.deep,
        userContext,
      };
    }
    return {
      toolCalls: parsed.toolCalls,
      directReply: null,
      tradeCheck: null,
      deep: parsed.deep,
      userContext,
    };
  } catch (err) {
    const status = isClaudeApiError(err) ? err.status : err instanceof APIError ? err.status : undefined;
    const message = err instanceof Error ? err.message : String(err);
    if (isClaudeApiError(err)) {
      console.error(`[ORCHESTRATOR] Claude API error ${err.status}: ${err.message}`);
    }
    console.warn('[orchestrator] Falling back to heuristic routing', {
      message: userMessage,
      status,
      error: message,
    });
    return {
      ...buildFallbackPlan(userMessage, context),
      userContext,
    };
  }
}
