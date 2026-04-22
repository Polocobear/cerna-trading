import type { SupabaseClient } from '@supabase/supabase-js';
import {
  callGeminiV2,
  sanitizeGeminiError,
  type GeminiV2Model,
} from '@/lib/gemini/client';
import {
  buildAnalyzePrompt,
  buildBriefPrompt,
  buildPortfolioCheckPrompt,
  buildScreenPrompt,
  describeToolCall,
  type ExchangeContext,
} from './prompts';
import type {
  AgentEvent,
  AgentName,
  AgentResult,
  ToolCall,
  TradeAction,
  AgentSource,
} from './types';
import type { AgentContext } from '@/lib/memory/context-builder';

function classify(toolName: string): AgentName {
  switch (toolName) {
    case 'screen_stocks':
      return 'screen';
    case 'analyze_stock':
      return 'analyze';
    case 'brief_market':
      return 'brief';
    case 'log_trade':
      return 'trade_log';
    case 'check_portfolio':
    default:
      return 'portfolio';
  }
}

function argsToUserMessage(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case 'screen_stocks': {
      const strategy = String(args.strategy ?? 'value');
      const sector = args.sector ? ` in the ${String(args.sector)} sector` : '';
      const cap = args.market_cap && args.market_cap !== 'all' ? ` (${String(args.market_cap)} cap)` : '';
      const exchange =
        typeof args.exchange === 'string' && args.exchange.trim()
          ? ` on ${args.exchange.toUpperCase()}`
          : '';
      const extra = args.additional_criteria ? `. Additional criteria: ${String(args.additional_criteria)}` : '';
      return `Screen for ${strategy} stocks${sector}${cap}${exchange}${extra}. Return 3-5 candidates with full analysis.`;
    }
    case 'analyze_stock': {
      const ticker = String(args.ticker ?? '').toUpperCase();
      const type = String(args.analysis_type ?? 'thesis');
      const context = args.context ? `\n\nUser context: ${String(args.context)}` : '';
      return `Analyze ${ticker} — ${type} analysis.${context}`;
    }
    case 'brief_market': {
      const focus = String(args.focus ?? 'general');
      const sector = args.sector ? ` with a spotlight on ${String(args.sector)}` : '';
      return `Produce today's market briefing, focus: ${focus}${sector}.`;
    }
    case 'check_portfolio': {
      const checkType = String(args.check_type ?? 'health');
      return `Run a ${checkType} check on the user's portfolio.`;
    }
    default:
      return 'Produce research.';
  }
}

function systemPromptFor(
  agent: AgentName,
  portfolioContext: string,
  exchange: ExchangeContext
): string {
  switch (agent) {
    case 'screen':
      return buildScreenPrompt(portfolioContext, exchange);
    case 'analyze':
      return buildAnalyzePrompt(portfolioContext, exchange);
    case 'brief':
      return buildBriefPrompt(portfolioContext, exchange);
    case 'portfolio':
      return buildPortfolioCheckPrompt(portfolioContext, exchange);
    case 'trade_log':
      return '';
  }
}

interface ExistingPositionRow {
  id: string;
  shares: number;
  cost_basis: number;
  exchange: string | null;
  currency: string | null;
}

function inferExchangeFromTicker(ticker: string, fallback: string): string {
  if (/^[A-Z]{3}$/.test(ticker)) return fallback || 'ASX';
  return fallback || 'ASX';
}

