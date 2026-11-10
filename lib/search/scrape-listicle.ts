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

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
};

async function fetchViaFirecrawl(url: string): Promise<string> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) throw new Error('firecrawl_unavailable: FIRECRAWL_API_KEY not set');
  const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url, formats: ['html'], onlyMainContent: false }),
  });
  if (!res.ok) throw new Error(`firecrawl_http_${res.status}`);
  const data = await res.json() as { data?: { html?: string } };
  const html = data?.data?.html;
  if (!html) throw new Error('firecrawl_no_html');
  return html;
}

export async function scrapeListicle(url: string): Promise<RawEntry[]> {
  // Try direct fetch first — works for most sites and avoids the Firecrawl round-trip.
  let html: string | null = null;
  let directStatus = 0;
  try {
    const res = await fetch(url, { headers: BROWSER_HEADERS, redirect: 'follow' });
    directStatus = res.status;
    if (res.ok) html = await res.text();
  } catch {
    directStatus = -1;
  }

  // Fall back to Firecrawl when the site blocked us (403/404/429) or the direct fetch threw.
  if (html === null) {
    const blocked = directStatus === 0 || directStatus === -1 || directStatus === 403 || directStatus === 404 || directStatus === 429;
    if (!blocked) {
      throw new Error(`article_fetch_failed: HTTP ${directStatus}`);
    }
    try {
      html = await fetchViaFirecrawl(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `article_fetch_failed: direct=${directStatus}, firecrawl=${msg} — try pasting restaurant names directly`
      );
    }
  }

  return scrapeListicleHtml(html);
}
