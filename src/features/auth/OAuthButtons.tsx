'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface OAuthButtonsProps {
  mode: 'login' | 'signup';
}

export function OAuthButtons({ mode }: OAuthButtonsProps) {
  const [loading, setLoading] = useState<'google' | 'github' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function signIn(provider: 'google' | 'github') {
    setLoading(provider);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setError(error.message);
      setLoading(null);
    }
  }

  const label = mode === 'signup' ? 'Sign up' : 'Continue';

  return (
    <div className="space-y-2.5">
      <button
        type="button"
        disabled={loading !== null}
        onClick={() => signIn('google')}
        className="w-full flex items-center justify-center gap-2.5 py-2.5 rounded-lg border border-cerna-border bg-cerna-bg-primary hover:bg-cerna-bg-hover text-cerna-text-primary transition-smooth min-h-[44px] disabled:opacity-50"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        <span className="text-sm font-medium">{label} with Google</span>
      </button>
      <button
        type="button"
        disabled={loading !== null}
        onClick={() => signIn('github')}
        className="w-full flex items-center justify-center gap-2.5 py-2.5 rounded-lg border border-cerna-border bg-cerna-bg-primary hover:bg-cerna-bg-hover text-cerna-text-primary transition-smooth min-h-[44px] disabled:opacity-50"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.19.69-3.87-1.54-3.87-1.54-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.29 1.18-3.09-.12-.29-.51-1.46.11-3.05 0 0 .96-.31 3.16 1.18a10.94 10.94 0 0 1 5.76 0c2.2-1.49 3.16-1.18 3.16-1.18.63 1.59.23 2.76.11 3.05.74.81 1.18 1.83 1.18 3.09 0 4.43-2.69 5.41-5.25 5.69.41.36.78 1.07.78 2.15 0 1.55-.01 2.8-.01 3.18 0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5z"/>
        </svg>
        <span className="text-sm font-medium">{label} with GitHub</span>
      </button>

      {error && <p className="text-xs text-cerna-loss">{error}</p>}

      <div className="flex items-center gap-3 py-1">
        <div className="flex-1 h-px bg-cerna-border" />
        <span className="text-xs text-cerna-text-tertiary">or</span>
        <div className="flex-1 h-px bg-cerna-border" />
      </div>
    </div>
  );
}
