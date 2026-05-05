import { NextRequest, NextResponse } from 'next/server';
import { isAuthorized, unauthorizedResponse } from '@/lib/admin-auth';

async function tryFetch(url: string, headers: Record<string, string>) {
  try {
    const r = await fetch(url, { headers });
    const text = await r.text();
    let body: unknown;
    try { body = JSON.parse(text); } catch { body = text.slice(0, 1000); }
    return { status: r.status, body };
  } catch (e) {
    return { error: String(e) };
  }
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorizedResponse();

  const slug = req.nextUrl.searchParams.get('slug') ?? 'red-hook-tavern-brooklyn';
  const name = req.nextUrl.searchParams.get('name') ?? 'red hook tavern';

  const jsonHeaders = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
    Accept: 'application/json, text/plain, */*',
    Referer: 'https://www.opentable.com/',
  };

  const [r1, r2, r3, r4] = await Promise.all([
    tryFetch(`https://www.opentable.com/dapi/search/typeahead?term=${encodeURIComponent(name)}&latitude=40.7128&longitude=-74.0060`, jsonHeaders),
    tryFetch(`https://www.opentable.com/restref/info/?urlSlug=${slug}`, jsonHeaders),
    tryFetch(`https://www.opentable.com/dapi/fe/gql`, { ...jsonHeaders, 'Content-Type': 'application/json' }),
    tryFetch(`https://www.opentable.com/s?query=${encodeURIComponent(name)}&covers=2&metroId=4`, { ...jsonHeaders, Accept: 'application/json' }),
  ]);

  return NextResponse.json({ slug, typeahead: r1, restref_info: r2, gql: r3, search: r4 });
}
