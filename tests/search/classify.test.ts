import { describe, it, expect } from 'vitest';
import { classifyInput } from '@/lib/search/classify';

describe('classifyInput', () => {
  it('classifies a single Resy URL as single-url', () => {
    const r = classifyInput('https://resy.com/cities/ny/venues/don-angie');
    expect(r.kind).toBe('single-url');
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0].hintUrl).toContain('resy.com');
  });

  it('classifies a single OpenTable URL as single-url', () => {
    const r = classifyInput('https://www.opentable.com/r/sunns-new-york');
    expect(r.kind).toBe('single-url');
    expect(r.entries[0].hintUrl).toContain('opentable.com');
  });

  it('classifies a single SevenRooms URL as single-url', () => {
    const r = classifyInput('https://www.sevenrooms.com/reservations/donangienj');
    expect(r.kind).toBe('single-url');
  });

  it('classifies a non-provider URL as article-url', () => {
    const r = classifyInput('https://www.theinfatuation.com/new-york/guides/the-best-restaurants-in-the-west-village');
    expect(r.kind).toBe('article-url');
    expect(r.entries[0].hintUrl).toContain('theinfatuation.com');
  });

  it('classifies multi-line input as list', () => {
    const r = classifyInput('Via Carota\nDon Angie\nhttps://resy.com/cities/ny/venues/sunns');
    expect(r.kind).toBe('list');
    expect(r.entries).toHaveLength(3);
    expect(r.entries[0].displayName).toBe('Via Carota');
    expect(r.entries[2].hintUrl).toContain('resy.com');
  });

  it('trims and drops empty lines in a list', () => {
    const r = classifyInput('  Via Carota  \n\n   \nDon Angie\n');
    expect(r.kind).toBe('list');
    expect(r.entries.map((e) => e.displayName)).toEqual(['Via Carota', 'Don Angie']);
  });

  it('treats a single bare name as a list of one', () => {
    const r = classifyInput('Via Carota');
    expect(r.kind).toBe('list');
    expect(r.entries[0].displayName).toBe('Via Carota');
    expect(r.entries[0].hintUrl).toBeUndefined();
  });
});
