import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  Icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({ Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center text-center py-16 px-4 animate-fade-in">
      <Icon size={48} strokeWidth={1.25} className="text-cerna-text-tertiary mb-4" />
      <h3 className="text-lg font-semibold text-cerna-text-primary mb-1.5">{title}</h3>
      <p className="text-sm text-cerna-text-secondary max-w-sm">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
