import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase-server';

const INVITE_CODE = 'EatHappy';

const SignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  displayName: z.string().max(80).optional(),
  inviteCode: z.string(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = SignupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 422 }
    );
  }

  const { email, password, displayName, inviteCode } = parsed.data;

  if (inviteCode !== INVITE_CODE) {
    return NextResponse.json({ error: 'Invalid invite code' }, { status: 403 });
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName ?? null },
      // Skip email confirmation in dev — set "Email Confirm" to off in Supabase dashboard
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
    },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(
    {
      user: {
        id: data.user?.id,
        email: data.user?.email,
        displayName: displayName ?? null,
      },
    },
    { status: 201 }
  );
}
