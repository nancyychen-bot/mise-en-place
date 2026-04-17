import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkUserWatchlist } from '@/lib/checker';

export async function POST(req: NextRequest) {
  // Verify cron secret
  const auth = req.headers.get('authorization');
  const secret = process.env.CRON_SECRET;

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Find users who are due for a check right now.
  // Rule: floor(minutes_since_epoch) % check_interval_min === 0
  // OR last_checked is null / older than interval.
  const minutesSinceEpoch = Math.floor(Date.now() / 60000);

  const { data: allSettings, error } = await db
    .from('user_settings')
    .select('user_id, check_interval_min, monitoring_enabled')
    .eq('monitoring_enabled', true);

  if (error) {
    console.error('[cron] failed to load settings:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const dueUserIds = (allSettings ?? [])
    .filter((s) => minutesSinceEpoch % s.check_interval_min === 0)
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
