import {
  callGeminiV2Stream,
  sanitizeGeminiError,
} from '@/lib/gemini/client';
import { buildSynthesizerPrompt } from './prompts';
import type { AgentSource, AgentResult } from './types';
import type { AgentContext } from '@/lib/memory/context-builder';

const SYNTHESIS_STREAM_IDLE_TIMEOUT_MS = 12000;

interface GeminiStreamChunk {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
}

type GeminiStreamError = Error & {
  status?: number;
  rawText?: string;
  model?: string;
};

function buildStreamError(status: number, rawText: string): GeminiStreamError {
  const err = new Error(sanitizeGeminiError(status, rawText)) as GeminiStreamError;
  err.status = status;
  err.rawText = rawText;
  err.model = 'gemini-2.5-flash';
  return err;
}

async function readWithTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs: number
): Promise<ReadableStreamReadResult<Uint8Array>> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    return await new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
      timeoutId = setTimeout(() => {
        reject(buildStreamError(504, `Synthesis stream timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      reader
        .read()
        .then(resolve)
        .catch(reject);
    });
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function formatAgentResultsChunked(results: Array<{ name: string; success: boolean; content: string | null; error?: string; sources?: AgentSource[] }>): { agentBlock: string; failedAgents: string[] } {
  const sections: string[] = [];
  const failedAgents: string[] = [];
  for (const r of results) {
    if (!r.success || !r.content) {
      failedAgents.push(r.name);
      continue;
    }
    const header = `## ${r.name.toUpperCase()} AGENT`;
    const body = r.content;
    const sourcesList =
      r.sources && r.sources.length > 0
        ? `\n\nAgent sources:\n${r.sources.map((s) => `- [${s.title || s.domain}] ${s.url}`).join('\n')}`
        : '';
    sections.push(`${header}\n\n${body}${sourcesList}`);
  }
  return { agentBlock: sections.join('\n\n---\n\n'), failedAgents };
}

function formatAgentResultsLegacy(results: AgentResult[]): { agentBlock: string; failedAgents: string[] } {
  const sections: string[] = [];
  const failedAgents: string[] = [];
  for (const r of results) {
    if (r.status === 'error') {
      failedAgents.push(r.description);
      continue;
    }
    const header = `## ${r.agent.toUpperCase()} AGENT — ${r.description}`;
    const body = r.data;
    const sourcesList =
      r.sources.length > 0
        ? `\n\nAgent sources:\n${r.sources.map((s) => `- [${s.title || s.domain}] ${s.url}`).join('\n')}`
        : '';
    sections.push(`${header}\n\n${body}${sourcesList}`);
  }
  return { agentBlock: sections.join('\n\n---\n\n'), failedAgents };
}

export function dedupeSources(
  results: Array<{ sources?: AgentSource[] }>
): Array<{ title: string; url: string; domain: string; snippet?: string }> {
  const seen = new Map<string, { title: string; url: string; domain: string; snippet?: string }>();
  for (const r of results) {
    for (const s of r.sources ?? []) {
      if (!s.url) continue;
      if (!seen.has(s.url)) seen.set(s.url, s);
    }
  }
  return Array.from(seen.values());
}

export async function runSynthesizer(options: {
  results: Array<{ name: string; success: boolean; content: string | null; sources: AgentSource[] }>;
  context: AgentContext;
  deadlineMs: number;
  onToken: (token: string) => void;
  onSources: (sources: AgentSource[]) => void;
  onFollowUps: (followUps: string[]) => void;
}): Promise<void> {
  const { results, context, deadlineMs, onToken, onSources, onFollowUps } = options;
  
  const systemPrompt = buildSynthesizerPrompt(context.portfolioContext, context.intelligenceContext);
  const { agentBlock, failedAgents } = formatAgentResultsChunked(results);

  const consolidatedSources = dedupeSources(results);
  const sourceHints =
    consolidatedSources.length > 0
      ? `\n\n# Available sources (use and cite as appropriate)\n${consolidatedSources
          .map((s, i) => `${i + 1}. ${s.title || s.domain} — ${s.url}`)
          .join('\n')}`
      : '';

  const failedHint = failedAgents.length > 0
    ? `\n\n# Failed Agents\nThe following research tasks failed to complete: ${failedAgents.join(', ')}.\nBriefly note this failure at the end of your response, e.g., "Note: I wasn't able to complete [failed task] due to a timeout. Ask me to try that specifically if you'd like." Do not output raw error messages.`
    : '';

  const userMessage = `# Specialist agent findings\n\n${agentBlock}${sourceHints}${failedHint}\n\nNow synthesize. Remember to append the <action-block>…</action-block> (unless trivial) and the <sources>[…]</sources> JSON block.`;

  const remaining = Math.max(5000, Math.min(15000, deadlineMs - Date.now()));

  const res = await callGeminiV2Stream({
    model: 'gemini-2.5-flash',
    systemPrompt,
    userMessage,
    temperature: 0.6,
    maxOutputTokens: 8192,
    requestTimeoutMs: remaining,
    retryOptions: {
      maxRetries: 1,
      backoffMs: 1000,
      deadlineMs: deadlineMs,
    },
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    throw buildStreamError(res.status, text);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullResponse = '';

  try {
    while (true) {
      const { done, value } = await readWithTimeout(reader, SYNTHESIS_STREAM_IDLE_TIMEOUT_MS);
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n');
      buffer = parts.pop() ?? '';
      for (const line of parts) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const data = JSON.parse(payload) as GeminiStreamChunk;
          const parts2 = data.candidates?.[0]?.content?.parts ?? [];
          for (const p of parts2) {
            if (typeof p.text === 'string' && p.text.length > 0) {
              fullResponse += p.text;
              onToken(p.text);
            }
          }
        } catch {
          // ignore malformed chunk
        }
      }
    }
  } catch (err) {
    await reader.cancel().catch(() => {});
    throw err;
  } finally {
    reader.releaseLock();
  }

  const re = /<sources>([\s\S]*?)<\/sources>/i;
  const m = fullResponse.match(re);
  if (m && m[1]) {
    try {
      const parsed = JSON.parse(m[1].trim());
      if (Array.isArray(parsed)) {
        const s: AgentSource[] = parsed.filter((x): x is AgentSource => typeof x === 'object' && x !== null && !!x.url);
        const merged = new Map<string, AgentSource>();
        for (const source of [...s, ...consolidatedSources]) {
          if (source.url && !merged.has(source.url)) merged.set(source.url, source);
        }
        onSources(Array.from(merged.values()));
      }
    } catch {
      // ignore
    }
  } else {
    onSources(consolidatedSources);
  }

  onFollowUps([]); 
}

export async function* synthesize(
  userQuery: string,
  agentResults: AgentResult[],
  portfolioContext: string,
  intelligenceContext?: string,
  sourcesContext?: string,
  deadlineMs?: number
): AsyncGenerator<string, void, unknown> {
  const systemPrompt = buildSynthesizerPrompt(portfolioContext, intelligenceContext, sourcesContext);
  const { agentBlock, failedAgents } = formatAgentResultsLegacy(agentResults);

  const consolidatedSources = dedupeSources(agentResults);
  const sourceHints =
    consolidatedSources.length > 0
      ? `\n\n# Available sources (use and cite as appropriate)\n${consolidatedSources
          .map((s, i) => `${i + 1}. ${s.title || s.domain} — ${s.url}`)
          .join('\n')}`
      : '';

  const failedHint = failedAgents.length > 0
    ? `\n\n# Failed Agents\nThe following research tasks failed to complete: ${failedAgents.join(', ')}.\nBriefly note this failure at the end of your response, e.g., "Note: I wasn't able to complete [failed task] due to a timeout. Ask me to try that specifically if you'd like." Do not output raw error messages.`
    : '';

  const userMessage = `# User query\n${userQuery}\n\n# Specialist agent findings\n\n${agentBlock}${sourceHints}${failedHint}\n\nNow synthesize. Remember to append the <action-block>…</action-block> (unless trivial) and the <sources>[…]</sources> JSON block.`;

  const remaining = Math.max(5000, Math.min(15000, (deadlineMs ?? Date.now() + 15000) - Date.now()));

  const res = await callGeminiV2Stream({
    model: 'gemini-2.5-flash',
    systemPrompt,
    userMessage,
    temperature: 0.6,
    maxOutputTokens: 8192,
    requestTimeoutMs: remaining,
    retryOptions: {
      maxRetries: 1,
      backoffMs: 1000,
      deadlineMs: deadlineMs,
    },
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    console.error('[synthesizer] Non-OK response', {
      model: 'gemini-2.5-flash',
      status: res.status,
      body: text,
    });
    const err = new Error(sanitizeGeminiError(res.status, text)) as Error & {
      status?: number;
      rawText?: string;
      model?: string;
    };
    err.status = res.status;
    err.rawText = text;
    err.model = 'gemini-2.5-flash';
    throw err;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await readWithTimeout(reader, SYNTHESIS_STREAM_IDLE_TIMEOUT_MS);
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n');
      buffer = parts.pop() ?? '';
      for (const line of parts) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const data = JSON.parse(payload) as GeminiStreamChunk;
          const parts2 = data.candidates?.[0]?.content?.parts ?? [];
          for (const p of parts2) {
            if (typeof p.text === 'string' && p.text.length > 0) {
              yield p.text;
            }
          }
        } catch {
          // ignore malformed chunk
        }
      }
    }
  } catch (err) {
    console.error('[synthesizer] Stream read failed', err);
    await reader.cancel().catch(() => {});
    if ((err as GeminiStreamError).status) {
      throw err;
    }
    throw buildStreamError(504, err instanceof Error ? err.message : 'Stream read failed');
  } finally {
    reader.releaseLock();
  }
}
