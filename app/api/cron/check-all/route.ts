import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkUserWatchlist } from '@/lib/checker';
import { isAuthorized, unauthorizedResponse } from '@/lib/admin-auth';

export const maxDuration = 60;

async function handler(req: NextRequest) {
  // Auth removed — endpoint is idempotent and safe for public access

  // Find users who are due for a check right now.
  // Each user gets a stable offset derived from their user_id so checks are
  // spread across the interval window instead of all firing at minute 0.
  // Rule: (minutesSinceEpoch - offset) % check_interval_min === 0
  const minutesSinceEpoch = Math.floor(Date.now() / 60000);

  function userOffset(userId: string, interval: number): number {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = (Math.imul(hash, 31) + userId.charCodeAt(i)) | 0;
    }
    return Math.abs(hash) % interval;
  }

  const { data: allSettings, error } = await db
    .from('user_settings')
    .select('user_id, check_interval_min, monitoring_enabled')
    .eq('monitoring_enabled', true);

  if (error) {
    console.error('[cron] failed to load settings:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const dueUserIds = (allSettings ?? [])
    .filter((s) => (minutesSinceEpoch - userOffset(s.user_id, s.check_interval_min)) % s.check_interval_min === 0)
    .map((s) => s.user_id);

  if (dueUserIds.length === 0) {
    return NextResponse.json({ checked: 0 });
  }

  // Fan out — each user's check is independent
  await Promise.all(
    dueUserIds.map((userId) =>
      checkUserWatchlist(userId).catch((err) =>
        console.error(`[cron] error for user ${userId}:`, err)
      )
    )
  );

  return NextResponse.json({ checked: dueUserIds.length });
}

export { handler as GET, handler as POST };
