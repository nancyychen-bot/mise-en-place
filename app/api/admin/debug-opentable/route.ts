import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug') ?? 'red-hook-tavern-brooklyn';

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
  };

  try {
    const res = await fetch(`https://www.opentable.com/r/${encodeURIComponent(slug)}`, { headers });
    const text = await res.text();

    // Sample the first 3000 chars and search for ID patterns
    const sample = text.slice(0, 3000);
    const ridMatches = [...text.matchAll(/"rid"\s*:\s*(\d+)/g)].map(m => m[1]);
    const restMatches = [...text.matchAll(/"restaurantId"\s*:\s*(\d+)/g)].map(m => m[1]);
    const rest2Matches = [...text.matchAll(/"restaurant_id"\s*:\s*(\d+)/g)].map(m => m[1]);
    const idMatches = [...text.matchAll(/"id"\s*:\s*(\d+)/g)].slice(0, 5).map(m => m[1]);

    return NextResponse.json({
      status: res.status,
      totalLength: text.length,
      sample,
      ridMatches,
      restaurantIdMatches: restMatches,
      restaurant_id_matches: rest2Matches,
      firstFewIds: idMatches,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) });
  }
}
