import { callClaudeStream, CLAUDE_HAIKU } from '@/lib/claude/client';
import { buildSynthesizerPrompt } from './prompts';
import type { AgentSource, AgentResult } from './types';
import type { AgentContext } from '@/lib/memory/context-builder';

function formatAgentResultsChunked(
  results: Array<{ name: string; success: boolean; content: string | null; error?: string; sources?: AgentSource[] }>
): { agentBlock: string; failedAgents: string[] } {
  const sections: string[] = [];
  const failedAgents: string[] = [];

  for (const result of results) {
    if (!result.success || !result.content) {
      failedAgents.push(result.name);
      continue;
    }

    const header = `## ${result.name.toUpperCase()} AGENT`;
    const sourcesList =
      result.sources && result.sources.length > 0
        ? `\n\nAgent sources:\n${result.sources.map((source) => `- [${source.title || source.domain}] ${source.url}`).join('\n')}`
        : '';
    sections.push(`${header}\n\n${result.content}${sourcesList}`);
  }

  return { agentBlock: sections.join('\n\n---\n\n'), failedAgents };
}

function formatAgentResultsLegacy(results: AgentResult[]): { agentBlock: string; failedAgents: string[] } {
  const sections: string[] = [];
  const failedAgents: string[] = [];

  for (const result of results) {
    if (result.status === 'error') {
      failedAgents.push(result.description);
      continue;
    }

    const header = `## ${result.agent.toUpperCase()} AGENT - ${result.description}`;
    const sourcesList =
      result.sources.length > 0
        ? `\n\nAgent sources:\n${result.sources.map((source) => `- [${source.title || source.domain}] ${source.url}`).join('\n')}`
        : '';
    sections.push(`${header}\n\n${result.data}${sourcesList}`);
  }

  return { agentBlock: sections.join('\n\n---\n\n'), failedAgents };
}

export function dedupeSources(
  results: Array<{ sources?: AgentSource[] }>
): Array<{ title: string; url: string; domain: string; snippet?: string }> {
  const seen = new Map<string, { title: string; url: string; domain: string; snippet?: string }>();
  for (const result of results) {
    for (const source of result.sources ?? []) {
      if (!source.url || seen.has(source.url)) continue;
      seen.set(source.url, source);
    }
  }
  return Array.from(seen.values());
}

function mergeSources(primary: AgentSource[], fallback: AgentSource[]): AgentSource[] {
  const merged = new Map<string, AgentSource>();
  for (const source of [...primary, ...fallback]) {
    if (!source.url || merged.has(source.url)) continue;
    merged.set(source.url, source);
  }
  return Array.from(merged.values());
}

function parseSourcesFromResponse(text: string): AgentSource[] {
  const match = text.match(/<sources>([\s\S]*?)<\/sources>/i);
  if (!match?.[1]) return [];

  try {
    const parsed = JSON.parse(match[1].trim());
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is AgentSource => typeof item === 'object' && item !== null && typeof item.url === 'string')
      .map((item) => ({
        title: typeof item.title === 'string' ? item.title : item.domain || item.url,
        url: item.url,
        domain: typeof item.domain === 'string' ? item.domain : new URL(item.url).hostname.replace(/^www\./, ''),
        ...(typeof item.snippet === 'string' ? { snippet: item.snippet } : {}),
      }));
  } catch {
    return [];
  }
}

function buildUserMessage(
  userQuery: string | null,
  agentBlock: string,
  consolidatedSources: AgentSource[],
  failedAgents: string[]
): string {
  const userBlock = userQuery ? `# User query\n${userQuery}\n\n` : '';
  const sourceHints =
    consolidatedSources.length > 0
      ? `\n\n# Available sources (use and cite as appropriate)\n${consolidatedSources
          .map((source, index) => `${index + 1}. ${source.title || source.domain} - ${source.url}`)
          .join('\n')}`
      : '';
  const failedHint =
    failedAgents.length > 0
      ? `\n\n# Failed Agents\nThe following research tasks failed to complete: ${failedAgents.join(', ')}.\nBriefly note this failure at the end of your response. Do not output raw error messages.`
      : '';

  return `${userBlock}# Specialist agent findings\n\n${agentBlock}${sourceHints}${failedHint}\n\nNow synthesize. Remember to append the <action-block>...</action-block> (unless trivial) and the <sources>[...]</sources> JSON block.`;
}

class AsyncTextQueue {
  private values: string[] = [];
  private ended = false;
  private error: unknown = null;
  private waiting: Array<{
    resolve: (value: IteratorResult<string>) => void;
    reject: (reason?: unknown) => void;
  }> = [];

  push(value: string): void {
    if (this.ended) return;
    const waiter = this.waiting.shift();
    if (waiter) {
      waiter.resolve({ value, done: false });
      return;
    }
    this.values.push(value);
  }

  close(): void {
    if (this.ended) return;
    this.ended = true;
    while (this.waiting.length > 0) {
      this.waiting.shift()?.resolve({ value: undefined, done: true });
    }
  }

  fail(error: unknown): void {
    if (this.ended) return;
    this.error = error;
    this.ended = true;
    while (this.waiting.length > 0) {
      this.waiting.shift()?.reject(error);
    }
  }

  async next(): Promise<IteratorResult<string>> {
    if (this.values.length > 0) {
      return { value: this.values.shift() as string, done: false };
    }
    if (this.error) {
      throw this.error;
    }
    if (this.ended) {
      return { value: undefined, done: true };
    }
    return new Promise<IteratorResult<string>>((resolve, reject) => {
      this.waiting.push({ resolve, reject });
    });
  }
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

  if (Date.now() > deadlineMs - 3000) {
    throw new Error('Pipeline deadline approached before synthesis');
  }

  const consolidatedSources = dedupeSources(results);
  const sourcesContext = consolidatedSources
    .map((source, index) => `[${index + 1}] ${source.title} - ${source.domain}\n${source.url}`)
    .join('\n\n');
  const systemPrompt = buildSynthesizerPrompt(
    context.portfolioContext,
    context.intelligenceContext,
    sourcesContext
  );
  const { agentBlock, failedAgents } = formatAgentResultsChunked(results);
  const userMessage = buildUserMessage(null, agentBlock, consolidatedSources, failedAgents);

  const response = await callClaudeStream(
    {
      model: CLAUDE_HAIKU,
      systemPrompt,
      userMessage,
      maxTokens: 8192,
      temperature: 1,
    },
    onToken
  );

  onSources(mergeSources(parseSourcesFromResponse(response.text), consolidatedSources));
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
  if (deadlineMs && Date.now() > deadlineMs - 3000) {
    throw new Error('Pipeline deadline approached before synthesis');
  }

  const systemPrompt = buildSynthesizerPrompt(portfolioContext, intelligenceContext, sourcesContext);
  const { agentBlock, failedAgents } = formatAgentResultsLegacy(agentResults);
  const consolidatedSources = dedupeSources(agentResults);
  const userMessage = buildUserMessage(userQuery, agentBlock, consolidatedSources, failedAgents);
  const queue = new AsyncTextQueue();

  const streamPromise = callClaudeStream(
    {
      model: CLAUDE_HAIKU,
      systemPrompt,
      userMessage,
      maxTokens: 8192,
      temperature: 1,
    },
    (chunk) => {
      queue.push(chunk);
    }
  );

  void streamPromise.then(
    () => queue.close(),
    (error) => queue.fail(error)
  );

  try {
    while (true) {
      const next = await queue.next();
      if (next.done) break;
      yield next.value;
    }
    await streamPromise;
  } catch (error) {
    queue.fail(error);
    throw error;
  }
}
