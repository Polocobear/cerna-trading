import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { callSonarStream } from '@/lib/sonar/client';
import { transformSonarStream } from '@/lib/sonar/stream';
import { buildSystemPrompt, buildDefaultUserMessage } from '@/lib/sonar/prompts';
import type { ChatRequest } from '@/types/chat';
import type { Position, Profile, WatchlistItem } from '@/types/portfolio';
import type { SonarMessage } from '@/types/sonar';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const body = (await req.json()) as ChatRequest;
  const { mode, controls, sessionId } = body;

  if (!mode || !sessionId) {
    return NextResponse.json({ error: 'mode and sessionId are required' }, { status: 400 });
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [positionsRes, profileRes, watchlistRes, messagesRes] = await Promise.all([
    supabase.from('positions').select('*').eq('user_id', user.id).eq('status', 'open'),
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    supabase.from('watchlist').select('*').eq('user_id', user.id),
    supabase
      .from('chat_messages')
      .select('role, content')
      .eq('user_id', user.id)
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  const portfolio = (positionsRes.data ?? []) as Position[];
  const profile = (profileRes.data ?? null) as Profile | null;
  const watchlist = (watchlistRes.data ?? []) as WatchlistItem[];
  const recent = ((messagesRes.data ?? []) as Array<{ role: 'user' | 'assistant'; content: string }>).reverse();

  const userMessage = body.message?.trim() || buildDefaultUserMessage(mode, controls);
  const systemPrompt = buildSystemPrompt({ mode, controls, message: userMessage, portfolio, watchlist, profile });

  const messages: SonarMessage[] = [
    { role: 'system', content: systemPrompt },
    ...recent.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user', content: userMessage },
  ];

  await supabase.from('chat_messages').insert({
    user_id: user.id,
    session_id: sessionId,
    mode,
    role: 'user',
    content: userMessage,
  });

  const sonarResponse = await callSonarStream(messages);
  if (!sonarResponse.ok || !sonarResponse.body) {
    const errText = await sonarResponse.text().catch(() => 'Sonar error');
    return NextResponse.json({ error: errText }, { status: 502 });
  }

  const transformed = transformSonarStream(sonarResponse.body);

  const [forClient, forPersist] = transformed.tee();

  void (async () => {
    const reader = forPersist.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    let citations: string[] = [];
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          try {
            const evt = JSON.parse(line.slice(5).trim()) as {
              type: string;
              content?: string;
              citations?: string[];
            };
            if (evt.type === 'done' && evt.content) fullText = evt.content;
            if (evt.type === 'citations' && evt.citations) citations = evt.citations;
          } catch {
            // ignore parse errors
          }
        }
      }
      if (fullText) {
        await supabase.from('chat_messages').insert({
          user_id: user.id,
          session_id: sessionId,
          mode,
          role: 'assistant',
          content: fullText,
          citations: citations.map((url) => ({ url })),
        });
      }
    } catch {
      // persist failures should not break the stream
    }
  })();

  return new Response(forClient, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
