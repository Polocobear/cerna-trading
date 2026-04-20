import { cn } from '@/lib/utils/cn';

interface SkeletonProps {
  variant?: 'text' | 'card' | 'metric';
  className?: string;
  width?: string;
}

export function Skeleton({ variant = 'text', className, width }: SkeletonProps) {
  const base =
    'rounded-md bg-gradient-to-r from-cerna-bg-tertiary via-cerna-bg-hover to-cerna-bg-tertiary bg-[length:200%_100%] animate-shimmer';

  const sizes: Record<NonNullable<SkeletonProps['variant']>, string> = {
    text: 'h-3.5 w-3/4',
    card: 'h-32 w-full',
    metric: 'h-6 w-20',
  };

  return <div className={cn(base, sizes[variant], className)} style={width ? { width } : undefined} />;
}
