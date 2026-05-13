/**
 * Resolves an OpenTable URL slug (e.g. "sunns-new-york") to a numeric restaurant ID.
 * Scrapes the OpenTable restaurant page and extracts the rid from embedded JSON.
 * Returns null if resolution fails.
 */
export async function resolveOpenTableVenueId(slugOrUrl: string): Promise<string | null> {
  if (/^\d+$/.test(slugOrUrl.trim())) return slugOrUrl.trim();

  let slug = slugOrUrl.trim();
  try {
    const url = new URL(slugOrUrl);
    if (url.hostname.includes('opentable.com')) {
      const m = url.pathname.match(/\/(?:r\/)?([^/?#]+)/);
      if (m) slug = m[1];
    }
  } catch { /* raw slug */ }

  try {
    // Use the edge runtime endpoint which runs on Cloudflare's network
    // and is not blocked by OpenTable like Vercel's serverless IPs are.
    const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mise-en-place-restaurants.vercel.app';
    const res = await fetch(`${base}/api/resolve-opentable?slug=${encodeURIComponent(slug)}`);
    if (res.ok) {
      const data = await res.json() as { rid: string | null };
      if (data.rid) return data.rid;
    }
  } catch { /* fall through */ }

  return null;
}

