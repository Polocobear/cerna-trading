import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface AlertRow {
  id: string;
  alert_type: string;
  title: string;
  body: string;
  ticker: string | null;
  priority: string;
  is_read: boolean;
  is_dismissed: boolean;
  expires_at: string | null;
  created_at: string;
}

interface PatchBody {
  id: string;
  action: 'read' | 'dismiss';
}

function isAlertRow(obj: unknown): obj is AlertRow {
  return typeof obj === 'object' && obj !== null && 'id' in obj && 'title' in obj;
}

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('proactive_alerts')
    .select('id, alert_type, title, body, ticker, priority, is_read, is_dismissed, expires_at, created_at')
    .eq('user_id', user.id)
    .eq('is_dismissed', false)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order('is_read', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const alerts = Array.isArray(data) ? data.filter(isAlertRow) : [];

  return NextResponse.json({ alerts });
}

export async function PATCH(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { id, action } = body;
  if (!id || !action) {
    return NextResponse.json({ error: 'id and action required' }, { status: 400 });
  }

  const update =
    action === 'dismiss'
      ? { is_dismissed: true }
      : action === 'read'
      ? { is_read: true }
      : null;

  if (!update) {
    return NextResponse.json({ error: 'action must be "read" or "dismiss"' }, { status: 400 });
  }

  const { error } = await supabase
    .from('proactive_alerts')
    .update(update)
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
