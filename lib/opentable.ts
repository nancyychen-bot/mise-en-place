import type { Slot } from './types';

/**
 * Resolves an OpenTable URL slug (e.g. "sunns-new-york") to a numeric restaurant ID.
 * Scrapes the OpenTable restaurant page and extracts the rid from embedded JSON.
 * Returns null if resolution fails.
 */
export async function resolveOpenTableVenueId(slugOrUrl: string): Promise<string | null> {
  if (/^\d+$/.test(slugOrUrl.trim())) return slugOrUrl.trim();

  let slug = slugOrUrl.trim();
  try {
    const url = new URL(slugOrUrl);
    if (url.hostname.includes('opentable.com')) {
      const m = url.pathname.match(/\/(?:r\/)?([^/?#]+)/);
      if (m) slug = m[1];
    }
  } catch { /* raw slug */ }

  try {
    // Use the edge runtime endpoint which runs on Cloudflare's network
    // and is not blocked by OpenTable like Vercel's serverless IPs are.
    const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mise-en-place-restaurants.vercel.app';
    const res = await fetch(`${base}/api/resolve-opentable?slug=${encodeURIComponent(slug)}`);
    if (res.ok) {
      const data = await res.json() as { rid: string | null };
      if (data.rid) return data.rid;
    }
  } catch { /* fall through */ }

  return null;
}

/**
 * OpenTable availability via their public widget endpoint.
 * This endpoint is less stable than Resy and may change shape.
 * We wrap it defensively — any failure returns [].
 */
export async function findOpenTableAvailability(
  restaurantId: string,  // numeric RID (e.g. "55048")
  date: string,          // "YYYY-MM-DD"
  time: string,          // "19:00"
  partySize: number
): Promise<Slot[]> {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mise-en-place-restaurants.vercel.app';
  const params = new URLSearchParams({
    rid: restaurantId,
    date,
    time,
    covers: String(partySize),
  });

  const res = await fetch(`${base}/api/opentable-availability?${params}`, {
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`proxy_http_${res.status}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await res.json()) as any;
  if (data?.error) {
    throw new Error(`ot_${data.error}${data.status ? '_' + data.status : ''}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const times: any[] = data?.times ?? [];

  return times.map((t) => {
    const rawTime: string = t?.time ?? t?.dateTime ?? '';
    // rawTime might be "19:00" or ISO "2026-04-22T19:00:00"
    const timePart = rawTime.includes('T')
      ? rawTime.split('T')[1].substring(0, 5)
      : rawTime.substring(0, 5);

    const [hStr, mStr] = timePart.split(':');
    const h = parseInt(hStr, 10);
    const m = mStr ?? '00';
    const suffix = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;

    return {
      date,
      time: timePart,
      displayTime: `${h12}:${m} ${suffix}`,
      bookingToken: t?.hash ?? undefined,
    };
  });
}
