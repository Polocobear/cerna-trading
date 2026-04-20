'use client';

import Link from 'next/link';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const showDetail = process.env.NODE_ENV === 'development';

  return (
    <div className="relative min-h-screen flex items-center justify-center p-6 bg-cerna-bg-primary overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 50% 40%, rgba(239, 68, 68, 0.06) 0%, transparent 60%)',
        }}
      />
      <div className="relative w-full max-w-md rounded-2xl glass-elevated p-8 text-center">
        <div className="inline-flex flex-col items-center mb-5">
          <h1 className="text-2xl font-bold tracking-wider">CERNA</h1>
          <div className="text-xs tracking-[0.3em] text-cerna-text-tertiary uppercase mt-0.5">
            Trading
          </div>
        </div>
        <h2 className="text-xl font-semibold text-cerna-text-primary mb-2">Something went wrong</h2>
        <p className="text-sm text-cerna-text-secondary mb-6">
          An unexpected error occurred. You can try again or return to the dashboard.
        </p>
        {showDetail && (
          <pre className="text-xs text-left bg-cerna-bg-primary border border-cerna-border rounded-md p-3 mb-6 overflow-x-auto custom-scrollbar text-cerna-loss">
            {error.message}
          </pre>
        )}
        <div className="flex flex-col gap-2">
          <button
            onClick={reset}
            className="w-full py-2.5 rounded-lg bg-cerna-primary hover:bg-cerna-primary-hover text-white font-medium transition-smooth glow-primary-hover min-h-[44px]"
          >
            Try again
          </button>
          <Link
            href="/dashboard"
            className="w-full py-2.5 rounded-lg border border-cerna-border text-cerna-text-secondary hover:text-cerna-text-primary hover:border-cerna-border-hover transition-smooth min-h-[44px] flex items-center justify-center"
          >
            Go to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
