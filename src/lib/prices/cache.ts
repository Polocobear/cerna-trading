export interface PriceData {
  price: number;
  change: number;
  changePercent: number;
  currency: string;
  marketState: string;
  fetchedAt: number;
}

const CACHE_TTL = 5 * 60 * 1000;
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
