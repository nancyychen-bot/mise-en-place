import { describe, it, expect } from 'vitest';
import { checkAvailability } from '@/lib/search/check-availability';
import type { ResolvedVenue } from '@/lib/search/types';

const baseOpts = { date: '2026-11-07', windowStart: '19:00', windowEnd: '21:00', partySize: 2, resyApiKey: '' };

describe('checkAvailability', () => {
  it('returns unsupported when provider is null', async () => {
    const venue: ResolvedVenue = {
      id: 'r1', displayName: 'X', provider: null, venueId: null, bookingUrl: null, resolveError: 'no_confident_match',
    };
    const r = await checkAvailability(venue, baseOpts);
    expect(r.status).toBe('unsupported');
  });

  it('returns error when Resy API key is missing', async () => {
    const venue: ResolvedVenue = {
      id: 'r2', displayName: 'X', provider: 'resy', venueId: '12345', bookingUrl: 'https://resy.com/',
    };
    const r = await checkAvailability(venue, { ...baseOpts, resyApiKey: '' });
    expect(r.status).toBe('error');
  });
});
