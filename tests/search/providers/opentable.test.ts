import { describe, it, expect, vi, afterEach } from 'vitest';
import { checkOpenTableAvailability } from '@/lib/search/providers/opentable';
import type { ResolvedVenue } from '@/lib/search/types';

const venue: ResolvedVenue = {
  id: 'r1',
  displayName: 'Sunns',
  provider: 'opentable',
  venueId: 'sunns-new-york',
  bookingUrl: 'https://www.opentable.com/r/sunns-new-york',
};

afterEach(() => vi.restoreAllMocks());

describe('checkOpenTableAvailability', () => {
  it('returns unavailable when OT page has no slot JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html><body>nope</body></html>', { status: 200 })));
    const r = await checkOpenTableAvailability(venue, {
      date: '2026-11-07', windowStart: '19:00', windowEnd: '21:00', partySize: 2, resyApiKey: '',
    });
    expect(r.status).toBe('unavailable');
  });

  it('returns error on non-200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })));
    const r = await checkOpenTableAvailability(venue, {
      date: '2026-11-07', windowStart: '19:00', windowEnd: '21:00', partySize: 2, resyApiKey: '',
    });
    expect(r.status).toBe('error');
  });

  it('extracts time slots from embedded __NEXT_DATA__ and filters to window', async () => {
    const payload = {
      props: {
        pageProps: {
          availability: {
            timeSlots: [
              { time: '18:00', slotHash: 'a' },
              { time: '19:30', slotHash: 'b' },
              { time: '20:00', slotHash: 'c' },
              { time: '22:00', slotHash: 'd' },
            ],
          },
        },
      },
    };
    const html = `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(payload)}</script></body></html>`;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(html, { status: 200 })));

    const r = await checkOpenTableAvailability(venue, {
      date: '2026-11-07', windowStart: '19:00', windowEnd: '21:00', partySize: 2, resyApiKey: '',
    });
    expect(r.status).toBe('available');
    if (r.status === 'available') {
      expect(r.slots.map((s) => s.time)).toEqual(['19:30', '20:00']);
      for (const s of r.slots) expect(s.bookingUrl).toContain('opentable.com');
    }
  });
});
