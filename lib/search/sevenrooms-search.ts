import type { ProviderSearchHit } from './resy-search';

/**
 * SevenRooms does not expose a stable public name-search endpoint.
 * We only match SevenRooms when the article/list input provides a direct URL.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function searchSevenRoomsByName(
  _name: string,
  _city: string | undefined
): Promise<ProviderSearchHit | null> {
  return null;
}
