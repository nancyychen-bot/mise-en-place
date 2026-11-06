# Restaurant Availability Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a `/dashboard/search` page that takes a URL (single restaurant, article, or pasted list), a date, a time window, and party size, then streams per-venue availability across Resy / OpenTable / SevenRooms into a results table. Linked spec: `docs/superpowers/specs/2026-11-06-restaurant-availability-search-design.md`.

**Architecture:** Two-phase pipeline (resolve → check) behind one SSE endpoint. New `lib/search/` module holds input classification, listicle scraping, venue resolution, and provider-agnostic availability dispatch. The existing `lib/resy.ts`, `lib/opentable.ts`, `lib/sevenrooms.ts` modules are reused; OpenTable gets a new lightweight HTML-scrape availability path to avoid Playwright in a web request.

**Tech Stack:** Next.js 15 App Router (existing), TypeScript, `node-html-parser` (new), `vitest` + `@vitest/ui` (new, for tests), existing Supabase auth (`requireUser`), existing Tailwind styling.

---

## File Map

**New files**

- `lib/search/types.ts` — shared types: `ResolvedEntry`, `ResolvedVenue`, `AvailabilityResult`, `SearchRequest`, SSE event payload types.
- `lib/search/classify.ts` — `classifyInput(raw) → { kind: 'single-url' | 'article-url' | 'list', entries: RawEntry[] }`.
- `lib/search/scrape-listicle.ts` — `scrapeListicle(url) → RawEntry[]` with Infatuation-specific rules + generic provider-link fallback.
- `lib/search/resolve-venue.ts` — `resolveVenue(entry, { city, resyApiKey }) → ResolvedVenue`.
- `lib/search/similarity.ts` — tiny token-set-ratio string similarity helper for name matching.
- `lib/search/check-availability.ts` — `checkAvailability(venue, opts) → AvailabilityResult` provider dispatcher.
- `lib/search/providers/resy.ts` — Resy adapter: wraps `findResyAvailability`, filters to window, converts errors.
- `lib/search/providers/opentable.ts` — new lightweight OT HTML-scrape availability.
- `lib/search/providers/sevenrooms.ts` — wraps `findSevenRoomsAvailability`.
- `lib/search/resy-search.ts` — `searchResyByName(name, city, apiKey)` using the existing `venueSearch` endpoint (lifted/refactored from `resolveResyVenueId` step 2).
- `lib/search/opentable-search.ts` — `searchOpenTableByName(name, city)` using OT's public autocomplete endpoint.
- `lib/search/sevenrooms-search.ts` — stub that returns `null` for v1 (SevenRooms has no stable name-search API for us).
- `lib/search/concurrency.ts` — `runPool<T,R>(items, limit, fn)` tiny concurrency limiter.
- `app/api/search/route.ts` — the SSE endpoint. Node.js runtime, streams events.
- `app/dashboard/search/page.tsx` — server component that renders the client form.
- `app/dashboard/search/search-client.tsx` — client component with form + results table + SSE consumer.
- `tests/search/classify.test.ts`
- `tests/search/similarity.test.ts`
- `tests/search/scrape-listicle.test.ts`
- `tests/search/__fixtures__/infatuation-west-village.html` — saved fixture.
- `tests/search/resolve-venue.test.ts`
- `tests/search/check-availability.test.ts`
- `tests/search/concurrency.test.ts`
- `tests/search/providers/opentable.test.ts`
- `vitest.config.ts`

**Modified files**

- `package.json` — add `node-html-parser`, `vitest`, `@vitest/ui`, `happy-dom`; add `test` and `test:watch` scripts.
- `app/dashboard/layout.tsx` — add a nav link to `/dashboard/search`.

---

## Task 1: Add vitest + node-html-parser

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Install dependencies**

Run:
```bash
npm install --save node-html-parser
npm install --save-dev vitest @vitest/ui happy-dom
```

Expected: `package.json` gets `node-html-parser` under `dependencies` and `vitest`/`@vitest/ui`/`happy-dom` under `devDependencies`. No errors.

- [ ] **Step 2: Add `test` scripts to `package.json`**

Open `package.json` and update the `scripts` block so it reads:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "test": "vitest run",
  "test:watch": "vitest"
},
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globals: false,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
});
```

- [ ] **Step 4: Verify vitest runs (with zero tests)**

Run: `npm test`
Expected: Vitest exits 0 with "No test files found, exiting with code 0" or similar. If it errors about missing files, that's fine — proceed.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add vitest + node-html-parser for search feature"
```

---

## Task 2: Shared types module

**Files:**
- Create: `lib/search/types.ts`

- [ ] **Step 1: Write `lib/search/types.ts`**

