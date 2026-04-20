import type { ModelTier } from './client';

interface TierRouteInput {
  mode: string;
  controls?: {
    depth?: string;
    analysisType?: string;
    focus?: string;
  };
}

const DEEP_ANALYSIS_TYPES = ['fundamentals', 'peers', 'valuation', 'portfolio_report'];

export function routeToTier(input: TierRouteInput): ModelTier {
  const { mode, controls } = input;

  if (mode === 'screen' && controls?.depth === 'deep') return 'deep';

  if (mode === 'analyze' && controls?.analysisType) {
    if (DEEP_ANALYSIS_TYPES.includes(controls.analysisType)) return 'deep';
  }

  if (mode === 'brief' && controls?.focus === 'portfolio_health') return 'deep';

  return 'standard';
}
