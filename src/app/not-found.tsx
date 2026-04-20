import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="relative min-h-screen flex items-center justify-center p-6 bg-cerna-bg-primary overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 50% 40%, rgba(124, 91, 240, 0.08) 0%, transparent 60%)',
        }}
      />
      <div className="relative w-full max-w-md rounded-2xl glass-elevated p-8 text-center">
        <div className="inline-flex flex-col items-center mb-5">
          <h1 className="text-2xl font-bold tracking-wider">CERNA</h1>
          <div className="text-xs tracking-[0.3em] text-cerna-text-tertiary uppercase mt-0.5">
            Trading
          </div>
        </div>
        <div className="text-6xl font-bold text-cerna-primary mb-2">404</div>
        <h2 className="text-xl font-semibold text-cerna-text-primary mb-2">Page not found</h2>
        <p className="text-sm text-cerna-text-secondary mb-6">
          The page you&apos;re looking for doesn&apos;t exist.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center w-full py-2.5 rounded-lg bg-cerna-primary hover:bg-cerna-primary-hover text-white font-medium transition-smooth glow-primary-hover min-h-[44px]"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