```ts
export type Provider = 'resy' | 'opentable' | 'sevenrooms';

/** A row before any venue resolution — "I found the name 'Via Carota' and maybe a URL". */
export interface RawEntry {
  displayName: string;
  hintUrl?: string;
}

/** A row after resolution — ready to be checked, or marked unresolved. */
export interface ResolvedVenue {
  id: string;
  displayName: string;
  provider: Provider | null;
  venueId: string | null;
  bookingUrl: string | null;
  resolveError?: string;
}

export interface Slot {
  time: string;        // "19:30" (24h)
  bookingUrl: string;  // deep link to the booking page/widget with slot preselected
}

export type AvailabilityResult =
  | { status: 'available'; slots: Slot[] }
  | { status: 'unavailable' }
  | { status: 'error'; message: string }
  | { status: 'unsupported' };

export interface SearchRequest {
  input: string;
  date: string;         // YYYY-MM-DD
  windowStart: string;  // HH:mm
  windowEnd: string;    // HH:mm
  partySize: number;
  city?: string;        // default "New York"
}

export type SseEvent =
  | { event: 'resolved'; data: { venues: ResolvedVenue[] } }
  | { event: 'result'; data: { id: string; result: AvailabilityResult } }
  | { event: 'done'; data: Record<string, never> };

export interface CheckOpts {
  date: string;
  windowStart: string;
  windowEnd: string;
  partySize: number;
  resyApiKey: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/search/types.ts
git commit -m "feat(search): shared types for availability search"
```

---

## Task 3: String-similarity helper (TDD)

**Files:**
- Test: `tests/search/similarity.test.ts`
- Create: `lib/search/similarity.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/search/similarity.test.ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/search/similarity.test.ts`
Expected: FAIL — "Cannot find module '@/lib/search/similarity'".

- [ ] **Step 3: Implement `lib/search/similarity.ts`**

```ts
function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
  );
}

/**
 * Jaccard-style token-set ratio: |A ∩ B| / |A ∪ B|.
 * Returns 0..1. Order-insensitive, case/punctuation-insensitive.
 */
export function tokenSetRatio(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 && tb.size === 0) return 1;
  let intersect = 0;
  for (const t of ta) if (tb.has(t)) intersect++;
  const union = ta.size + tb.size - intersect;
  return union === 0 ? 0 : intersect / union;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/search/similarity.test.ts`
Expected: PASS, 6/6 tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/search/similarity.ts tests/search/similarity.test.ts
git commit -m "feat(search): token-set-ratio name similarity helper"
```

---

## Task 4: Concurrency pool (TDD)

**Files:**
- Test: `tests/search/concurrency.test.ts`
- Create: `lib/search/concurrency.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/search/concurrency.test.ts
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
```

- [ ] **Step 2: Run to confirm failure**

Run: `npm test -- tests/search/concurrency.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/search/concurrency.ts`**

```ts
export async function runPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  onResult?: (index: number, value: R) => void
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      const v = await fn(items[i], i);
      results[i] = v;
      onResult?.(i, v);
    }
  }

  const workers: Promise<void>[] = [];
  const n = Math.max(1, Math.min(limit, items.length));
  for (let i = 0; i < n; i++) workers.push(worker());
  await Promise.all(workers);
  return results;
}
```

- [ ] **Step 4: Run to verify passing**

Run: `npm test -- tests/search/concurrency.test.ts`
Expected: PASS, 3/3.

- [ ] **Step 5: Commit**

```bash
git add lib/search/concurrency.ts tests/search/concurrency.test.ts
git commit -m "feat(search): bounded concurrency pool"
```

---

## Task 5: Input classification (TDD)

**Files:**
- Test: `tests/search/classify.test.ts`
- Create: `lib/search/classify.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/search/classify.test.ts
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
```

- [ ] **Step 2: Run to confirm failure**

Run: `npm test -- tests/search/classify.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/search/classify.ts`**

```ts
import type { RawEntry } from './types';

const PROVIDER_HOSTS = ['resy.com', 'opentable.com', 'sevenrooms.com'];

function isUrl(line: string): boolean {
  try {
    const u = new URL(line);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function hostOf(url: string): string {
  try { return new URL(url).hostname.toLowerCase(); } catch { return ''; }
}

function isProviderUrl(url: string): boolean {
  const h = hostOf(url);
  return PROVIDER_HOSTS.some((p) => h === p || h.endsWith(`.${p}`));
}

function nameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const seg = u.pathname.split('/').filter(Boolean).pop() ?? u.hostname;
    return seg.replace(/[-_]+/g, ' ');
  } catch {
    return url;
  }
}

export interface ClassifyResult {
  kind: 'single-url' | 'article-url' | 'list';
  entries: RawEntry[];
}

export function classifyInput(raw: string): ClassifyResult {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  if (lines.length === 1) {
    const only = lines[0];
    if (isUrl(only)) {
      if (isProviderUrl(only)) {
        return { kind: 'single-url', entries: [{ displayName: nameFromUrl(only), hintUrl: only }] };
      }
      return { kind: 'article-url', entries: [{ displayName: hostOf(only), hintUrl: only }] };
    }
    return { kind: 'list', entries: [{ displayName: only }] };
  }

  const entries: RawEntry[] = lines.map((line) =>
    isUrl(line)
      ? { displayName: nameFromUrl(line), hintUrl: line }
      : { displayName: line }
  );
  return { kind: 'list', entries };
}
```

- [ ] **Step 4: Run to verify passing**

Run: `npm test -- tests/search/classify.test.ts`
Expected: PASS, 7/7.

- [ ] **Step 5: Commit**

```bash
git add lib/search/classify.ts tests/search/classify.test.ts
git commit -m "feat(search): classify input as single URL, article, or list"
```

---

## Task 6: Listicle scraping (TDD with fixture)

**Files:**
- Test: `tests/search/scrape-listicle.test.ts`
- Test fixture: `tests/search/__fixtures__/infatuation-west-village.html`
- Create: `lib/search/scrape-listicle.ts`

- [ ] **Step 1: Save a real Infatuation article fixture**

Run from the repo root:

```bash
mkdir -p tests/search/__fixtures__
curl -sSL 'https://www.theinfatuation.com/new-york/guides/the-best-restaurants-in-the-west-village' \
  -H 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36' \
  -o tests/search/__fixtures__/infatuation-west-village.html
