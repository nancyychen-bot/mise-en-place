import type { Provider } from './types';

export interface ProviderSearchHit {
  provider: Provider;
  venueId: string;
  bookingUrl: string;
  displayName: string;
  city: string | null;
}

const RESY_HEADERS = (apiKey: string) => ({
  Authorization: `ResyAPI api_key="${apiKey}"`,
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
  'X-Origin': 'https://resy.com',
  Referer: 'https://resy.com/',
  Accept: 'application/json, text/plain, */*',
});

// Resy's city slugs: 'ny' = New York, etc.
const CITY_SLUGS: Record<string, string> = {
  'new york': 'ny',
  'new york city': 'ny',
  'nyc': 'ny',
  'los angeles': 'la',
  'chicago': 'chi',
};

function citySlug(city: string | undefined): string {
  return CITY_SLUGS[(city ?? '').toLowerCase()] ?? 'ny';
}

export async function searchResyByName(
  name: string,
  city: string | undefined,
  apiKey: string
): Promise<ProviderSearchHit | null> {
  if (!apiKey) return null;
  const params = new URLSearchParams({
    query: name,
    'geo[latitude]': '40.7128',
    'geo[longitude]': '-74.0060',
    'slot_filter[party_size]': '2',
    'slot_filter[day]': new Date().toISOString().split('T')[0],
  });
  let res: Response;
  try {
    res = await fetch(`https://api.resy.com/3/venueSearch?${params}`, {
      headers: RESY_HEADERS(apiKey),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const data = await res.json().catch(() => null) as unknown as {
    search?: { hits?: Array<Record<string, unknown>> };
    hits?: Array<Record<string, unknown>>;
  } | null;
  const hits = (data?.search?.hits ?? data?.hits ?? []) as Array<Record<string, unknown>>;
  if (!hits.length) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const top = hits[0] as any;
  const venue = top.venue ?? top;
  const id = venue?.id?.resy ?? venue?.venue_id;
  const slug = venue?.url_slug;
  if (!id || !slug) return null;

  const slugCity = citySlug(city);
  return {
    provider: 'resy',
    venueId: String(id),
    bookingUrl: `https://resy.com/cities/${slugCity}/venues/${slug}`,
    displayName: venue?.name ?? name,
    city: slugCity,
  };
}
