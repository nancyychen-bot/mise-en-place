import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { checkUserWatchlist } from '@/lib/checker';
import { db } from '@/lib/db';

const RATE_LIMIT_MS = 30000;

export async function POST() {
  const user = await requireUser().catch(() => null);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const cutoff = new Date(Date.now() - RATE_LIMIT_MS).toISOString();
  const { data } = await db
    .from('user_settings')
    .update({ last_manual_check_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .or(`last_manual_check_at.is.null,last_manual_check_at.lt.${cutoff}`)
    .select('user_id');

  if (!data?.length) {
    return NextResponse.json({ error: 'Rate limited — wait a few seconds' }, { status: 429 });
  }

  try {
    const results = await checkUserWatchlist(user.id, true);
    return NextResponse.json(results);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
