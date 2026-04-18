export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug') ?? '';
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(`https://www.opentable.com/r/${encodeURIComponent(slug)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok || !res.body) return NextResponse.json({ rid: null });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let chunk = '';
    let found: string | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunk += decoder.decode(value, { stream: true });

      const m1 = chunk.match(/"rid"\s*:\s*(\d+)/);
      if (m1) { found = m1[1]; break; }
      const m2 = chunk.match(/"restaurantId"\s*:\s*(\d+)/);
      if (m2) { found = m2[1]; break; }
      const m3 = chunk.match(/"restaurant_id"\s*:\s*(\d+)/);
      if (m3) { found = m3[1]; break; }

      if (chunk.length > 150_000) break;
    }

    controller.abort();
    return NextResponse.json({ rid: found });
  } catch {
    return NextResponse.json({ rid: null });
  }
}
