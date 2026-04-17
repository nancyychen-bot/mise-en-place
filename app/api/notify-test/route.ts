import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { sendNotification } from '@/lib/ntfy';

// Rate limit: 1 per 5s per user
const lastRun = new Map<string, number>();
const RATE_LIMIT_MS = 5000;

export async function POST() {
  const user = await requireUser().catch(() => null);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const last = lastRun.get(user.id) ?? 0;
  if (Date.now() - last < RATE_LIMIT_MS) {
    return NextResponse.json({ error: 'Rate limited — wait a few seconds' }, { status: 429 });
  }
  lastRun.set(user.id, Date.now());

  const { data: settings } = await db
    .from('user_settings')
    .select('ntfy_topic, ntfy_priority')
    .eq('user_id', user.id)
    .single();

  if (!settings?.ntfy_topic) {
    return NextResponse.json(
      { error: 'No ntfy topic configured. Add one in Account settings first.' },
      { status: 400 }
    );
  }

  await sendNotification(
    settings.ntfy_topic,
    'Mise en Place — Test Notification',
    "It's working! You'll be notified the moment a table opens up.",
    settings.ntfy_priority,
    process.env.NEXT_PUBLIC_APP_URL
  );

  return NextResponse.json({ ok: true });
}
