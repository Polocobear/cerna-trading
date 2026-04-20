export function formatCurrency(value: number, currency = 'AUD'): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPercent(value: number, decimals = 2): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' });
}

export function calculatePnL(shares: number, costBasis: number, currentPrice: number): number {
  if (!costBasis) return 0;
  return ((currentPrice - costBasis) / costBasis) * 100;
}
