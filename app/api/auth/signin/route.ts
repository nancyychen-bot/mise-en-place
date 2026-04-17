import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase-server';

const SigninSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = SigninSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 422 }
    );
  }

  const { email, password } = parsed.data;
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  // Fetch display name
  const { data: profile } = await supabase
    .from('users')
    .select('display_name')
    .eq('id', data.user.id)
    .single();

  return NextResponse.json({
    user: {
      id: data.user.id,
      email: data.user.email,
      displayName: profile?.display_name ?? null,
    },
  });
}