wc -l tests/search/__fixtures__/infatuation-west-village.html
```

Expected: file is >100 lines. If the article changes later, `wc -l` will still show a non-trivial count — the tests below assert structural properties, not exact restaurant names, so they stay stable.

- [ ] **Step 2: Write failing tests**

```ts
// tests/search/scrape-listicle.test.ts
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
```

- [ ] **Step 3: Run to confirm failure**

Run: `npm test -- tests/search/scrape-listicle.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `lib/search/scrape-listicle.ts`**

```ts
import { parse, HTMLElement } from 'node-html-parser';
import type { RawEntry } from './types';

const PROVIDER_HOST_RE = /\b(resy|opentable|sevenrooms)\.com/i;

function cleanText(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function nearestHeadingText(a: HTMLElement): string | null {
  let cursor: HTMLElement | null = a;
  while (cursor) {
    let prev = cursor.previousElementSibling as HTMLElement | null;
    while (prev) {
      if (/^h[1-4]$/i.test(prev.tagName)) {
        const t = cleanText(prev.text);
        if (t) return t;
      }
      prev = prev.previousElementSibling as HTMLElement | null;
    }
    cursor = cursor.parentNode as HTMLElement | null;
  }
  return null;
}

export function scrapeListicleHtml(html: string): RawEntry[] {
  const root = parse(html);
  const anchors = root.querySelectorAll('a[href]');
  const seen = new Set<string>();
  const entries: RawEntry[] = [];

  for (const a of anchors) {
    const href = a.getAttribute('href') ?? '';
    if (!PROVIDER_HOST_RE.test(href)) continue;
    if (seen.has(href)) continue;
    seen.add(href);

    const linkText = cleanText(a.text);
    const heading = nearestHeadingText(a);
    const displayName = (heading && heading.length >= 2)
      ? heading
      : (linkText && !/^book|reserve|reservation|table/i.test(linkText))
        ? linkText
        : (heading ?? linkText ?? href);

    entries.push({ displayName: cleanText(displayName), hintUrl: href });
  }

  return entries;
}

export async function scrapeListicle(url: string): Promise<RawEntry[]> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`article_fetch_failed: HTTP ${res.status}`);
  const html = await res.text();
  return scrapeListicleHtml(html);
}
```

- [ ] **Step 5: Run to verify passing**

Run: `npm test -- tests/search/scrape-listicle.test.ts`
Expected: all tests PASS. If the Infatuation fixture test fails because the page shape has shifted, re-fetch the fixture (step 1) before adjusting the implementation; only adjust the code if the shape has genuinely changed.

- [ ] **Step 6: Commit**

```bash
git add lib/search/scrape-listicle.ts tests/search/scrape-listicle.test.ts tests/search/__fixtures__/infatuation-west-village.html
git commit -m "feat(search): scrape restaurant lists from article URLs"
```

---

## Task 7: Resy name search

**Files:**
- Create: `lib/search/resy-search.ts`

- [ ] **Step 1: Write the module**

```ts
// lib/search/resy-search.ts
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
```

- [ ] **Step 2: Commit**

```bash
git add lib/search/resy-search.ts
git commit -m "feat(search): Resy name-search returning top hit"
```

---

## Task 8: OpenTable name search

**Files:**
- Create: `lib/search/opentable-search.ts`

- [ ] **Step 1: Write the module**

```ts
// lib/search/opentable-search.ts
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
```

- [ ] **Step 2: Commit**

```bash
git add lib/search/opentable-search.ts
git commit -m "feat(search): OpenTable name-search via autocomplete API"
```

---

## Task 9: SevenRooms search stub

**Files:**
- Create: `lib/search/sevenrooms-search.ts`

- [ ] **Step 1: Write the stub**

```ts
// lib/search/sevenrooms-search.ts
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
```

- [ ] **Step 2: Commit**

```bash
git add lib/search/sevenrooms-search.ts
git commit -m "feat(search): SevenRooms name-search stub (direct URL only)"
```

---

## Task 10: Venue resolver (TDD)

