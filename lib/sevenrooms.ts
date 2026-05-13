import type { Slot } from './types';

/**
 * Extracts a SevenRooms venue slug from a pasted URL or raw slug.
 *
 * Accepts:
 *   https://www.sevenrooms.com/reservations/donangienj
 *   https://www.sevenrooms.com/explore/donangienj
 *   donangienj
 */
export function parseSevenRoomsVenueInput(input: string): string {
  const trimmed = input.trim();

  try {
    const url = new URL(trimmed);
    if (url.hostname.includes('sevenrooms.com')) {
      // Path: /reservations/{slug} or /explore/{slug}
      const match = url.pathname.match(/\/(?:reservations|explore)\/([^/?#]+)/);
      if (match) return match[1];
    }
  } catch {
    // Raw slug
  }

  return trimmed;
}

export async function findSevenRoomsAvailability(
  venueSlug: string,
  date: string,       // "YYYY-MM-DD"
  partySize: number
): Promise<Slot[]> {
  const params = new URLSearchParams({
    venue: venueSlug,
    start_date: date,
    num_days: '1',
    party_size: String(partySize),
    channel: 'SEVENROOMS_WIDGET',
    halo_size_interval: '100',
    exclude_pdr: 'true',
  });

  const url = `https://www.sevenrooms.com/api-yoa/availability/ng/widget/range?${params}`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      Accept: 'application/json',
      Referer: 'https://www.sevenrooms.com/',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`http_${res.status}`);
  }

  const rawText = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(rawText);
  } catch {
    throw new Error(`not_json: ${rawText.slice(0, 120)}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = data as any;
  if (d?.status !== 200) return [];

  // Response: { data: { availability: { "2026-05-15": [{ times: [...] }] } } }
  const availability = d?.data?.availability ?? {};
  const shifts = availability[date] ?? [];

  const slots: Slot[] = [];

  for (const shift of shifts) {
    if (shift?.is_closed || shift?.is_blackout) continue;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const times: any[] = shift?.times ?? [];

    for (const t of times) {
      const rawTime: string = t?.time ?? '';
      const rawIso: string = t?.time_iso ?? '';
      if (!rawTime && !rawIso) continue;

      let time24: string;
      let displayTime: string;

      if (/^\d{1,2}:\d{2}\s*(AM|PM)$/i.test(rawTime)) {
        displayTime = rawTime.toUpperCase();
        const [timePart, meridiem] = rawTime.split(/\s+/);
        const [hStr, mStr] = timePart.split(':');
        let h = parseInt(hStr, 10);
        if (meridiem.toUpperCase() === 'PM' && h !== 12) h += 12;
        if (meridiem.toUpperCase() === 'AM' && h === 12) h = 0;
        time24 = `${String(h).padStart(2, '0')}:${mStr}`;
      } else if (rawIso) {
        // "2026-05-13 17:00:00"
        const timePart = rawIso.split(' ')[1]?.substring(0, 5) ?? '';
        time24 = timePart;
        const [hStr, mStr] = timePart.split(':');
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
        bookingToken: t?.access_persistent_id ?? undefined,
      });
    }
  }

  return slots;
}
