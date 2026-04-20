export default function DashboardLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-cerna-bg-primary">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-wider text-cerna-text-primary animate-pulse">
          CERNA
        </h1>
        <p className="text-xs text-cerna-text-tertiary uppercase tracking-[0.3em] mt-1">Trading</p>
        <p className="text-sm text-cerna-text-secondary mt-6">Loading your intelligence dashboard…</p>
      </div>
    </div>
  );
}
