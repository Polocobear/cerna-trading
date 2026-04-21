import type { Position, Profile, WatchlistItem } from '@/types/portfolio';
import type { ModeControls, SonarMode } from '@/types/chat';
import { buildScreenPrompt } from '@/features/modes/screen/screen-prompt';
import { buildAnalyzePrompt } from '@/features/modes/analyze/analyze-prompt';
import { buildBriefPrompt } from '@/features/modes/brief/brief-prompt';
import { buildAskPrompt, classifyAskIntent } from '@/features/modes/ask/ask-prompt';

interface PromptInput {
  mode: SonarMode;
  controls?: ModeControls;
  message?: string;
  portfolio: Position[];
  watchlist: WatchlistItem[];
  profile: Profile | null;
}

export function buildSystemPrompt(input: PromptInput): string {
  const { mode, controls = {}, message, portfolio, watchlist, profile } = input;

  switch (mode) {
    case 'screen':
      return buildScreenPrompt(portfolio, controls);
    case 'analyze':
      return buildAnalyzePrompt(portfolio, controls);
    case 'brief':
      return buildBriefPrompt(portfolio, watchlist, controls);
    case 'ask': {
      const intent = classifyAskIntent(message ?? '');
      return buildAskPrompt(portfolio, profile, intent);
    }
  }
}

export function buildDefaultUserMessage(mode: SonarMode, controls: ModeControls = {}): string {
  switch (mode) {
    case 'screen': {
      const sector = controls.sector && controls.sector !== 'All' ? controls.sector : 'any sector';
      const cap = controls.marketCap && controls.marketCap !== 'All' ? controls.marketCap : 'any market cap';
      return `Find undervalued stocks in ${sector} with ${cap} market cap.`;
    }
    case 'analyze': {
      const ticker = controls.ticker?.toUpperCase() ?? '';
      const type = controls.analysisType ?? 'thesis';
      return `Analyze ${ticker} — ${type}.`;
    }
    case 'brief':
      return `Give me a ${controls.depth === 'deep' ? 'full' : 'quick'} morning brief on my ${controls.scope ?? 'holdings'}.`;
    case 'ask':
      return '';
  }
}
