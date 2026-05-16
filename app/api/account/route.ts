import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { createSupabaseServerClient } from '@/lib/supabase-server';


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
    .select('ntfy_topic, ntfy_priority, monitoring_enabled, timezone, resy_api_key, resy_auth_token, opentable_session, sevenrooms_auth_token, token_expired, phone_number, stripe_payment_method')
    .eq('user_id', user.id)
    .single();

  return NextResponse.json({
    email: profile?.email ?? user.email,
    displayName: profile?.display_name ?? null,
    ntfyTopic: settings?.ntfy_topic ?? null,
    ntfyPriority: settings?.ntfy_priority ?? 'default',
    monitoringEnabled: settings?.monitoring_enabled ?? true,
    timezone: settings?.timezone ?? 'America/New_York',
    resyApiKey: settings?.resy_api_key ?? null,
    resyAuthToken: settings?.resy_auth_token ? '••••••' : null,
    opentableSession: settings?.opentable_session ? '••••••' : null,
    sevenroomsAuthToken: settings?.sevenrooms_auth_token ? '••••••' : null,
    tokenExpired: settings?.token_expired ?? {},
    phoneNumber: settings?.phone_number ?? null,
    stripePaymentMethod: settings?.stripe_payment_method ? '••••••' : null,
  });
}

const PatchSchema = z.object({
  email: z.string().email().optional(),
  displayName: z.string().max(80).optional(),
  ntfyTopic: z.string().max(100).optional(),
  ntfyPriority: z.enum(['min', 'low', 'default', 'high', 'max']).optional(),
  monitoringEnabled: z.boolean().optional(),
  timezone: z.string().max(50).optional(),
  resyApiKey: z.string().max(200).optional(),
  resyAuthToken: z.string().max(500).optional(),
  opentableSession: z.string().max(500).optional(),
  sevenroomsAuthToken: z.string().max(500).optional(),
  phoneNumber: z.string().max(20).optional(),
  stripePaymentMethod: z.string().max(200).optional(),
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
  if (d.ntfyTopic !== undefined) {
    // Strip any URL prefix users might accidentally include (e.g. "ntfy.sh/topic")
    const topic = d.ntfyTopic.replace(/^https?:\/\/[^/]+\//, '').replace(/^ntfy\.sh\//, '');
    settingsUpdate.ntfy_topic = topic;
  }
  if (d.ntfyPriority !== undefined) settingsUpdate.ntfy_priority = d.ntfyPriority;
  if (d.monitoringEnabled !== undefined) settingsUpdate.monitoring_enabled = d.monitoringEnabled;
  if (d.timezone !== undefined) settingsUpdate.timezone = d.timezone;
  if (d.resyApiKey !== undefined) settingsUpdate.resy_api_key = d.resyApiKey || null;
  if (d.phoneNumber !== undefined) settingsUpdate.phone_number = d.phoneNumber || null;
  if (d.stripePaymentMethod !== undefined) settingsUpdate.stripe_payment_method = d.stripePaymentMethod || null;

  if (d.resyAuthToken !== undefined || d.opentableSession !== undefined || d.sevenroomsAuthToken !== undefined) {
    const { data: current } = await db
      .from('user_settings')
      .select('token_expired')
      .eq('user_id', user.id)
      .single();
    const expired = { ...(current?.token_expired ?? {}) };

    if (d.resyAuthToken !== undefined) {
      settingsUpdate.resy_auth_token = d.resyAuthToken || null;
      delete expired.resy;
    }
    if (d.opentableSession !== undefined) {
      settingsUpdate.opentable_session = d.opentableSession || null;
      delete expired.opentable;
    }
    if (d.sevenroomsAuthToken !== undefined) {
      settingsUpdate.sevenrooms_auth_token = d.sevenroomsAuthToken || null;
      delete expired.sevenrooms;
    }
    settingsUpdate.token_expired = expired;
  }

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
