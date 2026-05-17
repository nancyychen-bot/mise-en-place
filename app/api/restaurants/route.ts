import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { parseResyVenueInput, parseOpenTableVenueInput, parseSevenRoomsVenueInput } from '@/lib/venue-parser';
import { resolveResyVenueId } from '@/lib/resy';
import { resolveOpenTableVenueId } from '@/lib/opentable';
import { lookupReleaseTime, fetchReleaseTime } from '@/lib/release-times';

export async function GET() {
  const user = await requireUser().catch(() => null);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await db
    .from('restaurants')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

const CreateSchema = z.object({
  name: z.string().min(1).max(200),
  platform: z.enum(['resy', 'opentable', 'sevenrooms']),
  venueIdOrUrl: z.string().min(1),
  partySizes: z.array(z.number().int().min(1).max(20)).min(1).default([2]),
});

export async function POST(req: NextRequest) {
  const user = await requireUser().catch(() => null);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 422 });
  }

  const { name, platform, venueIdOrUrl, partySizes } = parsed.data;

  // Resolve venue ID, keeping the original slug for URL construction
  let venueId: string;
  let venueSlug: string | null = null;
  let venueCity: string | null = null;
  if (platform === 'resy') {
    // Extract city from URL (e.g. /cities/chi/ → 'chi'), default 'ny'
    try {
      const u = new URL(venueIdOrUrl);
      const m = u.pathname.match(/\/cities\/([^/]+)\//);
      if (m) venueCity = m[1];
    } catch { /* raw slug, no city to extract */ }

    const raw = parseResyVenueInput(venueIdOrUrl);
    if (!/^\d+$/.test(raw)) {
      venueSlug = raw;
      const apiKey = process.env.RESY_API_KEY ?? '';
      const resolved = apiKey ? await Promise.race([
        resolveResyVenueId(raw, apiKey, venueCity ?? 'ny'),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
      ]) : null;
      venueId = resolved ?? raw;
    } else {
      venueId = raw;
    }
  } else if (platform === 'opentable') {
    const raw = parseOpenTableVenueInput(venueIdOrUrl);
    if (!/^\d+$/.test(raw)) {
      venueSlug = raw;
      const resolved = await Promise.race([
        resolveOpenTableVenueId(raw),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
      ]);
      venueId = resolved ?? raw;
    } else {
      venueId = raw;
    }
  } else {
    // sevenrooms — slug-based, no numeric ID needed
    const raw = parseSevenRoomsVenueInput(venueIdOrUrl);
    venueSlug = raw;
    venueId = raw;
  }

  const { data: restaurant, error } = await db
    .from('restaurants')
    .insert({
      user_id: user.id,
      name,
      platform,
      venue_id: venueId,
      venue_slug: venueSlug,
      venue_city: venueCity,
      party_size: partySizes[0],
      party_sizes: partySizes,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Try Snatchd first for live data, fall back to static lookup
  const release = await fetchReleaseTime(name, restaurant.venue_slug).catch(() => null)
    ?? lookupReleaseTime(name);
  if (release) {
    await db.from('restaurants').update({
      release_days_ahead: release.daysAhead,
      release_time: release.time,
    }).eq('id', restaurant.id);
  }

  // Log system event
  await db.from('activity_log').insert({
    user_id: user.id,
    restaurant_id: restaurant.id,
    type: 'system',
    message: `Added <strong>${name}</strong> to watchlist (${platform})`,
  });

  return NextResponse.json(restaurant, { status: 201 });
}
