import { NextRequest } from 'next/server';
import { createClient as createSupabaseServerClient } from '@/lib/supabase/server';
import { runSynthesizer } from '@/lib/agents/synthesizer';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const { results, context } = await req.json();

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        await runSynthesizer({
          results,
          context,
          deadlineMs: Date.now() + 25000,
          onToken: (token: string) => {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'token', token })}\n\n`)
            );
          },
          onSources: (sources) => {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'sources', sources })}\n\n`)
            );
          },
          onFollowUps: (followUps) => {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'follow_ups', followUps })}\n\n`)
            );
          },
        });
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
      } catch (err) {
        console.error('[synthesize] failed:', err);
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'error', message: 'Synthesis failed' })}\n\n`)
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
