import { callGeminiV2Stream } from '@/lib/gemini/client';
import { buildSynthesizerPrompt } from './prompts';
import type { AgentResult } from './types';

interface GeminiStreamChunk {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
}

function formatAgentResults(results: AgentResult[]): string {
  const sections: string[] = [];
  for (const r of results) {
    const header = `## ${r.agent.toUpperCase()} AGENT — ${r.description}${r.status === 'error' ? ' (FAILED)' : ''}`;
    const body = r.status === 'success' ? r.data : `Agent failed: ${r.error ?? 'unknown error'}. Proceed without this input.`;
    const sourcesList =
      r.sources.length > 0
        ? `\n\nAgent sources:\n${r.sources.map((s) => `- [${s.title || s.domain}] ${s.url}`).join('\n')}`
        : '';
    sections.push(`${header}\n\n${body}${sourcesList}`);
  }
  return sections.join('\n\n---\n\n');
}

/**
 * Stream-synthesize final response. Yields text chunks as they arrive.
 */
export async function* synthesize(
  userQuery: string,
  agentResults: AgentResult[],
  portfolioContext: string
): AsyncGenerator<string, void, unknown> {
  const systemPrompt = buildSynthesizerPrompt(portfolioContext);
  const agentBlock = formatAgentResults(agentResults);

  const consolidatedSources = dedupeSources(agentResults);
  const sourceHints =
    consolidatedSources.length > 0
      ? `\n\n# Available sources (use and cite as appropriate)\n${consolidatedSources
          .map((s, i) => `${i + 1}. ${s.title || s.domain} — ${s.url}`)
          .join('\n')}`
      : '';

  const userMessage = `# User query\n${userQuery}\n\n# Specialist agent findings\n\n${agentBlock}${sourceHints}\n\nNow synthesize. Remember to append the <action-block>…</action-block> (unless trivial) and the <sources>[…]</sources> JSON block.`;

  const res = await callGeminiV2Stream({
    model: 'gemini-2.5-flash',
    systemPrompt,
    userMessage,
    temperature: 0.6,
    maxOutputTokens: 4096,
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    throw new Error(`Synthesizer failed: ${res.status} ${text.slice(0, 200)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
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
  } finally {
    reader.releaseLock();
  }
}

export function dedupeSources(
  results: AgentResult[]
): Array<{ title: string; url: string; domain: string }> {
  const seen = new Map<string, { title: string; url: string; domain: string }>();
  for (const r of results) {
    for (const s of r.sources) {
      if (!s.url) continue;
      if (!seen.has(s.url)) seen.set(s.url, s);
    }
  }
  return Array.from(seen.values());
}
