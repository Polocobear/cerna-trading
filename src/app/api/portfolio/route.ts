import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

interface PositionInput {
  ticker: string;
  exchange?: string;
  company_name?: string;
  shares: number;
  cost_basis: number;
  date_acquired?: string;
  thesis?: string;
}

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('positions')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ positions: data });
}

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const input = (await req.json()) as PositionInput;
  const { data, error } = await supabase
    .from('positions')
    .insert({
      user_id: user.id,
      ticker: input.ticker.toUpperCase(),
      exchange: input.exchange ?? 'ASX',
      company_name: input.company_name ?? null,
      shares: input.shares,
      cost_basis: input.cost_basis,
      date_acquired: input.date_acquired ?? null,
      thesis: input.thesis ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ position: data });
}

export async function PATCH(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json()) as { id: string } & Partial<PositionInput> & {
      status?: 'open' | 'closed';
      close_price?: number;
    };
  const { id, ...updates } = body;
  const { data, error } = await supabase
    .from('positions')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ position: data });
}

export async function DELETE(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = (await req.json()) as { id: string };
  const { error } = await supabase.from('positions').delete().eq('id', id).eq('user_id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
