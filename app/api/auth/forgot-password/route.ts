import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase-server';

const Schema = z.object({
  email: z.string().email(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 422 }
    );
  }

  const { email } = parsed.data;
  const supabase = await createSupabaseServerClient();

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
  const redirectTo = `${appUrl}/api/auth/callback?next=/reset-password`;

  // Always return 200 to avoid leaking whether the email exists
  await supabase.auth.resetPasswordForEmail(email, { redirectTo });

  return NextResponse.json({ ok: true });
}
