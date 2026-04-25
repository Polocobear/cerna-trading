import {
  callClaude,
  CLAUDE_HAIKU,
  CLAUDE_SONNET,
  parseClaudeJson,
} from '@/lib/claude/client';
import type { AgentContext } from '@/lib/memory/context-builder';
import type { AgentSource } from './types';
import { safeAgentError } from './executor';
import {
  buildTradeCheckCatalystPrompt,
  buildTradeCheckClassifierPrompt,
  buildTradeCheckFundamentalsPrompt,
  buildTradeCheckGateMessagePrompt,
  buildTradeCheckPortfolioFitPrompt,
  buildTradeCheckScreenPrompt,
  buildTradeCheckVerdictPrompt,
} from './prompts';
import type {
  TradeCheckCatalystResult,
  TradeCheckFundamentalsResult,
  TradeCheckPortfolioFitResult,
  TradeCheckRequestedAction,
  TradeCheckResponseClassification,
  TradeCheckScreenResult,
  TradeCheckState,
  TradeCheckVerdictResult,
} from './trade-check-types';

interface TradeCheckExecutorContext {
  ticker: string;
  requestedAction: TradeCheckRequestedAction;
  context: AgentContext;
  extraContext?: string;
}

interface TradeCheckExecutionResult<T> {
  success: boolean;
  result: T | null;
  sources: AgentSource[];
  error?: string;
}

function ensureString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function ensureStringArray(value: unknown, fallback: string[] = []): string[] {
  if (!Array.isArray(value)) return fallback;
  const normalized = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
  return normalized.length > 0 ? normalized : fallback;
}

function ensureSignal(value: unknown): 'go' | 'caution' | 'stop' {
  if (value === 'go' || value === 'caution' || value === 'stop') return value;
  return 'caution';
}

function ensureVerdict(value: unknown): 'GO' | 'NO_GO' | 'CONDITIONAL' {
  if (value === 'GO' || value === 'NO_GO' || value === 'CONDITIONAL') return value;
  return 'CONDITIONAL';
}

function ensureConviction(value: unknown): 'low' | 'medium' | 'high' {
  if (value === 'low' || value === 'medium' || value === 'high') return value;
  return 'medium';
}

function ensureNullableNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(/[%,$,\s]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseScreenResult(value: unknown): TradeCheckScreenResult | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  return {
    headline: ensureString(raw.headline, 'Initial screen complete'),
    summary: ensureString(raw.summary, 'I ran a quick first-pass screen on the idea.'),
    signal: ensureSignal(raw.signal),
    passesInitialScreen: Boolean(raw.passesInitialScreen),
    setupView: ensureString(raw.setupView, 'The setup needs more work.'),
    liquidityView: ensureString(raw.liquidityView, 'Liquidity is not fully clear from the first pass.'),
    whyNow: ensureString(raw.whyNow, 'Timing is not yet compelling.'),
    keyPoints: ensureStringArray(raw.keyPoints, []),
    riskFlags: ensureStringArray(raw.riskFlags, []),
  };
}

export function parseFundamentalsResult(value: unknown): TradeCheckFundamentalsResult | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const valuationView =
    raw.valuationView === 'cheap' ||
    raw.valuationView === 'fair' ||
    raw.valuationView === 'stretched' ||
    raw.valuationView === 'unclear'
      ? raw.valuationView
      : 'unclear';

  return {
    headline: ensureString(raw.headline, 'Fundamentals reviewed'),
    summary: ensureString(raw.summary, 'I reviewed the core financial picture.'),
    signal: ensureSignal(raw.signal),
    qualityScore: ensureNullableNumber(raw.qualityScore),
    valuationView,
    balanceSheetView: ensureString(raw.balanceSheetView, 'Balance sheet quality is mixed.'),
    earningsView: ensureString(raw.earningsView, 'Earnings support is mixed.'),
    whatNeedsToBeTrue: ensureString(
      raw.whatNeedsToBeTrue,
      'The company needs to execute cleanly for the trade to work.'
    ),
    keyPoints: ensureStringArray(raw.keyPoints, []),
    riskFlags: ensureStringArray(raw.riskFlags, []),
  };
}

