export type RsiSignal = 'oversold' | 'neutral' | 'overbought';
export type TrendDirection = 'above' | 'below' | null;
export type MacdTrend = 'bullish' | 'bearish' | 'neutral' | null;

export interface TechnicalIndicators {
  rsi14: number | null;
  rsiSignal: RsiSignal;
  sma50: number | null;
  sma200: number | null;
  priceVsSma200: TrendDirection;
  macd: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  macdTrend: MacdTrend;
  volumeVsAvg: number | null;
  fiftyTwoWeekPosition: number | null;
}

interface PricePoint {
  close: number;
  volume: number;
}

function roundTo(value: number | null, digits = 2): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function lastFinite(series: number[]): number | null {
  for (let index = series.length - 1; index >= 0; index -= 1) {
    const value = series[index];
    if (Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function lastTwoFinite(series: number[]): [number | null, number | null] {
  const values: number[] = [];
  for (let index = series.length - 1; index >= 0; index -= 1) {
    const value = series[index];
    if (Number.isFinite(value)) {
      values.push(value);
      if (values.length === 2) break;
    }
  }
  return [values[1] ?? null, values[0] ?? null];
}

export function sma(data: number[], period: number): number[] {
  const output = Array.from({ length: data.length }, () => Number.NaN);
  if (period <= 0 || data.length < period) return output;

  let sum = 0;
  for (let index = 0; index < data.length; index += 1) {
    sum += data[index] ?? 0;
    if (index >= period) {
      sum -= data[index - period] ?? 0;
    }
    if (index >= period - 1) {
      output[index] = sum / period;
    }
  }

  return output;
}

export function ema(data: number[], period: number): number[] {
  const output = Array.from({ length: data.length }, () => Number.NaN);
  if (period <= 0 || data.length < period) return output;

  const multiplier = 2 / (period + 1);
  let seedTotal = 0;

  for (let index = 0; index < period; index += 1) {
    seedTotal += data[index] ?? 0;
  }

  let previous = seedTotal / period;
  output[period - 1] = previous;

  for (let index = period; index < data.length; index += 1) {
    previous = (data[index] - previous) * multiplier + previous;
    output[index] = previous;
  }

  return output;
}

function calculateRsi(closes: number[], period = 14): number | null {
  if (closes.length <= period) return null;

  let gains = 0;
  let losses = 0;
  for (let index = 1; index <= period; index += 1) {
    const change = closes[index] - closes[index - 1];
    if (change > 0) gains += change;
    if (change < 0) losses += Math.abs(change);
  }

  let averageGain = gains / period;
  let averageLoss = losses / period;

  for (let index = period + 1; index < closes.length; index += 1) {
    const change = closes[index] - closes[index - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    averageGain = (averageGain * (period - 1) + gain) / period;
    averageLoss = (averageLoss * (period - 1) + loss) / period;
  }

  if (averageGain === 0 && averageLoss === 0) return 50;
  if (averageLoss === 0) return 100;

  const rs = averageGain / averageLoss;
  return 100 - 100 / (1 + rs);
}

function calculateMacdTrend(histogramSeries: number[]): MacdTrend {
  const [previous, current] = lastTwoFinite(histogramSeries);
  if (current == null) return null;
  if (previous == null) {
    if (current > 0) return 'bullish';
    if (current < 0) return 'bearish';
    return 'neutral';
  }
  if (current > 0 && current >= previous) return 'bullish';
  if (current < 0 && current <= previous) return 'bearish';
  return 'neutral';
}

export function calculateIndicators(prices: PricePoint[], currentPrice: number): TechnicalIndicators {
  const closes = prices.map((price) => price.close).filter((close) => Number.isFinite(close));
  const volumes = prices.map((price) => price.volume).filter((volume) => Number.isFinite(volume));

  const rsi14 = roundTo(calculateRsi(closes, 14));
  const sma50Series = sma(closes, 50);
  const sma200Series = sma(closes, 200);
  const sma50Value = roundTo(lastFinite(sma50Series));
  const sma200Value = roundTo(lastFinite(sma200Series));

  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdSeries = closes.map((_, index) => {
    const short = ema12[index];
    const long = ema26[index];
    return Number.isFinite(short) && Number.isFinite(long) ? short - long : Number.NaN;
  });
  const compactMacd = macdSeries.filter((value) => Number.isFinite(value));
  const compactSignal = ema(compactMacd, 9);
  const macdSignalSeries = Array.from({ length: macdSeries.length }, () => Number.NaN);
  let compactIndex = 0;

  for (let index = 0; index < macdSeries.length; index += 1) {
    if (!Number.isFinite(macdSeries[index])) continue;
    macdSignalSeries[index] = compactSignal[compactIndex] ?? Number.NaN;
    compactIndex += 1;
  }

  const histogramSeries = macdSeries.map((value, index) => {
    const signal = macdSignalSeries[index];
    return Number.isFinite(value) && Number.isFinite(signal) ? value - signal : Number.NaN;
  });

  const volumeVsAvg =
    volumes.length >= 21
      ? roundTo(
          volumes[volumes.length - 1] /
            (volumes.slice(Math.max(0, volumes.length - 21), volumes.length - 1).reduce((sum, volume) => sum + volume, 0) /
              20),
          2
        )
      : null;

  const fiftyTwoWeekLow = closes.length > 0 ? Math.min(...closes) : null;
  const fiftyTwoWeekHigh = closes.length > 0 ? Math.max(...closes) : null;
  const fiftyTwoWeekPosition =
    fiftyTwoWeekLow != null &&
    fiftyTwoWeekHigh != null &&
    fiftyTwoWeekHigh > fiftyTwoWeekLow
      ? roundTo(((currentPrice - fiftyTwoWeekLow) / (fiftyTwoWeekHigh - fiftyTwoWeekLow)) * 100, 1)
      : null;

  return {
    rsi14,
    rsiSignal: rsi14 == null ? 'neutral' : rsi14 < 30 ? 'oversold' : rsi14 > 70 ? 'overbought' : 'neutral',
    sma50: sma50Value,
    sma200: sma200Value,
    priceVsSma200:
      sma200Value == null ? null : currentPrice >= sma200Value ? 'above' : 'below',
    macd: roundTo(lastFinite(macdSeries)),
    macdSignal: roundTo(lastFinite(macdSignalSeries)),
    macdHistogram: roundTo(lastFinite(histogramSeries)),
    macdTrend: calculateMacdTrend(histogramSeries),
    volumeVsAvg,
    fiftyTwoWeekPosition,
  };
}
