import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { checkUserWatchlist } from '@/lib/checker';
import { db } from '@/lib/db';

const RATE_LIMIT_MS = 30000; // 30 seconds between manual checks

export async function POST() {
  const user = await requireUser().catch(() => null);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // DB-backed rate limit — survives cold starts
  const { data: settings } = await db
    .from('user_settings')
    .select('last_manual_check_at')
    .eq('user_id', user.id)
    .single();

  const lastRun = settings?.last_manual_check_at ? new Date(settings.last_manual_check_at).getTime() : 0;
  if (Date.now() - lastRun < RATE_LIMIT_MS) {
    return NextResponse.json({ error: 'Rate limited — wait a few seconds' }, { status: 429 });
  }

  await db
    .from('user_settings')
    .update({ last_manual_check_at: new Date().toISOString() })
    .eq('user_id', user.id);

  try {
    const results = await checkUserWatchlist(user.id, true);
    return NextResponse.json(results);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
