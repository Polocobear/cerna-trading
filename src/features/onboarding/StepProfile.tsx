'use client';

interface StepProfileProps {
  displayName: string;
  smsfName: string;
  strategy: string;
  onChange: (next: { displayName: string; smsfName: string; strategy: string }) => void;
  onNext: () => void;
}

export function StepProfile({ displayName, smsfName, strategy, onChange, onNext }: StepProfileProps) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onNext();
      }}
      className="space-y-5 animate-fade-in"
    >
      <div>
        <h2 className="text-2xl font-bold text-cerna-text-primary">Welcome to Cerna Trading</h2>
        <p className="mt-1 text-cerna-text-secondary">Let&apos;s set up your intelligence dashboard.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-cerna-text-secondary mb-1.5">Display name</label>
        <input
          required
          value={displayName}
          onChange={(e) => onChange({ displayName: e.target.value, smsfName, strategy })}
          className="w-full px-3 py-2.5 rounded-lg bg-cerna-bg-primary border border-cerna-border text-cerna-text-primary focus:border-cerna-border-active focus:outline-none focus:ring-1 focus:ring-[rgba(124,91,240,0.25)] transition-smooth min-h-[44px]"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-cerna-text-secondary mb-1.5">
          SMSF name <span className="text-cerna-text-tertiary">(optional)</span>
        </label>
        <input
          value={smsfName}
          onChange={(e) => onChange({ displayName, smsfName: e.target.value, strategy })}
          className="w-full px-3 py-2.5 rounded-lg bg-cerna-bg-primary border border-cerna-border text-cerna-text-primary focus:border-cerna-border-active focus:outline-none focus:ring-1 focus:ring-[rgba(124,91,240,0.25)] transition-smooth min-h-[44px]"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-cerna-text-secondary mb-1.5">
          Investment strategy
        </label>
        <textarea
          required
          rows={3}
          value={strategy}
          placeholder="e.g., Long-term value investing focused on ASX blue chips and dividend stocks"
          onChange={(e) => onChange({ displayName, smsfName, strategy: e.target.value })}
          className="w-full px-3 py-2.5 rounded-lg bg-cerna-bg-primary border border-cerna-border text-cerna-text-primary focus:border-cerna-border-active focus:outline-none focus:ring-1 focus:ring-[rgba(124,91,240,0.25)] transition-smooth"
        />
      </div>

      <button
        type="submit"
        disabled={!displayName.trim() || !strategy.trim()}
        className="w-full py-3 rounded-lg bg-cerna-primary hover:bg-cerna-primary-hover text-white font-medium transition-smooth glow-primary-hover min-h-[48px] disabled:opacity-50"
      >
        Continue
      </button>
    </form>
  );
}
