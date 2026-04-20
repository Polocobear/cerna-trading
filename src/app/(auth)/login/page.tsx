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
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight">Cerna Trading</h1>
          <p className="mt-2 text-cerna-text-secondary">Portfolio-aware ASX intelligence</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-cerna-border bg-cerna-bg-secondary p-6 space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-cerna-text-secondary mb-1.5">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-cerna-bg-tertiary border border-cerna-border text-cerna-text-primary focus:border-cerna-border-active focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-cerna-text-secondary mb-1.5">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-cerna-bg-tertiary border border-cerna-border text-cerna-text-primary focus:border-cerna-border-active focus:outline-none"
            />
          </div>

          {error && (
            <p className="text-sm text-cerna-loss bg-[rgba(239,68,68,0.1)] p-2 rounded-md">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-md bg-cerna-primary hover:bg-cerna-primary-hover text-white font-medium transition disabled:opacity-50"
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
