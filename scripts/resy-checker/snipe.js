import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { platform } from 'process';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '.env');
try {
  const envText = readFileSync(envPath, 'utf-8');
  for (const line of envText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
} catch {}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const resyApiKey = process.env.RESY_API_KEY;
if (!supabaseUrl || !supabaseKey || !resyApiKey) {
  console.error('[resy-snipe] SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESY_API_KEY required');
  process.exit(1);
}
const db = createClient(supabaseUrl, supabaseKey);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Args ────────────────────────────────────────────────────────────
// Usage: node snipe.js --venue=12345 --date=2026-06-16 --time=19:00 --party=2 --city=ny

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace('--', '').split('=');
    return [k, v];
  })
);

const VENUE_ID = args.venue;
const TARGET_DATE = args.date;
const TARGET_TIME = args.time;
const PARTY_SIZE = parseInt(args.party || '2', 10);
const CITY = args.city || 'ny';
const POLL_INTERVAL = parseInt(args.interval || '10', 10) * 1000;
const MAX_DURATION = parseInt(args.duration || '10', 10) * 60 * 1000;

if (!VENUE_ID || !TARGET_DATE || !TARGET_TIME) {
  console.error('[resy-snipe] Required: --venue=<id> --date=YYYY-MM-DD --time=HH:MM');
  console.error('[resy-snipe] Optional: --party=N --city=ny --interval=10 --duration=10');
  process.exit(1);
}

function fmt12h(t) {
  const [h, m] = t.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

const DISPLAY_TIME = fmt12h(TARGET_TIME);

const CITY_GEO = {
  ny:  { lat: 40.7128,  long: -74.0060 },
  chi: { lat: 41.8781,  long: -87.6298 },
  la:  { lat: 34.0522,  long: -118.2437 },
  sf:  { lat: 37.7749,  long: -122.4194 },
};

// ── Browser ─────────────────────────────────────────────────────────

let context = null;
let apiPage = null;

async function launchAndWarm() {
  const userDataDir = mkdtempSync(join(tmpdir(), 'resy-snipe-'));
  const isMac = platform === 'darwin';

  context = await chromium.launchPersistentContext(userDataDir, {
    ...(isMac ? { channel: 'chrome', headless: false } : { headless: true }),
    args: [
      '--disable-blink-features=AutomationControlled',
      ...(isMac ? [] : ['--disable-gpu', '--no-sandbox']),
    ],
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
    ignoreDefaultArgs: ['--enable-automation'],
  });

  const page = await context.newPage();
  await page.goto('https://resy.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
  await sleep(2000);

  await page.mouse.move(400 + Math.random() * 200, 300 + Math.random() * 100);
  await sleep(300);
  await page.evaluate(() => window.scrollBy(0, 150 + Math.random() * 200));
  await sleep(500);

  await page.setExtraHTTPHeaders({
    Authorization: `ResyAPI api_key="${resyApiKey}"`,
  });

  apiPage = page;
  console.log('[resy-snipe] browser warmed up');
}

// ── Availability + Booking ──────────────────────────────────────────

function pickBestSlot(slots, preferredTime) {
  if (slots.length === 0) return null;
  if (!preferredTime) return slots.sort((a, b) => a.time.localeCompare(b.time))[0];
  function toMin(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
  const prefMin = toMin(preferredTime);
  return slots.reduce((best, slot) => {
    return Math.abs(toMin(slot.time) - prefMin) < Math.abs(toMin(best.time) - prefMin) ? slot : best;
  });
}

async function findSlots() {
  const geo = CITY_GEO[CITY] ?? CITY_GEO.ny;
  const url = `https://api.resy.com/4/find?lat=${geo.lat}&long=${geo.long}&day=${TARGET_DATE}&party_size=${PARTY_SIZE}&venue_id=${VENUE_ID}`;

  const response = await apiPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
  if (!response || response.status() >= 400) return [];

  const text = await apiPage.evaluate(() => document.body.innerText);
  let data;
  try { data = JSON.parse(text); } catch { return []; }

  const venues = data?.results?.venues;
  if (!Array.isArray(venues) || venues.length === 0) return [];

  return (venues[0]?.slots ?? []).map((s) => {
    const startIso = s?.date?.start ?? '';
    const timePart = startIso.split(' ')[1] ?? startIso.split('T')[1] ?? '';
    const [hStr, mStr] = timePart.split(':');
    const h = parseInt(hStr, 10);
    const m = mStr ?? '00';
    const suffix = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return {
      date: TARGET_DATE,
      time: `${String(h).padStart(2, '0')}:${m}`,
      displayTime: `${h12}:${m} ${suffix}`,
      bookingToken: s?.config?.token ?? undefined,
    };
  });
}

async function bookBestSlot(slots, authToken) {
  const best = pickBestSlot(slots, TARGET_TIME);
  if (!best?.bookingToken) return { booked: false, error: 'no_booking_token' };

  // Get details
  const detailsRes = await apiPage.evaluate(
    async ({ body, apiKey, authToken }) => {
      const res = await fetch('https://api.resy.com/3/details', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `ResyAPI api_key="${apiKey}"`,
          'x-resy-auth-token': authToken,
        },
        body,
      });
      return { status: res.status, body: await res.text() };
    },
    { body: JSON.stringify({ config_id: best.bookingToken, day: TARGET_DATE, party_size: PARTY_SIZE }), apiKey: resyApiKey, authToken }
  );

  if (detailsRes.status === 401 || detailsRes.status === 403) return { booked: false, authExpired: true };
  if (detailsRes.status >= 400) return { booked: false, error: `details_${detailsRes.status}` };

  const details = JSON.parse(detailsRes.body);
  const bookToken = details?.book_token?.value;
  if (!bookToken) return { booked: false, error: 'no_book_token' };
  const paymentMethodId = details?.user?.payment_methods?.[0]?.id ?? null;

  // Book
  const params = new URLSearchParams({ book_token: bookToken });
  if (paymentMethodId != null) params.set('struct_payment_method', JSON.stringify({ id: paymentMethodId }));

  const bookRes = await apiPage.evaluate(
    async ({ body, apiKey, authToken }) => {
      const res = await fetch('https://api.resy.com/3/book', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `ResyAPI api_key="${apiKey}"`,
          'x-resy-auth-token': authToken,
        },
        body,
      });
      return { status: res.status, body: await res.text() };
    },
    { body: params.toString(), apiKey: resyApiKey, authToken }
  );

  if (bookRes.status === 401 || bookRes.status === 403) return { booked: false, authExpired: true };
  if (bookRes.status >= 400) return { booked: false, error: `book_${bookRes.status}: ${bookRes.body.slice(0, 200)}` };

  return { booked: true, slot: best };
}

