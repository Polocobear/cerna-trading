export type Mode = 'screen' | 'analyze' | 'brief' | 'portfolio' | 'ask';
export type SonarMode = Exclude<Mode, 'portfolio'>;

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
  sector?: string;
  marketCap?: string;
  depth?: 'quick' | 'deep';
  ticker?: string;
  analysisType?: 'thesis' | 'peers' | 'fundamentals';
  scope?: 'holdings' | 'watchlist';
}

export interface ChatRequest {
  mode: SonarMode;
  controls?: ModeControls;
  message?: string;
  sessionId: string;
}
