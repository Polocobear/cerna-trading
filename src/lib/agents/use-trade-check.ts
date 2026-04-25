'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { AgentContext } from '@/lib/memory/context-builder';
import { FINANCIAL_DISCLAIMER } from './prompts';
import type {
  TradeCheckCatalystResult,
  TradeCheckFundamentalsResult,
  TradeCheckInit,
  TradeCheckPortfolioFitResult,
  TradeCheckResponseClassification,
  TradeCheckScreenResult,
  TradeCheckState,
  TradeCheckStepId,
  TradeCheckVerdictResult,
} from './trade-check-types';
import {
  createTradeCheckState,
  nextTradeCheckStep,
} from './trade-check-types';

type TradeAwarePhase =
  | 'idle'
  | 'orchestrating'
  | 'researching'
  | 'synthesizing'
  | 'trade_check'
  | 'done';

interface MessageSource {
  title: string;
  url: string;
  domain: string;
  snippet?: string;
}

interface MutableChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  sources?: MessageSource[];
  followUps?: string[];
}

interface UseTradeCheckOptions {
  setMessages: Dispatch<SetStateAction<MutableChatMessage[]>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setIsLoading: Dispatch<SetStateAction<boolean>>;
  setIsStreaming: Dispatch<SetStateAction<boolean>>;
  setPhase: Dispatch<SetStateAction<TradeAwarePhase>>;
}

interface TriggerHandleResponse {
  runId: string;
  publicAccessToken?: string;
  stepId: 'fundamentals' | 'catalyst';
}

interface TriggerStatusResponse<T> {
  status?: string;
  output?: {
    success?: boolean;
    result?: T | null;
    sources?: MessageSource[];
    error?: string;
  } | null;
  error?: string | null;
  metadata?: Record<string, unknown>;
}

const TERMINAL_FAILURES = new Set([
  'FAILED',
  'CANCELED',
  'CRASHED',
  'SYSTEM_FAILURE',
  'TIMED_OUT',
  'EXPIRED',
]);

function cloneState(state: TradeCheckState): TradeCheckState {
  return {
    ...state,
    challengeNotes: { ...state.challengeNotes },
    questions: [...state.questions],
    steps: {
      screen: { ...state.steps.screen, sources: [...(state.steps.screen.sources ?? [])] },
      fundamentals: {
        ...state.steps.fundamentals,
        sources: [...(state.steps.fundamentals.sources ?? [])],
      },
      catalyst: { ...state.steps.catalyst, sources: [...(state.steps.catalyst.sources ?? [])] },
      portfolio_fit: {
        ...state.steps.portfolio_fit,
        sources: [...(state.steps.portfolio_fit.sources ?? [])],
      },
      verdict: { ...state.steps.verdict, sources: [...(state.steps.verdict.sources ?? [])] },
    },
  };
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return fallback;
}

