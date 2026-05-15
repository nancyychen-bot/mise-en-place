import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import type { Platform } from '@/lib/types';

const ALL_PLATFORMS: Platform[] = ['resy', 'opentable', 'sevenrooms', 'tock'];

interface PlatformStatus {
  status: 'ok' | 'warning' | 'error' | 'idle';
  lastChecked: string | null;
  error?: string;
}

export async function GET() {
  const user = await requireUser().catch(() => null);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Get ALL active restaurants grouped by platform (across all users)
  const { data: restaurants, error: restErr } = await db
    .from('restaurants')
    .select('id, platform, user_id')
    .eq('active', true);

  if (restErr) return NextResponse.json({ error: restErr.message }, { status: 500 });

  // Group restaurant IDs by platform
  const platformRestaurants = new Map<Platform, { id: string; user_id: string }[]>();
  for (const r of restaurants ?? []) {
    const entries = platformRestaurants.get(r.platform) ?? [];
    entries.push({ id: r.id, user_id: r.user_id });
    platformRestaurants.set(r.platform, entries);
  }

  const result: Record<string, PlatformStatus> = {};

  for (const platform of ALL_PLATFORMS) {
    const entries = platformRestaurants.get(platform);

    if (!entries || entries.length === 0) {
      result[platform] = { status: 'idle', lastChecked: null };
      continue;
    }

    let lastChecked: string | null = null;
    let totalRestaurants = 0;
    let failedRestaurants = 0;
    let lastError = '';

    for (const { id: rid, user_id: rUserId } of entries) {
      const { data: logs } = await db
        .from('activity_log')
        .select('message, created_at')
        .eq('user_id', rUserId)
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
    } else {
      const failRate = failedRestaurants / totalRestaurants;
      if (failRate >= 0.5) {
        result[platform] = { status: 'error', lastChecked, error: lastError || 'unknown' };
      } else if (failRate >= 0.25) {
        result[platform] = { status: 'warning', lastChecked, error: lastError || 'unknown' };
      } else {
        result[platform] = { status: 'ok', lastChecked };
      }
    }
  }

  return NextResponse.json(result);
}