// ── Main loop ───────────────────────────────────────────────────────

async function main() {
  console.log(`[resy-snipe] Target: venue ${VENUE_ID}, ${TARGET_DATE} at ${DISPLAY_TIME}, party ${PARTY_SIZE}`);
  console.log(`[resy-snipe] Polling every ${POLL_INTERVAL / 1000}s for up to ${MAX_DURATION / 60000} min`);

  // Load auth token
  const { data: restaurants } = await db
    .from('restaurants')
    .select('user_id, name, venue_slug, venue_city')
    .eq('venue_id', VENUE_ID)
    .eq('platform', 'resy')
    .limit(1);

  const restaurant = restaurants?.[0];
  if (!restaurant) {
    console.error(`[resy-snipe] No restaurant with venue_id=${VENUE_ID}`);
    process.exit(1);
  }

  const { data: settings } = await db
    .from('user_settings')
    .select('resy_auth_token, token_expired, ntfy_topic')
    .eq('user_id', restaurant.user_id)
    .single();

  if (!settings?.resy_auth_token || settings.token_expired?.resy) {
    console.error('[resy-snipe] No valid Resy auth token');
    process.exit(1);
  }

  await launchAndWarm();

  const startTime = Date.now();
  let attempt = 0;

  while (Date.now() - startTime < MAX_DURATION) {
    attempt++;
    try {
      console.log(`[resy-snipe] attempt ${attempt} at ${new Date().toISOString()}`);
      const slots = await findSlots();
      const inWindow = slots.filter((s) => {
        const diff = Math.abs(
          (parseInt(s.time.split(':')[0]) * 60 + parseInt(s.time.split(':')[1])) -
          (parseInt(TARGET_TIME.split(':')[0]) * 60 + parseInt(TARGET_TIME.split(':')[1]))
        );
        return diff <= 60;
      });

      if (inWindow.length > 0) {
        console.log(`[resy-snipe] found ${inWindow.length} slot(s): ${inWindow.map(s => s.displayTime).join(', ')}`);
        const result = await bookBestSlot(inWindow, settings.resy_auth_token);

        if (result.booked) {
          console.log(`[resy-snipe] BOOKED! ${result.slot.displayTime} on ${TARGET_DATE}`);

          if (settings.ntfy_topic) {
            const slug = restaurant.venue_slug ?? VENUE_ID;
            const city = restaurant.venue_city ?? 'ny';
            const bookingUrl = `https://resy.com/cities/${city}/venues/${slug}?date=${TARGET_DATE}&seats=${PARTY_SIZE}`;
            await fetch(`https://ntfy.sh/${encodeURIComponent(settings.ntfy_topic)}`, {
              method: 'POST',
              headers: { Title: `Sniped! ${restaurant.name}`, Priority: 'max', Tags: 'tada', Click: bookingUrl },
              body: `${result.slot.displayTime} on ${TARGET_DATE} for ${PARTY_SIZE} guests`,
            });
          }

          await db.from('activity_log').insert({
            user_id: restaurant.user_id, type: 'system',
            message: `Sniped <strong>${restaurant.name}</strong> at ${result.slot.displayTime} on ${TARGET_DATE}`,
          });
          await db.from('restaurants')
            .update({ auto_book: false })
            .eq('venue_id', VENUE_ID)
            .eq('platform', 'resy');

          break;
        }

        if (result.authExpired) {
          console.error('[resy-snipe] auth token expired');
          break;
        }

        console.log(`[resy-snipe] booking failed: ${result.error}`);
      } else {
        console.log(`[resy-snipe] no slots yet`);
      }
    } catch (err) {
      console.error(`[resy-snipe] error: ${err.message}`);
    }

    await sleep(POLL_INTERVAL);
  }

  await context?.close().catch(() => {});
  console.log(`[resy-snipe] done — ${attempt} attempts over ${Math.round((Date.now() - startTime) / 1000)}s`);
}

main().catch((err) => {
  console.error('[resy-snipe] fatal:', err);
  context?.close().catch(() => {});
  process.exit(1);
});
