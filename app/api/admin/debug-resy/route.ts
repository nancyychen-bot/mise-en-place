import { NextRequest, NextResponse } from 'next/server';

async function tryFetch(url: string, headers: Record<string, string>) {
  const r = await fetch(url, { headers });
  const text = await r.text();
  let body: unknown;
  try { body = JSON.parse(text); } catch { body = text.slice(0, 500); }
  return { status: r.status, body };
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const slug = req.nextUrl.searchParams.get('slug') ?? 'bistrot-ha';
  const apiKey = process.env.RESY_API_KEY ?? '';
  const today = new Date().toISOString().slice(0, 10);

  const headers = {
    Authorization: `ResyAPI api_key="${apiKey}"`,
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
    'X-Origin': 'https://resy.com',
    Referer: 'https://resy.com/',
    Accept: 'application/json, text/plain, */*',
  };

  const [r1, r2, r3, r4, r5] = await Promise.all([
    tryFetch(`https://api.resy.com/3/venue?url_slug=${slug}&location=us-ny`, headers),
    tryFetch(`https://api.resy.com/3/venue?url_slug=${slug}&location=ny`, headers),
    tryFetch(`https://api.resy.com/3/venueSearch?query=${slug}&geo[latitude]=40.7128&geo[longitude]=-74.0060`, headers),
    tryFetch(`https://api.resy.com/3/venueSearch?query=${slug}&geo[latitude]=40.7128&geo[longitude]=-74.0060&limit=5`, headers),
    tryFetch(`https://api.resy.com/4/find?lat=40.7128&long=-74.0060&day=${today}&party_size=2&venue_id=${slug}`, headers),
  ]);

  return NextResponse.json({ slug, venue_us_ny: r1, venue_ny: r2, search: r3, search_limit: r4, find: r5 });
}
