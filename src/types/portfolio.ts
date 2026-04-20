export type RiskTolerance = 'conservative' | 'moderate' | 'aggressive';
export type PositionStatus = 'open' | 'closed';
export type JournalAction = 'buy' | 'sell' | 'add' | 'trim' | 'pass';

export interface Profile {
  id: string;
  display_name: string | null;
  risk_tolerance: RiskTolerance;
  smsf_name: string | null;
  investment_strategy: string | null;
  sectors_of_interest: string[] | null;
  cash_available: number;
  created_at: string;
  updated_at: string;
}

export interface Position {
  id: string;
  user_id: string;
  ticker: string;
  exchange: string;
  company_name: string | null;
  shares: number;
  cost_basis: number;
  date_acquired: string | null;
  thesis: string | null;
  status: PositionStatus;
  closed_at: string | null;
  close_price: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface WatchlistItem {
  id: string;
  user_id: string;
  ticker: string;
  exchange: string;
  company_name: string | null;
  target_price: number | null;
  notes: string | null;
  source: string;
  created_at: string;
}

export interface JournalEntry {
  id: string;
  user_id: string;
  position_id: string | null;
  action: JournalAction;
  ticker: string;
  shares: number | null;
  price: number | null;
  reasoning: string | null;
  cerna_recommendation: string | null;
  outcome_notes: string | null;
  created_at: string;
}
