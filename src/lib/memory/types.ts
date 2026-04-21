export type MemoryCategory =
  | 'preference'
  | 'goal'
  | 'concern'
  | 'interest'
  | 'context'
  | 'behavioral'
  | 'learning'
  | 'feedback';

export interface MemoryEntry {
  id: string;
  category: MemoryCategory;
  content: string;
  confidence: number;
  firstObserved: string;
  lastConfirmed: string;
  timesReferenced: number;
}

export type DecisionType =
  | 'buy'
  | 'sell'
  | 'hold'
  | 'avoid'
  | 'watch'
  | 'trim'
  | 'add'
  | 'rebalance';

export type DecisionConfidence = 'low' | 'medium' | 'high';

export type OutcomeStatus = 'pending' | 'correct' | 'incorrect' | 'mixed' | 'expired';

export interface Decision {
  id: string;
  sessionId: string | null;
  decisionType: DecisionType;
  ticker: string;
  reasoning: string;
  priceAtDecision: number | null;
  targetPrice: number | null;
  stopLoss: number | null;
  timeframe: string | null;
  confidence: DecisionConfidence | null;
  outcomeStatus: OutcomeStatus;
  priceAtReview: number | null;
  returnPct: number | null;
  outcomeNotes: string | null;
  reviewedAt: string | null;
  userActed: boolean;
  userAction: string | null;
  userActionDate: string | null;
  createdAt: string;
}

export type AlertType =
  | 'earnings_upcoming'
  | 'price_target_hit'
  | 'significant_move'
  | 'decision_review'
  | 'concentration_warning'
  | 'behavioral_nudge'
  | 'market_event';

export type AlertPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface ProactiveAlert {
  id: string;
  alertType: AlertType;
  title: string;
  body: string;
  ticker: string | null;
  priority: AlertPriority;
  isRead: boolean;
  isDismissed: boolean;
  expiresAt: string | null;
  createdAt: string;
}

export interface SessionSummaryRecord {
  id: string;
  sessionId: string;
  summary: string;
  topics: string[];
  tickersDiscussed: string[];
  sentiment: 'bullish' | 'bearish' | 'neutral' | 'mixed' | 'concerned' | null;
  createdAt: string;
}

export interface IntelligenceContext {
  memory: string;
  decisions: string;
  sessions: string;
  behavioral: string;
  alerts: string;
  full: string;
}

export interface BehavioralInsight {
  pattern: string;
  evidence: string;
  confidence: number;
}
