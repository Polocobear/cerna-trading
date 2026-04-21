import { formatDate } from '@/lib/utils/format';

interface EarningsCalendarProps {
  items: Array<{
    ticker: string;
    companyName: string;
    earningsDate: string;
    daysUntil: number;
  }>;
}

function getTone(daysUntil: number): string {
  if (daysUntil <= 5) return 'var(--earnings-imminent)';
  if (daysUntil <= 14) return 'var(--earnings-soon)';
  return 'var(--earnings-later)';
}

export function EarningsCalendar({ items }: EarningsCalendarProps) {
  if (items.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="dashboard-section-heading">Upcoming Earnings</div>
      <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar snap-x">
        {items.map((item) => (
          <div key={`${item.ticker}-${item.earningsDate}`} className="dashboard-earnings-pill snap-start">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: getTone(item.daysUntil) }} />
            <span className="font-semibold" style={{ color: 'var(--dashboard-text-strong)' }}>{item.ticker}</span>
            <span style={{ color: 'var(--dashboard-text-65)' }}>{formatDate(item.earningsDate)}</span>
            <span className="tabular-nums" style={{ color: getTone(item.daysUntil) }}>{`(${item.daysUntil}d)`}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
