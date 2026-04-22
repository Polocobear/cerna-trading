'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentName } from './types';

export type AgentStatusState = 'pending' | 'running' | 'complete' | 'error';

export interface AgentStatus {
  name: AgentName;
  description: string;
  status: AgentStatusState;
  summary?: string;
  error?: string;
  sources?: Source[];
}

export interface Source {
  title: string;
  url: string;
  domain: string;
  snippet?: string;
}

export interface AgentChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  followUps?: string[];
  createdAt: string;
}

interface UseAgentChatOptions {
  sessionId: string;
  depth: 'standard' | 'deep';
}

export type Phase = 'idle' | 'orchestrating' | 'researching' | 'synthesizing' | 'done';

interface UseAgentChatResult {
  messages: AgentChatMessage[];
  agentStatuses: AgentStatus[];
  isLoading: boolean;
  isStreaming: boolean;
  deepRemaining: number;
  sources: Source[];
  followUps: string[];
  sessionTitle: string | null;
  error: string | null;
  phase: Phase;
  sendMessage: (message: string) => Promise<void>;
  resetSession: () => void;
  loadSession: (messages: AgentChatMessage[]) => void;
}

function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function sanitizeClientErrorMessage(message: string): string {
  if (
    /Gemini/i.test(message) ||
    /request failed \(\d+\)/i.test(message) ||
    /^\s*\d{3}\b/.test(message)
  ) {
    return 'The AI service is temporarily unavailable. Please try again.';
  }
  return message || 'Something went wrong. Please try again.';
}

