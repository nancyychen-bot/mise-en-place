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
      next: { revalidate: 0 },
    });
  } catch (err) {
    console.error('[resy] fetch error:', err);
    return [];
  }

  if (res.status === 401 || res.status === 403) {
    throw new Error('RESY_AUTH_ERROR');
  }

  if (res.status === 404 || !res.ok) {
    return [];
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = json as any;
  const venues = data?.results?.venues;
  if (!Array.isArray(venues) || venues.length === 0) return [];

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
  apiKey: string
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

  try {
    // Try /3/venue with url_slug
    const res = await fetch(
      `${SEARCH_BASE}?url_slug=${encodeURIComponent(slug)}&location=us-ny`,
      {
        headers: {
          Authorization: `ResyAPI api_key="${apiKey}"`,
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
          'X-Origin': 'https://resy.com',
          Referer: 'https://resy.com/',
          'Accept': 'application/json, text/plain, */*',
        },
      }
    );

    if (res.ok) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any;
      const id = data?.id?.resy ?? data?.venue?.id?.resy ?? data?.id;
      if (id) return String(id);
    }

    // Fallback: try /4/find with the slug directly to get the numeric id from response
    const findRes = await fetch(
      `${BASE}/4/find?lat=40.7128&long=-74.0060&day=${new Date().toISOString().slice(0,10)}&party_size=2&venue_id=${encodeURIComponent(slug)}`,
      {
        headers: {
          Authorization: `ResyAPI api_key="${apiKey}"`,
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
          'X-Origin': 'https://resy.com',
          Referer: 'https://resy.com/',
        },
      }
    );
    if (findRes.ok) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const findData = (await findRes.json()) as any;
      const venueId = findData?.results?.venues?.[0]?.venue?.id?.resy;
      if (venueId) return String(venueId);
    }

    return null;
  } catch {
    return null;
  }
}
