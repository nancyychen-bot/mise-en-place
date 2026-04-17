import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { parseResyVenueInput, parseOpenTableVenueInput } from '@/lib/venue-parser';
import { resolveResyVenueId } from '@/lib/resy';
import { resolveOpenTableVenueId } from '@/lib/opentable';

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

  // Resolve venue ID, keeping the original slug for URL construction
  let venueId: string;
  let venueSlug: string | null = null;
  if (platform === 'resy') {
    const raw = parseResyVenueInput(venueIdOrUrl);
    if (!/^\d+$/.test(raw)) {
      venueSlug = raw;
      const apiKey = process.env.RESY_API_KEY ?? '';
      const resolved = apiKey ? await resolveResyVenueId(raw, apiKey) : null;
      venueId = resolved ?? raw;
    } else {
      venueId = raw;
    }
  } else {
    const raw = parseOpenTableVenueInput(venueIdOrUrl);
    if (!/^\d+$/.test(raw)) {
      venueSlug = raw;
      const resolved = await resolveOpenTableVenueId(raw);
      venueId = resolved ?? raw;
    } else {
      venueId = raw;
    }
  }

  const { data: restaurant, error } = await db
    .from('restaurants')
    .insert({
      user_id: user.id,
      name,
      platform,
      venue_id: venueId,
      venue_slug: venueSlug,
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
