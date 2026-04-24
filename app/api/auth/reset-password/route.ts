import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase-server';

const Schema = z.object({
  password: z.string().min(8),
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

  const { password } = parsed.data;
  const supabase = await createSupabaseServerClient();

  // Requires an active session (set by the /api/auth/callback exchange)
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return NextResponse.json({ error: 'Failed to update password' }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
