import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { resolveResyVenueId } from '@/lib/resy';

// PATCH: manually set venue IDs — body: { "slug": "numeric_id", ... }
export async function PATCH(req: NextRequest) {
  const map: Record<string, string> = await req.json();
  const results = [];
  for (const [slug, numericId] of Object.entries(map)) {
    const { data: rows } = await db.from('restaurants').select('id, name').eq('venue_id', slug).eq('platform', 'resy');
    for (const row of rows ?? []) {
      await db.from('restaurants').update({ venue_id: numericId }).eq('id', row.id);
      results.push({ name: row.name, old: slug, new: numericId });
    }
  }
  return NextResponse.json({ results });
}

export async function POST() {
  const apiKey = process.env.RESY_API_KEY ?? '';
  if (!apiKey) return NextResponse.json({ error: 'No RESY_API_KEY' }, { status: 500 });

  const { data: restaurants } = await db
    .from('restaurants')
    .select('id, name, venue_id')
    .eq('platform', 'resy');

  const results = [];
  for (const r of restaurants ?? []) {
    // Only fix slug-based IDs (non-numeric)
    if (/^\d+$/.test(r.venue_id)) {
      results.push({ name: r.name, venue_id: r.venue_id, status: 'already numeric' });
      continue;
    }

    const resolved = await resolveResyVenueId(r.venue_id, apiKey);
    if (resolved && /^\d+$/.test(resolved)) {
      await db.from('restaurants').update({ venue_id: resolved }).eq('id', r.id);
      results.push({ name: r.name, old: r.venue_id, new: resolved, status: 'fixed' });
    } else {
      results.push({ name: r.name, venue_id: r.venue_id, status: 'could not resolve' });
    }
  }

  return NextResponse.json({ results });
}
