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
} catch {
  // env comes from GitHub Actions secrets
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const resyApiKey = process.env.RESY_API_KEY;
if (!supabaseUrl || !supabaseKey || !resyApiKey) {
  console.error('[resy-check] SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESY_API_KEY required');
  process.exit(1);
}
const db = createClient(supabaseUrl, supabaseKey);

const CITY_GEO = {
  ny:  { lat: 40.7128,  long: -74.0060 },
  chi: { lat: 41.8781,  long: -87.6298 },
  la:  { lat: 34.0522,  long: -118.2437 },
  sf:  { lat: 37.7749,  long: -122.4194 },
  bos: { lat: 42.3601,  long: -71.0589 },
  dc:  { lat: 38.9072,  long: -77.0369 },
  mia: { lat: 25.7617,  long: -80.1918 },
  atx: { lat: 30.2672,  long: -97.7431 },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Browser management ─────────────────────────────────────────────

let context = null;

async function launchBrowser() {
  if (!context || !context.browser()?.isConnected()) {
    const userDataDir = mkdtempSync(join(tmpdir(), 'resy-chrome-'));
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
  }
  return context;
}

async function closeBrowser() {
  if (context) {
    await context.close().catch(() => {});
    context = null;
  }
}

// ── Resy API via browser navigation ─────────────────────────────────

let apiPage = null;

async function warmUpImperva() {
  const page = await context.newPage();
  await page.goto('https://resy.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
  await sleep(2000);
  console.log('[resy-check] browser warmed up on resy.com');

  await page.setExtraHTTPHeaders({
    Authorization: `ResyAPI api_key="${resyApiKey}"`,
  });

  apiPage = page;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function isoToTime(iso) {
  const parts = iso.split(' ');
  const timePart = parts[1] ?? iso.split('T')[1] ?? '';
  const [hStr, mStr] = timePart.split(':');
  const h = parseInt(hStr, 10);
  const m = mStr ?? '00';
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return {
    time: `${String(h).padStart(2, '0')}:${m}`,
    displayTime: `${h12}:${m} ${suffix}`,
  };
}

async function findResyAvailability(venueId, day, partySize, city) {
  const geo = CITY_GEO[city] ?? CITY_GEO.ny;
  const url = `https://api.resy.com/4/find?lat=${geo.lat}&long=${geo.long}&day=${day}&party_size=${partySize}&venue_id=${venueId}`;

  const response = await apiPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
  if (!response || response.status() >= 400) {
    throw new Error(`http_${response ? response.status() : 'no_response'}`);
  }

  const text = await apiPage.evaluate(() => document.body.innerText);
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`not_json: ${text.slice(0, 100)}`);
  }

  const venues = data?.results?.venues;
  if (!Array.isArray(venues) || venues.length === 0) return [];

  const rawSlots = venues[0]?.slots ?? [];
  return rawSlots.map((s) => {
    const startIso = s?.date?.start ?? '';
    const { time, displayTime } = isoToTime(startIso);
    return {
      date: day,
      time,
      displayTime,
      type: s?.config?.type ?? undefined,
      bookingToken: s?.config?.token ?? undefined,
    };
  });
}

// ── Helpers ─────────────────────────────────────────────────────────

function getDateRange(days, timezone = 'America/New_York') {
  const result = [];
  const now = new Date();
  const todayStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  const today = new Date(`${todayStr}T00:00:00`);
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    result.push(d.toISOString().slice(0, 10));
  }
  return result;
}

function inWindow(time, earliest, latest) {
  if (earliest && time < earliest) return false;
  if (latest && time > latest) return false;
  return true;
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log(`[resy-check] starting at ${new Date().toISOString()}`);

  const { data: restaurants, error: restErr } = await db
    .from('restaurants')
    .select('id, user_id, name, venue_id, venue_city, party_size, party_sizes, earliest_time, latest_time, day_range, date_start, date_end')
    .eq('platform', 'resy')
    .eq('active', true);

  if (restErr) {
    console.error('[resy-check] load failed:', restErr.message);
    process.exit(1);
  }
  if (!restaurants?.length) {
    console.log('[resy-check] no active Resy restaurants');
    return;
  }
  // Parse --batch flag: "1/3" means batch 1 of 3
  const batchArg = process.argv.find(a => a.startsWith('--batch='));
  if (batchArg) {
    const [batchNum, batchTotal] = batchArg.split('=')[1].split('/').map(Number);
    // Stable sort by ID before slicing so batches don't overlap
    restaurants.sort((a, b) => a.id.localeCompare(b.id));
    const perBatch = Math.ceil(restaurants.length / batchTotal);
    const start = (batchNum - 1) * perBatch;
    restaurants = restaurants.slice(start, start + perBatch);
    console.log(`[resy-check] batch ${batchNum}/${batchTotal}: ${restaurants.length} restaurant(s)`);
  }

  shuffle(restaurants);
  console.log(`[resy-check] ${restaurants.length} restaurant(s) (shuffled)`);

  const userIds = [...new Set(restaurants.map((r) => r.user_id))];
  const { data: allSettings, error: settingsErr } = await db
    .from('user_settings')
    .select('user_id, earliest_time, latest_time, day_range, days_of_week, timezone, monitoring_enabled')
    .in('user_id', userIds);
  if (settingsErr) {
    console.error('[resy-check] settings load failed:', settingsErr.message);
    process.exit(1);
  }
  const settingsMap = new Map();
  for (const s of allSettings ?? []) settingsMap.set(s.user_id, s);

  await launchBrowser();
  await warmUpImperva();

  let checked = 0;
  for (const restaurant of restaurants) {
    const settings = settingsMap.get(restaurant.user_id);
    if (!settings || !settings.monitoring_enabled) continue;

    const tz = settings.timezone ?? 'America/New_York';
    const earliest = restaurant.earliest_time || settings.earliest_time;
    const latest = restaurant.latest_time || settings.latest_time;
    const sizes = Array.isArray(restaurant.party_sizes) && restaurant.party_sizes.length > 0
      ? restaurant.party_sizes
      : [restaurant.party_size];
    const city = restaurant.venue_city ?? 'ny';

    let dates;
    if (restaurant.date_start && restaurant.date_end) {
      dates = [];
      const start = new Date(`${restaurant.date_start}T00:00:00`);
      const end = new Date(`${restaurant.date_end}T00:00:00`);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        dates.push(d.toISOString().slice(0, 10));
      }
    } else {
      const dayRange = restaurant.day_range ?? settings.day_range ?? 14;
      dates = getDateRange(dayRange, tz);
    }

    const allSlots = [];
    let hadError = false;
    let consecutiveFailures = 0;
    let throttled = false;
    for (const date of dates) {
      if (throttled) break;
      for (const size of sizes) {
        try {
          const slots = await findResyAvailability(restaurant.venue_id, date, size, city);
          consecutiveFailures = 0;
          for (const slot of slots) {
            if (!inWindow(slot.time, earliest, latest)) continue;
            allSlots.push(slot);
          }
        } catch (err) {
          hadError = true;
          console.error(`[resy-check] ${restaurant.name} ${date}/${size}: ${err.message}`);
          if (err.message.includes('ERR_HTTP_RESPONSE_CODE_FAILURE') || err.message.includes('http_5')) {
            consecutiveFailures++;
            if (consecutiveFailures >= 3) {
              console.log(`[resy-check] ${restaurant.name}: throttled — skipping remaining dates`);
              throttled = true;
              break;
            }
          }
        }
        await sleep(800 + Math.random() * 400);
      }
    }

    const now = new Date().toISOString();
    const { error: updateErr } = await db
      .from('restaurants')
      .update({
        available_slots: allSlots,
        last_checked: now,
        slots_updated_at: now,
      })
      .eq('id', restaurant.id);

    if (updateErr) {
      console.error(`[resy-check] update failed for ${restaurant.name}: ${updateErr.message}`);
    } else {
      console.log(`[resy-check] ${restaurant.name} — ${allSlots.length} slot(s)${hadError ? ' (with errors)' : ''}`);
    }
    checked++;
  }

  await closeBrowser();
  console.log(`[resy-check] done — checked ${checked}`);
}

main().catch((err) => {
  console.error('[resy-check] fatal:', err);
  closeBrowser().catch(() => {});
  process.exit(1);
});