function inferCurrencyFromExchange(exchange: string): string {
  switch (exchange.toUpperCase()) {
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

export function safeAgentError(err: unknown): string {
  if (err instanceof Error) {
    const geminiError = err as Error & { status?: number; rawText?: string };
    if (typeof geminiError.status === 'number') {
      return sanitizeGeminiError(
        geminiError.status,
        geminiError.rawText ?? geminiError.message
      );
    }
    if (/Gemini/i.test(geminiError.message) || /^\s*\d{3}\b/.test(geminiError.message)) {
      return 'The AI service encountered a temporary error. Please try again.';
    }
    return geminiError.message;
  }
  return 'unknown error';
}

function formatMoney(n: number, currency: string): string {
  return `${currency === 'USD' ? '$' : ''}${n.toFixed(2)}${currency !== 'USD' ? ' ' + currency : ''}`;
}

async function handleLogTrade(
  args: Record<string, unknown>,
  supabase: SupabaseClient,
  userId: string,
  rawMessage: string,
  exchange: ExchangeContext
): Promise<{ success: boolean; content: string | null; sources: AgentSource[]; error?: string }> {
  const ticker = String(args.ticker ?? '').toUpperCase().trim();
  const actionRaw = String(args.action ?? '').toLowerCase();
  const shares = typeof args.shares === 'number' ? args.shares : parseFloat(String(args.shares ?? ''));
  const price = typeof args.price === 'number' ? args.price : parseFloat(String(args.price ?? ''));

  const validActions: TradeAction[] = ['buy', 'sell', 'add', 'trim'];
  const action = validActions.includes(actionRaw as TradeAction)
    ? (actionRaw as TradeAction)
    : null;

  if (!ticker || !action || !Number.isFinite(shares) || shares <= 0 || !Number.isFinite(price) || price <= 0) {
    return {
      success: false,
      content: null,
      sources: [],
      error: "I couldn't parse that trade clearly — could you confirm the ticker, buy/sell, number of shares, and price?",
    };
  }

  const exchangeStr =
    (typeof args.exchange === 'string' && args.exchange) ||
    inferExchangeFromTicker(ticker, exchange.primary);
  const currency =
    (typeof args.currency === 'string' && args.currency) || inferCurrencyFromExchange(exchangeStr);

  const { error: logErr } = await supabase.from('logged_trades').insert({
    user_id: userId,
    ticker,
    exchange: exchangeStr,
    action,
    shares,
    price,
    currency,
    logged_via: 'chat',
    reconciled: false,
    raw_message: rawMessage.slice(0, 1000),
    trade_date: new Date().toISOString(),
  });

  if (logErr) {
    return {
      success: false,
      content: null,
      sources: [],
      error: `I tried to log the trade but the database rejected it: ${logErr.message}`,
    };
  }

  const { data: existingRaw } = await supabase
    .from('positions')
    .select('id, shares, cost_basis, exchange, currency')
    .eq('user_id', userId)
    .eq('ticker', ticker)
    .eq('status', 'open')
    .maybeSingle();
  const existing = existingRaw as ExistingPositionRow | null;

  let finalShares = 0;
  let finalCostBasis = 0;
  let confirmation = '';

  if (action === 'buy' || action === 'add') {
    if (existing) {
      finalShares = existing.shares + shares;
      finalCostBasis =
        (existing.shares * existing.cost_basis + shares * price) / finalShares;
      await supabase
        .from('positions')
        .update({
          shares: finalShares,
          cost_basis: finalCostBasis,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
      confirmation = `Got it. Logged: ${action === 'buy' ? 'Bought' : 'Added'} ${shares} ${ticker} at ${formatMoney(price, currency)}. Your ${ticker} position is now ${finalShares} shares at avg ${formatMoney(finalCostBasis, currency)}.`;
    } else {
      finalShares = shares;
      finalCostBasis = price;
      await supabase.from('positions').insert({
        user_id: userId,
        ticker,
        exchange: exchangeStr,
        currency,
        shares,
        cost_basis: price,
      });
      confirmation = `Got it. Logged: Bought ${shares} ${ticker} at ${formatMoney(price, currency)}. New position opened.`;
    }
  } else {
    if (!existing) {
      confirmation = `I logged the ${action} of ${shares} ${ticker} at ${formatMoney(price, currency)}, but I don't have a matching open position on file — you may want to double-check your records.`;
    } else {
      finalShares = existing.shares - shares;
      if (finalShares <= 0.0001) {
        await supabase
          .from('positions')
          .update({
            status: 'closed',
            close_price: price,
            closed_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
        confirmation = `Got it. Logged: ${action === 'sell' ? 'Sold' : 'Trimmed'} ${shares} ${ticker} at ${formatMoney(price, currency)}. Position closed.`;
      } else {
        await supabase
          .from('positions')
          .update({ shares: finalShares, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
        confirmation = `Got it. Logged: ${action === 'sell' ? 'Sold' : 'Trimmed'} ${shares} ${ticker} at ${formatMoney(price, currency)}. Your ${ticker} position is now ${finalShares} shares.`;
      }
    }
  }

  await supabase.from('sync_history').insert({
    user_id: userId,
    sync_type: 'chat_trade',
    status: 'success',
    positions_updated: 1,
    trades_imported: 1,
  });

  return {
    success: true,
    content: confirmation,
    sources: [],
  };
}

export async function runAgent(options: {
  name: string;
  args: Record<string, unknown>;
  context: AgentContext;
  deep: boolean;
  deadlineMs: number;
  supabase?: SupabaseClient;
  userId?: string;
  userMessage?: string;
}): Promise<{
  name: string;
  success: boolean;
  content: string | null;
  sources: AgentSource[];
  error?: string;
}> {
  const { name, args, context, deep, deadlineMs, supabase, userId, userMessage } = options;
  const agent = classify(name);

  if (name === 'log_trade') {
    if (!supabase || !userId || !userMessage) {
      return { name, success: false, content: null, sources: [], error: 'Missing log_trade dependencies' };
    }
    const logRes = await handleLogTrade(args, supabase, userId, userMessage, context.exchangeCtx);
    return { name, ...logRes };
  }

  const systemPrompt = systemPromptFor(agent, context.portfolioContext, context.exchangeCtx);
  const promptUserMessage = argsToUserMessage(name, args);

  const isResearch = agent !== 'portfolio';
  const primary: GeminiV2Model = isResearch && deep ? 'gemini-2.5-pro' : 'gemini-2.5-flash';
  const enableSearch = isResearch;

  const tryCall = async (model: GeminiV2Model) => {
    return callGeminiV2({
      model,
      systemPrompt,
      userMessage: promptUserMessage,
      enableSearchGrounding: enableSearch,
      temperature: 0.55,
      maxOutputTokens: model === 'gemini-2.5-pro' ? 32768 : 8192,
      requestTimeoutMs: enableSearch ? 30000 : 12000,
      retryOptions: {
        maxRetries: enableSearch ? 0 : 1,
        backoffMs: 1000,
        deadlineMs,
      },
    });
  };

  try {
    if (Date.now() > deadlineMs - 5000) {
      throw new Error('Pipeline deadline approached before execution');
    }
    const res = await tryCall(primary);
    return {
      name,
      success: true,
      content: res.text,
      sources: res.sources,
    };
  } catch (err) {
    if (primary === 'gemini-2.5-pro' && Date.now() <= deadlineMs - 10000) {
      try {
        const res = await tryCall('gemini-2.5-flash');
        return {
          name,
          success: true,
          content: res.text,
          sources: res.sources,
        };
      } catch (fallbackErr) {
        return {
          name,
          success: false,
          content: null,
          sources: [],
          error: safeAgentError(fallbackErr),
        };
      }
    }
    return {
      name,
      success: false,
      content: null,
      sources: [],
      error: safeAgentError(err),
    };
  }
}

export interface ExecuteAgentsContext {
  portfolioContext: string;
  exchange: ExchangeContext;
  isDeepAvailable: boolean;
  supabase: SupabaseClient;
  userId: string;
  userMessage: string;
  deadlineMs?: number;
}

export async function executeAgents(
  toolCalls: ToolCall[],
  ctx: ExecuteAgentsContext,
  onEvent: (event: AgentEvent) => void
): Promise<AgentResult[]> {
  const promises = toolCalls.map(async (tool) => {
    const agent = classify(tool.name);
    const description = describeToolCall(tool.name, tool.arguments);
    onEvent({ type: 'agent_start', agent, description });

    const context: AgentContext = {
      profile: null,
      positions: [],
      watchlist: [],
      exchangeCtx: ctx.exchange,
      portfolioContext: ctx.portfolioContext,
      intelligenceContext: ''
    };

    const start = Date.now();
    const result = await runAgent({
      name: tool.name,
      args: tool.arguments,
      context,
      deep: ctx.isDeepAvailable,
      deadlineMs: ctx.deadlineMs ?? Date.now() + 55000,
      supabase: ctx.supabase,
      userId: ctx.userId,
      userMessage: ctx.userMessage,
    });

    const agentResult: AgentResult = {
      agent,
      description,
      status: result.success ? 'success' : 'error',
      data: result.content ?? '',
      sources: result.sources,
      executionTime: Date.now() - start,
      model: 'gemini-2.5-flash',
      error: result.error,
    };

    if (agentResult.status === 'success') {
      const trimmed = agentResult.data.trim().replace(/\s+/g, ' ');
      const summary = !trimmed ? 'completed' : trimmed.slice(0, 140) + (trimmed.length > 140 ? '…' : '');
      onEvent({ type: 'agent_complete', agent, summary, sources: agentResult.sources });
    } else {
      onEvent({ type: 'agent_error', agent, error: agentResult.error ?? 'unknown error' });
    }
    return agentResult;
  });

  const settled = await Promise.allSettled(promises);
  const results: AgentResult[] = [];
  for (let i = 0; i < settled.length; i++) {
    const s = settled[i];
    if (s.status === 'fulfilled') {
      results.push(s.value);
    } else {
      const tool = toolCalls[i];
      const agent = classify(tool.name);
      results.push({
        agent,
        description: describeToolCall(tool.name, tool.arguments),
        status: 'error',
        data: '',
        sources: [],
        executionTime: 0,
        model: 'gemini-2.5-flash',
        error: safeAgentError(s.reason),
      });
    }
  }
  return results;
}
