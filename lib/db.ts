import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _db: SupabaseClient | null = null;

/**
 * Service-role client for server-side operations (bypasses RLS).
 * Lazily initialized so the module can be imported at build time
 * without requiring env vars to be present.
 */
export function getDb(): SupabaseClient {
  if (_db) return _db;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required'
    );
  }

  _db = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return _db;
}

// Convenience proxy that forwards property access to the lazy client.
// Use `db.from(...)` just like before — it initializes on first access.
export const db = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getDb();
    const value = client[prop as keyof SupabaseClient];
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
  },
});
