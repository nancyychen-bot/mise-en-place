import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { createSupabaseServerClient } from '@/lib/supabase-server';

function maskKey(key: string | null): string | null {
  if (!key || key.length < 4) return null;
  return `••••••••${key.slice(-4)}`;
}

export async function GET() {
  const user = await requireUser().catch(() => null);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await db
    .from('users')
    .select('email, display_name')
    .eq('id', user.id)
    .single();

  const { data: settings } = await db
    .from('user_settings')
    .select('resy_api_key, ntfy_topic, ntfy_priority, monitoring_enabled')
    .eq('user_id', user.id)
    .single();

  return NextResponse.json({
    email: profile?.email ?? user.email,
    displayName: profile?.display_name ?? null,
    resyApiKey: maskKey(settings?.resy_api_key ?? null),
    ntfyTopic: settings?.ntfy_topic ?? null,
    ntfyPriority: settings?.ntfy_priority ?? 'default',
    monitoringEnabled: settings?.monitoring_enabled ?? true,
  });
}

const PatchSchema = z.object({
  email: z.string().email().optional(),
  displayName: z.string().max(80).optional(),
  resyApiKey: z.string().optional(),
  ntfyTopic: z.string().max(100).optional(),
  ntfyPriority: z.enum(['min', 'low', 'default', 'high', 'max']).optional(),
  monitoringEnabled: z.boolean().optional(),
});

export async function PATCH(req: NextRequest) {
  const user = await requireUser().catch(() => null);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 422 });
  }

  const d = parsed.data;

  // Update profile
  if (d.displayName !== undefined || d.email !== undefined) {
    const profileUpdate: Record<string, unknown> = {};
    if (d.displayName !== undefined) profileUpdate.display_name = d.displayName;
    if (d.email !== undefined) profileUpdate.email = d.email;

    await db.from('users').update(profileUpdate).eq('id', user.id);

    // Update email in Supabase Auth if changed
    if (d.email) {
      const supabase = await createSupabaseServerClient();
      await supabase.auth.updateUser({ email: d.email });
    }
  }

  // Update settings
  const settingsUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (d.resyApiKey !== undefined) settingsUpdate.resy_api_key = d.resyApiKey;
  if (d.ntfyTopic !== undefined) {
    // Strip any URL prefix users might accidentally include (e.g. "ntfy.sh/topic")
    const topic = d.ntfyTopic.replace(/^https?:\/\/[^/]+\//, '').replace(/^ntfy\.sh\//, '');
    settingsUpdate.ntfy_topic = topic;
  }
  if (d.ntfyPriority !== undefined) settingsUpdate.ntfy_priority = d.ntfyPriority;
  if (d.monitoringEnabled !== undefined) settingsUpdate.monitoring_enabled = d.monitoringEnabled;

  if (Object.keys(settingsUpdate).length > 1) {
    await db.from('user_settings').update(settingsUpdate).eq('user_id', user.id);
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const user = await requireUser().catch(() => null);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Delete the Supabase Auth user — cascades to our tables via ON DELETE CASCADE
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.admin.deleteUser(user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return new NextResponse(null, { status: 204 });
}
