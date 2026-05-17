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
    console.error('[auth/callback] code exchange failed:', error.message);
    return NextResponse.redirect(
      new URL(`/forgot-password?error=${encodeURIComponent(error.message)}`, origin)
    );
  }

  return NextResponse.redirect(
    new URL('/forgot-password?error=Invalid+or+expired+link.+Please+request+a+new+one.', origin)
  );
}
