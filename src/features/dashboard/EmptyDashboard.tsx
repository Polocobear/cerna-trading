import { ArrowRight, Link2, Plus } from 'lucide-react';

interface EmptyDashboardProps {
  onConnectPortfolio: () => void;
  onAddPosition: () => void;
  onOpenChat: () => void;
}

export function EmptyDashboard({ onConnectPortfolio, onAddPosition, onOpenChat }: EmptyDashboardProps) {
  return (
    <div className="dashboard-card max-w-3xl mx-auto p-8 md:p-10 text-center animate-card-in">
      <div className="mx-auto max-w-xl space-y-5">
        <div className="space-y-2">
          <div className="dashboard-kicker">Dashboard</div>
          <h2 className="text-3xl font-semibold tracking-tight" style={{ color: 'var(--dashboard-text-strong)' }}>
            Your portfolio is empty
          </h2>
          <p className="text-sm leading-6" style={{ color: 'var(--dashboard-text-60)' }}>
            Connect your Interactive Brokers account to sync your holdings, or add positions manually.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row justify-center gap-3">
          <button type="button" onClick={onConnectPortfolio} className="dashboard-action-button">
            <Link2 size={16} />
            <span>Connect IB</span>
          </button>
          <button
            type="button"
            onClick={onAddPosition}
            className="dashboard-action-button"
            style={{ background: 'var(--dashboard-surface-04)', color: 'var(--dashboard-text-strong)' }}
          >
            <Plus size={16} />
            <span>Add Position</span>
          </button>
        </div>

        <p className="text-sm leading-6" style={{ color: 'var(--dashboard-text-55)' }}>
          Or just start chatting. Ask Cerna to screen for stocks and it can help you build a portfolio.
        </p>

        <button type="button" onClick={onOpenChat} className="dashboard-link-button">
          <span>Open Chat</span>
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
