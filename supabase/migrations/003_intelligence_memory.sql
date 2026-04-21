-- User memory document (structured intelligence about the user)
CREATE TABLE IF NOT EXISTS user_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'preference',
    'goal',
    'concern',
    'interest',
    'context',
    'behavioral',
    'learning',
    'feedback'
  )),
  content TEXT NOT NULL,
  confidence REAL DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  source_session_id UUID,
  first_observed TIMESTAMPTZ DEFAULT now(),
  last_confirmed TIMESTAMPTZ DEFAULT now(),
  times_referenced INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, category, content)
);

-- Decision tracking (every recommendation the agent makes)
CREATE TABLE IF NOT EXISTS decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  session_id UUID,
  decision_type TEXT NOT NULL CHECK (decision_type IN (
    'buy', 'sell', 'hold', 'avoid', 'watch', 'trim', 'add', 'rebalance'
  )),
  ticker TEXT NOT NULL,
  reasoning TEXT NOT NULL,
  price_at_decision NUMERIC,
  target_price NUMERIC,
  stop_loss NUMERIC,
  timeframe TEXT,
  confidence TEXT CHECK (confidence IN ('low', 'medium', 'high')),

  -- Outcome tracking
  outcome_status TEXT DEFAULT 'pending' CHECK (outcome_status IN (
    'pending', 'correct', 'incorrect', 'mixed', 'expired'
  )),
  price_at_review NUMERIC,
  return_pct NUMERIC,
  outcome_notes TEXT,
  reviewed_at TIMESTAMPTZ,

  -- User action tracking
  user_acted BOOLEAN DEFAULT false,
  user_action TEXT,
  user_action_date TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- Session summaries (condensed record of each conversation)
CREATE TABLE IF NOT EXISTS session_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  session_id UUID NOT NULL,
  summary TEXT NOT NULL,
  topics TEXT[] DEFAULT '{}',
  tickers_discussed TEXT[] DEFAULT '{}',
  decisions_made UUID[] DEFAULT '{}',
  sentiment TEXT CHECK (sentiment IN ('bullish', 'bearish', 'neutral', 'mixed', 'concerned')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Proactive alerts (queued notifications)
CREATE TABLE IF NOT EXISTS proactive_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  alert_type TEXT NOT NULL CHECK (alert_type IN (
    'earnings_upcoming',
    'price_target_hit',
    'significant_move',
    'decision_review',
    'concentration_warning',
    'behavioral_nudge',
    'market_event'
  )),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  ticker TEXT,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  is_read BOOLEAN DEFAULT false,
  is_dismissed BOOLEAN DEFAULT false,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS policies
ALTER TABLE user_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE proactive_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own their memory" ON user_memory FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own their decisions" ON decisions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own their summaries" ON session_summaries FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own their alerts" ON proactive_alerts FOR ALL USING (auth.uid() = user_id);

-- Indexes for fast retrieval
CREATE INDEX IF NOT EXISTS idx_user_memory_user_category ON user_memory(user_id, category) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_decisions_user_ticker ON decisions(user_id, ticker);
CREATE INDEX IF NOT EXISTS idx_decisions_pending ON decisions(user_id, outcome_status) WHERE outcome_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_session_summaries_user ON session_summaries(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proactive_alerts_unread ON proactive_alerts(user_id, is_read) WHERE is_read = false AND is_dismissed = false;
