import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug') ?? 'bridges';
  const apiKey = process.env.RESY_API_KEY ?? '';

  const headers = {
    Authorization: `ResyAPI api_key="${apiKey}"`,
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
    'X-Origin': 'https://resy.com',
    Referer: 'https://resy.com/',
    Accept: 'application/json, text/plain, */*',
  };

  const [r1, r2, r3] = await Promise.all([
    fetch(`https://api.resy.com/3/venue?url_slug=${slug}&location=us-ny`, { headers }).then(r => r.json()).catch(e => ({ error: String(e) })),
    fetch(`https://api.resy.com/4/find?lat=40.7128&long=-74.0060&day=2026-04-24&party_size=2&venue_id=${slug}`, { headers }).then(r => r.json()).catch(e => ({ error: String(e) })),
    fetch(`https://api.resy.com/3/venueSearch?query=${slug}&geo[latitude]=40.7128&geo[longitude]=-74.0060`, { headers }).then(r => r.json()).catch(e => ({ error: String(e) })),
  ]);

  return NextResponse.json({ slug, venue_endpoint: r1, find_endpoint: r2, search_endpoint: r3 });
}
