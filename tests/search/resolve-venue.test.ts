import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveVenue } from '@/lib/search/resolve-venue';
import * as resyMod from '@/lib/search/resy-search';
import * as otMod from '@/lib/search/opentable-search';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('resolveVenue — direct URLs', () => {
  it('resolves a Resy URL by parsing the slug — no search call', async () => {
    const resySpy = vi.spyOn(resyMod, 'searchResyByName').mockResolvedValue(null);
    const v = await resolveVenue(
      { displayName: 'Don Angie', hintUrl: 'https://resy.com/cities/ny/venues/don-angie' },
      { city: 'New York', resyApiKey: 'x' }
    );
    expect(v.provider).toBe('resy');
    expect(v.venueId).toBe('don-angie');
    expect(v.bookingUrl).toContain('resy.com');
    expect(resySpy).not.toHaveBeenCalled();
  });

  it('resolves an OpenTable URL to a slug', async () => {
    const v = await resolveVenue(
      { displayName: 'Sunns', hintUrl: 'https://www.opentable.com/r/sunns-new-york' },
      { city: 'New York', resyApiKey: 'x' }
    );
    expect(v.provider).toBe('opentable');
    expect(v.venueId).toBe('sunns-new-york');
  });

  it('resolves a SevenRooms URL to a slug', async () => {
    const v = await resolveVenue(
      { displayName: 'Don Angie', hintUrl: 'https://www.sevenrooms.com/reservations/donangienj' },
      { city: 'New York', resyApiKey: 'x' }
    );
    expect(v.provider).toBe('sevenrooms');
    expect(v.venueId).toBe('donangienj');
  });
});

describe('resolveVenue — name only', () => {
  it('uses Resy search first and returns on strong match', async () => {
    vi.spyOn(resyMod, 'searchResyByName').mockResolvedValue({
      provider: 'resy',
      venueId: '12345',
      bookingUrl: 'https://resy.com/cities/ny/venues/via-carota',
      displayName: 'Via Carota',
      city: 'ny',
    });
    const otSpy = vi.spyOn(otMod, 'searchOpenTableByName');

    const v = await resolveVenue(
      { displayName: 'Via Carota' },
      { city: 'New York', resyApiKey: 'x' }
    );
    expect(v.provider).toBe('resy');
    expect(v.venueId).toBe('12345');
    expect(otSpy).not.toHaveBeenCalled();
  });

  it('falls through to OpenTable when Resy returns a weak match', async () => {
    vi.spyOn(resyMod, 'searchResyByName').mockResolvedValue({
      provider: 'resy',
      venueId: '12345',
      bookingUrl: 'https://resy.com/',
      displayName: 'Some Other Place Entirely',
      city: 'ny',
    });
    vi.spyOn(otMod, 'searchOpenTableByName').mockResolvedValue({
      provider: 'opentable',
      venueId: '9999',
      bookingUrl: 'https://www.opentable.com/r/via-carota',
      displayName: 'Via Carota',
      city: 'New York',
    });
    const v = await resolveVenue(
      { displayName: 'Via Carota' },
      { city: 'New York', resyApiKey: 'x' }
    );
    expect(v.provider).toBe('opentable');
  });

  it('returns resolveError when no provider has a high-confidence match', async () => {
    vi.spyOn(resyMod, 'searchResyByName').mockResolvedValue(null);
    vi.spyOn(otMod, 'searchOpenTableByName').mockResolvedValue(null);
    const v = await resolveVenue(
      { displayName: 'Nonexistent Place' },
      { city: 'New York', resyApiKey: 'x' }
    );
    expect(v.provider).toBeNull();
    expect(v.resolveError).toBeTruthy();
  });
});
