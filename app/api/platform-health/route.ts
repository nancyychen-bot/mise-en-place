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

    // Get the last 3 check entries across restaurants on this platform
    // to avoid a single transient error flipping the whole platform red
    const { data: logs, error: logErr } = await db
      .from('activity_log')
      .select('message, created_at')
      .eq('user_id', user.id)
      .eq('type', 'check')
      .in('restaurant_id', restaurantIds)
      .order('created_at', { ascending: false })
      .limit(3);

    if (logErr || !logs || logs.length === 0) {
      result[platform] = { status: 'idle', lastChecked: null };
      continue;
    }

    const lastChecked = logs[0].created_at;
    const errorLogs = logs.filter((l) => l.message.includes('[err:'));

    // If the majority of recent checks have errors, mark unhealthy
    if (errorLogs.length > logs.length / 2) {
      const match = errorLogs[0].message.match(/\[err:([^\]]*)\]/);
      result[platform] = {
        status: 'error',
        lastChecked,
        error: match ? match[1].trim() : 'unknown',
      };
    } else {
      result[platform] = { status: 'ok', lastChecked };
    }
  }

  return NextResponse.json(result);
}
