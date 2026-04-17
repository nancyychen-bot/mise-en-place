import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { checkUserWatchlist } from '@/lib/checker';

// Simple per-user rate limiter: 1 request per 5s
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

  try {
    const results = await checkUserWatchlist(user.id);
    return NextResponse.json(results);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
