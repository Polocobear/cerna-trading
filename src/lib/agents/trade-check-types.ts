import type { AgentSource } from './types';
import type { AgentContext } from '@/lib/memory/context-builder';

export type TradeCheckStepId =
  | 'screen'
  | 'fundamentals'
  | 'catalyst'
  | 'portfolio_fit'
  | 'verdict';

export type TradeCheckSignal = 'go' | 'caution' | 'stop';
export type TradeCheckStatus = 'idle' | 'running' | 'awaiting_input' | 'complete' | 'error' | 'skipped';
export type TradeCheckVerdict = 'GO' | 'NO_GO' | 'CONDITIONAL';
export type TradeCheckConviction = 'low' | 'medium' | 'high';
export type UserTradeCheckAction =
  | 'continue'
  | 'challenge'
  | 'bail'
  | 'skip'
  | 'question'
  | 'resize';

export type TradeCheckRequestedAction = 'buy' | 'sell' | 'add' | 'trim' | 'hold' | 'unknown';

export interface TradeCheckBaseResult {
  headline: string;
  summary: string;
  signal: TradeCheckSignal;
  keyPoints: string[];
  riskFlags: string[];
}

export interface TradeCheckScreenResult extends TradeCheckBaseResult {
  passesInitialScreen: boolean;
  setupView: string;
  liquidityView: string;
  whyNow: string;
}

export interface TradeCheckFundamentalsResult extends TradeCheckBaseResult {
  qualityScore: number | null;
  valuationView: 'cheap' | 'fair' | 'stretched' | 'unclear';
  balanceSheetView: string;
  earningsView: string;
  whatNeedsToBeTrue: string;
}

export interface TradeCheckCatalystResult extends TradeCheckBaseResult {
  timingWindow: string;
  nearTermCatalysts: string[];
  whatCouldBreakMomentum: string;
}

export interface TradeCheckPortfolioFitResult extends TradeCheckBaseResult {
  fitScore: number | null;
  suggestedSizePct: number | null;
  suggestedSizeAmount: number | null;
  sizingNote: string;
  diversificationImpact: string;
}

export interface TradeCheckVerdictResult {
  headline: string;
  verdict: TradeCheckVerdict;
  conviction: TradeCheckConviction;
  summary: string;
  positionSizing: string;
  timeframe: string;
  entryStrategy: string[];
  invalidationTriggers: string[];
  watchFor: string[];
  finalCall: string;
}

export type TradeCheckStepResult =
  | TradeCheckScreenResult
  | TradeCheckFundamentalsResult
  | TradeCheckCatalystResult
  | TradeCheckPortfolioFitResult
  | TradeCheckVerdictResult;

export interface TradeCheckStepState {
  id: TradeCheckStepId;
  title: string;
  status: TradeCheckStatus;
  result?: TradeCheckStepResult;
  gateMessage?: string;
  error?: string;
  sources?: AgentSource[];
  stage?: string;
  startedAt?: string;
  completedAt?: string;
  runId?: string;
  publicAccessToken?: string;
}

export interface TradeCheckState {
  active: boolean;
  ticker: string;
  requestedAction: TradeCheckRequestedAction;
  userMessage: string;
  currentStep: TradeCheckStepId;
  awaitingUserInput: boolean;
  challengeNotes: Partial<Record<TradeCheckStepId, string[]>>;
  questions: string[];
  resizePreferencePct: number | null;
  resizePreferenceAmount: number | null;
  steps: Record<TradeCheckStepId, TradeCheckStepState>;
  startedAt: string;
  completedAt?: string;
}

export interface TradeCheckResponseClassification {
  action: UserTradeCheckAction;
  reason: string;
  challengeNote?: string;
  question?: string;
  resizePct?: number | null;
  resizeAmount?: number | null;
}

export interface TradeCheckInit {
  ticker: string;
  requestedAction: TradeCheckRequestedAction;
  userMessage: string;
}

export function createTradeCheckSteps(): Record<TradeCheckStepId, TradeCheckStepState> {
  return {
    screen: { id: 'screen', title: 'Quick screen', status: 'idle', sources: [] },
    fundamentals: { id: 'fundamentals', title: 'Fundamentals', status: 'idle', sources: [] },
    catalyst: { id: 'catalyst', title: 'Catalysts', status: 'idle', sources: [] },
    portfolio_fit: { id: 'portfolio_fit', title: 'Portfolio fit', status: 'idle', sources: [] },
    verdict: { id: 'verdict', title: 'Final verdict', status: 'idle', sources: [] },
  };
}

export function createTradeCheckState(init: TradeCheckInit): TradeCheckState {
  return {
    active: true,
    ticker: init.ticker,
    requestedAction: init.requestedAction,
    userMessage: init.userMessage,
    currentStep: 'screen',
    awaitingUserInput: false,
    challengeNotes: {},
    questions: [],
    resizePreferencePct: null,
    resizePreferenceAmount: null,
    steps: createTradeCheckSteps(),
    startedAt: new Date().toISOString(),
  };
}

export function tradeCheckStepIds(): TradeCheckStepId[] {
  return ['screen', 'fundamentals', 'catalyst', 'portfolio_fit', 'verdict'];
}

export function nextTradeCheckStep(step: TradeCheckStepId): TradeCheckStepId | null {
  const steps = tradeCheckStepIds();
  const index = steps.indexOf(step);
  if (index < 0 || index === steps.length - 1) return null;
  return steps[index + 1] ?? null;
}

export interface TradeCheckTaskPayload {
  userId: string;
  ticker: string;
  requestedAction: TradeCheckRequestedAction;
  context: AgentContext;
  extraContext?: string;
}

export interface TradeCheckTaskOutput<T> {
  success: boolean;
  result: T | null;
  sources: AgentSource[];
  error?: string;
}
