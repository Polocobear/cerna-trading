import { callGeminiV2, type GeminiFunctionDeclaration } from '@/lib/gemini/client';
import { ORCHESTRATOR_SYSTEM_PROMPT } from './prompts';
import type { OrchestratorPlan, ToolCall, ToolName } from './types';

const VALID_TOOLS: ReadonlySet<ToolName> = new Set<ToolName>([
  'screen_asx',
  'analyze_stock',
  'brief_market',
  'check_portfolio',
]);

const TOOL_DECLARATIONS: GeminiFunctionDeclaration[] = [
  {
    name: 'screen_asx',
    description:
      'Screen the ASX for stocks matching a strategy. Use for discovery queries ("find value stocks", "dividend plays in mining").',
    parameters: {
      type: 'OBJECT',
      properties: {
        strategy: {
          type: 'STRING',
          enum: ['value', 'growth', 'dividend', 'quality', 'momentum', 'turnaround'],
          description: 'The screening strategy to apply',
        },
        sector: {
          type: 'STRING',
          description: 'Optional sector filter (e.g. "mining", "financials", "healthcare")',
        },
        market_cap: {
          type: 'STRING',
          enum: ['large', 'mid', 'small', 'all'],
          description: 'Optional market cap tier',
        },
        additional_criteria: {
          type: 'STRING',
          description: 'Any extra qualitative constraints from the user',
        },
      },
      required: ['strategy'],
    },
  },
  {
    name: 'analyze_stock',
    description:
      'Deep institutional analysis of a single ASX ticker. Use for "analyze X", "should I buy X", "thoughts on X".',
    parameters: {
      type: 'OBJECT',
      properties: {
        ticker: { type: 'STRING', description: 'ASX ticker, uppercase, no .AX suffix' },
        analysis_type: {
          type: 'STRING',
          enum: ['thesis', 'fundamentals', 'technical', 'peers', 'valuation', 'full'],
          description: 'Depth and angle of analysis',
        },
        context: {
          type: 'STRING',
          description: 'Optional extra context from the user query',
        },
      },
      required: ['ticker', 'analysis_type'],
    },
  },
  {
    name: 'brief_market',
    description:
      'Produce a market briefing. Use for "what happened today?", "anything interesting?", macro/news questions.',
    parameters: {
      type: 'OBJECT',
      properties: {
        focus: {
          type: 'STRING',
          enum: ['general', 'portfolio_relevant', 'sector', 'macro', 'earnings'],
          description: 'Briefing angle',
        },
        sector: {
          type: 'STRING',
          description: 'Sector to spotlight, if applicable',
        },
      },
      required: ['focus'],
    },
  },
  {
    name: 'check_portfolio',
    description:
      'Analyze the user\'s current holdings. Use for "how\'s my portfolio", concentration/rebalance/performance questions.',
    parameters: {
      type: 'OBJECT',
      properties: {
        check_type: {
          type: 'STRING',
          enum: ['health', 'concentration', 'rebalance', 'performance', 'full'],
          description: 'Type of portfolio check',
        },
      },
      required: ['check_type'],
    },
  },
];

export interface OrchestratorInput {
  userMessage: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export async function runOrchestrator(input: OrchestratorInput): Promise<OrchestratorPlan> {
  const messages = [
    ...input.history.map((h) => ({ role: h.role, content: h.content })),
    { role: 'user' as const, content: input.userMessage },
  ];

  const result = await callGeminiV2({
    model: 'gemini-2.5-flash',
    systemPrompt: ORCHESTRATOR_SYSTEM_PROMPT,
    messages,
    tools: TOOL_DECLARATIONS,
    temperature: 0.2,
    maxOutputTokens: 1024,
  });

  const seen = new Set<string>();
  const toolCalls: ToolCall[] = [];
  for (const fc of result.functionCalls) {
    if (!VALID_TOOLS.has(fc.name as ToolName)) continue;
    // dedupe exact duplicates (same name + same stringified args)
    const key = `${fc.name}:${JSON.stringify(fc.args ?? {})}`;
    if (seen.has(key)) continue;
    // also dedupe by name (rule: never duplicate call)
    const nameSeen = toolCalls.some((t) => t.name === fc.name);
    if (nameSeen) continue;
    seen.add(key);
    toolCalls.push({ name: fc.name as ToolName, arguments: fc.args ?? {} });
    if (toolCalls.length >= 3) break;
  }

  if (toolCalls.length === 0) {
    const trimmed = result.text.trim();
    return { directResponse: trimmed || "How can I help with your portfolio today?", toolCalls: [] };
  }

  return { toolCalls };
}