export function parseCatalystResult(value: unknown): TradeCheckCatalystResult | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  return {
    headline: ensureString(raw.headline, 'Catalysts reviewed'),
    summary: ensureString(raw.summary, 'I reviewed the near-term drivers for the stock.'),
    signal: ensureSignal(raw.signal),
    timingWindow: ensureString(raw.timingWindow, 'Timing is still unclear.'),
    nearTermCatalysts: ensureStringArray(raw.nearTermCatalysts, []),
    whatCouldBreakMomentum: ensureString(
      raw.whatCouldBreakMomentum,
      'Execution or sentiment could undercut the setup.'
    ),
    keyPoints: ensureStringArray(raw.keyPoints, []),
    riskFlags: ensureStringArray(raw.riskFlags, []),
  };
}

function parsePortfolioFitResult(value: unknown): TradeCheckPortfolioFitResult | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  return {
    headline: ensureString(raw.headline, 'Portfolio fit reviewed'),
    summary: ensureString(raw.summary, 'I checked the fit against the current portfolio.'),
    signal: ensureSignal(raw.signal),
    fitScore: ensureNullableNumber(raw.fitScore),
    suggestedSizePct: ensureNullableNumber(raw.suggestedSizePct),
    suggestedSizeAmount: ensureNullableNumber(raw.suggestedSizeAmount),
    sizingNote: ensureString(raw.sizingNote, 'Position size should stay disciplined.'),
    diversificationImpact: ensureString(
      raw.diversificationImpact,
      'The diversification impact is neutral to slightly negative.'
    ),
    keyPoints: ensureStringArray(raw.keyPoints, []),
    riskFlags: ensureStringArray(raw.riskFlags, []),
  };
}

function parseVerdictResult(value: unknown): TradeCheckVerdictResult | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  return {
    headline: ensureString(raw.headline, 'Checklist verdict'),
    verdict: ensureVerdict(raw.verdict),
    conviction: ensureConviction(raw.conviction),
    summary: ensureString(raw.summary, 'Here is the final checklist call.'),
    positionSizing: ensureString(raw.positionSizing, 'Keep position sizing measured.'),
    timeframe: ensureString(raw.timeframe, 'Act only within a defined review window.'),
    entryStrategy: ensureStringArray(raw.entryStrategy, []),
    invalidationTriggers: ensureStringArray(raw.invalidationTriggers, []),
    watchFor: ensureStringArray(raw.watchFor, []),
    finalCall: ensureString(raw.finalCall, 'Only act if the checklist still holds at entry time.'),
  };
}

function parseClassification(value: unknown, userMessage: string): TradeCheckResponseClassification | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const action =
    raw.action === 'continue' ||
    raw.action === 'challenge' ||
    raw.action === 'bail' ||
    raw.action === 'skip' ||
    raw.action === 'question' ||
    raw.action === 'resize'
      ? raw.action
      : null;

  if (!action) return null;

  return {
    action,
    reason: ensureString(raw.reason, userMessage.trim()),
    challengeNote: typeof raw.challengeNote === 'string' ? raw.challengeNote.trim() || undefined : undefined,
    question: typeof raw.question === 'string' ? raw.question.trim() || undefined : undefined,
    resizePct: ensureNullableNumber(raw.resizePct),
    resizeAmount: ensureNullableNumber(raw.resizeAmount),
  };
}

