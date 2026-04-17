import type { Slot } from './types';

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
  const params = new URLSearchParams({
    rid: restaurantId,
    restref: restaurantId,
    date,
    time: `${time}:00`,
    covers: String(partySize),
    lang: 'en-US',
  });

  const url = `https://www.opentable.com/restref/client/?${params}`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        Accept: 'application/json',
        Referer: 'https://www.opentable.com/',
      },
      next: { revalidate: 0 },
    });

    if (!res.ok) return [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;

    // OpenTable returns availableTimes array
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const times: any[] = data?.availability?.times ?? data?.availableTimes ?? [];

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
  } catch (err) {
    console.error('[opentable] error:', err);
    return [];
  }
}
