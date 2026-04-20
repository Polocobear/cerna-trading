'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center p-6 overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 50% 40%, rgba(124, 91, 240, 0.08) 0%, transparent 60%)',
        }}
      />

      <div className="relative w-full max-w-[420px] animate-fade-in">
        <div className="mb-8 text-center">
          <div className="inline-flex flex-col items-center">
            <h1 className="text-2xl font-bold tracking-wider">CERNA</h1>
            <div className="text-xs tracking-[0.3em] text-cerna-text-tertiary uppercase mt-0.5">
              Trading
            </div>
            <div className="mt-3 h-0.5 w-12 rounded-full bg-gradient-to-r from-transparent via-cerna-primary to-transparent" />
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl glass-elevated p-6 space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-cerna-text-secondary mb-1.5">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-cerna-bg-primary border border-cerna-border text-cerna-text-primary focus:border-cerna-border-active focus:outline-none focus:ring-1 focus:ring-[rgba(124,91,240,0.25)] transition-smooth min-h-[44px]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-cerna-text-secondary mb-1.5">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-cerna-bg-primary border border-cerna-border text-cerna-text-primary focus:border-cerna-border-active focus:outline-none focus:ring-1 focus:ring-[rgba(124,91,240,0.25)] transition-smooth min-h-[44px]"
            />
          </div>

          {error && (
            <p className="text-sm text-cerna-loss bg-[rgba(239,68,68,0.1)] p-2.5 rounded-md">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-cerna-primary hover:bg-cerna-primary-hover text-white font-medium transition-smooth glow-primary-hover min-h-[44px] disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-center mt-6 text-sm text-cerna-text-secondary">
          No account?{' '}
          <Link href="/signup" className="text-cerna-primary hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
