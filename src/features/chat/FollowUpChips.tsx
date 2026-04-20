interface FollowUpChipsProps {
  suggestions: string[];
  onSelect: (suggestion: string) => void;
}

export function FollowUpChips({ suggestions, onSelect }: FollowUpChipsProps) {
  if (suggestions.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-4 stagger-children">
      {suggestions.map((s) => (
        <button
          key={s}
          onClick={() => onSelect(s)}
          className="px-3 py-1.5 text-sm rounded-full glass border border-cerna-border text-cerna-text-secondary hover:border-cerna-primary hover:text-cerna-primary transition-smooth min-h-[44px] sm:min-h-0"
        >
          {s}
        </button>
      ))}
    </div>
  );
}