**Files:**
- Test: `tests/search/resolve-venue.test.ts`
- Create: `lib/search/resolve-venue.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/search/resolve-venue.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveVenue } from '@/lib/search/resolve-venue';
import * as resyMod from '@/lib/search/resy-search';
import * as otMod from '@/lib/search/opentable-search';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('resolveVenue — direct URLs', () => {
  it('resolves a Resy URL by parsing the slug — no search call', async () => {
    const resySpy = vi.spyOn(resyMod, 'searchResyByName').mockResolvedValue(null);
    const v = await resolveVenue(
      { displayName: 'Don Angie', hintUrl: 'https://resy.com/cities/ny/venues/don-angie' },
      { city: 'New York', resyApiKey: 'x' }
    );
    expect(v.provider).toBe('resy');
    expect(v.venueId).toBe('don-angie');
    expect(v.bookingUrl).toContain('resy.com');
    expect(resySpy).not.toHaveBeenCalled();
  });

  it('resolves an OpenTable URL to a slug', async () => {
    const v = await resolveVenue(
      { displayName: 'Sunns', hintUrl: 'https://www.opentable.com/r/sunns-new-york' },
      { city: 'New York', resyApiKey: 'x' }
    );
    expect(v.provider).toBe('opentable');
    expect(v.venueId).toBe('sunns-new-york');
  });

  it('resolves a SevenRooms URL to a slug', async () => {
    const v = await resolveVenue(
      { displayName: 'Don Angie', hintUrl: 'https://www.sevenrooms.com/reservations/donangienj' },
      { city: 'New York', resyApiKey: 'x' }
    );
    expect(v.provider).toBe('sevenrooms');
    expect(v.venueId).toBe('donangienj');
  });
});

describe('resolveVenue — name only', () => {
  it('uses Resy search first and returns on strong match', async () => {
    vi.spyOn(resyMod, 'searchResyByName').mockResolvedValue({
      provider: 'resy',
      venueId: '12345',
      bookingUrl: 'https://resy.com/cities/ny/venues/via-carota',
      displayName: 'Via Carota',
      city: 'ny',
    });
    const otSpy = vi.spyOn(otMod, 'searchOpenTableByName');

    const v = await resolveVenue(
      { displayName: 'Via Carota' },
      { city: 'New York', resyApiKey: 'x' }
    );
    expect(v.provider).toBe('resy');
    expect(v.venueId).toBe('12345');
    expect(otSpy).not.toHaveBeenCalled();
  });

  it('falls through to OpenTable when Resy returns a weak match', async () => {
    vi.spyOn(resyMod, 'searchResyByName').mockResolvedValue({
      provider: 'resy',
      venueId: '12345',
      bookingUrl: 'https://resy.com/',
      displayName: 'Some Other Place Entirely',
      city: 'ny',
    });
    vi.spyOn(otMod, 'searchOpenTableByName').mockResolvedValue({
      provider: 'opentable',
      venueId: '9999',
      bookingUrl: 'https://www.opentable.com/r/via-carota',
      displayName: 'Via Carota',
      city: 'New York',
    });
    const v = await resolveVenue(
      { displayName: 'Via Carota' },
      { city: 'New York', resyApiKey: 'x' }
    );
    expect(v.provider).toBe('opentable');
  });

  it('returns resolveError when no provider has a high-confidence match', async () => {
    vi.spyOn(resyMod, 'searchResyByName').mockResolvedValue(null);
    vi.spyOn(otMod, 'searchOpenTableByName').mockResolvedValue(null);
    const v = await resolveVenue(
      { displayName: 'Nonexistent Place' },
      { city: 'New York', resyApiKey: 'x' }
    );
    expect(v.provider).toBeNull();
    expect(v.resolveError).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npm test -- tests/search/resolve-venue.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/search/resolve-venue.ts`**

```ts
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

function hostOf(url: string): string {
  try { return new URL(url).hostname.toLowerCase(); } catch { return ''; }
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
```

- [ ] **Step 4: Run to verify passing**

Run: `npm test -- tests/search/resolve-venue.test.ts`
Expected: PASS, 6/6.

- [ ] **Step 5: Commit**

```bash
git add lib/search/resolve-venue.ts tests/search/resolve-venue.test.ts
git commit -m "feat(search): resolve raw entries to providers via URL or name search"
```

---

## Task 11: Resy availability adapter

**Files:**
- Create: `lib/search/providers/resy.ts`

- [ ] **Step 1: Write the adapter**

```ts
// lib/search/providers/resy.ts
import { findResyAvailability, resolveResyVenueId } from '@/lib/resy';
import type { AvailabilityResult, ResolvedVenue, CheckOpts } from '../types';

function inWindow(time: string, start: string, end: string): boolean {
  return time >= start && time <= end;
}

export async function checkResyAvailability(
  venue: ResolvedVenue,
  opts: CheckOpts
): Promise<AvailabilityResult> {
  if (!venue.venueId) return { status: 'unsupported' };
  if (!opts.resyApiKey) return { status: 'error', message: 'Missing Resy API key' };

  // venueId may be a slug (from a direct URL) or numeric (from name search).
  // Normalize to numeric via existing resolver.
  let numericId = venue.venueId;
  if (!/^\d+$/.test(numericId)) {
    const resolved = await resolveResyVenueId(numericId, opts.resyApiKey);
    if (!resolved) return { status: 'error', message: 'Could not resolve Resy slug to venue id' };
    numericId = resolved;
  }

  try {
    const slots = await findResyAvailability(opts.resyApiKey, numericId, opts.date, opts.partySize);
    const filtered = slots
      .filter((s) => inWindow(s.time, opts.windowStart, opts.windowEnd))
      .map((s) => ({
        time: s.time,
        bookingUrl: venue.bookingUrl ?? `https://resy.com/`,
      }));
    return filtered.length
      ? { status: 'available', slots: filtered }
      : { status: 'unavailable' };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/search/providers/resy.ts
