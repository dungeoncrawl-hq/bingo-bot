import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | undefined;

// Lazy on purpose: a top-level throw here would take down every page
// whenever Supabase isn't configured yet, instead of failing gracefully.
export function getSupabase(): SupabaseClient {
  if (client) return client;

  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'Missing Supabase config. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local (see .env.example).',
    );
  }

  client = createClient(url, anonKey);
  return client;
}
