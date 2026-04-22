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
- The app uses Gemini 2.5 Flash for orchestration, synthesis, portfolio checks, and memory tasks

### Anthropic (Claude API)
- `ANTHROPIC_API_KEY` — Required to run the screen, analyze, and brief agents on Claude Sonnet with Anthropic web search
- Get it from the Claude Console / Anthropic API dashboard
- If this key is not set, those research agents fall back to the existing Gemini path

## Optional
- `ALPHA_VANTAGE_API_KEY` — Not currently used (Yahoo Finance is primary price source)

## Setup Steps

1. Create a Supabase project at https://supabase.com
2. Go to Settings → API → copy the URL and anon key
3. Go to Settings → API → copy the service role key
4. Run the migration: SQL Editor → paste contents of `supabase/migrations/001_initial_schema.sql` → Run
5. Enable Email auth: Authentication → Providers → Email → Enable
6. Get a Gemini API key from https://aistudio.google.com (free, no credit card)
7. Get an Anthropic API key if you want Claude Sonnet research agents
8. Add all variables to Vercel: Settings → Environment Variables
9. Deploy

## Deploy Steps

1. Create Supabase project + run migration (above)
2. Get Gemini API key
3. Get Anthropic API key for Claude-backed research agents
4. Install Vercel CLI or connect GitHub repo to Vercel
5. Set environment variables in Vercel dashboard
6. Deploy — region pinned to `syd1` via `vercel.json`
7. Smoke test: signup → onboarding → screen → analyze → brief
