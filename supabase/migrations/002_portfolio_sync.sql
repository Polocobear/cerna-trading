-- Phase 8: Portfolio Sync + Exchange Generalization

-- Extend profiles with exchange/currency preferences + IB connection flag
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferred_exchange TEXT DEFAULT 'ASX';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferred_currency TEXT DEFAULT 'AUD';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ib_connected BOOLEAN DEFAULT false;

-- Extend positions with currency (exchange already exists)
ALTER TABLE positions ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'AUD';

-- Extend watchlist with currency (exchange already exists)
ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'AUD';

-- IB connections (one per user)
CREATE TABLE ib_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  flex_token TEXT NOT NULL,
  activity_query_id TEXT NOT NULL,
  trade_confirm_query_id TEXT,
  last_activity_sync TIMESTAMPTZ,
  last_trade_sync TIMESTAMPTZ,
  sync_status TEXT DEFAULT 'pending' CHECK (sync_status IN ('pending','syncing','success','error')),
  sync_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Logged trades (chat / flex / csv / manual)
CREATE TABLE logged_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  ticker TEXT NOT NULL,
  exchange TEXT,
  action TEXT NOT NULL CHECK (action IN ('buy','sell','add','trim')),
  shares NUMERIC NOT NULL,
  price NUMERIC NOT NULL,
  currency TEXT DEFAULT 'USD',
  logged_via TEXT NOT NULL CHECK (logged_via IN ('chat','flex_activity','flex_trade_confirm','csv','manual')),
  reconciled BOOLEAN DEFAULT false,
  raw_message TEXT,
  trade_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sync history
CREATE TABLE sync_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  sync_type TEXT NOT NULL CHECK (sync_type IN ('flex_activity','flex_trade_confirm','chat_trade','csv_import')),
  status TEXT NOT NULL CHECK (status IN ('success','partial','error')),
  positions_updated INT DEFAULT 0,
  trades_imported INT DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chat sessions (fixes Phase 7C deviation)
CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE ib_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE logged_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_data" ON ib_connections FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_data" ON logged_trades FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_data" ON sync_history FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_data" ON chat_sessions FOR ALL USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_logged_trades_user_ticker ON logged_trades(user_id, ticker);
CREATE INDEX idx_logged_trades_reconciled ON logged_trades(user_id, reconciled) WHERE reconciled = false;
CREATE INDEX idx_sync_history_user ON sync_history(user_id, created_at DESC);
CREATE INDEX idx_chat_sessions_user ON chat_sessions(user_id, updated_at DESC);