git commit -m "feat(search): Resy availability adapter"
```

---

## Task 12: SevenRooms availability adapter

**Files:**
- Create: `lib/search/providers/sevenrooms.ts`

- [ ] **Step 1: Write the adapter**

```ts
// lib/search/providers/sevenrooms.ts
import { findSevenRoomsAvailability } from '@/lib/sevenrooms';
import type { AvailabilityResult, ResolvedVenue, CheckOpts } from '../types';

function inWindow(time: string, start: string, end: string): boolean {
  return time >= start && time <= end;
}

export async function checkSevenRoomsAvailability(
  venue: ResolvedVenue,
  opts: CheckOpts
): Promise<AvailabilityResult> {
  if (!venue.venueId) return { status: 'unsupported' };

  try {
    const slots = await findSevenRoomsAvailability(venue.venueId, opts.date, opts.partySize);
    const filtered = slots
      .filter((s) => inWindow(s.time, opts.windowStart, opts.windowEnd))
      .map((s) => ({
        time: s.time,
        bookingUrl: venue.bookingUrl ?? `https://www.sevenrooms.com/reservations/${venue.venueId}`,
      }));
    return filtered.length
      ? { status: 'available', slots: filtered }
      : { status: 'unavailable' };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/search/providers/sevenrooms.ts
git commit -m "feat(search): SevenRooms availability adapter"
```

---

## Task 13: OpenTable lightweight availability adapter (TDD)

**Files:**
- Test: `tests/search/providers/opentable.test.ts`
- Create: `lib/search/providers/opentable.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/search/providers/opentable.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { checkOpenTableAvailability } from '@/lib/search/providers/opentable';
import type { ResolvedVenue } from '@/lib/search/types';

const venue: ResolvedVenue = {
  id: 'r1',
  displayName: 'Sunns',
  provider: 'opentable',
  venueId: 'sunns-new-york',
  bookingUrl: 'https://www.opentable.com/r/sunns-new-york',
};

afterEach(() => vi.restoreAllMocks());

describe('checkOpenTableAvailability', () => {
  it('returns unavailable when OT page has no slot JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html><body>nope</body></html>', { status: 200 })));
    const r = await checkOpenTableAvailability(venue, {
      date: '2026-11-07', windowStart: '19:00', windowEnd: '21:00', partySize: 2, resyApiKey: '',
    });
    expect(r.status).toBe('unavailable');
  });

  it('returns error on non-200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })));
    const r = await checkOpenTableAvailability(venue, {
      date: '2026-11-07', windowStart: '19:00', windowEnd: '21:00', partySize: 2, resyApiKey: '',
    });
    expect(r.status).toBe('error');
  });

  it('extracts time slots from embedded __NEXT_DATA__ and filters to window', async () => {
    const payload = {
      props: {
        pageProps: {
          availability: {
            timeSlots: [
              { time: '18:00', slotHash: 'a' },
              { time: '19:30', slotHash: 'b' },
              { time: '20:00', slotHash: 'c' },
              { time: '22:00', slotHash: 'd' },
            ],
          },
        },
      },
    };
    const html = `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(payload)}</script></body></html>`;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(html, { status: 200 })));

    const r = await checkOpenTableAvailability(venue, {
      date: '2026-11-07', windowStart: '19:00', windowEnd: '21:00', partySize: 2, resyApiKey: '',
    });
    expect(r.status).toBe('available');
    if (r.status === 'available') {
      expect(r.slots.map((s) => s.time)).toEqual(['19:30', '20:00']);
      for (const s of r.slots) expect(s.bookingUrl).toContain('opentable.com');
    }
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npm test -- tests/search/providers/opentable.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/search/providers/opentable.ts`**

```ts
// lib/search/providers/opentable.ts
import { parse } from 'node-html-parser';
import type { AvailabilityResult, ResolvedVenue, CheckOpts } from '../types';

function inWindow(time: string, start: string, end: string): boolean {
  return time >= start && time <= end;
}

function slotsFromNextData(html: string): string[] | null {
  const root = parse(html);
  const script = root.querySelector('script#__NEXT_DATA__');
  if (!script) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = JSON.parse(script.text) as any;
    const raw = data?.props?.pageProps?.availability?.timeSlots
      ?? data?.props?.pageProps?.restaurant?.availability?.timeSlots
      ?? [];
    if (!Array.isArray(raw)) return null;
    const times: string[] = [];
    for (const s of raw) {
      const t: string | undefined = s?.time ?? s?.datetime?.slice?.(11, 16);
      if (t && /^\d{2}:\d{2}$/.test(t)) times.push(t);
    }
    return times;
  } catch {
    return null;
  }
}

function buildBookingUrl(venueId: string, date: string, time: string, partySize: number): string {
  const dateTime = `${date}T${time}`;
  const params = new URLSearchParams({
    restref: venueId,
    partySize: String(partySize),
    datetime: dateTime,
  });
  return `https://www.opentable.com/restref/client/?${params}`;
}

