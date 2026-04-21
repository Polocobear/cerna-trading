export type YahooMarketState = 'REGULAR' | 'PRE' | 'POST' | 'CLOSED';

export interface YahooQuote {
  ticker: string;
  exchange: string;
  currency: string;
  currentPrice: number;
  previousClose: number;
  dailyChange: number;
  dailyChangePct: number;
  dayHigh: number;
  dayLow: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  volume: number;
  averageVolume: number;
  marketCap: number;
  pe: number | null;
  eps: number | null;
  dividendYield: number | null;
  marketState: YahooMarketState;
}

export interface YahooAnalyst {
  ticker: string;
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
  totalAnalysts: number;
  targetMeanPrice: number;
  targetHighPrice: number;
  targetLowPrice: number;
  recommendationMean: number;
  currentPrice: number;
  upsidePct: number;
}

export interface YahooEarnings {
  ticker: string;
  earningsDate: string | null;
  daysUntilEarnings: number | null;
}

export interface YahooNewsItem {
  title: string;
  publisher: string;
  link: string;
  publishedAt: string;
}

export interface YahooHistoricalPrice {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface YahooHistorical {
  ticker: string;
  prices: YahooHistoricalPrice[];
}
