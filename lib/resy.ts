import type { Slot } from './types';

const BASE = 'https://api.resy.com';

// Resy's venue lookup endpoint — same one the website uses
const SEARCH_BASE = 'https://api.resy.com/3/venue';

function isoToTime(iso: string): { time: string; displayTime: string } {
  // iso looks like "2026-04-22 19:00:00"
  const parts = iso.split(' ');
  const timePart = parts[1] ?? iso.split('T')[1] ?? '';
  const [hStr, mStr] = timePart.split(':');
  const h = parseInt(hStr, 10);
  const m = mStr ?? '00';
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return {
    time: `${String(h).padStart(2, '0')}:${m}`,
    displayTime: `${h12}:${m} ${suffix}`,
  };
}

export async function findResyAvailability(
  apiKey: string,
  venueId: string,
  day: string,       // "YYYY-MM-DD"
  partySize: number
): Promise<Slot[]> {
  const url =
    `${BASE}/4/find?lat=0&long=0&day=${day}&party_size=${partySize}&venue_id=${venueId}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Authorization: `ResyAPI api_key="${apiKey}"`,
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
        'X-Origin': 'https://resy.com',
        Referer: 'https://resy.com/',
      },
      cache: 'no-store',
    });
  } catch (err) {
    throw new Error(`fetch_err: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (res.status === 401 || res.status === 403) {
    throw new Error('RESY_AUTH_ERROR');
  }

  if (res.status === 404 || !res.ok) {
    throw new Error(`http_${res.status}`);
  }

  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`not_json: ${text.slice(0, 120)}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = json as any;
  const venues = data?.results?.venues;
  if (!Array.isArray(venues) || venues.length === 0) {
    throw new Error(`empty_venues: ${text.slice(0, 200)}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawSlots: any[] = venues[0]?.slots ?? [];

  return rawSlots.map((s) => {
    const startIso: string = s?.date?.start ?? '';
    const { time, displayTime } = isoToTime(startIso);
    return {
      date: day,
      time,
      displayTime,
      type: s?.config?.type ?? undefined,
      bookingToken: s?.config?.token ?? undefined,
    };
  });
}

/**
 * Resolves a Resy URL slug (e.g. "don-angie") to a numeric venue_id.
 * Uses Resy's venue search API — same call their autocomplete makes.
 * Returns null if resolution fails (let the user paste the numeric ID manually).
 */
export async function resolveResyVenueId(
  slugOrUrl: string,
  apiKey: string,
  city: string = 'ny'
): Promise<string | null> {
  // If it's already numeric, return as-is
  if (/^\d+$/.test(slugOrUrl.trim())) return slugOrUrl.trim();

  // Extract slug from URL if needed
  let slug = slugOrUrl.trim();
  try {
    const url = new URL(slugOrUrl);
    const m = url.pathname.match(/\/venues\/([^/?#]+)/);
    if (m) slug = m[1];
  } catch {
    /* raw slug */
  }

  const headers = {
    Authorization: `ResyAPI api_key="${apiKey}"`,
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
    'X-Origin': 'https://resy.com',
    Referer: 'https://resy.com/',
    Accept: 'application/json, text/plain, */*',
  };

  // 1. Try the venue lookup endpoint directly
  try {
    const r = await fetch(`https://api.resy.com/3/venue?url_slug=${slug}&location=${city}`, { headers });
    if (r.ok) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await r.json() as any;
      const id = data?.id?.resy ?? data?.venue?.id?.resy ?? data?.venue_id;
      if (id) return String(id);
    }
  } catch { /* continue */ }

  // 2. Try the venue search endpoint
  try {
    const params = new URLSearchParams({
      query: slug,
      'geo[latitude]': '40.7128',
      'geo[longitude]': '-74.0060',
      'slot_filter[party_size]': '2',
      'slot_filter[day]': new Date().toISOString().split('T')[0],
    });
    const r = await fetch(`https://api.resy.com/3/venueSearch?${params}`, { headers });
    if (r.ok) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await r.json() as any;
      const venues = data?.search?.hits ?? data?.hits ?? [];
      for (const v of venues) {
        const vSlug = v?.venue?.url_slug ?? v?.url_slug ?? '';
        const vId = v?.venue?.id?.resy ?? v?.id?.resy ?? v?.venue_id;
        if (vSlug === slug && vId) return String(vId);
      }
      // If only one result, use it
      if (venues.length === 1) {
        const vId = venues[0]?.venue?.id?.resy ?? venues[0]?.id?.resy ?? venues[0]?.venue_id;
        if (vId) return String(vId);
      }
    }
  } catch { /* continue */ }

  // 3. Fall back to page scraping (may be blocked by Imperva)
  try {
    const pageRes = await fetch(`https://resy.com/cities/ny/venues/${encodeURIComponent(slug)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    if (pageRes.ok) {
      const html = await pageRes.text();
      const m1 = html.match(/"id"\s*:\s*\{\s*"resy"\s*:\s*(\d+)/);
      if (m1) return m1[1];
      const m2 = html.match(/"venue_id"\s*:\s*(\d+)/);
      if (m2) return m2[1];
    }
  } catch { /* give up */ }

  return null;
}
