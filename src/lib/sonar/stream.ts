import type { SonarChunk } from '@/types/sonar';

export interface StreamEvent {
  type: 'token' | 'citations' | 'done' | 'error';
  content?: string;
  citations?: string[];
  error?: string;
}

export function encodeSSE(event: StreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export function parseSonarSSE(text: string): SonarChunk | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed === '[DONE]') return null;
  try {
    return JSON.parse(trimmed) as SonarChunk;
  } catch {
    return null;
  }
}

export function transformSonarStream(upstream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';
  let citations: string[] = [];
  let fullText = '';

  return new ReadableStream({
    async start(controller) {
      const reader = upstream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (payload === '[DONE]') continue;
            const chunk = parseSonarSSE(payload);
            if (!chunk) continue;
            if (chunk.citations && chunk.citations.length > 0) {
              citations = chunk.citations;
            }
            const token = chunk.choices?.[0]?.delta?.content;
            if (token) {
              fullText += token;
              controller.enqueue(encoder.encode(encodeSSE({ type: 'token', content: token })));
            }
          }
        }
        controller.enqueue(encoder.encode(encodeSSE({ type: 'citations', citations })));
        controller.enqueue(encoder.encode(encodeSSE({ type: 'done', content: fullText })));
        controller.close();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'stream error';
        controller.enqueue(encoder.encode(encodeSSE({ type: 'error', error: message })));
        controller.close();
      } finally {
        reader.releaseLock();
      }
    },
  });
}
