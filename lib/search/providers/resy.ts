import { findResyAvailability, resolveResyVenueId } from '@/lib/resy';
import type { AvailabilityResult, ResolvedVenue, CheckOpts } from '../types';

function inWindow(time: string, start: string, end: string): boolean {
  return time >= start && time <= end;
}

export async function checkResyAvailability(
  venue: ResolvedVenue,
  opts: CheckOpts
): Promise<AvailabilityResult> {
  if (!venue.venueId) return { status: 'unsupported' };
  if (!opts.resyApiKey) return { status: 'error', message: 'Missing Resy API key' };

  // venueId may be a slug (from a direct URL) or numeric (from name search).
  // Normalize to numeric via existing resolver.
  let numericId = venue.venueId;
  if (!/^\d+$/.test(numericId)) {
    const resolved = await resolveResyVenueId(numericId, opts.resyApiKey);
    if (!resolved) return { status: 'error', message: 'Could not resolve Resy slug to venue id' };
    numericId = resolved;
  }

  try {
    const slots = await findResyAvailability(opts.resyApiKey, numericId, opts.date, opts.partySize);
    const filtered = slots
      .filter((s) => inWindow(s.time, opts.windowStart, opts.windowEnd))
      .map((s) => ({
        time: s.time,
        bookingUrl: venue.bookingUrl ?? `https://resy.com/`,
      }));
    return filtered.length
      ? { status: 'available', slots: filtered }
      : { status: 'unavailable' };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}
