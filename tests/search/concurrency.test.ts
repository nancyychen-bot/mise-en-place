import { describe, it, expect } from 'vitest';
import { runPool } from '@/lib/search/concurrency';

describe('runPool', () => {
  it('maps every item and preserves input order in the resolved array', async () => {
    const results = await runPool([1, 2, 3, 4, 5], 2, async (n) => n * 10);
    expect(results).toEqual([10, 20, 30, 40, 50]);
  });

  it('respects the concurrency limit', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    await runPool(items, 3, async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 10));
      inFlight--;
      return 0;
    });
    expect(maxInFlight).toBeLessThanOrEqual(3);
  });

  it('calls onResult as each item completes', async () => {
    const seen: number[] = [];
    await runPool([1, 2, 3], 2, async (n) => n, (i, v) => seen.push(v));
    expect(seen.sort()).toEqual([1, 2, 3]);
  });
});
