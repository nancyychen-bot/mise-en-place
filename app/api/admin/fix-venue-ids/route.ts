import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isAuthorized, unauthorizedResponse } from '@/lib/admin-auth';
import { resolveResyVenueId } from '@/lib/resy';
import { resolveOpenTableVenueId } from '@/lib/opentable';

// PATCH: manually set venue IDs — body: { "slug": "numeric_id", ... }
// Works for both resy and opentable restaurants
export async function PATCH(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorizedResponse();
  const map: Record<string, string> = await req.json();
  const results = [];
  for (const [slug, numericId] of Object.entries(map)) {
    const { data: rows } = await db.from('restaurants').select('id, name, platform').eq('venue_id', slug);
    for (const row of rows ?? []) {
      await db.from('restaurants').update({ venue_id: numericId }).eq('id', row.id);
      results.push({ name: row.name, platform: row.platform, old: slug, new: numericId });
    }
  }
  return NextResponse.json({ results });
}

// GET: auto-resolve OpenTable slug-based venue IDs
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorizedResponse();
  const { data: restaurants } = await db
    .from('restaurants')
    .select('id, name, venue_id')
    .eq('platform', 'opentable');

  const results = [];
  for (const r of restaurants ?? []) {
    if (/^\d+$/.test(r.venue_id)) {
      results.push({ name: r.name, venue_id: r.venue_id, status: 'already numeric' });
      continue;
    }

    const resolved = await resolveOpenTableVenueId(r.venue_id);
    if (resolved && /^\d+$/.test(resolved)) {
      await db.from('restaurants').update({ venue_id: resolved }).eq('id', r.id);
      results.push({ name: r.name, old: r.venue_id, new: resolved, status: 'fixed' });
    } else {
      results.push({ name: r.name, venue_id: r.venue_id, status: 'could not resolve' });
    }
  }

  return NextResponse.json({ results });
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorizedResponse();
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
