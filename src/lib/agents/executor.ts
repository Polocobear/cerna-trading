import { callGeminiV2, type GeminiV2Model } from '@/lib/gemini/client';
import {
  buildAnalyzePrompt,
  buildBriefPrompt,
  buildPortfolioCheckPrompt,
  buildScreenPrompt,
  describeToolCall,
} from './prompts';
import type {
  AgentEvent,
  AgentName,
  AgentResult,
  ToolCall,
} from './types';

function classify(toolName: string): AgentName {
  switch (toolName) {
    case 'screen_asx':
      return 'screen';
    case 'analyze_stock':
      return 'analyze';
    case 'brief_market':
      return 'brief';
    case 'check_portfolio':
    default:
      return 'portfolio';
  }
}

function argsToUserMessage(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case 'screen_asx': {
      const strategy = String(args.strategy ?? 'value');
      const sector = args.sector ? ` in the ${String(args.sector)} sector` : '';
      const cap = args.market_cap && args.market_cap !== 'all' ? ` (${String(args.market_cap)} cap)` : '';
      const extra = args.additional_criteria ? `. Additional criteria: ${String(args.additional_criteria)}` : '';
      return `Screen the ASX for ${strategy} stocks${sector}${cap}${extra}. Return 3-5 candidates with full analysis.`;
    }
    case 'analyze_stock': {
      const ticker = String(args.ticker ?? '').toUpperCase();
      const type = String(args.analysis_type ?? 'thesis');
      const context = args.context ? `\n\nUser context: ${String(args.context)}` : '';
      return `Analyze ${ticker} — ${type} analysis.${context}`;
    }
    case 'brief_market': {
      const focus = String(args.focus ?? 'general');
      const sector = args.sector ? ` with a spotlight on ${String(args.sector)}` : '';
      return `Produce today's market briefing, focus: ${focus}${sector}.`;
    }
    case 'check_portfolio': {
      const checkType = String(args.check_type ?? 'health');
      return `Run a ${checkType} check on the user's portfolio.`;
    }
    default:
      return 'Produce research.';
  }
}

function systemPromptFor(agent: AgentName, portfolioContext: string): string {
  switch (agent) {
    case 'screen':
      return buildScreenPrompt(portfolioContext);
    case 'analyze':
      return buildAnalyzePrompt(portfolioContext);
    case 'brief':
      return buildBriefPrompt(portfolioContext);
    case 'portfolio':
      return buildPortfolioCheckPrompt(portfolioContext);
  }
}

async function runAgent(
  tool: ToolCall,
  portfolioContext: string,
  isDeepAvailable: boolean
): Promise<AgentResult> {
  const agent = classify(tool.name);
  const description = describeToolCall(tool.name, tool.arguments);
  const userMessage = argsToUserMessage(tool.name, tool.arguments);
  const systemPrompt = systemPromptFor(agent, portfolioContext);

  // Portfolio always Flash, no search. Screen/Analyze/Brief prefer Pro + search
  // if the user has deep budget available this turn.
  const isResearch = agent !== 'portfolio';
  const primary: GeminiV2Model = isResearch && isDeepAvailable ? 'gemini-2.5-pro' : 'gemini-2.5-flash';
  const enableSearch = isResearch;

  const start = Date.now();

  const tryCall = async (model: GeminiV2Model) => {
    return callGeminiV2({
      model,
      systemPrompt,
      userMessage,
      enableSearchGrounding: enableSearch,
      temperature: 0.55,
      maxOutputTokens: 3072,
    });
  };

  let usedModel: GeminiV2Model = primary;
  try {
    const res = await tryCall(primary);
    return {
      agent,
      description,
      status: 'success',
      data: res.text,
      sources: res.sources,
      executionTime: Date.now() - start,
      model: usedModel,
    };
  } catch (err) {
    const status = (err as Error & { status?: number }).status;
    if (status === 429) {
      // brief backoff then retry
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const res = await tryCall(primary);
        return {
          agent,
          description,
          status: 'success',
          data: res.text,
          sources: res.sources,
          executionTime: Date.now() - start,
          model: usedModel,
        };
      } catch (err2) {
        const status2 = (err2 as Error & { status?: number }).status;
        // Fall back to Flash for research agents if Pro still rate-limited
        if (status2 === 429 && primary === 'gemini-2.5-pro') {
          try {
            usedModel = 'gemini-2.5-flash';
            const res = await tryCall('gemini-2.5-flash');
            return {
              agent,
              description,
              status: 'success',
              data: res.text,
              sources: res.sources,
              executionTime: Date.now() - start,
              model: usedModel,
            };
          } catch (err3) {
            const msg = err3 instanceof Error ? err3.message : 'unknown error';
            return {
              agent,
              description,
              status: 'error',
              data: '',
              sources: [],
              executionTime: Date.now() - start,
              model: usedModel,
              error: msg,
            };
          }
        }
        const msg = err2 instanceof Error ? err2.message : 'unknown error';
        return {
          agent,
          description,
          status: 'error',
          data: '',
          sources: [],
          executionTime: Date.now() - start,
          model: usedModel,
          error: msg,
        };
      }
    }
    const msg = err instanceof Error ? err.message : 'unknown error';
    return {
      agent,
      description,
      status: 'error',
      data: '',
      sources: [],
      executionTime: Date.now() - start,
      model: usedModel,
      error: msg,
    };
  }
}

function summarize(data: string): string {
  const trimmed = data.trim().replace(/\s+/g, ' ');
  if (!trimmed) return 'completed';
  return trimmed.slice(0, 140) + (trimmed.length > 140 ? '…' : '');
}

export async function executeAgents(
  toolCalls: ToolCall[],
  portfolioContext: string,
  isDeepAvailable: boolean,
  onEvent: (event: AgentEvent) => void
): Promise<AgentResult[]> {
  const promises = toolCalls.map(async (tool) => {
    const agent = classify(tool.name);
    const description = describeToolCall(tool.name, tool.arguments);
    onEvent({ type: 'agent_start', agent, description });
    const result = await runAgent(tool, portfolioContext, isDeepAvailable);
    if (result.status === 'success') {
      onEvent({ type: 'agent_complete', agent, summary: summarize(result.data) });
    } else {
      onEvent({ type: 'agent_error', agent, error: result.error ?? 'unknown error' });
    }
    return result;
  });

  const settled = await Promise.allSettled(promises);
  const results: AgentResult[] = [];
  for (let i = 0; i < settled.length; i++) {
    const s = settled[i];
    if (s.status === 'fulfilled') {
      results.push(s.value);
    } else {
      const tool = toolCalls[i];
      const agent = classify(tool.name);
      const msg = s.reason instanceof Error ? s.reason.message : 'unknown error';
      results.push({
        agent,
        description: describeToolCall(tool.name, tool.arguments),
        status: 'error',
        data: '',
        sources: [],
        executionTime: 0,
        model: 'gemini-2.5-flash',
        error: msg,
      });
    }
  }
  return results;
}
