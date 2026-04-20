import type { ModeControls, ScreenStrategy } from '@/types/chat';

export type StrategyPreset = Omit<
  ModeControls,
  'depth' | 'sector' | 'marketCap' | 'strategy' | 'ticker' | 'analysisType' | 'scope' | 'focus'
>;

export const STRATEGY_PRESETS: Record<Exclude<ScreenStrategy, 'custom'>, StrategyPreset> = {
  value: {
    maxPE: 15,
    maxPB: 1.5,
    maxPEG: 1.0,
    minDividendYield: 2,
    maxDebtEquity: 1.0,
    minROE: 10,
  },
  growth: {
    minEPSGrowth: 15,
    minRevenueGrowth: 10,
    maxPEG: 2.0,
    minROE: 12,
    positiveFCF: true,
  },
  dividend: {
    minDividendYield: 4,
    maxPayoutRatio: 80,
    maxDebtEquity: 0.8,
    positiveFCF: true,
    minROE: 8,
  },
  quality: {
    minROE: 15,
    maxDebtEquity: 0.5,
    positiveFCF: true,
    minEPSGrowth: 5,
    maxPayoutRatio: 70,
  },
  momentum: {
    above200MA: true,
    above50MA: true,
    rsiRange: 'neutral',
    minAnalystConsensus: 'buy',
  },
  turnaround: {
    maxPE: 20,
    maxPB: 1.0,
    minAnalystConsensus: 'hold',
  },
};

export const STRATEGY_LABELS: Record<ScreenStrategy, string> = {
  value: 'Value',
  growth: 'Growth',
  dividend: 'Dividend',
  quality: 'Quality',
  momentum: 'Momentum',
  turnaround: 'Turnaround',
  custom: 'Custom',
};

export const STRATEGY_DESCRIPTIONS: Record<Exclude<ScreenStrategy, 'custom'>, string> = {
  value: 'Low P/E, P/B',
  growth: 'High EPS/rev growth',
  dividend: 'High yield, sustainable payout',
  quality: 'High ROE, low debt, strong FCF',
  momentum: 'Above MAs, neutral RSI',
  turnaround: 'Beaten down, analyst upgrades',
};
