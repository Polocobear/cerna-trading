export interface PriceData {
  price: number;
  change: number;
  changePercent: number;
  currency: string;
  marketState: string;
  fetchedAt: number;
}

const CACHE_TTL = 2 * 60 * 1000;
const priceCache = new Map<string, PriceData>();

export function getCachedPrice(ticker: string): PriceData | null {
  const cached = priceCache.get(ticker);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) return cached;
  return null;
}

export function setCachedPrice(ticker: string, data: Omit<PriceData, 'fetchedAt'>): void {
  priceCache.set(ticker, { ...data, fetchedAt: Date.now() });
}

export function getCacheTTL(): number {
  return CACHE_TTL;
}

/**
 * Map an exchange code to the Yahoo Finance symbol suffix.
 * Returns empty string for US exchanges (no suffix required).
 */
const SUFFIX_MAP: Record<string, string> = {
  ASX: '.AX',
  NYSE: '',
  NASDAQ: '',
  AMEX: '',
  ARCA: '',
  LSE: '.L',
  TSX: '.TO',
  HKEX: '.HK',
  JPX: '.T',
  TYO: '.T',
  XETRA: '.DE',
  EURONEXT: '.PA',
  SIX: '.SW',
  BSE: '.BO',
  NSE: '.NS',
};

/**
 * Build the Yahoo Finance symbol for a ticker + exchange.
 * Falls back to .AX suffix when exchange is missing (legacy ASX behavior).
 */
export function getYahooSymbol(ticker: string, exchange?: string | null): string {
  const upper = ticker.toUpperCase();
  // If the caller already provided a fully-qualified Yahoo symbol, don't double-suffix.
  if (upper.includes('.')) return upper;
  if (!exchange) return `${upper}.AX`;
  const suffix = SUFFIX_MAP[exchange.toUpperCase()];
  if (suffix === undefined) return upper; // unknown → pass through
  return `${upper}${suffix}`;
}

/**
 * Strip a known Yahoo suffix so we can key back to the bare ticker.
 */
export function stripYahooSuffix(symbol: string): string {
  return symbol.replace(
    /\.(AX|L|TO|HK|T|DE|PA|SW|BO|NS)$/i,
    ''
  );
}
