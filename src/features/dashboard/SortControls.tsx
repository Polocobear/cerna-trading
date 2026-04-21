export type DashboardSortKey = 'value' | 'daily-change' | 'analyst-upside' | 'rsi';

interface SortControlsProps {
  value: DashboardSortKey;
  onChange: (value: DashboardSortKey) => void;
}

const OPTIONS: Array<{ value: DashboardSortKey; label: string }> = [
  { value: 'value', label: 'Value' },
  { value: 'daily-change', label: 'Daily Change' },
  { value: 'analyst-upside', label: 'Analyst Upside' },
  { value: 'rsi', label: 'RSI' },
];

export function SortControls({ value, onChange }: SortControlsProps) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span style={{ color: 'var(--dashboard-text-45)' }}>Sort by</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as DashboardSortKey)}
        className="rounded-full px-3 py-2 text-sm outline-none transition-smooth"
        style={{
          background: 'var(--dashboard-surface-04)',
          color: 'var(--dashboard-text-strong)',
          border: '1px solid var(--dashboard-surface-08)',
        }}
      >
        {OPTIONS.map((option) => (
          <option
            key={option.value}
            value={option.value}
            style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)' }}
          >
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
