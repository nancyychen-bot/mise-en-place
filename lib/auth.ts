import { createSupabaseServerClient } from './supabase-server';
import type { User } from './types';

/**
 * Returns the currently authenticated user from the session cookie,
 * or null if not signed in.
 */
export async function getCurrentUser(): Promise<User | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    // Fetch display name from our users table
    const { data: profile } = await supabase
      .from('users')
      .select('display_name')
      .eq('id', user.id)
      .single();

    return {
      id: user.id,
      email: user.email ?? '',
      displayName: profile?.display_name ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Same as getCurrentUser but throws a 401-equivalent error if not signed in.
 * Use in API routes that require auth.
 */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) {
    throw new AuthError('Not authenticated');
  }
  return user;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}
