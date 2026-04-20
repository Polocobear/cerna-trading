# Environment Variables — Cerna Trading

## Required

### Supabase
- `NEXT_PUBLIC_SUPABASE_URL` — Your Supabase project URL (https://xxxxx.supabase.co)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon/public key
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key (server-side only, never expose to client)

### Perplexity Sonar
- `SONAR_API_KEY` — Perplexity API key from https://docs.perplexity.ai

## Optional
- `ALPHA_VANTAGE_API_KEY` — Not currently used (Yahoo Finance is primary price source)

## Setup Steps

1. Create a Supabase project at https://supabase.com
2. Go to Settings → API → copy the URL and anon key
3. Go to Settings → API → copy the service role key
4. Run the migration: SQL Editor → paste contents of `supabase/migrations/001_initial_schema.sql` → Run
5. Enable Email auth: Authentication → Providers → Email → Enable
6. (Optional) Enable Google auth: Authentication → Providers → Google → follow setup guide
7. Get Sonar API key from https://docs.perplexity.ai/guides/getting-started
8. Add all variables to Vercel: Settings → Environment Variables
9. Deploy

## Deploy Steps

1. Create Supabase project + run migration (above)
2. Get Sonar API key
3. Install Vercel CLI or connect GitHub repo to Vercel
4. Set environment variables in Vercel dashboard (all 4 required vars)
5. Deploy — region pinned to `syd1` via `vercel.json`
6. Smoke test: signup → onboarding → screen → analyze → brief
