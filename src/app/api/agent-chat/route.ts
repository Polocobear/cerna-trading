import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rate-limit';
import {
  canUseDeepTier,
  recordDeepUsage,
  getDeepUsageRemaining,
} from '@/lib/gemini/deep-usage';
import type { Position, Profile, WatchlistItem } from '@/types/portfolio';
import {
  buildPortfolioContext,
  buildExchangeContext,
  describeToolCall,
} from '@/lib/agents/prompts';
import { runOrchestrator } from '@/lib/agents/orchestrator';
import { executeAgents } from '@/lib/agents/executor';
import { synthesize, dedupeSources } from '@/lib/agents/synthesizer';
import { generateFollowUps } from '@/lib/agents/follow-ups';
import { generateSessionTitle } from '@/lib/agents/session-title';
import { buildIntelligenceContext } from '@/lib/memory/context-builder';
import { extractMemories } from '@/lib/memory/manager';
import { extractDecisions, matchDecisionsToTrades } from '@/lib/memory/decision-tracker';
import { summarizeSession } from '@/lib/memory/session-summarizer';
import type {
  AgentEvent,
  AgentName,
  AgentResult,
  PlannedAgent,
  ToolCall,
} from '@/lib/agents/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ROUTE_SOFT_BUDGET_MS = 55000;
const SYNTHESIS_MIN_BUDGET_MS = 12000;
const FOLLOW_UP_BUDGET_MS = 2500;
const SESSION_TITLE_BUDGET_MS = 1500;

interface AgentChatRequest {
  message: string;
  sessionId: string;
  depth?: 'standard' | 'deep';
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

type SSEPayload =
  | { type: 'plan'; agents: Array<{ name: AgentName; description: string }> }
  | AgentEvent
  | { type: 'stream'; content: string }
  | { type: 'sources'; sources: Array<{ title: string; url: string; domain: string }> }
  | { type: 'follow_ups'; suggestions: string[] }
  | { type: 'session_title'; title: string }
  | { type: 'done'; model: 'flash' | 'mixed' | 'error'; deepRemaining: number };

function classify(toolName: string): AgentName {
  switch (toolName) {
    case 'screen_stocks':
      return 'screen';
    case 'analyze_stock':
      return 'analyze';
    case 'brief_market':
      return 'brief';
    case 'log_trade':
      return 'trade_log';
    case 'check_portfolio':
    default:
      return 'portfolio';
  }
}

function toPlanAgents(toolCalls: ToolCall[]): PlannedAgent[] {
  return toolCalls.map((t) => ({
    name: classify(t.name),
    description: describeToolCall(t.name, t.arguments),
    tool: t,
  }));
}

function stripSourcesTag(text: string): {
  clean: string;
  sources: Array<{ title: string; url: string; domain: string; snippet?: string }>;
} {
  const re = /<sources>([\s\S]*?)<\/sources>/i;
  const m = text.match(re);
  let clean = text.replace(re, '').trimEnd();
  let sources: Array<{ title: string; url: string; domain: string; snippet?: string }> = [];
  if (m && m[1]) {
    try {
      const parsed = JSON.parse(m[1].trim());
      if (Array.isArray(parsed)) {
        sources = parsed
          .filter(
            (s): s is { title?: unknown; url?: unknown; domain?: unknown; snippet?: unknown } =>
              typeof s === 'object' && s !== null
          )
          .map((s) => ({
            title: typeof s.title === 'string' ? s.title : '',
            url: typeof s.url === 'string' ? s.url : '',
            domain: typeof s.domain === 'string' ? s.domain : '',
            snippet: typeof s.snippet === 'string' ? s.snippet : undefined,
          }))
          .filter((s) => s.url);
      }
    } catch {
      // ignore malformed sources tag
    }
  }
  return { clean, sources };
}

function extractTickers(text: string): string[] {
  const matches = text.match(/\b[A-Z]{3,5}\b/g) ?? [];
  const blacklist = new Set([
    'ASX',
    'USD',
    'AUD',
    'SMSF',
    'CEO',
    'CFO',
    'EPS',
    'PEG',
    'ROE',
    'ROIC',
    'DCF',
    'RSI',
    'CGT',
    'FCF',
    'RBA',
    'GDP',
    'IMF',
    'ETF',
    'ESG',
    'NYSE',
    'NASDAQ',
    'YTD',
    'QOQ',
    'YOY',
    'BUY',
    'SELL',
    'HOLD',
    'ADD',
    'TRIM',
  ]);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of matches) {
    if (blacklist.has(m)) continue;
    if (seen.has(m)) continue;
    seen.add(m);
    out.push(m);
    if (out.length >= 10) break;
  }
  return out;
}

function summarizePartialText(text: string, limit = 220): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (!trimmed) return '';
  return trimmed.slice(0, limit) + (trimmed.length > limit ? '...' : '');
}

