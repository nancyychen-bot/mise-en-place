import { describe, it, expect } from 'vitest';
import { tokenSetRatio } from '@/lib/search/similarity';

describe('tokenSetRatio', () => {
  it('returns 1 for identical strings', () => {
    expect(tokenSetRatio('via carota', 'via carota')).toBe(1);
  });

  it('is case- and punctuation-insensitive', () => {
    expect(tokenSetRatio('Via Carota', 'via, carota!')).toBe(1);
  });

  it('ignores word order', () => {
    expect(tokenSetRatio('don angie', 'angie don')).toBe(1);
  });

  it('is 0 for completely different strings', () => {
    expect(tokenSetRatio('apple', 'zebra')).toBe(0);
  });

  it('returns a value between 0 and 1 for partial overlap', () => {
    const r = tokenSetRatio('don angie restaurant', 'don angie');
    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThanOrEqual(1);
  });

  it('crosses 0.75 for a close match', () => {
    expect(tokenSetRatio('Via Carota', 'Via Carota NYC')).toBeGreaterThanOrEqual(0.75);
  });
});
