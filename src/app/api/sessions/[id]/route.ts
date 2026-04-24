import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { Citation } from '@/types/chat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('user_id', user.id)
    .eq('session_id', params.id)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ messages: data ?? [] });
}

interface PersistMessageInput {
  role?: unknown;
  content?: unknown;
  citations?: unknown;
}

function sanitizeCitations(value: unknown): Citation[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => ({
      url: typeof item.url === 'string' ? item.url : '',
      title: typeof item.title === 'string' ? item.title : undefined,
      snippet: typeof item.snippet === 'string' ? item.snippet : undefined,
      domain: typeof item.domain === 'string' ? item.domain : undefined,
    }))
    .filter((item) => item.url);
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { messages?: PersistMessageInput[] };
  try {
    body = (await req.json()) as { messages?: PersistMessageInput[] };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  const rows = messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => ({
      user_id: user.id,
      session_id: params.id,
      mode: 'ask' as const,
      role: message.role as 'user' | 'assistant',
      content: typeof message.content === 'string' ? message.content.trim() : '',
      citations: sanitizeCitations(message.citations),
    }))
    .filter((message) => message.content.length > 0);

  if (rows.length === 0) {
    return NextResponse.json({ error: 'No valid messages to persist' }, { status: 400 });
  }

  const { error } = await supabase.from('chat_messages').insert(rows);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, count: rows.length });
}
