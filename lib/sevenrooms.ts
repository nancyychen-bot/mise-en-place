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

/**
 * SevenRooms availability via their public widget API.
 * Uses the same endpoint their embeddable reservation widget calls.
 */
export async function findSevenRoomsAvailability(
  venueSlug: string,
  date: string,       // "YYYY-MM-DD"
  partySize: number
): Promise<Slot[]> {
  const params = new URLSearchParams({
    venue: venueSlug,
    date,
    party_size: String(partySize),
    channel: 'SEVENROOMS_WIDGET',
    duration: '0',
  });

  const url = `https://www.sevenrooms.com/api-yoa/availability/widget/get?${params}`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        Accept: 'application/json',
        Referer: 'https://www.sevenrooms.com/',
      },
      next: { revalidate: 0 },
    });

    if (!res.ok) return [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;

    if (data?.status !== 1) return [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawSlots: any[] =
      data?.payload?.time_slots ??
      data?.payload?.availability?.time_slots ??
      [];

    return rawSlots.flatMap((s) => {
      // Time might be "7:00 PM" or a 24h string like "19:00"
      const rawTime: string = s?.time_slot ?? s?.time ?? s?.real_datetime_of_slot ?? '';
      if (!rawTime) return [];

      let time24: string;
      let displayTime: string;

      if (/^\d{1,2}:\d{2}\s*(AM|PM)$/i.test(rawTime)) {
        // Already in 12h format like "7:00 PM"
        displayTime = rawTime.toUpperCase();
        const [timePart, meridiem] = rawTime.split(/\s+/);
        const [hStr, mStr] = timePart.split(':');
        let h = parseInt(hStr, 10);
        if (meridiem.toUpperCase() === 'PM' && h !== 12) h += 12;
        if (meridiem.toUpperCase() === 'AM' && h === 12) h = 0;
        time24 = `${String(h).padStart(2, '0')}:${mStr}`;
      } else {
        // "19:00" or "2026-04-22 19:00:00"
        const timePart = rawTime.includes('T')
          ? rawTime.split('T')[1].substring(0, 5)
          : rawTime.includes(' ') && rawTime.length > 10
          ? rawTime.split(' ')[1].substring(0, 5)
          : rawTime.substring(0, 5);
        time24 = timePart;
        const [hStr, mStr] = timePart.split(':');
        const h = parseInt(hStr, 10);
        const suffix = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        displayTime = `${h12}:${mStr} ${suffix}`;
      }

      return [{
        date,
        time: time24,
        displayTime,
        bookingToken: s?.access_persistent_id ?? undefined,
      }];
    });
  } catch (err) {
    console.error('[sevenrooms] error:', err);
    return [];
  }
}
