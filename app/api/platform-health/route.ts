import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import type { Platform } from '@/lib/types';

const ALL_PLATFORMS: Platform[] = ['resy', 'opentable', 'sevenrooms', 'tock'];

interface PlatformStatus {
  status: 'ok' | 'error' | 'idle';
  lastChecked: string | null;
  error?: string;
}

export async function GET() {
  const user = await requireUser().catch(() => null);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Get user's active restaurants grouped by platform
  const { data: restaurants, error: restErr } = await db
    .from('restaurants')
    .select('id, platform')
    .eq('user_id', user.id)
    .eq('active', true);

  if (restErr) return NextResponse.json({ error: restErr.message }, { status: 500 });

  // Group restaurant IDs by platform
  const platformRestaurants = new Map<Platform, string[]>();
  for (const r of restaurants ?? []) {
    const ids = platformRestaurants.get(r.platform) ?? [];
    ids.push(r.id);
    platformRestaurants.set(r.platform, ids);
  }

  const result: Record<string, PlatformStatus> = {};

  for (const platform of ALL_PLATFORMS) {
    const restaurantIds = platformRestaurants.get(platform);

    if (!restaurantIds || restaurantIds.length === 0) {
      result[platform] = { status: 'idle', lastChecked: null };
      continue;
    }

    // For each restaurant on this platform, get its most recent check.
    // Only flag the platform red if EVERY restaurant's latest check has an error.
    let lastChecked: string | null = null;
    let totalRestaurants = 0;
    let failedRestaurants = 0;
    let lastError = '';

    for (const rid of restaurantIds) {
      const { data: logs } = await db
        .from('activity_log')
        .select('message, created_at')
        .eq('user_id', user.id)
        .eq('type', 'check')
        .eq('restaurant_id', rid)
        .order('created_at', { ascending: false })
        .limit(1);

      if (!logs || logs.length === 0) continue;
      totalRestaurants++;
      if (!lastChecked || logs[0].created_at > lastChecked) lastChecked = logs[0].created_at;
      if (logs[0].message.includes('[err:')) {
        failedRestaurants++;
        const match = logs[0].message.match(/\[err:([^\]]*)\]/);
        if (match) lastError = match[1].trim();
      }
    }

    if (totalRestaurants === 0) {
      result[platform] = { status: 'idle', lastChecked: null };
    } else if (failedRestaurants === totalRestaurants) {
      result[platform] = { status: 'error', lastChecked, error: lastError || 'unknown' };
    } else {
      result[platform] = { status: 'ok', lastChecked };
    }
  }

  return NextResponse.json(result);
}
