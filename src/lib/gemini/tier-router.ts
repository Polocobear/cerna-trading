import type { ModelTier } from './client';

interface TierRouteInput {
  mode: string;
  controls?: {
    depth?: string;
    analysisType?: string;
  };
}

export function routeToTier(input: TierRouteInput): ModelTier {
  const { mode, controls } = input;

  if (mode === 'screen' && controls?.depth === 'deep') return 'deep';
  if (mode === 'analyze' && controls?.analysisType === 'fundamentals') return 'deep';
  // Ask/DECIDE handled in route after intent classification

  return 'standard';
}