export async function POST(req: Request) {
  const pipelineStart = Date.now();
  const pipelineDeadline = pipelineStart + 55000;
  console.error(`[agent-chat] START at ${new Date().toISOString()}`);
  let body: AgentChatRequest;
  try {
    body = (await req.json()) as AgentChatRequest;
  } catch (error) {
    console.error(`[agent-chat] FAILED at ${Date.now() - pipelineStart}ms:`, error);
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { message, sessionId, depth = 'standard', history = [] } = body;
  if (!message || typeof message !== 'string' || !sessionId) {
    return NextResponse.json({ error: 'message and sessionId are required' }, { status: 400 });
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rate = checkRateLimit(user.id);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment.' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfter ?? 30) } }
    );
  }

  const [positionsRes, profileRes, watchlistRes, priorMsgsRes] = await Promise.all([
    supabase.from('positions').select('*').eq('user_id', user.id).eq('status', 'open'),
    supabase
      .from('profiles')
      .select(
        'id, display_name, risk_tolerance, smsf_name, investment_strategy, sectors_of_interest, preferred_exchange, preferred_currency, cash_available, created_at, updated_at'
      )
      .eq('id', user.id)
      .maybeSingle(),
    supabase.from('watchlist').select('*').eq('user_id', user.id),
    supabase
      .from('chat_messages')
      .select('id')
      .eq('user_id', user.id)
      .eq('session_id', sessionId)
      .limit(1),
  ]);

  const positions = (positionsRes.data ?? []) as Position[];
  const profile = (profileRes.data ?? null) as Profile | null;
  const watchlist = (watchlistRes.data ?? []) as WatchlistItem[];
  const isFirstExchange = (priorMsgsRes.data ?? []).length === 0;

  const portfolioCtx = buildPortfolioContext(profile, positions, watchlist);
  const exchangeCtx = buildExchangeContext(profile, positions);

  // Build intelligence context (memory + decisions + sessions) — non-blocking best-effort
  const intelCtx = await buildIntelligenceContext(user.id, sessionId, supabase).catch(() => ({
    memory: '', decisions: '', sessions: '', behavioral: '', alerts: '', full: '',
  }));

  // Save user message immediately (mode = 'ask' to fit existing schema).
  await supabase.from('chat_messages').insert({
    user_id: user.id,
    session_id: sessionId,
    mode: 'ask',
    role: 'user',
    content: message,
  });

  const isDeepRequested = depth === 'deep';
  const initialDeepAvailable = isDeepRequested && canUseDeepTier(user.id);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const startedAt = Date.now();
      let closed = false;
      const remainingBudgetMs = () => ROUTE_SOFT_BUDGET_MS - (Date.now() - startedAt);
      const emit = (payload: SSEPayload) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          // stream may be closed; ignore
        }
      };
      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // ignore
        }
      };

      let fullResponse = '';
      let deepConsumed = false;

      try {
        // (a) orchestrate
        let plan: Awaited<ReturnType<typeof runOrchestrator>>;
        try {
          plan = await runOrchestrator({
            userMessage: message,
            history: history.slice(-10),
            exchange: exchangeCtx,
          });
        } finally {
          console.error(`[agent-chat] ORCHESTRATOR complete: ${Date.now() - pipelineStart}ms`);
        }
        console.error(`[agent-chat] ROUTING:`, JSON.stringify(plan.toolCalls));

        // direct response path
        if (plan.directResponse && plan.toolCalls.length === 0) {
          emit({ type: 'plan', agents: [] });
          emit({ type: 'stream', content: plan.directResponse });
          fullResponse = plan.directResponse;

          // persist assistant message
          await supabase.from('chat_messages').insert({
            user_id: user.id,
            session_id: sessionId,
            mode: 'ask',
            role: 'assistant',
            content: fullResponse,
            citations: [],
          });

          if (isFirstExchange && remainingBudgetMs() >= SESSION_TITLE_BUDGET_MS) {
            const title = await generateSessionTitle(message, fullResponse);
            if (title) emit({ type: 'session_title', title });
          }

          emit({
            type: 'done',
            model: 'flash',
            deepRemaining: getDeepUsageRemaining(user.id),
          });
          close();

          // Async post-processing — non-blocking
          Promise.allSettled([
            extractMemories(user.id, sessionId, [message], fullResponse, supabase),
            matchDecisionsToTrades(user.id, supabase),
          ]).catch(console.error);

          return;
        }

        const planned = toPlanAgents(plan.toolCalls);
        emit({
          type: 'plan',
          agents: planned.map((p) => ({ name: p.name, description: p.description })),
        });

        // Consume deep usage once per query, iff deep requested and agents include research.
        const hasResearch = planned.some((p) => p.name !== 'portfolio');
        const useDeep = initialDeepAvailable && hasResearch;
        if (useDeep) {
          recordDeepUsage(user.id);
          deepConsumed = true;
        }

        // (d) execute
        let results: AgentResult[];
        try {
          results = await executeAgents(
            plan.toolCalls,
            {
              portfolioContext: portfolioCtx.text,
              exchange: exchangeCtx,
              isDeepAvailable: useDeep,
              supabase,
              userId: user.id,
              userMessage: message,
              deadlineMs: pipelineDeadline,
            },
            (evt) => emit(evt)
          );
        } finally {
          console.error(`[agent-chat] AGENTS complete: ${Date.now() - pipelineStart}ms`);
        }

        const allFailed = results.length > 0 && results.every((r) => r.status === 'error');
        if (allFailed) {
          const fallback =
            "I hit errors fetching that research. Try again in a moment, or rephrase the question.";
          emit({ type: 'stream', content: fallback });
          fullResponse = fallback;
          await supabase.from('chat_messages').insert({
            user_id: user.id,
            session_id: sessionId,
            mode: 'ask',
            role: 'assistant',
            content: fullResponse,
            citations: [],
          });
          emit({
            type: 'done',
            model: 'error',
            deepRemaining: getDeepUsageRemaining(user.id),
          });
          close();
          return;
        }

        // (e) synthesize stream — inject intelligence context
        try {
          const allSources = results
            .filter((r) => r.status === 'success')
            .flatMap((r) => r.sources ?? []);

          const uniqueSources = Array.from(
            new Map(allSources.map((s) => [s.url, s])).values()
          );

          const sourcesForPrompt = uniqueSources
            .map((s, i) => `[${i + 1}] ${s.title} — ${s.domain}\n${s.url}`)
            .join('\n\n');

          const synthStream = synthesize(
            message,
            results,
            portfolioCtx.text,
            intelCtx.full,
            sourcesForPrompt,
            pipelineDeadline
          );
          for await (const chunk of synthStream) {
            fullResponse += chunk;
            emit({ type: 'stream', content: chunk });
          }
        } finally {
          console.error(`[agent-chat] SYNTHESIZER complete: ${Date.now() - pipelineStart}ms`);
        }

        // (f) strip <sources>…</sources> from saved text, emit sources event
        const { clean, sources: parsedSources } = stripSourcesTag(fullResponse);
        const dedupedAgentSources = dedupeSources(results);
        const merged = new Map<string, { title: string; url: string; domain: string }>();
        for (const s of [...parsedSources, ...dedupedAgentSources]) {
          if (s.url && !merged.has(s.url)) merged.set(s.url, s);
        }
        const finalSources = Array.from(merged.values());
        emit({ type: 'sources', sources: finalSources });

        // (g) follow-ups
        const tickers = Array.from(
          new Set([...portfolioCtx.tickers, ...extractTickers(clean.slice(0, 1500))])
        ).slice(0, 8);
        if (remainingBudgetMs() >= FOLLOW_UP_BUDGET_MS) {
          const followUps = await generateFollowUps(message, clean.slice(0, 500), tickers);
          emit({ type: 'follow_ups', suggestions: followUps });
        }

        // (h) persist assistant message
        await supabase.from('chat_messages').insert({
          user_id: user.id,
          session_id: sessionId,
          mode: 'ask',
          role: 'assistant',
          content: clean,
          citations: finalSources,
        });

        // (i) session title on first exchange
        if (isFirstExchange && remainingBudgetMs() >= SESSION_TITLE_BUDGET_MS) {
          const title = await generateSessionTitle(message, clean);
          if (title) emit({ type: 'session_title', title });
        }

        // (j) done
        const modelLabel: 'flash' | 'mixed' = results.some((r) => r.model === 'gemini-2.5-pro')
          ? 'mixed'
          : 'flash';
        emit({
          type: 'done',
          model: modelLabel,
          deepRemaining: getDeepUsageRemaining(user.id),
        });
        close();

        // (k) Async post-processing — runs after stream closes, non-blocking
        const allMessages = [
          ...history.map((h) => ({ role: h.role, content: h.content })),
          { role: 'user' as const, content: message },
          { role: 'assistant' as const, content: clean },
        ];
        const shouldSummarize = allMessages.length >= 10 || isFirstExchange;

        Promise.allSettled([
          extractMemories(user.id, sessionId, [message], clean, supabase),
          extractDecisions(user.id, sessionId, clean, supabase),
          shouldSummarize
            ? summarizeSession(user.id, sessionId, allMessages, supabase)
            : Promise.resolve(),
          matchDecisionsToTrades(user.id, supabase),
        ]).catch(console.error);

      } catch (err) {
        console.error(`[agent-chat] FAILED at ${Date.now() - pipelineStart}ms:`, err);
        const safeMsg = fullResponse.trim().length > 0
          ? '\n\nThe response was cut short because the request took too long. Please ask again if you want me to continue.'
          : "\n\nI couldn't process that request right now. Please try again in a moment.";
        const error = err as Error & { status?: number; rawText?: string; model?: string };
        console.error('[agent-chat] pipeline failed', {
          message: err instanceof Error ? err.message : 'unknown error',
          status: error.status,
          model: error.model,
          rawText: error.rawText,
          stack: err instanceof Error ? err.stack : undefined,
        });
        emit({
          type: 'stream',
          content: safeMsg,
        });
        emit({
          type: 'done',
          model: 'error',
          deepRemaining: getDeepUsageRemaining(user.id),
        });
        close();
        // Note: deepConsumed is best-effort — if we credited before error we keep it spent,
        // matching spec "1 deep usage per query regardless of outcome."
        void deepConsumed;
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
