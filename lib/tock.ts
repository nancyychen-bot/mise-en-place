import type { Slot } from './types';

/**
 * Extracts a Tock venue slug from a pasted URL or raw slug.
 *
 * Accepts:
 *   https://www.exploretock.com/semma
 *   https://www.exploretock.com/semma?date=2026-04-22
 *   semma
 */
export function parseTockVenueInput(input: string): string {
  const trimmed = input.trim();

  try {
    const url = new URL(trimmed);
    if (url.hostname.includes('exploretock.com')) {
      // Path: /{slug}
      const slug = url.pathname.replace(/^\//, '').split('/')[0].split('?')[0];
      if (slug) return slug;
    }
  } catch {
    // Raw slug
  }

  return trimmed;
}

/**
 * Tock availability via their public search API.
 * Returns [] defensively on any failure.
 */
export async function findTockAvailability(
  venueSlug: string,
  date: string,       // "YYYY-MM-DD"
  time: string,       // "HH:MM" preferred start time
  partySize: number
): Promise<Slot[]> {
  const params = new URLSearchParams({
    date,
    size: String(partySize),
    time,
    type: 'all',
    venue: venueSlug,
  });

  const url = `https://www.exploretock.com/api/search?${params}`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        Accept: 'application/json',
        Referer: `https://www.exploretock.com/${venueSlug}`,
      },
      next: { revalidate: 0 },
    });

    if (!res.ok) return [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;

    // Tock returns results with experiences that have time slots
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results: any[] =
      data?.results ??
      data?.availabilities ??
      data?.experiences ??
      [];

    const slots: Slot[] = [];

    for (const result of results) {
      // Each result may have a list of available times
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const times: any[] =
        result?.times ??
        result?.availableTimes ??
        result?.slots ??
        (result?.time ? [result] : []);

      for (const t of times) {
        const rawTime: string = t?.time ?? t?.startTime ?? t?.dateTime ?? '';
        if (!rawTime) continue;

        let time24: string;
        let displayTime: string;

        if (rawTime.includes('T')) {
          // ISO: "2026-04-22T19:00:00"
          const timePart = rawTime.split('T')[1].substring(0, 5);
          time24 = timePart;
          const [hStr, mStr] = timePart.split(':');
          const h = parseInt(hStr, 10);
          const suffix = h >= 12 ? 'PM' : 'AM';
          displayTime = `${h % 12 || 12}:${mStr} ${suffix}`;
        } else if (/^\d{1,2}:\d{2}$/.test(rawTime)) {
          // "19:00"
          time24 = rawTime.padStart(5, '0');
          const [hStr, mStr] = rawTime.split(':');
          const h = parseInt(hStr, 10);
          const suffix = h >= 12 ? 'PM' : 'AM';
          displayTime = `${h % 12 || 12}:${mStr} ${suffix}`;
        } else {
          continue;
        }

        slots.push({
          date,
          time: time24,
          displayTime,
          bookingToken: t?.id ?? t?.experienceId ?? undefined,
        });
      }
    }

    return slots;
  } catch (err) {
    console.error('[tock] error:', err);
    return [];
  }
}
