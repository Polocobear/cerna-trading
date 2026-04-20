'use client';

import { AlertTriangle } from 'lucide-react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const showDetail = process.env.NODE_ENV === 'development';

  return (
    <div className="flex items-center justify-center py-20 px-6">
      <div className="w-full max-w-md rounded-2xl glass-elevated p-8 text-center">
        <AlertTriangle size={32} className="mx-auto text-amber-500 mb-3" />
        <h2 className="text-lg font-semibold text-cerna-text-primary mb-1">Dashboard error</h2>
        <p className="text-sm text-cerna-text-secondary mb-5">
          Something went wrong loading this view.
        </p>
        {showDetail && (
          <pre className="text-xs text-left bg-cerna-bg-primary border border-cerna-border rounded-md p-3 mb-5 overflow-x-auto custom-scrollbar text-cerna-loss">
            {error.message}
          </pre>
        )}
        <button
          onClick={reset}
          className="w-full py-2.5 rounded-lg bg-cerna-primary hover:bg-cerna-primary-hover text-white font-medium transition-smooth min-h-[44px]"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
