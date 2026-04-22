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
} from './types';

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
  // 3-letter all-caps is typical of ASX; otherwise default to the user's primary exchange or ASX
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

function isRetryableGeminiStatus(status?: number): status is number {
  return status === 429 || status === 503 || (typeof status === 'number' && status >= 500);
}

function waitWithJitter(baseMs: number): Promise<void> {
  const jitter = Math.random() * 500;
  return new Promise((resolve) => setTimeout(resolve, baseMs + jitter));
}

function safeAgentError(err: unknown): string {
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
): Promise<AgentResult> {
  const start = Date.now();
  const description = describeToolCall('log_trade', args);

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
      agent: 'trade_log',
      description,
      status: 'error',
      data: "I couldn't parse that trade clearly — could you confirm the ticker, buy/sell, number of shares, and price?",
      sources: [],
      executionTime: Date.now() - start,
      model: 'gemini-2.5-flash',
      error: 'invalid log_trade arguments',
    };
  }

  const exchangeStr =
    (typeof args.exchange === 'string' && args.exchange) ||
    inferExchangeFromTicker(ticker, exchange.primary);
  const currency =
    (typeof args.currency === 'string' && args.currency) || inferCurrencyFromExchange(exchangeStr);

  // Insert logged_trade
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
      agent: 'trade_log',
      description,
      status: 'error',
      data: `I tried to log the trade but the database rejected it: ${logErr.message}`,
      sources: [],
      executionTime: Date.now() - start,
      model: 'gemini-2.5-flash',
      error: logErr.message,
    };
  }

  // Update positions
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
    // sell or trim
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
    agent: 'trade_log',
    description,
    status: 'success',
    data: confirmation,
    sources: [],
    executionTime: Date.now() - start,
    model: 'gemini-2.5-flash',
  };
}

async function runResearchAgent(
  tool: ToolCall,
  portfolioContext: string,
  exchange: ExchangeContext,
  isDeepAvailable: boolean
): Promise<AgentResult> {
  const agent = classify(tool.name);
  const description = describeToolCall(tool.name, tool.arguments);
  const userMessage = argsToUserMessage(tool.name, tool.arguments);
  const systemPrompt = systemPromptFor(agent, portfolioContext, exchange);

  const isResearch = agent !== 'portfolio';
  const primary: GeminiV2Model = isResearch && isDeepAvailable ? 'gemini-2.5-pro' : 'gemini-2.5-flash';
  const enableSearch = isResearch;

  const start = Date.now();

  const tryCall = async (model: GeminiV2Model) => {
    return callGeminiV2({
      model,
      systemPrompt,
      userMessage,
      enableSearchGrounding: enableSearch,
      temperature: 0.55,
      maxOutputTokens: 3072,
    });
  };

  let usedModel: GeminiV2Model = primary;
  try {
    const res = await tryCall(primary);
    return {
      agent,
      description,
      status: 'success',
      data: res.text,
      sources: res.sources,
      executionTime: Date.now() - start,
      model: usedModel,
    };
  } catch (err) {
    const status = (err as Error & { status?: number }).status;
    if (isRetryableGeminiStatus(status)) {
      await waitWithJitter(2000);
      try {
        const res = await tryCall(primary);
        return {
          agent,
          description,
          status: 'success',
          data: res.text,
          sources: res.sources,
          executionTime: Date.now() - start,
          model: usedModel,
        };
      } catch (err2) {
        const status2 = (err2 as Error & { status?: number }).status;
        if (isRetryableGeminiStatus(status2) && primary === 'gemini-2.5-pro') {
          try {
            await waitWithJitter(2000);
            usedModel = 'gemini-2.5-flash';
            const res = await tryCall('gemini-2.5-flash');
            return {
              agent,
              description,
              status: 'success',
              data: res.text,
              sources: res.sources,
              executionTime: Date.now() - start,
              model: usedModel,
            };
          } catch (err3) {
            const msg = safeAgentError(err3);
            return {
              agent,
              description,
              status: 'error',
              data: '',
              sources: [],
              executionTime: Date.now() - start,
              model: usedModel,
              error: msg,
            };
          }
        }
        const msg = safeAgentError(err2);
        return {
          agent,
          description,
          status: 'error',
          data: '',
          sources: [],
          executionTime: Date.now() - start,
          model: usedModel,
          error: msg,
        };
      }
    }
    const msg = safeAgentError(err);
    return {
      agent,
      description,
      status: 'error',
      data: '',
      sources: [],
      executionTime: Date.now() - start,
      model: usedModel,
      error: msg,
    };
  }
}

function summarize(data: string): string {
  const trimmed = data.trim().replace(/\s+/g, ' ');
  if (!trimmed) return 'completed';
  return trimmed.slice(0, 140) + (trimmed.length > 140 ? '…' : '');
}

export interface ExecuteAgentsContext {
  portfolioContext: string;
  exchange: ExchangeContext;
  isDeepAvailable: boolean;
  supabase: SupabaseClient;
  userId: string;
  userMessage: string;
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

    let result: AgentResult;
    if (tool.name === 'log_trade') {
      result = await handleLogTrade(
        tool.arguments,
        ctx.supabase,
        ctx.userId,
        ctx.userMessage,
        ctx.exchange
      );
    } else {
      result = await runResearchAgent(
        tool,
        ctx.portfolioContext,
        ctx.exchange,
        ctx.isDeepAvailable
      );
    }

    if (result.status === 'success') {
      onEvent({ type: 'agent_complete', agent, summary: summarize(result.data) });
    } else {
      onEvent({ type: 'agent_error', agent, error: result.error ?? 'unknown error' });
    }
    return result;
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
      const msg = safeAgentError(s.reason);
      results.push({
        agent,
        description: describeToolCall(tool.name, tool.arguments),
        status: 'error',
        data: '',
        sources: [],
        executionTime: 0,
        model: 'gemini-2.5-flash',
        error: msg,
      });
    }
  }
  return results;
}