function fallbackClassification(userMessage: string): TradeCheckResponseClassification {
  const normalized = userMessage.trim().toLowerCase();
  const percentMatch = normalized.match(/(\d+(?:\.\d+)?)\s*%/);
  const dollarMatch = normalized.match(/\$?\s*([0-9][0-9,]*(?:\.\d+)?)(?:\s*(k|m))?/);

  if (/\b(stop|bail|leave it there|enough|never mind|cancel)\b/.test(normalized)) {
    return { action: 'bail', reason: 'User wants to stop.' };
  }
  if (/\b(skip|pass this step|skip this)\b/.test(normalized)) {
    return { action: 'skip', reason: 'User wants to skip the current step.' };
  }
  if (percentMatch || /\b(size|sizing|smaller|bigger|too big|too small|weight)\b/.test(normalized)) {
    let resizeAmount: number | null = null;
    if (dollarMatch) {
      const base = Number(dollarMatch[1].replace(/,/g, ''));
      const multiplier =
        dollarMatch[2] === 'm' ? 1_000_000 : dollarMatch[2] === 'k' ? 1_000 : 1;
      resizeAmount = Number.isFinite(base) ? base * multiplier : null;
    }
    return {
      action: 'resize',
      reason: 'User wants to change the size.',
      resizePct: percentMatch ? Number(percentMatch[1]) : null,
      resizeAmount,
    };
  }
  if (/\?$/.test(normalized) || /^(why|what|how|when|where)\b/.test(normalized)) {
    return { action: 'question', reason: 'User asked a question.', question: userMessage.trim() };
  }
  if (/\b(disagree|challenge|wrong|missed|but|however|not sure|too harsh|too soft)\b/.test(normalized)) {
    return {
      action: 'challenge',
      reason: 'User is challenging the conclusion.',
      challengeNote: userMessage.trim(),
    };
  }
  if (/\b(continue|go on|next|proceed|sounds good|okay|ok|yep|yes)\b/.test(normalized)) {
    return { action: 'continue', reason: 'User wants to continue.' };
  }

  return { action: 'question', reason: 'Defaulted to clarification request.', question: userMessage.trim() };
}

async function executeStructuredClaude<T>(options: {
  model: typeof CLAUDE_HAIKU | typeof CLAUDE_SONNET;
  systemPrompt: string;
  userMessage: string;
  useWebSearch?: boolean;
  webSearchMaxUses?: number;
  maxTokens?: number;
  thinkingBudget?: number;
  parser: (value: unknown) => T | null;
}): Promise<TradeCheckExecutionResult<T>> {
  try {
    const response = await callClaude({
      model: options.model,
      systemPrompt: options.systemPrompt,
      userMessage: options.userMessage,
      useWebSearch: options.useWebSearch ?? false,
      webSearchMaxUses: options.webSearchMaxUses ?? 3,
      maxTokens: options.maxTokens ?? 4096,
      thinkingBudget: options.thinkingBudget ?? 0,
      temperature: 1,
    });

    const parsed = options.parser(parseClaudeJson<unknown>(response.text));
    if (!parsed) {
      return {
        success: false,
        result: null,
        sources: response.sources,
        error: 'The model returned an invalid checklist result.',
      };
    }

    return {
      success: true,
      result: parsed,
      sources: response.sources,
    };
  } catch (error) {
    return {
      success: false,
      result: null,
      sources: [],
      error: safeAgentError(error),
    };
  }
}

export async function executeScreenStep(
  options: TradeCheckExecutorContext
): Promise<TradeCheckExecutionResult<TradeCheckScreenResult>> {
  return executeStructuredClaude({
    model: CLAUDE_HAIKU,
    systemPrompt: buildTradeCheckScreenPrompt({
      ticker: options.ticker,
      requestedAction: options.requestedAction,
      portfolioContext: options.context.portfolioContext,
      exchange: options.context.exchangeCtx,
      userContext: options.context.userContext,
      extraContext: options.extraContext,
    }),
    userMessage: `Run the quick screen for ${options.ticker}.`,
    useWebSearch: true,
    webSearchMaxUses: 2,
    maxTokens: 4096,
    thinkingBudget: 0,
    parser: parseScreenResult,
  });
}

export async function executePortfolioFitStep(
  options: TradeCheckExecutorContext
): Promise<TradeCheckExecutionResult<TradeCheckPortfolioFitResult>> {
  return executeStructuredClaude({
    model: CLAUDE_HAIKU,
    systemPrompt: buildTradeCheckPortfolioFitPrompt({
      ticker: options.ticker,
      requestedAction: options.requestedAction,
      portfolioContext: options.context.portfolioContext,
      exchange: options.context.exchangeCtx,
      userContext: options.context.userContext,
      extraContext: options.extraContext,
    }),
    userMessage: `Evaluate the portfolio fit for ${options.ticker}.`,
    maxTokens: 4096,
    parser: parsePortfolioFitResult,
  });
}

