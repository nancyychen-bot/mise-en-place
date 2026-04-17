import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { resolveResyVenueId } from '@/lib/resy';

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
