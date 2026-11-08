import type { ProviderSearchHit } from './resy-search';

/**
 * SevenRooms does not expose a stable public name-search endpoint.
 * We only match SevenRooms when the article/list input provides a direct URL.
 */
export async function searchSevenRoomsByName(
  name: string,
  city: string | undefined
): Promise<ProviderSearchHit | null> {
  void name;
  void city;
  return null;
}