export async function checkOpenTableAvailability(
  venue: ResolvedVenue,
  opts: CheckOpts
): Promise<AvailabilityResult> {
  if (!venue.venueId) return { status: 'unsupported' };

  const url = venue.bookingUrl ?? `https://www.opentable.com/r/${venue.venueId}`;
  const params = new URLSearchParams({
    covers: String(opts.partySize),
    dateTime: `${opts.date}T${opts.windowStart}`,
  });

  let res: Response;
  try {
    res = await fetch(`${url}?${params}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    });
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err) };
  }

  if (!res.ok) return { status: 'error', message: `http_${res.status}` };

  const html = await res.text();
  const times = slotsFromNextData(html);
  if (times === null) return { status: 'unavailable' };

  const filtered = times
    .filter((t) => inWindow(t, opts.windowStart, opts.windowEnd))
    .map((t) => ({
      time: t,
      bookingUrl: buildBookingUrl(venue.venueId as string, opts.date, t, opts.partySize),
    }));

  return filtered.length ? { status: 'available', slots: filtered } : { status: 'unavailable' };
}
```

- [ ] **Step 4: Run to verify passing**

Run: `npm test -- tests/search/providers/opentable.test.ts`
Expected: PASS, 3/3.

- [ ] **Step 5: Commit**

```bash
git add lib/search/providers/opentable.ts tests/search/providers/opentable.test.ts
git commit -m "feat(search): lightweight OpenTable availability via NEXT_DATA scrape"
```

---

## Task 14: Provider dispatcher (TDD)

**Files:**
- Test: `tests/search/check-availability.test.ts`
- Create: `lib/search/check-availability.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/search/check-availability.test.ts
import { describe, it, expect } from 'vitest';
import { checkAvailability } from '@/lib/search/check-availability';
import type { ResolvedVenue } from '@/lib/search/types';

const baseOpts = { date: '2026-11-07', windowStart: '19:00', windowEnd: '21:00', partySize: 2, resyApiKey: '' };

describe('checkAvailability', () => {
  it('returns unsupported when provider is null', async () => {
    const venue: ResolvedVenue = {
      id: 'r1', displayName: 'X', provider: null, venueId: null, bookingUrl: null, resolveError: 'no_confident_match',
    };
    const r = await checkAvailability(venue, baseOpts);
    expect(r.status).toBe('unsupported');
  });

  it('returns error when Resy API key is missing', async () => {
    const venue: ResolvedVenue = {
      id: 'r2', displayName: 'X', provider: 'resy', venueId: '12345', bookingUrl: 'https://resy.com/',
    };
    const r = await checkAvailability(venue, { ...baseOpts, resyApiKey: '' });
    expect(r.status).toBe('error');
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npm test -- tests/search/check-availability.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/search/check-availability.ts`**

```ts
// lib/search/check-availability.ts
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
```

- [ ] **Step 4: Run to verify passing**

Run: `npm test -- tests/search/check-availability.test.ts`
Expected: PASS, 2/2.

- [ ] **Step 5: Commit**

```bash
git add lib/search/check-availability.ts tests/search/check-availability.test.ts
git commit -m "feat(search): provider-dispatching availability check with soft timeout"
```

---

## Task 15: SSE API route

**Files:**
- Create: `app/api/search/route.ts`

- [ ] **Step 1: Write the route**

```ts
// app/api/search/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import type { ResolvedVenue, SearchRequest, RawEntry } from '@/lib/search/types';
import { classifyInput } from '@/lib/search/classify';
import { scrapeListicle } from '@/lib/search/scrape-listicle';
import { resolveVenue } from '@/lib/search/resolve-venue';
import { checkAvailability } from '@/lib/search/check-availability';
import { runPool } from '@/lib/search/concurrency';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CONCURRENCY = 5;

function sseEncode(event: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function POST(req: NextRequest) {
  const user = await requireUser().catch(() => null);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: SearchRequest;
  try {
    body = await req.json() as SearchRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.input?.trim()) return NextResponse.json({ error: 'input is required' }, { status: 400 });
  if (!body.date) return NextResponse.json({ error: 'date is required' }, { status: 400 });
  if (!body.windowStart || !body.windowEnd) return NextResponse.json({ error: 'windowStart and windowEnd are required' }, { status: 400 });
  if (!body.partySize || body.partySize < 1 || body.partySize > 20) {
    return NextResponse.json({ error: 'partySize must be 1..20' }, { status: 400 });
  }

  const { data: settings } = await db
    .from('user_settings')
    .select('resy_api_key')
    .eq('user_id', user.id)
    .single();
  const resyApiKey = (settings?.resy_api_key as string | null) ?? '';

  const classified = classifyInput(body.input);
  let rawEntries: RawEntry[] = classified.entries;

  if (classified.kind === 'article-url' && rawEntries[0]?.hintUrl) {
    try {
      const scraped = await scrapeListicle(rawEntries[0].hintUrl);
      if (scraped.length === 0) {
        return NextResponse.json({ error: "Couldn't find restaurants in that URL — try pasting names directly." }, { status: 400 });
      }
      rawEntries = scraped;
    } catch (err) {
      return NextResponse.json({ error: `Article fetch failed: ${err instanceof Error ? err.message : String(err)}` }, { status: 400 });
    }
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const venues: ResolvedVenue[] = await runPool(rawEntries, CONCURRENCY, (e) =>
          resolveVenue(e, { city: body.city, resyApiKey })
        );

        controller.enqueue(sseEncode('resolved', { venues }));

        await runPool(venues, CONCURRENCY, async (venue) => {
          const result = await checkAvailability(venue, {
            date: body.date,
            windowStart: body.windowStart,
            windowEnd: body.windowEnd,
            partySize: body.partySize,
            resyApiKey,
          });
          controller.enqueue(sseEncode('result', { id: venue.id, result }));
          return result;
        });

        controller.enqueue(sseEncode('done', {}));
      } catch (err) {
        controller.enqueue(
          sseEncode('error', { message: err instanceof Error ? err.message : String(err) })
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
```

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: `app/api/search/route.ts` compiles cleanly. If TypeScript complains about `requireUser` or `db` imports, inspect those modules — they're imported the same way as in `app/api/check-now/route.ts`.

- [ ] **Step 3: Commit**

```bash
git add app/api/search/route.ts
git commit -m "feat(search): SSE API route — resolve then check with concurrency"
```

---

## Task 16: Dashboard page skeleton

**Files:**
- Create: `app/dashboard/search/page.tsx`
- Create: `app/dashboard/search/search-client.tsx`

- [ ] **Step 1: Write the server component**

```tsx
// app/dashboard/search/page.tsx
import { requireUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { SearchClient } from './search-client';

export default async function SearchPage() {
  const user = await requireUser().catch(() => null);
  if (!user) redirect('/login');

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold mb-6">Availability Search</h1>
      <p className="text-sm text-neutral-600 mb-6">
        Paste a restaurant URL, a listicle (like an Infatuation guide), or a list of names (one per line).
      </p>
      <SearchClient />
    </div>
  );
}
```

- [ ] **Step 2: Write the client component**

```tsx
// app/dashboard/search/search-client.tsx
'use client';

import { useState, useRef } from 'react';
import type { ResolvedVenue, AvailabilityResult, SseEvent } from '@/lib/search/types';

type RowState = {
  venue: ResolvedVenue;
  result?: AvailabilityResult;
};

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function SearchClient() {
  const [input, setInput] = useState('');
  const [date, setDate] = useState(todayIso());
  const [windowStart, setWindowStart] = useState('19:00');
  const [windowEnd, setWindowEnd] = useState('21:00');
  const [partySize, setPartySize] = useState(2);
  const [city, setCity] = useState('New York');
  const [rows, setRows] = useState<RowState[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setRows([]);
    setLoading(true);
    const ctrl = new AbortController();
    abortRef.current?.abort();
    abortRef.current = ctrl;

    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input, date, windowStart, windowEnd, partySize, city }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const text = await res.text();
        try {
          const j = JSON.parse(text);
          throw new Error(j.error ?? `HTTP ${res.status}`);
        } catch { throw new Error(text || `HTTP ${res.status}`); }
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += value;
        let idx: number;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const raw = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const lines = raw.split('\n');
          let eventName = 'message';
          let dataLine = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) eventName = line.slice(7).trim();
            if (line.startsWith('data: ')) dataLine = line.slice(6);
          }
          if (!dataLine) continue;
          const parsed = JSON.parse(dataLine);
          const evt = { event: eventName, data: parsed } as SseEvent;
          if (evt.event === 'resolved') {
            setRows(evt.data.venues.map((v) => ({ venue: v })));
          } else if (evt.event === 'result') {
            setRows((prev) =>
              prev.map((r) => r.venue.id === evt.data.id ? { ...r, result: evt.data.result } : r)
            );
          }
        }
      }
    } catch (err) {
      if ((err as { name?: string }).name !== 'AbortError') {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setLoading(false);
    }
  }

  const checked = rows.filter((r) => r.result).length;
  const available = rows.filter((r) => r.result?.status === 'available').length;

  return (
    <div>
      <form onSubmit={onSubmit} className="space-y-4 mb-8">
        <label className="block">
          <span className="text-sm font-medium">URL, article, or list</span>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={4}
            required
            className="mt-1 w-full border rounded p-2 font-mono text-sm"
            placeholder="https://www.theinfatuation.com/new-york/guides/..."
          />
        </label>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <label className="block">
            <span className="text-sm font-medium">Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className="mt-1 w-full border rounded p-2" />
          </label>
          <label className="block">
            <span className="text-sm font-medium">From</span>
            <input type="time" value={windowStart} onChange={(e) => setWindowStart(e.target.value)} required className="mt-1 w-full border rounded p-2" />
          </label>
          <label className="block">
            <span className="text-sm font-medium">To</span>
            <input type="time" value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} required className="mt-1 w-full border rounded p-2" />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Party</span>
            <input type="number" min={1} max={20} value={partySize} onChange={(e) => setPartySize(parseInt(e.target.value, 10) || 2)} required className="mt-1 w-full border rounded p-2" />
          </label>
          <label className="block">
            <span className="text-sm font-medium">City</span>
            <input type="text" value={city} onChange={(e) => setCity(e.target.value)} className="mt-1 w-full border rounded p-2" />
          </label>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="bg-black text-white px-4 py-2 rounded disabled:opacity-50"
        >
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-800 text-sm">{error}</div>}

      {rows.length > 0 && (
        <>
          <div className="text-sm text-neutral-600 mb-2">
            Checked {checked}/{rows.length} — {available} available.
          </div>
          <table className="w-full text-sm">
            <thead className="text-left border-b">
              <tr>
                <th className="py-2">Restaurant</th>
                <th className="py-2">Provider</th>
                <th className="py-2">Status</th>
                <th className="py-2">Slots</th>
                <th className="py-2">Link</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <ResultRow key={r.venue.id} row={r} />
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function ResultRow({ row }: { row: RowState }) {
  const { venue, result } = row;
  return (
    <tr className="border-b align-top">
      <td className="py-2 pr-2">{venue.displayName}</td>
      <td className="py-2 pr-2 text-neutral-500">{venue.provider ?? '—'}</td>
      <td className="py-2 pr-2">{renderStatus(row)}</td>
      <td className="py-2 pr-2">{renderSlots(row)}</td>
      <td className="py-2">{renderLink(row)}</td>
    </tr>
  );
}

function renderStatus(row: RowState) {
  if (!row.result) return <span className="text-neutral-500">checking…</span>;
  switch (row.result.status) {
    case 'available': return <span className="text-green-700 font-medium">Available</span>;
    case 'unavailable': return <span className="text-neutral-500">No tables</span>;
    case 'error': return <span className="text-yellow-700" title={row.result.message}>Check failed</span>;
    case 'unsupported': return <span className="text-neutral-500">Couldn't resolve</span>;
  }
}

function renderSlots(row: RowState) {
  if (row.result?.status !== 'available') return null;
  return (
    <div className="flex flex-wrap gap-2">
      {row.result.slots.map((s) => (
        <a key={s.time} href={s.bookingUrl} target="_blank" rel="noopener noreferrer"
           className="px-2 py-0.5 bg-green-50 border border-green-200 rounded text-green-800 hover:bg-green-100">
          {s.time}
        </a>
      ))}
    </div>
  );
}

function renderLink(row: RowState) {
  const { venue, result } = row;
  if (venue.bookingUrl) {
    return <a href={venue.bookingUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Open</a>;
  }
  if (result?.status === 'unsupported' || !venue.provider) {
    const q = encodeURIComponent(`${venue.displayName} reservations`);
    return <a href={`https://www.google.com/search?q=${q}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Search</a>;
  }
  return null;
}
```

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: clean build.

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/search/page.tsx app/dashboard/search/search-client.tsx
git commit -m "feat(search): dashboard page with streaming results table"
```

---

## Task 17: Dashboard nav entry

**Files:**
- Modify: `app/dashboard/layout.tsx`

- [ ] **Step 1: Read the current nav structure**

Run: `cat app/dashboard/layout.tsx`
Expected: a layout with a top/side nav listing existing pages (Watchlist/Activity/Preferences/Account). Note the exact JSX pattern used for other links.

- [ ] **Step 2: Add a "Search" link that matches the existing pattern**

Add a new entry linking to `/dashboard/search` labeled "Search", using the same `<Link>` + className structure the other entries use. If the nav is rendered via a loop over an array of `{ href, label }` objects, add `{ href: '/dashboard/search', label: 'Search' }` to that array. Otherwise, duplicate an existing nav `<Link>` and change the href and label.

- [ ] **Step 3: Visual sanity check**

Run: `npm run dev`, open `/dashboard`, confirm the "Search" link appears in the nav and clicking it loads the new page. Kill the dev server when done.

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/layout.tsx
git commit -m "feat(search): nav link to /dashboard/search"
```

---

## Task 18: Full test suite + end-to-end sanity

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: all tests pass. If anything fails, fix before moving on.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: no errors. Fix any that appear.

- [ ] **Step 3: Full build**

Run: `npm run build`
Expected: clean build with no type errors.

- [ ] **Step 4: Manual end-to-end check**

1. `npm run dev`
2. Log in at `/login`.
3. Visit `/dashboard/search`.
4. Paste `https://www.theinfatuation.com/new-york/guides/the-best-restaurants-in-the-west-village`, date = tomorrow, time window 19:00–21:00, party 2, city "New York". Submit.
5. Expect: "Checked N/N" counter appears, rows stream in, at least some rows show "Available" or "No tables" (any `error` statuses are acceptable per the OT risk noted in the spec).
6. Click an available slot — it should open the provider booking page in a new tab.
7. Repeat with a single-URL input (e.g. a Resy URL) and a pasted list of two names.

Report observed results. If a whole-run failure occurs (not just per-row), investigate the server logs and fix before closing out.

- [ ] **Step 5: Final commit if anything changed**

Only if step 4 required fixes:

```bash
git add -A
git commit -m "fix(search): address findings from manual QA"
```

---

## Self-Review Notes

- **Spec coverage:** Classification (Task 5), listicle scrape (6), name search for all three providers (7/8/9), resolver (10), provider adapters (11/12/13), dispatcher (14), SSE route (15), UI with streaming (16), nav (17). OT Playwright constraint addressed in Task 13.
- **Types:** `ResolvedVenue`, `AvailabilityResult`, `CheckOpts`, `SseEvent` defined once in Task 2 and reused. Provider ids are strings, `venueId` nullable, slot `time` is `HH:mm`.
- **No placeholders left.**
- **Risks flagged:** OT lightweight path may land in `error` often — acceptable per spec. Infatuation fixture test asserts structural properties (≥5 entries, has provider hint) so it survives article edits.
