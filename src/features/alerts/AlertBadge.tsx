'use client';

interface AlertBadgeProps {
  count: number;
}

export function AlertBadge({ count }: AlertBadgeProps) {
  if (count <= 0) return null;

  return (
    <span
      className="ml-auto shrink-0 min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
      style={{ background: '#7c5bf0' }}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
