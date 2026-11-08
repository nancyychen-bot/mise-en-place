import type { Provider } from './types';
import type { ProviderSearchHit } from './resy-search';

/**
 * Uses OpenTable's public typeahead endpoint. Returns top hit as a ProviderSearchHit.
 * The endpoint is used by their own homepage search; we send a browser-like UA.
 */
export async function searchOpenTableByName(
  name: string,
  city: string | undefined
): Promise<ProviderSearchHit | null> {
  const params = new URLSearchParams({ q: name });
  if (city) params.set('loc', city);

  let res: Response;
  try {
    res = await fetch(`https://www.opentable.com/dapi/fe/gql/autocomplete?${params}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
        Accept: 'application/json',
        Referer: 'https://www.opentable.com/',
      },
    });
  } catch {
    return null;
  }

  if (!res.ok) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await res.json().catch(() => null) as any;
  const restaurants: Array<Record<string, unknown>> =
    data?.restaurants ?? data?.data?.autocomplete?.restaurants ?? [];

  if (!restaurants.length) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = restaurants[0] as any;

  const rid: string | number | undefined = r?.id ?? r?.restaurantId ?? r?.rid;
  const slug: string | undefined = r?.urlSlug ?? r?.urlPath ?? r?.slug;
  if (!rid && !slug) return null;

  const bookingUrl = slug
    ? `https://www.opentable.com/r/${slug}`
    : `https://www.opentable.com/restref/client/?rid=${rid}`;

  return {
    provider: 'opentable' as Provider,
    venueId: rid ? String(rid) : (slug as string),
    bookingUrl,
    displayName: r?.name ?? name,
    city: city ?? null,
  };
}
