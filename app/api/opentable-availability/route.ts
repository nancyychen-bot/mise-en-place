export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const rid = req.nextUrl.searchParams.get('rid') ?? '';
  const date = req.nextUrl.searchParams.get('date') ?? '';
  const time = req.nextUrl.searchParams.get('time') ?? '19:00';
  const covers = req.nextUrl.searchParams.get('covers') ?? '2';

  if (!rid || !date) {
    return NextResponse.json({ error: 'rid and date required' }, { status: 400 });
  }

  const params = new URLSearchParams({
    rid,
    restref: rid,
    date,
    time: `${time}:00`,
    covers,
    lang: 'en-US',
  });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(`https://www.opentable.com/restref/client/?${params}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        Accept: 'application/json',
        Referer: 'https://www.opentable.com/',
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json({ times: [], status: res.status });
    }

    const data = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const times = (data as any)?.availability?.times ?? (data as any)?.availableTimes ?? [];

    return NextResponse.json({ times });
  } catch {
    return NextResponse.json({ times: [], error: 'timeout' });
  }
}
