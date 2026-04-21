import { createClient } from '@supabase/supabase-js';

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Supabase URL or service role key not configured');
  }
  return createClient(url, serviceKey);
}