export async function executeVerdictStep(
  options: TradeCheckExecutorContext
): Promise<TradeCheckExecutionResult<TradeCheckVerdictResult>> {
  return executeStructuredClaude({
    model: CLAUDE_SONNET,
    systemPrompt: buildTradeCheckVerdictPrompt({
      ticker: options.ticker,
      requestedAction: options.requestedAction,
      portfolioContext: options.context.portfolioContext,
      exchange: options.context.exchangeCtx,
      userContext: options.context.userContext,
      extraContext: options.extraContext,
    }),
    userMessage: `Give the final checklist verdict for ${options.ticker}.`,
    maxTokens: 6144,
    thinkingBudget: 2048,
    parser: parseVerdictResult,
  });
}

export async function classifyUserResponse(
  userMessage: string
): Promise<TradeCheckResponseClassification> {
  try {
    const response = await callClaude({
      model: CLAUDE_HAIKU,
      systemPrompt: buildTradeCheckClassifierPrompt(),
      userMessage,
      maxTokens: 1024,
      thinkingBudget: 0,
      temperature: 1,
      useWebSearch: false,
    });
    const parsed = parseClassification(parseClaudeJson<unknown>(response.text), userMessage);
    return parsed ?? fallbackClassification(userMessage);
  } catch {
    return fallbackClassification(userMessage);
  }
}

export async function generateGateMessage(options: {
  stepId: TradeCheckState['currentStep'];
  state: TradeCheckState;
  userReply?: string;
  classification?: TradeCheckResponseClassification | null;
}): Promise<string> {
  try {
    const response = await callClaude({
      model: CLAUDE_HAIKU,
      systemPrompt: buildTradeCheckGateMessagePrompt(options),
      userMessage: 'Write the next co-pilot message.',
      maxTokens: 1024,
      thinkingBudget: 0,
      temperature: 1,
      useWebSearch: false,
    });
    return ensureString(response.text, 'I have the next step ready when you are.');
  } catch {
    const stepTitle = options.state.steps[options.stepId]?.title ?? 'next step';
    return `I have the ${stepTitle.toLowerCase()} view ready. Say continue to move on, challenge it if you disagree, skip it if you want to move faster, or stop here.`;
  }
}

export async function executeFundamentalsStep(
  options: TradeCheckExecutorContext
): Promise<TradeCheckExecutionResult<TradeCheckFundamentalsResult>> {
  return executeStructuredClaude({
    model: CLAUDE_SONNET,
    systemPrompt: buildTradeCheckFundamentalsPrompt({
      ticker: options.ticker,
      requestedAction: options.requestedAction,
      portfolioContext: options.context.portfolioContext,
      exchange: options.context.exchangeCtx,
      userContext: options.context.userContext,
      extraContext: options.extraContext,
    }),
    userMessage: `Run the fundamentals step for ${options.ticker}.`,
    useWebSearch: true,
    webSearchMaxUses: 6,
    maxTokens: 6144,
    thinkingBudget: 4096,
    parser: parseFundamentalsResult,
  });
}

export async function executeCatalystStep(
  options: TradeCheckExecutorContext
): Promise<TradeCheckExecutionResult<TradeCheckCatalystResult>> {
  return executeStructuredClaude({
    model: CLAUDE_SONNET,
    systemPrompt: buildTradeCheckCatalystPrompt({
      ticker: options.ticker,
      requestedAction: options.requestedAction,
      portfolioContext: options.context.portfolioContext,
      exchange: options.context.exchangeCtx,
      userContext: options.context.userContext,
      extraContext: options.extraContext,
    }),
    userMessage: `Run the catalyst step for ${options.ticker}.`,
    useWebSearch: true,
    webSearchMaxUses: 6,
    maxTokens: 6144,
    thinkingBudget: 4096,
    parser: parseCatalystResult,
  });
}
