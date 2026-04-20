interface ProgressTrackerProps {
  status: 'idle' | 'searching' | 'streaming' | 'done' | 'error';
}

export function ProgressTracker({ status }: ProgressTrackerProps) {
  if (status === 'idle' || status === 'done') return null;
  const label =
    status === 'searching'
      ? 'Searching sources'
      : status === 'streaming'
        ? 'Synthesizing answer'
        : 'Something went wrong';

  return (
    <div className="flex items-center gap-2 text-sm text-cerna-text-secondary py-3">
      <span className="flex gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-cerna-primary animate-pulse" />
        <span className="w-1.5 h-1.5 rounded-full bg-cerna-primary animate-pulse [animation-delay:150ms]" />
        <span className="w-1.5 h-1.5 rounded-full bg-cerna-primary animate-pulse [animation-delay:300ms]" />
      </span>
      <span>{label}…</span>
    </div>
  );
}
