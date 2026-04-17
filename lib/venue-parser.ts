/**
 * Extracts a Resy venue slug from a pasted URL or raw slug.
 *
 * Accepts:
 *   https://resy.com/cities/ny/venues/don-angie
 *   https://resy.com/cities/ny/venues/don-angie?date=2026-04-22
 *   don-angie
 *   12345  (already a numeric ID — pass through)
 */
export function parseResyVenueInput(input: string): string {
  const trimmed = input.trim();

  // Already a numeric ID
  if (/^\d+$/.test(trimmed)) return trimmed;

  // Full URL
  try {
    const url = new URL(trimmed);
    if (url.hostname.includes('resy.com')) {
      // Path: /cities/{city}/venues/{slug}
      const match = url.pathname.match(/\/venues\/([^/?#]+)/);
      if (match) return match[1];
    }
  } catch {
    // Not a URL — treat as raw slug
  }

  // Raw slug like "don-angie"
  return trimmed;
}

/**
 * Extracts an OpenTable restaurant ID or slug from a pasted URL.
 *
 * Accepts:
 *   https://www.opentable.com/r/don-angie-new-york
 *   https://www.opentable.com/don-angie-new-york
 *   don-angie-new-york
 *   123456 (numeric RID)
 */
export function parseOpenTableVenueInput(input: string): string {
  const trimmed = input.trim();

  if (/^\d+$/.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    if (url.hostname.includes('opentable.com')) {
      // Strip leading /r/ or / to get the slug
      const slug = url.pathname.replace(/^\/(r\/)?/, '').replace(/\/$/, '');
      if (slug) return slug;
    }
  } catch {
    // Raw slug
  }

  return trimmed;
}
