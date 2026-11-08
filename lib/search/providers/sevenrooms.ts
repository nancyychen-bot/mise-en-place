import { findSevenRoomsAvailability } from '@/lib/sevenrooms';
import type { AvailabilityResult, ResolvedVenue, CheckOpts } from '../types';

function inWindow(time: string, start: string, end: string): boolean {
  return time >= start && time <= end;
}

export async function checkSevenRoomsAvailability(
  venue: ResolvedVenue,
  opts: CheckOpts
): Promise<AvailabilityResult> {
  if (!venue.venueId) return { status: 'unsupported' };

  try {
    const slots = await findSevenRoomsAvailability(venue.venueId, opts.date, opts.partySize);
    const filtered = slots
      .filter((s) => inWindow(s.time, opts.windowStart, opts.windowEnd))
      .map((s) => ({
        time: s.time,
        bookingUrl: venue.bookingUrl ?? `https://www.sevenrooms.com/reservations/${venue.venueId}`,
      }));
    return filtered.length
      ? { status: 'available', slots: filtered }
      : { status: 'unavailable' };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}
