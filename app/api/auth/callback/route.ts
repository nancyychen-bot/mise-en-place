import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

// Handles Supabase auth redirects (e.g. password reset email links).
// Supabase appends ?code=xxx to the redirectTo URL; this route exchanges
// it for a session cookie and forwards the user to the intended destination.
export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl;
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  // Something went wrong — send back to sign-in with an error hint
  return NextResponse.redirect(
    new URL('/signin?error=link-expired', origin)
  );
}
