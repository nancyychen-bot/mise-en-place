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

export async function scrapeListicle(url: string): Promise<RawEntry[]> {
  const res = await fetch(url, { headers: BROWSER_HEADERS, redirect: 'follow' });
  if (res.status === 404) {
    throw new Error(
      `article_fetch_failed: HTTP 404 (the site may be blocking server requests — try pasting restaurant names directly)`
    );
  }
  if (res.status === 403) {
    throw new Error(
      `article_fetch_failed: HTTP 403 (blocked by the site's bot protection — try pasting restaurant names directly)`
    );
  }
  if (!res.ok) throw new Error(`article_fetch_failed: HTTP ${res.status}`);
  const html = await res.text();
  return scrapeListicleHtml(html);
}
