import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { scrapeListicleHtml } from '@/lib/search/scrape-listicle';

const FIXTURE = join(__dirname, '__fixtures__', 'infatuation-west-village.html');

describe('scrapeListicleHtml (Infatuation)', () => {
  let html: string;
  beforeAll(() => { html = readFileSync(FIXTURE, 'utf8'); });

  it('extracts at least 5 restaurants', () => {
    const entries = scrapeListicleHtml(html);
    expect(entries.length).toBeGreaterThanOrEqual(5);
  });

  it('every entry has a non-empty displayName', () => {
    const entries = scrapeListicleHtml(html);
    for (const e of entries) {
      expect(e.displayName.trim().length).toBeGreaterThan(0);
    }
  });

  it('at least one entry has a resy.com or opentable.com hintUrl', () => {
    const entries = scrapeListicleHtml(html);
    const hasProviderHint = entries.some(
      (e) => e.hintUrl && /(resy|opentable|sevenrooms)\.com/i.test(e.hintUrl)
    );
    expect(hasProviderHint).toBe(true);
  });

  it('dedupes entries pointing at the same booking URL', () => {
    const entries = scrapeListicleHtml(html);
    const urls = entries.map((e) => e.hintUrl).filter(Boolean) as string[];
    expect(new Set(urls).size).toBe(urls.length);
  });
});

describe('scrapeListicleHtml (generic fallback)', () => {
  it('extracts provider links from a minimal page', () => {
    const html = `
      <html><body>
        <h2>Via Carota</h2>
        <a href="https://resy.com/cities/ny/venues/via-carota">Book</a>
        <h2>Sunns</h2>
        <a href="https://www.opentable.com/r/sunns-new-york">Reserve</a>
      </body></html>
    `;
    const entries = scrapeListicleHtml(html);
    expect(entries.length).toBe(2);
    expect(entries[0].displayName).toMatch(/via carota/i);
    expect(entries[0].hintUrl).toContain('resy.com');
    expect(entries[1].hintUrl).toContain('opentable.com');
  });

  it('returns an empty array when no provider links exist', () => {
    const entries = scrapeListicleHtml('<html><body><p>Hello</p></body></html>');
    expect(entries).toEqual([]);
  });
});
