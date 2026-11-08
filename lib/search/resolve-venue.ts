import { randomUUID } from 'node:crypto';
import type { RawEntry, ResolvedVenue, Provider } from './types';
import { tokenSetRatio } from './similarity';
import { searchResyByName } from './resy-search';
import { searchOpenTableByName } from './opentable-search';
import { searchSevenRoomsByName } from './sevenrooms-search';

const NAME_MATCH_THRESHOLD = 0.75;

export interface ResolveOptions {
  city?: string;
  resyApiKey: string;
}

function providerFromHost(host: string): Provider | null {
  if (host.endsWith('resy.com')) return 'resy';
  if (host.endsWith('opentable.com')) return 'opentable';
  if (host.endsWith('sevenrooms.com')) return 'sevenrooms';
  return null;
}

function parseDirectUrl(url: string): { provider: Provider; venueId: string; bookingUrl: string } | null {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const provider = providerFromHost(host);
    if (!provider) return null;

    if (provider === 'resy') {
      const vid = u.searchParams.get('venue_id');
      if (vid && /^\d+$/.test(vid)) return { provider, venueId: vid, bookingUrl: url };
      const m = u.pathname.match(/\/venues\/([^/?#]+)/);
      if (m) return { provider, venueId: m[1], bookingUrl: url };
    }

    if (provider === 'opentable') {
      const m = u.pathname.match(/\/(?:r\/)?([^/?#]+)/);
      if (m) return { provider, venueId: m[1], bookingUrl: url };
    }

    if (provider === 'sevenrooms') {
      const m = u.pathname.match(/\/(?:reservations|explore)\/([^/?#]+)/);
      if (m) return { provider, venueId: m[1], bookingUrl: url };
    }

    return null;
  } catch { return null; }
}

export async function resolveVenue(
  entry: RawEntry,
  opts: ResolveOptions
): Promise<ResolvedVenue> {
  const id = randomUUID();

  if (entry.hintUrl) {
    const direct = parseDirectUrl(entry.hintUrl);
    if (direct) {
      return {
        id,
        displayName: entry.displayName,
        provider: direct.provider,
        venueId: direct.venueId,
        bookingUrl: direct.bookingUrl,
      };
    }
  }

  const searchers = [
    () => searchResyByName(entry.displayName, opts.city, opts.resyApiKey),
    () => searchOpenTableByName(entry.displayName, opts.city),
    () => searchSevenRoomsByName(entry.displayName, opts.city),
  ];

  for (const search of searchers) {
    const hit = await search();
    if (!hit) continue;
    const score = tokenSetRatio(entry.displayName, hit.displayName);
    if (score >= NAME_MATCH_THRESHOLD) {
      return {
        id,
        displayName: entry.displayName,
        provider: hit.provider,
        venueId: hit.venueId,
        bookingUrl: hit.bookingUrl,
      };
    }
  }

  return {
    id,
    displayName: entry.displayName,
    provider: null,
    venueId: null,
    bookingUrl: null,
    resolveError: 'no_confident_match',
  };
}
