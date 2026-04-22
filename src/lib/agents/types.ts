/**
 * Phase 7B — Agent Backend Types
 */

export type AgentName = 'screen' | 'analyze' | 'brief' | 'portfolio' | 'trade_log';

export type AgentModel = 'gemini-2.5-pro' | 'gemini-2.5-flash';

export interface AgentSource {
  title: string;
  url: string;
  domain: string;
}

export type ScreenStrategy = 'value' | 'growth' | 'dividend' | 'quality' | 'momentum' | 'turnaround';
export type ScreenMarketCap = 'large' | 'mid' | 'small' | 'all';
export type AnalysisType = 'thesis' | 'fundamentals' | 'technical' | 'peers' | 'valuation' | 'full';
export type BriefFocus = 'general' | 'portfolio_relevant' | 'sector' | 'macro' | 'earnings';
export type PortfolioCheckType = 'health' | 'concentration' | 'rebalance' | 'performance' | 'full';

export interface ScreenArgs {
  strategy: ScreenStrategy;
  sector?: string;
  market_cap?: ScreenMarketCap;
  additional_criteria?: string;
}

export interface AnalyzeArgs {
  ticker: string;
  analysis_type: AnalysisType;
  context?: string;
}

export interface BriefArgs {
  focus: BriefFocus;
  sector?: string;
}

export interface PortfolioArgs {
  check_type: PortfolioCheckType;
}

export type ToolName =
  | 'screen_stocks'
  | 'analyze_stock'
  | 'brief_market'
  | 'check_portfolio'
  | 'log_trade';

export type TradeAction = 'buy' | 'sell' | 'add' | 'trim';

export interface LogTradeArgs {
  ticker: string;
  action: TradeAction;
  shares: number;
  price: number;
  exchange?: string;
  currency?: string;
}

export interface ToolCall {
  name: ToolName;
  // Using unknown at boundary — callers narrow by name.
  arguments: Record<string, unknown>;
}

export interface OrchestratorPlan {
  directResponse?: string;
  toolCalls: ToolCall[];
}

export interface PlannedAgent {
  name: AgentName;
  description: string;
  tool: ToolCall;
}

export interface AgentResult {
  agent: AgentName;
  description: string;
  status: 'success' | 'error';
  data: string;
  sources: AgentSource[];
  executionTime: number;
  model: AgentModel;
  error?: string;
}

export type AgentEvent =
  | { type: 'agent_start'; agent: AgentName; description: string }
  | { type: 'agent_complete'; agent: AgentName; summary: string; sources?: AgentSource[] }
  | { type: 'agent_error'; agent: AgentName; error: string };

export interface PortfolioContextPayload {
  text: string;
  tickers: string[];
}