function formatCurrency(value: number): string {
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function buildStepSummary(result: {
  headline: string;
  summary: string;
  keyPoints?: string[];
  riskFlags?: string[];
}): string {
  const points = Array.isArray(result.keyPoints) ? result.keyPoints.filter(Boolean) : [];
  const risks = Array.isArray(result.riskFlags) ? result.riskFlags.filter(Boolean) : [];

  const lines = [`**${result.headline}**`, '', result.summary];

  if (points.length > 0) {
    lines.push('', '### What stands out');
    for (const point of points) {
      lines.push(`- ${point}`);
    }
  }

  if (risks.length > 0) {
    lines.push('', '### Risks to keep in mind');
    for (const risk of risks) {
      lines.push(`- ${risk}`);
    }
  }

  return lines.join('\n');
}

function formatScreenMessage(
  ticker: string,
  result: TradeCheckScreenResult,
  gateMessage: string
): string {
  return [
    `## Trade checklist — ${ticker}`,
    '',
    '### Step 1 — Quick screen',
    buildStepSummary(result),
    '',
    `**Setup:** ${result.setupView}`,
    `**Liquidity:** ${result.liquidityView}`,
    `**Why now:** ${result.whyNow}`,
    '',
    '### Next move',
    gateMessage,
  ].join('\n');
}

function formatFundamentalsMessage(
  ticker: string,
  result: TradeCheckFundamentalsResult,
  gateMessage: string
): string {
  return [
    `## Trade checklist — ${ticker}`,
    '',
    '### Step 2 — Fundamentals',
    buildStepSummary(result),
    '',
    result.qualityScore != null ? `**Quality score:** ${Math.round(result.qualityScore)}/100` : null,
    `**Valuation view:** ${result.valuationView}`,
    `**Balance sheet:** ${result.balanceSheetView}`,
    `**Earnings power:** ${result.earningsView}`,
    `**What needs to be true:** ${result.whatNeedsToBeTrue}`,
    '',
    '### Next move',
    gateMessage,
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}

function formatCatalystMessage(
  ticker: string,
  result: TradeCheckCatalystResult,
  gateMessage: string
): string {
  return [
    `## Trade checklist — ${ticker}`,
    '',
    '### Step 3 — Catalysts',
    buildStepSummary(result),
    '',
    `**Timing window:** ${result.timingWindow}`,
    result.nearTermCatalysts.length > 0 ? '### Near-term catalysts' : null,
    ...result.nearTermCatalysts.map((item) => `- ${item}`),
    '',
    `**What could break it:** ${result.whatCouldBreakMomentum}`,
    '',
    '### Next move',
    gateMessage,
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}

function formatPortfolioFitMessage(
  ticker: string,
  result: TradeCheckPortfolioFitResult,
  gateMessage: string
): string {
  return [
    `## Trade checklist — ${ticker}`,
    '',
    '### Step 4 — Portfolio fit',
    buildStepSummary(result),
    '',
    result.fitScore != null ? `**Fit score:** ${Math.round(result.fitScore)}/100` : null,
    result.suggestedSizePct != null ? `**Suggested size:** ${result.suggestedSizePct}%` : null,
    result.suggestedSizeAmount != null
      ? `**Suggested dollars:** ${formatCurrency(result.suggestedSizeAmount)}`
      : null,
    `**Sizing note:** ${result.sizingNote}`,
    `**Diversification impact:** ${result.diversificationImpact}`,
    '',
    '### Next move',
    gateMessage,
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}

function formatVerdictMessage(ticker: string, result: TradeCheckVerdictResult): string {
  return [
    `## Trade checklist — ${ticker}`,
    '',
    '### Final verdict',
    `**${result.verdict} · ${result.headline}**`,
    '',
    result.summary,
    '',
    `**Conviction:** ${result.conviction}`,
    `**Position sizing:** ${result.positionSizing}`,
    `**Timeframe:** ${result.timeframe}`,
    '',
    result.entryStrategy.length > 0 ? '### Entry strategy' : null,
    ...result.entryStrategy.map((item, index) => `${index + 1}. ${item}`),
    '',
    result.invalidationTriggers.length > 0 ? '### Invalidation triggers' : null,
    ...result.invalidationTriggers.map((item) => `- ${item}`),
    '',
    result.watchFor.length > 0 ? '### What to watch' : null,
    ...result.watchFor.map((item) => `- ${item}`),
    '',
    '### Final call',
    result.finalCall,
    '',
    FINANCIAL_DISCLAIMER,
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}

function formatBailMessage(ticker: string): string {
  return [
    `## Trade checklist — ${ticker}`,
    '',
    'Stopped here. If you want to restart later, ask for a fresh trade check on this name.',
  ].join('\n');
}

function formatResizeAcknowledgement(ticker: string, text: string): string {
  return [
    `## Trade checklist — ${ticker}`,
    '',
    text,
    '',
    'Say continue when you want me to keep going.',
  ].join('\n');
}

function buildExtraContext(state: TradeCheckState, note?: string): string {
  const completed = Object.values(state.steps)
    .filter((step) => step.result)
    .map((step) => {
      const headline =
        step.result && 'headline' in step.result && typeof step.result.headline === 'string'
          ? step.result.headline
          : step.title;
      return `- ${step.title}: ${headline}`;
    });

  return [
    `Original request: ${state.userMessage}`,
    state.resizePreferencePct != null ? `Preferred size cap: ${state.resizePreferencePct}%` : null,
    state.resizePreferenceAmount != null
      ? `Preferred size cap: ${formatCurrency(state.resizePreferenceAmount)}`
      : null,
    completed.length > 0 ? 'Completed checklist context:' : null,
    completed.length > 0 ? completed.join('\n') : null,
    note ? `User note: ${note}` : null,
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function useTradeCheck(options: UseTradeCheckOptions): {
  tradeCheckState: TradeCheckState | null;
  startTradeCheck: (init: TradeCheckInit, context: AgentContext, assistantId: string) => Promise<boolean>;
  handleTradeCheckMessage: (userMessage: string, assistantId: string) => Promise<boolean>;
  clearTradeCheck: () => void;
} {
  const { setMessages, setError, setIsLoading, setIsStreaming, setPhase } = options;
  const [tradeCheckState, setTradeCheckState] = useState<TradeCheckState | null>(null);
  const stateRef = useRef<TradeCheckState | null>(null);
  const contextRef = useRef<AgentContext | null>(null);

  useEffect(() => {
    stateRef.current = tradeCheckState;
  }, [tradeCheckState]);

  const replaceState = useCallback((nextState: TradeCheckState | null) => {
    stateRef.current = nextState;
    setTradeCheckState(nextState);
  }, []);

  const patchState = useCallback((updater: (prev: TradeCheckState) => TradeCheckState) => {
    setTradeCheckState((prev) => {
      if (!prev) return prev;
      const next = updater(prev);
      stateRef.current = next;
      return next;
    });
  }, []);

  const updateAssistantMessage = useCallback(
    (assistantId: string, content: string, sources: MessageSource[] = []) => {
      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content,
                sources,
              }
            : message
        )
      );
    },
    [setMessages]
  );

  const markStepRunning = useCallback(
    (stepId: TradeCheckStepId, stage?: string) => {
      patchState((prev) => {
        const next = cloneState(prev);
        next.currentStep = stepId;
        next.awaitingUserInput = false;
        next.steps[stepId] = {
          ...next.steps[stepId],
          status: 'running',
          error: undefined,
          gateMessage: undefined,
          stage,
          startedAt: new Date().toISOString(),
        };
        return next;
      });
    },
    [patchState]
  );

  const setStepError = useCallback(
    (stepId: TradeCheckStepId, error: string) => {
      patchState((prev) => {
        const next = cloneState(prev);
        next.awaitingUserInput = true;
        next.steps[stepId] = {
          ...next.steps[stepId],
          status: 'error',
          error,
          completedAt: new Date().toISOString(),
        };
        return next;
      });
    },
    [patchState]
  );

  const requestGateMessage = useCallback(
    async (
      state: TradeCheckState,
      stepId: TradeCheckStepId,
      userReply?: string,
      classification?: TradeCheckResponseClassification | null
    ): Promise<string> => {
      const response = await fetch('/api/agent/trade-check/gate-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stepId,
          state,
          userReply,
          classification,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok || typeof data.message !== 'string') {
        throw new Error('Failed to generate gate message');
      }
      return data.message;
    },
    []
  );

  const applyCompletedStep = useCallback(
    async (
      stepId: TradeCheckStepId,
      assistantId: string,
      result:
        | TradeCheckScreenResult
        | TradeCheckFundamentalsResult
        | TradeCheckCatalystResult
        | TradeCheckPortfolioFitResult
        | TradeCheckVerdictResult,
      sources: MessageSource[],
      userReply?: string,
      classification?: TradeCheckResponseClassification | null
    ) => {
      const current = stateRef.current;
      if (!current) return;

      const completed = cloneState(current);
      completed.currentStep = stepId;
      completed.awaitingUserInput = stepId !== 'verdict';
      completed.steps[stepId] = {
        ...completed.steps[stepId],
        status: 'complete',
        result,
        sources,
        stage: undefined,
        error: undefined,
        completedAt: new Date().toISOString(),
      };

      if (stepId === 'verdict') {
        completed.active = false;
        completed.awaitingUserInput = false;
        completed.completedAt = new Date().toISOString();
        replaceState(completed);
        updateAssistantMessage(
          assistantId,
          formatVerdictMessage(completed.ticker, result as TradeCheckVerdictResult),
          sources
        );
        setPhase('done');
        setIsLoading(false);
        setIsStreaming(false);
        return;
      }

      const gateMessage = await requestGateMessage(completed, stepId, userReply, classification);
      completed.steps[stepId].gateMessage = gateMessage;
      replaceState(completed);

      let content = '';
      if (stepId === 'screen') {
        content = formatScreenMessage(completed.ticker, result as TradeCheckScreenResult, gateMessage);
      } else if (stepId === 'fundamentals') {
        content = formatFundamentalsMessage(
          completed.ticker,
          result as TradeCheckFundamentalsResult,
          gateMessage
        );
      } else if (stepId === 'catalyst') {
        content = formatCatalystMessage(
          completed.ticker,
          result as TradeCheckCatalystResult,
          gateMessage
        );
      } else {
        content = formatPortfolioFitMessage(
          completed.ticker,
          result as TradeCheckPortfolioFitResult,
          gateMessage
        );
      }

      updateAssistantMessage(assistantId, content, sources);
      setPhase('trade_check');
      setIsLoading(false);
      setIsStreaming(false);
    },
    [
      replaceState,
      requestGateMessage,
      setIsLoading,
      setIsStreaming,
      setPhase,
      updateAssistantMessage,
    ]
  );

  const pollTriggerStep = useCallback(
    async <T,>(stepId: 'fundamentals' | 'catalyst', runId: string): Promise<{
      success: boolean;
      result: T | null;
      sources: MessageSource[];
      error?: string;
    }> => {
      while (true) {
        const response = await fetch(`/api/agent/status?runId=${encodeURIComponent(runId)}`);
        const data = (await response.json().catch(() => ({}))) as TriggerStatusResponse<T>;

        if (!response.ok) {
          throw new Error(typeof data.error === 'string' ? data.error : 'Failed to poll trade check step');
        }

        if (data.status === 'COMPLETED') {
          return {
            success: Boolean(data.output?.success),
            result: (data.output?.result ?? null) as T | null,
            sources: data.output?.sources ?? [],
            error: data.output?.error,
          };
        }

        if (data.status && TERMINAL_FAILURES.has(data.status)) {
          throw new Error(
            typeof data.error === 'string' ? data.error : `${stepId} step failed`
          );
        }

        const stage =
          typeof data.metadata?.stage === 'string'
            ? data.metadata.stage
            : typeof data.metadata?.agentStatusMessage === 'string'
              ? data.metadata.agentStatusMessage
              : undefined;

        if (stage) {
          patchState((prev) => {
            const next = cloneState(prev);
            next.steps[stepId] = {
              ...next.steps[stepId],
              status: 'running',
              stage,
              runId,
            };
            return next;
          });
        }

        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    },
    [patchState]
  );

  const runStep = useCallback(
    async (
      stepId: TradeCheckStepId,
      assistantId: string,
      note?: string,
      userReply?: string,
      classification?: TradeCheckResponseClassification | null
    ): Promise<boolean> => {
      const current = stateRef.current;
      const context = contextRef.current;
      if (!current || !context) return false;

      markStepRunning(stepId);
      setError(null);
      setIsLoading(true);
      setIsStreaming(false);
      setPhase('trade_check');

      const extraContext = buildExtraContext(current, note);

      try {
        if (stepId === 'screen') {
          const response = await fetch('/api/agent/trade-check/screen', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ticker: current.ticker,
              requestedAction: current.requestedAction,
              context,
              extraContext,
            }),
          });
          const data = (await response.json().catch(() => ({}))) as {
            success?: boolean;
            result?: TradeCheckScreenResult | null;
            sources?: MessageSource[];
            error?: string;
          };

          if (!response.ok || !data.success || !data.result) {
            throw new Error(data.error ?? 'Quick screen failed');
          }

          await applyCompletedStep(
            'screen',
            assistantId,
            data.result,
            data.sources ?? [],
            userReply,
            classification
          );
          return true;
        }

        if (stepId === 'fundamentals' || stepId === 'catalyst') {
          const route =
            stepId === 'fundamentals'
              ? '/api/agent/trade-check/fundamentals'
              : '/api/agent/trade-check/catalyst';
          const response = await fetch(route, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ticker: current.ticker,
              requestedAction: current.requestedAction,
              context,
              extraContext,
            }),
          });
          const handle = (await response.json().catch(() => ({}))) as TriggerHandleResponse & {
            error?: string;
          };
          if (!response.ok || !handle.runId) {
            throw new Error(handle.error ?? `Failed to start ${stepId} step`);
          }

          patchState((prev) => {
            const next = cloneState(prev);
            next.steps[stepId] = {
              ...next.steps[stepId],
              runId: handle.runId,
              publicAccessToken: handle.publicAccessToken,
            };
            return next;
          });

          const completed = await pollTriggerStep<
            TradeCheckFundamentalsResult | TradeCheckCatalystResult
          >(stepId, handle.runId);

          if (!completed.success || !completed.result) {
            throw new Error(completed.error ?? `${stepId} step failed`);
          }

          await applyCompletedStep(
            stepId,
            assistantId,
            completed.result,
            completed.sources,
            userReply,
            classification
          );
          return true;
        }

        if (stepId === 'portfolio_fit') {
          const response = await fetch('/api/agent/trade-check/portfolio-fit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ticker: current.ticker,
              requestedAction: current.requestedAction,
              context,
              extraContext,
            }),
          });
          const data = (await response.json().catch(() => ({}))) as {
            success?: boolean;
            result?: TradeCheckPortfolioFitResult | null;
            sources?: MessageSource[];
            error?: string;
          };

          if (!response.ok || !data.success || !data.result) {
            throw new Error(data.error ?? 'Portfolio fit step failed');
          }

          await applyCompletedStep(
            'portfolio_fit',
            assistantId,
            data.result,
            data.sources ?? [],
            userReply,
            classification
          );
          return true;
        }

        const response = await fetch('/api/agent/trade-check/verdict', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticker: current.ticker,
            requestedAction: current.requestedAction,
            context,
            extraContext,
          }),
        });
        const data = (await response.json().catch(() => ({}))) as {
          success?: boolean;
          result?: TradeCheckVerdictResult | null;
          sources?: MessageSource[];
          error?: string;
        };

        if (!response.ok || !data.success || !data.result) {
          throw new Error(data.error ?? 'Verdict step failed');
        }

        await applyCompletedStep('verdict', assistantId, data.result, data.sources ?? []);
        return true;
      } catch (error) {
        const message = toErrorMessage(error, `${stepId} step failed`);
        setStepError(stepId, message);
        setError(message);
        setIsLoading(false);
        setIsStreaming(false);
        setPhase('trade_check');
        updateAssistantMessage(
          assistantId,
          `## Trade checklist — ${current.ticker}\n\nI hit an issue on **${current.steps[stepId].title}**: ${message}`
        );
        return false;
      }
    },
    [
      applyCompletedStep,
      markStepRunning,
      patchState,
      pollTriggerStep,
      setError,
      setIsLoading,
      setIsStreaming,
      setPhase,
      setStepError,
      updateAssistantMessage,
    ]
  );

  const clearTradeCheck = useCallback(() => {
    contextRef.current = null;
    replaceState(null);
  }, [replaceState]);

  const startTradeCheck = useCallback(
    async (init: TradeCheckInit, context: AgentContext, assistantId: string): Promise<boolean> => {
      contextRef.current = context;
      const next = createTradeCheckState(init);
      replaceState(next);
      return runStep('screen', assistantId);
    },
    [replaceState, runStep]
  );

  const handleTradeCheckMessage = useCallback(
    async (userMessage: string, assistantId: string): Promise<boolean> => {
      const current = stateRef.current;
      if (!current) return false;

      setError(null);
      setPhase('trade_check');
      setIsStreaming(false);

      const response = await fetch('/api/agent/trade-check/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userMessage }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        classification?: TradeCheckResponseClassification;
      };
      const classification =
        response.ok && data.classification
          ? data.classification
          : ({
              action: 'question',
              reason: 'Fallback to question handling.',
              question: userMessage,
            } as TradeCheckResponseClassification);

      if (classification.action === 'bail') {
        patchState((prev) => {
          const next = cloneState(prev);
          next.active = false;
          next.awaitingUserInput = false;
          next.completedAt = new Date().toISOString();
          return next;
        });
        updateAssistantMessage(assistantId, formatBailMessage(current.ticker));
        setIsLoading(false);
        setPhase('done');
        return true;
      }

      if (classification.action === 'question') {
        const gateMessage = await requestGateMessage(current, current.currentStep, userMessage, classification);
        patchState((prev) => {
          const next = cloneState(prev);
          next.questions = [...next.questions, classification.question ?? userMessage];
          next.steps[next.currentStep] = {
            ...next.steps[next.currentStep],
            gateMessage,
          };
          next.awaitingUserInput = true;
          return next;
        });
        updateAssistantMessage(
          assistantId,
          `## Trade checklist — ${current.ticker}\n\n${gateMessage}`,
          current.steps[current.currentStep].sources ?? []
        );
        setIsLoading(false);
        setPhase('trade_check');
        return true;
      }

      if (classification.action === 'resize') {
        patchState((prev) => {
          const next = cloneState(prev);
          if (classification.resizePct != null) {
            next.resizePreferencePct = classification.resizePct;
          }
          if (classification.resizeAmount != null) {
            next.resizePreferenceAmount = classification.resizeAmount;
          }
          return next;
        });

        if (current.currentStep === 'portfolio_fit' || current.currentStep === 'verdict') {
          const rerunStep =
            current.currentStep === 'verdict' ? 'portfolio_fit' : current.currentStep;
          return runStep(rerunStep, assistantId, classification.challengeNote ?? userMessage, userMessage, classification);
        }

        const resizeText =
          classification.resizePct != null
            ? `Noted — I’ll cap the size around ${classification.resizePct}%.`
            : classification.resizeAmount != null
              ? `Noted — I’ll frame the size around ${formatCurrency(classification.resizeAmount)}.`
              : 'Noted — I’ll keep the sizing tighter when we reach portfolio fit.';
        updateAssistantMessage(assistantId, formatResizeAcknowledgement(current.ticker, resizeText));
        setIsLoading(false);
        setPhase('trade_check');
        return true;
      }

      if (classification.action === 'challenge') {
        patchState((prev) => {
          const next = cloneState(prev);
          const existing = next.challengeNotes[next.currentStep] ?? [];
          next.challengeNotes[next.currentStep] = [
            ...existing,
            classification.challengeNote ?? userMessage,
          ];
          return next;
        });
        return runStep(
          current.currentStep,
          assistantId,
          classification.challengeNote ?? userMessage,
          userMessage,
          classification
        );
      }

      let nextStep = nextTradeCheckStep(current.currentStep);
      if (!nextStep) {
        updateAssistantMessage(assistantId, `## Trade checklist — ${current.ticker}\n\nThis checklist is already complete.`);
        setIsLoading(false);
        setPhase('done');
        return true;
      }

      if (classification.action === 'skip') {
        if (nextStep !== 'verdict') {
          patchState((prev) => {
            const next = cloneState(prev);
            next.steps[nextStep!] = {
              ...next.steps[nextStep!],
              status: 'skipped',
              completedAt: new Date().toISOString(),
            };
            return next;
          });
          nextStep = nextTradeCheckStep(nextStep) ?? 'verdict';
        }
      }

      return runStep(nextStep, assistantId, undefined, userMessage, classification);
    },
    [
      patchState,
      requestGateMessage,
      runStep,
      setError,
      setIsLoading,
      setIsStreaming,
      setPhase,
      updateAssistantMessage,
    ]
  );

  return {
    tradeCheckState,
    startTradeCheck,
    handleTradeCheckMessage,
    clearTradeCheck,
  };
}
