import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RawMessage {
  session_id: string;
  mode: string;
  role: string;
  content: string;
  created_at: string;
}

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('chat_messages')
    .select('session_id, mode, role, content, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as RawMessage[];
  const bySession = new Map<
    string,
    {
      id: string;
      mode: string;
      preview: string;
      lastMessageAt: string;
      messageCount: number;
    }
  >();

  for (const row of rows) {
    const existing = bySession.get(row.session_id);
    if (!existing) {
      bySession.set(row.session_id, {
        id: row.session_id,
        mode: row.mode,
        preview: row.role === 'user' ? row.content.slice(0, 80) : '',
        lastMessageAt: row.created_at,
        messageCount: 1,
      });
    } else {
      existing.messageCount += 1;
      if (row.role === 'user' && !existing.preview) {
        existing.preview = row.content.slice(0, 80);
      }
    }
  }

  const sessions = Array.from(bySession.values()).sort(
    (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
  );

  return NextResponse.json({ sessions });
}
