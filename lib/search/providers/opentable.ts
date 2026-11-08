import { parse } from 'node-html-parser';
import type { AvailabilityResult, ResolvedVenue, CheckOpts } from '../types';

function inWindow(time: string, start: string, end: string): boolean {
  return time >= start && time <= end;
}

function slotsFromNextData(html: string): string[] | null {
  const root = parse(html);
  const script = root.querySelector('script#__NEXT_DATA__');
  if (!script) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = JSON.parse(script.text) as any;
    const raw = data?.props?.pageProps?.availability?.timeSlots
      ?? data?.props?.pageProps?.restaurant?.availability?.timeSlots
      ?? [];
    if (!Array.isArray(raw)) return null;
    const times: string[] = [];
    for (const s of raw) {
      const t: string | undefined = s?.time ?? s?.datetime?.slice?.(11, 16);
      if (t && /^\d{2}:\d{2}$/.test(t)) times.push(t);
    }
    return times;
  } catch {
    return null;
  }
}

function buildBookingUrl(venueId: string, date: string, time: string, partySize: number): string {
  const dateTime = `${date}T${time}`;
  const params = new URLSearchParams({
    restref: venueId,
    partySize: String(partySize),
    datetime: dateTime,
  });
  return `https://www.opentable.com/restref/client/?${params}`;
}

export async function checkOpenTableAvailability(
  venue: ResolvedVenue,
  opts: CheckOpts
): Promise<AvailabilityResult> {
  if (!venue.venueId) return { status: 'unsupported' };

  const url = venue.bookingUrl ?? `https://www.opentable.com/r/${venue.venueId}`;
  const params = new URLSearchParams({
    covers: String(opts.partySize),
    dateTime: `${opts.date}T${opts.windowStart}`,
  });

  let res: Response;
  try {
    res = await fetch(`${url}?${params}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    });
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err) };
  }

  if (!res.ok) return { status: 'error', message: `http_${res.status}` };

  const html = await res.text();
  const times = slotsFromNextData(html);
  if (times === null) return { status: 'unavailable' };

  const filtered = times
    .filter((t) => inWindow(t, opts.windowStart, opts.windowEnd))
    .map((t) => ({
      time: t,
      bookingUrl: buildBookingUrl(venue.venueId as string, opts.date, t, opts.partySize),
    }));

  return filtered.length ? { status: 'available', slots: filtered } : { status: 'unavailable' };
}
