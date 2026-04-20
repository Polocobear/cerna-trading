import type { GeminiGroundingChunk, GeminiGroundingMetadata } from './client';

export interface ParsedCitation {
  title: string;
  url: string;
  snippet?: string;
}

export interface StreamEvent {
  type: 'token' | 'citations' | 'done' | 'error';
  content?: string;
  citations?: ParsedCitation[];
  error?: string;
}

function encodeSSE(event: StreamEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

/**
 * Transform Gemini's SSE stream into our app's SSE contract:
 *   {type: 'token', content: '...'}  — per token
 *   {type: 'citations', citations: [...]} — on completion
 *   {type: 'done', content: fullText} — on completion
 *   {type: 'error', error: '...'} — on failure
 */
export function transformGeminiStream(
  upstream: ReadableStream<Uint8Array>
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let citations: ParsedCitation[] = [];

  return new ReadableStream({
    async start(controller) {
      const reader = upstream.getReader();
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
              const data = JSON.parse(payload) as {
                candidates?: Array<{
                  content?: { parts?: Array<{ text?: string }> };
                  groundingMetadata?: GeminiGroundingMetadata;
                }>;
              };
              const candidate = data.candidates?.[0];
              if (!candidate) continue;

              const token = candidate.content?.parts?.map((p) => p.text ?? '').join('');
              if (token) {
                fullText += token;
                controller.enqueue(encodeSSE({ type: 'token', content: token }));
              }

              const grounding = candidate.groundingMetadata;
              if (grounding?.groundingChunks) {
                citations = grounding.groundingChunks
                  .filter((c: GeminiGroundingChunk) => c.web?.uri)
                  .map((c: GeminiGroundingChunk) => ({
                    title: c.web?.title ?? '',
                    url: c.web?.uri ?? '',
                  }));
              }
            } catch {
              // Skip malformed chunks
            }
          }
        }
        controller.enqueue(encodeSSE({ type: 'citations', citations }));
        controller.enqueue(encodeSSE({ type: 'done', content: fullText }));
        controller.close();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'stream error';
        controller.enqueue(encodeSSE({ type: 'error', error: message }));
        controller.close();
      } finally {
        reader.releaseLock();
      }
    },
  });
}
