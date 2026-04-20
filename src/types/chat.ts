export type Mode = 'screen' | 'analyze' | 'brief' | 'portfolio' | 'ask';
export type SonarMode = Exclude<Mode, 'portfolio'>;

export type ScreenStrategy =
  | 'value'
  | 'growth'
  | 'dividend'
  | 'quality'
  | 'momentum'
  | 'turnaround'
  | 'custom';

export type AnalysisType =
  | 'thesis'
  | 'fundamentals'
  | 'technical'
  | 'analyst'
  | 'peers'
  | 'valuation'
  | 'portfolio_report';

export type BriefFocus =
  | 'everything'
  | 'earnings'
  | 'news'
  | 'macro'
  | 'analyst'
  | 'dividends'
  | 'portfolio_health';

export interface Citation {
  url: string;
  title?: string;
  snippet?: string;
  domain?: string;
  favicon?: string;
}

export interface ChatMessage {
  id: string;
  user_id: string;
  session_id: string;
  mode: Mode;
  role: 'user' | 'assistant';
  content: string;
  citations: Citation[] | null;
  created_at: string;
}

export interface ModeControls {
  // Shared
  depth?: 'quick' | 'deep';

  // Screen
  sector?: string;
  marketCap?: string;
  strategy?: ScreenStrategy;
  maxPE?: number;
  maxPB?: number;
  maxPEG?: number;
  minEPSGrowth?: number;
  minRevenueGrowth?: number;
  minDividendYield?: number;
  maxPayoutRatio?: number;
  maxDebtEquity?: number;
  minROE?: number;
  positiveFCF?: boolean;
  minAnalystConsensus?: 'any' | 'strong_buy' | 'buy' | 'hold';
  minPriceTargetUpside?: number;
  above200MA?: boolean;
  above50MA?: boolean;
  rsiRange?: 'any' | 'oversold' | 'neutral' | 'overbought';

  // Analyze
  ticker?: string;
  analysisType?: AnalysisType;

  // Brief
  scope?: 'holdings' | 'watchlist';
  focus?: BriefFocus;
}

export interface ChatRequest {
  mode: SonarMode;
  controls?: ModeControls;
  message?: string;
  sessionId: string;
}
