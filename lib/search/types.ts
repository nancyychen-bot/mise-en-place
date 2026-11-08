export type Provider = 'resy' | 'opentable' | 'sevenrooms';

/** A row before any venue resolution — "I found the name 'Via Carota' and maybe a URL". */
export interface RawEntry {
  displayName: string;
  hintUrl?: string;
}

/** A row after resolution — ready to be checked, or marked unresolved. */
export interface ResolvedVenue {
  id: string;
  displayName: string;
  provider: Provider | null;
  venueId: string | null;
  bookingUrl: string | null;
  resolveError?: string;
}

export interface Slot {
  time: string;        // "19:30" (24h)
  bookingUrl: string;  // deep link to the booking page/widget with slot preselected
}

export type AvailabilityResult =
  | { status: 'available'; slots: Slot[] }
  | { status: 'unavailable' }
  | { status: 'error'; message: string }
  | { status: 'unsupported' };

export interface SearchRequest {
  input: string;
  date: string;         // YYYY-MM-DD
  windowStart: string;  // HH:mm
  windowEnd: string;    // HH:mm
  partySize: number;
  city?: string;        // default "New York"
}

export type SseEvent =
  | { event: 'resolved'; data: { venues: ResolvedVenue[] } }
  | { event: 'result'; data: { id: string; result: AvailabilityResult } }
  | { event: 'done'; data: Record<string, never> };

export interface CheckOpts {
  date: string;
  windowStart: string;
  windowEnd: string;
  partySize: number;
  resyApiKey: string;
}
