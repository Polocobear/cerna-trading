export function formatCurrency(value: number, currency = 'AUD'): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatCurrencyDetailed(value: number, currency = 'AUD', digits = 2): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatPercent(value: number, decimals = 2): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

export function formatSignedNumber(value: number, decimals = 2): string {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${Math.abs(value).toFixed(decimals)}`;
}

export function formatRelativeTime(date: Date | null): string {
  if (!date) return 'Never updated';

  const deltaMs = Date.now() - date.getTime();
  const deltaMinutes = Math.max(0, Math.round(deltaMs / 60_000));
  if (deltaMinutes < 1) return 'just now';
  if (deltaMinutes === 1) return '1 min ago';
  if (deltaMinutes < 60) return `${deltaMinutes} min ago`;

  const deltaHours = Math.round(deltaMinutes / 60);
  if (deltaHours === 1) return '1 hour ago';
  if (deltaHours < 24) return `${deltaHours} hours ago`;

  const deltaDays = Math.round(deltaHours / 24);
  return deltaDays === 1 ? '1 day ago' : `${deltaDays} days ago`;
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' });
}

export function calculatePnL(shares: number, costBasis: number, currentPrice: number): number {
  if (!costBasis) return 0;
  return ((currentPrice - costBasis) / costBasis) * 100;
}
