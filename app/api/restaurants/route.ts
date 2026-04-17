import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { parseResyVenueInput, parseOpenTableVenueInput } from '@/lib/venue-parser';
import { resolveResyVenueId } from '@/lib/resy';

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
  platform: z.enum(['resy', 'opentable']),
  venueIdOrUrl: z.string().min(1),
  partySize: z.number().int().min(1).max(20).default(2),
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

  const { name, platform, venueIdOrUrl, partySize } = parsed.data;

  // Resolve venue ID
  let venueId: string;
  if (platform === 'resy') {
    const raw = parseResyVenueInput(venueIdOrUrl);

    // If it's a slug (not already numeric), try to resolve via Resy API
    if (!/^\d+$/.test(raw)) {
      const { data: settings } = await db
        .from('user_settings')
        .select('resy_api_key')
        .eq('user_id', user.id)
        .single();

      const apiKey = settings?.resy_api_key ?? '';
      const resolved = apiKey ? await resolveResyVenueId(raw, apiKey) : null;
      venueId = resolved ?? raw; // fall back to slug if resolution fails
    } else {
      venueId = raw;
    }
  } else {
    venueId = parseOpenTableVenueInput(venueIdOrUrl);
  }

  const { data: restaurant, error } = await db
    .from('restaurants')
    .insert({
      user_id: user.id,
      name,
      platform,
      venue_id: venueId,
      party_size: partySize,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Log system event
  await db.from('activity_log').insert({
    user_id: user.id,
    restaurant_id: restaurant.id,
    type: 'system',
    message: `Added <strong>${name}</strong> to watchlist (${platform})`,
  });

  return NextResponse.json(restaurant, { status: 201 });
}
