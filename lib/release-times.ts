interface ReleaseInfo {
  daysAhead: number;
  time: string;
}

const KNOWN_RELEASES: Record<string, ReleaseInfo> = {
  'le veau d\'or': { daysAhead: 14, time: '09:00' },
  'don angie': { daysAhead: 7, time: '09:00' },
  'lilia': { daysAhead: 28, time: '10:00' },
  'i sodi': { daysAhead: 13, time: '00:00' },
  'carbone': { daysAhead: 30, time: '10:00' },
  'torrisi': { daysAhead: 30, time: '10:00' },
  '4 charles prime rib': { daysAhead: 21, time: '09:00' },
  'tatiana': { daysAhead: 28, time: '12:00' },
  'bong': { daysAhead: 21, time: '09:00' },
  'semma': { daysAhead: 7, time: '09:00' },
  'estela': { daysAhead: 14, time: '09:00' },
  'red hook tavern': { daysAhead: 13, time: '00:00' },
  'minetta tavern': { daysAhead: 30, time: '00:00' },
  'cote': { daysAhead: 29, time: '10:00' },
  'four horseman': { daysAhead: 29, time: '07:00' },
  'thai diner': { daysAhead: 7, time: '09:00' },
  'golden diner': { daysAhead: 14, time: '09:00' },
  'lei bar': { daysAhead: 14, time: '09:00' },
  'lucali': { daysAhead: 14, time: '09:00' },
  'nom wah tea parlor': { daysAhead: 14, time: '09:00' },
};

export function lookupReleaseTime(restaurantName: string): ReleaseInfo | null {
  const key = restaurantName.toLowerCase().trim();
  if (KNOWN_RELEASES[key]) return KNOWN_RELEASES[key];
  for (const [k, v] of Object.entries(KNOWN_RELEASES)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return null;
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/['']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function parseSnatchdText(text: string): ReleaseInfo | null {
  const match = text.match(/opens at (\d+) days? in advance at (\d+)\s*(AM|PM)/i);
  if (!match) return null;
  let hours = parseInt(match[2], 10);
  const period = match[3].toUpperCase();
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  return {
    daysAhead: parseInt(match[1], 10),
    time: `${String(hours).padStart(2, '0')}:00`,
  };
}

export async function fetchReleaseTime(restaurantName: string, venueSlug?: string | null): Promise<ReleaseInfo | null> {
  const slugs = [
    venueSlug,
    slugify(restaurantName),
    slugify(restaurantName).replace(/-/g, ''),
  ].filter(Boolean) as string[];

  for (const slug of slugs) {
    try {
      const res = await fetch(`https://www.snatchd.app/${slug}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible)' },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) continue;
      const text = await res.text();
      const info = parseSnatchdText(text);
      if (info) return info;
    } catch {
      continue;
    }
  }
  return null;
}
