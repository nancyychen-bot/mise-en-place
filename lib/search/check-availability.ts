import type { AvailabilityResult, ResolvedVenue, CheckOpts } from './types';
import { checkResyAvailability } from './providers/resy';
import { checkSevenRoomsAvailability } from './providers/sevenrooms';
import { checkOpenTableAvailability } from './providers/opentable';

const SOFT_TIMEOUT_MS = 20_000;

function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: () => T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(onTimeout()), ms);
    p.then((v) => { clearTimeout(t); resolve(v); })
     .catch(() => { clearTimeout(t); resolve(onTimeout()); });
  });
}

export async function checkAvailability(
  venue: ResolvedVenue,
  opts: CheckOpts
): Promise<AvailabilityResult> {
  if (!venue.provider) return { status: 'unsupported' };

  const run = (): Promise<AvailabilityResult> => {
    switch (venue.provider) {
      case 'resy': return checkResyAvailability(venue, opts);
      case 'opentable': return checkOpenTableAvailability(venue, opts);
      case 'sevenrooms': return checkSevenRoomsAvailability(venue, opts);
    }
    return Promise.resolve({ status: 'unsupported' } satisfies AvailabilityResult);
  };

  return withTimeout(run(), SOFT_TIMEOUT_MS, () => ({ status: 'error', message: 'timeout' }));
}
