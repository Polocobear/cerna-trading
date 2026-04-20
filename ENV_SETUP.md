# Environment Variables — Cerna Trading

## Required

### Supabase
- `NEXT_PUBLIC_SUPABASE_URL` — Your Supabase project URL (https://xxxxx.supabase.co)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon/public key
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key (server-side only, never expose to client)

### Gemini (Google AI Studio)
- `GEMINI_API_KEY` — Free API key from https://aistudio.google.com
- Go to Google AI Studio → Click "Get API Key" → Create API key
- No credit card required
- Free tier: 1,500 requests/day, Google Search Grounding included
- The app uses Gemini 2.5 Flash with Google Search Grounding for real-time financial data

## Optional
- `ALPHA_VANTAGE_API_KEY` — Not currently used (Yahoo Finance is primary price source)

## Setup Steps

1. Create a Supabase project at https://supabase.com
2. Go to Settings → API → copy the URL and anon key
3. Go to Settings → API → copy the service role key
4. Run the migration: SQL Editor → paste contents of `supabase/migrations/001_initial_schema.sql` → Run
5. Enable Email auth: Authentication → Providers → Email → Enable
6. Get a Gemini API key from https://aistudio.google.com (free, no credit card)
7. Add all variables to Vercel: Settings → Environment Variables
8. Deploy

## Deploy Steps

1. Create Supabase project + run migration (above)
2. Get Gemini API key
3. Install Vercel CLI or connect GitHub repo to Vercel
4. Set environment variables in Vercel dashboard (4 required vars)
5. Deploy — region pinned to `syd1` via `vercel.json`
6. Smoke test: signup → onboarding → screen → analyze → brief