export function useAgentChat(options: UseAgentChatOptions): UseAgentChatResult {
  const { sessionId, depth } = options;

  const [messages, setMessages] = useState<AgentChatMessage[]>([]);
  const [agentsRecord, setAgentsRecord] = useState<Record<string, AgentStatus>>({});
  const [phase, setPhase] = useState<Phase>('idle');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [deepRemaining, setDeepRemaining] = useState(0);
  const [sources, setSources] = useState<Source[]>([]);
  const [followUps, setFollowUps] = useState<string[]>([]);
  const [sessionTitle, setSessionTitle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // Fetch deep-remaining initial value.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/deep-usage')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { remaining?: number } | null) => {
        if (cancelled || !data || typeof data.remaining !== 'number') return;
        setDeepRemaining(data.remaining);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const resetSession = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setAgentsRecord({});
    setPhase('idle');
    setSources([]);
    setFollowUps([]);
    setSessionTitle(null);
    setError(null);
    setIsLoading(false);
    setIsStreaming(false);
  }, []);

  const loadSession = useCallback((initial: AgentChatMessage[]) => {
    abortRef.current?.abort();
    setMessages(initial);
    setAgentsRecord({});
    setPhase('idle');
    const lastAssistant = [...initial].reverse().find((m) => m.role === 'assistant');
    setSources(lastAssistant?.sources ?? []);
    setFollowUps(lastAssistant?.followUps ?? []);
    setSessionTitle(null);
    setError(null);
    setIsLoading(false);
    setIsStreaming(false);
  }, []);

  const endpointFor = (toolName: string): string => {
    const map: Record<string, string> = {
      screen_stocks: '/api/agent/screen',
      analyze_stock: '/api/agent/analyze',
      brief_market: '/api/agent/brief',
      check_portfolio: '/api/agent/portfolio',
      log_trade: '/api/agent/log-trade',
    };
    return map[toolName] ?? '/api/agent/screen';
  };

  const labelFor = (call: { name: string; arguments?: Record<string, unknown> }): string => {
    const args = call.arguments;
    const labels: Record<string, string> = {
      screen_stocks: 'Screening stocks',
      analyze_stock: `Analyzing ${String(args?.ticker ?? 'stock')}`,
      brief_market: 'Briefing market',
      check_portfolio: 'Checking portfolio',
      log_trade: 'Logging trade',
    };
    return labels[call.name] ?? call.name;
  };

  const classify = (toolName: string): AgentName => {
    switch (toolName) {
      case 'screen_stocks': return 'screen';
      case 'analyze_stock': return 'analyze';
      case 'brief_market': return 'brief';
      case 'log_trade': return 'trade_log';
      case 'check_portfolio':
      default: return 'portfolio';
    }
  };

  const doSend = useCallback(
    async (messageText: string): Promise<void> => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setError(null);
      setIsLoading(true);
      setIsStreaming(false);
      setPhase('orchestrating');
      setSources([]);
      setFollowUps([]);

      const userMsg: AgentChatMessage = {
        id: genId(),
        role: 'user',
        content: messageText,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);

      const assistantId = genId();
      setMessages((prev) => [
        ...prev,
        {
          id: assistantId,
          role: 'assistant',
          content: '',
          sources: [],
          followUps: [],
          createdAt: new Date().toISOString(),
        },
      ]);

      try {
        // === STEP 1: Orchestrate ===
        const orchRes = await fetch('/api/agent/orchestrate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: messageText, sessionId }),
          signal: controller.signal,
        });
        if (!orchRes.ok) throw new Error('Orchestration failed');
        const { toolCalls, directReply, context } = await orchRes.json();

        // If orchestrator answered directly (no tools), we're done
        if (directReply && toolCalls.length === 0) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: directReply } : m
            )
          );
          setPhase('done');
          setIsLoading(false);
          return;
        }

        // === STEP 2: Research (parallel agents) ===
        setPhase('researching');

        const initialAgents: Record<string, AgentStatus> = {};
        for (const call of toolCalls) {
          initialAgents[call.name] = { 
            name: classify(call.name),
            description: labelFor(call),
            status: 'running', 
            sources: [] 
          };
        }
        setAgentsRecord(initialAgents);

        const agentPromises = toolCalls.map(async (call: { name: string, arguments: Record<string, unknown> }) => {
          const endpoint = endpointFor(call.name);
          try {
            const res = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ args: call.arguments, context, deep: depth === 'deep' }),
              signal: controller.signal,
            });
            const result = await res.json();
            
            setAgentsRecord((prev) => ({
              ...prev,
              [call.name]: {
                name: classify(call.name),
                status: result.success ? 'complete' : 'error',
                description: labelFor(call),
                summary: result.success ? 'Done' : undefined,
                error: result.success ? undefined : result.error,
                sources: result.sources ?? [],
              },
            }));
            
            return { name: call.name, ...result };
          } catch (err) {
            setAgentsRecord((prev) => ({
              ...prev,
              [call.name]: { ...prev[call.name], status: 'error', error: 'Agent execution failed' },
            }));
            return { name: call.name, success: false, content: null, sources: [] };
          }
        });

        const results = await Promise.all(agentPromises);
        const successful = results.filter((r) => r.success);

        if (successful.length === 0) {
          setError('All research agents failed. Please try again.');
          setPhase('done');
          setIsLoading(false);
          return;
        }

        // === STEP 3: Synthesize ===
        setPhase('synthesizing');
        setIsStreaming(true);

        const synthRes = await fetch('/api/agent/synthesize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ results, context }),
          signal: controller.signal,
        });

        if (!synthRes.ok || !synthRes.body) {
          const fallbackContent = successful
            .map((r) => `### ${labelFor({ name: r.name, arguments: {} })}\n\n${r.content}`)
            .join('\n\n---\n\n');

          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: fallbackContent } : m
            )
          );
          setPhase('done');
          setIsStreaming(false);
          setIsLoading(false);
          return;
        }

        const reader = synthRes.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data: ')) continue;
            try {
              const event = JSON.parse(trimmed.slice(6));
              
              if (event.type === 'token') {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: m.content + event.token }
                      : m
                  )
                );
              } else if (event.type === 'sources') {
                setSources(event.sources);
                setMessages((prev) =>
                  prev.map((m) => (m.id === assistantId ? { ...m, sources: event.sources } : m))
                );
              } else if (event.type === 'follow_ups') {
                setFollowUps(event.followUps);
                setMessages((prev) =>
                  prev.map((m) => (m.id === assistantId ? { ...m, followUps: event.followUps } : m))
                );
              } else if (event.type === 'error') {
                setError(event.message);
              } else if (event.type === 'done') {
                // Done event explicitly handles closing logic
              }
            } catch {}
          }
        }
        
        // Final cleanup
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: m.content.replace(/<sources>[\s\S]*?<\/sources>/i, '').trimEnd() }
              : m
          )
        );

        setPhase('done');
        setIsStreaming(false);
        setIsLoading(false);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        console.error('[useAgentChat] pipeline failed:', err);
        setError(sanitizeClientErrorMessage(err instanceof Error ? err.message : 'Something went wrong'));
        setPhase('done');
        setIsStreaming(false);
        setIsLoading(false);
      }
    },
    [sessionId, depth]
  );

  const sendMessage = useCallback(
    async (messageText: string): Promise<void> => {
      const trimmed = messageText.trim();
      if (!trimmed) return;
      await doSend(trimmed);
    },
    [doSend]
  );

  return {
    messages,
    agentStatuses: Object.values(agentsRecord),
    isLoading,
    isStreaming,
    deepRemaining,
    sources,
    followUps,
    sessionTitle,
    error,
    phase,
    sendMessage,
    resetSession,
    loadSession,
  };
}
