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

// ── Auto-booking helpers ───────────────────────────────────────────

function pickBestSlot(slots, preferredTime) {
  if (slots.length === 0) return null;
  if (!preferredTime) return slots.sort((a, b) => a.time.localeCompare(b.time))[0];
  function toMin(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
  const prefMin = toMin(preferredTime);
  return slots.reduce((best, slot) => {
    return Math.abs(toMin(slot.time) - prefMin) < Math.abs(toMin(best.time) - prefMin) ? slot : best;
  });
}

function resyHeaders(apiKey, authToken) {
  return {
    Authorization: `ResyAPI api_key="${apiKey}"`,
    'x-resy-auth-token': authToken,
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
    'X-Origin': 'https://resy.com',
    Referer: 'https://resy.com/',
  };
}

async function getBookingDetails(authToken, configId, day, partySize) {
  const body = JSON.stringify({ config_id: configId, day, party_size: Number(partySize) });

  const response = await apiPage.evaluate(
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
    { body, apiKey: resyApiKey, authToken }
  );

  if (response.status === 401 || response.status === 403) {
    throw Object.assign(new Error('RESY_AUTH_EXPIRED'), { authExpired: true });
  }
  if (response.status >= 400) throw new Error(`details_http_${response.status}: ${response.body.slice(0, 200)}`);

  const data = JSON.parse(response.body);
  const bookToken = data?.book_token?.value;
  if (!bookToken) throw new Error('no_book_token');
  const paymentMethodId = data?.user?.payment_methods?.[0]?.id ?? null;
  return { bookToken, paymentMethodId };
}

async function bookSlot(authToken, bookToken, paymentMethodId) {
  const params = new URLSearchParams({ book_token: bookToken });
  if (paymentMethodId != null) {
    params.set('struct_payment_method', JSON.stringify({ id: paymentMethodId }));
  }

  const response = await apiPage.evaluate(
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

  if (response.status === 401 || response.status === 403) {
    return { success: false, error: 'auth_expired', authExpired: true };
  }
  if (response.status >= 400) {
    return { success: false, error: `http_${response.status}: ${response.body.slice(0, 200)}` };
  }

  const data = JSON.parse(response.body);
  return { success: true, confirmationId: data?.resy_token ?? 'confirmed' };
}

async function handleAuthExpired(userId, platform) {
  const { data: current } = await db
    .from('user_settings')
    .select('token_expired, ntfy_topic')
    .eq('user_id', userId)
    .single();
  const expired = { ...(current?.token_expired ?? {}), [platform]: true };
  await db.from('user_settings').update({ token_expired: expired }).eq('user_id', userId);
  await db.from('restaurants')
    .update({ auto_book: false })
    .eq('user_id', userId)
    .eq('platform', platform);
  if (current?.ntfy_topic) {
    await fetch(`https://ntfy.sh/${encodeURIComponent(current.ntfy_topic)}`, {
      method: 'POST',
      headers: { Title: `${platform} token expired`, Priority: 'high', Tags: 'warning' },
      body: `Auto-booking paused. Update your ${platform} token in account settings.`,
    });
  }
  await db.from('activity_log').insert({
    user_id: userId, type: 'system',
    message: `<strong>${platform}</strong> token expired — auto-booking disabled.`,
  });
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log(`[resy-check] starting at ${new Date().toISOString()}`);

  let { data: restaurants, error: restErr } = await db
    .from('restaurants')
    .select('id, user_id, name, venue_id, venue_city, party_size, party_sizes, earliest_time, latest_time, day_range, date_start, date_end, auto_book, preferred_time, available_slots')
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
  const batchArg = process.argv.find(a => a.startsWith('--batch='));

  const userIds = [...new Set(restaurants.map((r) => r.user_id))];
  const { data: allSettings, error: settingsErr } = await db
    .from('user_settings')
    .select('user_id, earliest_time, latest_time, day_range, days_of_week, timezone, monitoring_enabled, ntfy_topic, ntfy_priority')
    .in('user_id', userIds);
  if (settingsErr) {
    console.error('[resy-check] settings load failed:', settingsErr.message);
    process.exit(1);
  }
  const settingsMap = new Map();
  for (const s of allSettings ?? []) settingsMap.set(s.user_id, s);

  // Load auth tokens for users with auto_book restaurants
  const autoBookUserIds = [...new Set(
    restaurants.filter(r => r.auto_book).map(r => r.user_id)
  )];
  const authTokenMap = new Map();
  if (autoBookUserIds.length > 0) {
    const { data: tokens } = await db
      .from('user_settings')
      .select('user_id, resy_auth_token, token_expired')
      .in('user_id', autoBookUserIds);
    for (const t of tokens ?? []) {
      if (t.resy_auth_token && !t.token_expired?.resy) {
        authTokenMap.set(t.user_id, t.resy_auth_token);
      }
    }
    if (authTokenMap.size > 0) {
      console.log(`[resy-check] ${authTokenMap.size} user(s) with auto-book auth tokens`);
    }
  }

  // Group restaurants by venue_id — fetch once per venue, write to all rows
  const venueMap = new Map(); // venue_id → { city, restaurants: [...], maxDayRange, allSizes, allDates }
  for (const restaurant of restaurants) {
    const settings = settingsMap.get(restaurant.user_id);
    if (!settings || !settings.monitoring_enabled) continue;

    const tz = settings.timezone ?? 'America/New_York';
    const sizes = Array.isArray(restaurant.party_sizes) && restaurant.party_sizes.length > 0
      ? restaurant.party_sizes
      : [restaurant.party_size];

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

    const existing = venueMap.get(restaurant.venue_id);
    if (existing) {
      existing.restaurants.push({ restaurant, settings });
      for (const s of sizes) { if (!existing.allSizes.has(s)) existing.allSizes.add(s); }
      for (const d of dates) { if (!existing.allDates.has(d)) existing.allDates.add(d); }
    } else {
      venueMap.set(restaurant.venue_id, {
        city: restaurant.venue_city ?? 'ny',
        name: restaurant.name,
        restaurants: [{ restaurant, settings }],
        allSizes: new Set(sizes),
        allDates: new Set(dates),
      });
    }
  }

  let uniqueVenues = [...venueMap.entries()];

  // Estimate total API calls and determine how many batches are actually needed
  const CALLS_PER_BATCH = 50;
  let totalEstimatedCalls = 0;
  for (const [, venue] of uniqueVenues) {
    totalEstimatedCalls += venue.allDates.size * venue.allSizes.size;
  }
  const neededBatches = Math.max(1, Math.ceil(totalEstimatedCalls / CALLS_PER_BATCH));

  if (batchArg) {
    const [batchNum, batchTotal] = batchArg.split('=')[1].split('/').map(Number);
    // If this batch number exceeds what's needed, exit early
    if (batchNum > neededBatches) {
      console.log(`[resy-check] batch ${batchNum}/${batchTotal}: not needed (${neededBatches} batches sufficient for ${totalEstimatedCalls} calls)`);
      return;
    }
    uniqueVenues.sort((a, b) => a[0].localeCompare(b[0]));
    const perBatch = Math.ceil(uniqueVenues.length / neededBatches);
    const start = (batchNum - 1) * perBatch;
    uniqueVenues = uniqueVenues.slice(start, start + perBatch);
    console.log(`[resy-check] batch ${batchNum}/${batchTotal} (${neededBatches} needed): ${uniqueVenues.length} venue(s), ~${totalEstimatedCalls} total calls`);
  }
  shuffle(uniqueVenues);
  console.log(`[resy-check] ${restaurants.length} restaurant(s) → ${uniqueVenues.length} unique venue(s)`);

  await launchBrowser();
  await warmUpImperva();

  let checked = 0;
  for (const [venueId, venue] of uniqueVenues) {
    const dates = [...venue.allDates].sort();
    const sizes = [...venue.allSizes];

    // Fetch all slots for this venue (union of all users' date/size needs)
    const rawSlots = [];
    let hadError = false;
    let consecutiveFailures = 0;
    let throttled = false;
    for (const date of dates) {
      if (throttled) break;
      for (const size of sizes) {
        try {
          const slots = await findResyAvailability(venueId, date, size, venue.city);
          consecutiveFailures = 0;
          rawSlots.push(...slots);
        } catch (err) {
          hadError = true;
          console.error(`[resy-check] ${venue.name} ${date}/${size}: ${err.message}`);
          if (err.message.includes('ERR_HTTP_RESPONSE_CODE_FAILURE') || err.message.includes('http_5')) {
            consecutiveFailures++;
            if (consecutiveFailures >= 3) {
              console.log(`[resy-check] ${venue.name}: throttled — skipping remaining dates`);
              throttled = true;
              break;
            }
          }
        }
        await sleep(800 + Math.random() * 400);
      }
    }

    // Distribute results to each restaurant row, filtered by that user's time window
    const now = new Date().toISOString();
    for (const { restaurant, settings } of venue.restaurants) {
      const earliest = restaurant.earliest_time || settings.earliest_time;
      const latest = restaurant.latest_time || settings.latest_time;
      const filtered = rawSlots.filter(s => inWindow(s.time, earliest, latest));

      // Detect new slots (not in previous available_slots)
      const prevKeys = new Set(
        (restaurant.available_slots ?? []).map(s => `${s.date}:${s.time}`)
      );
      const newSlots = filtered.filter(s => !prevKeys.has(`${s.date}:${s.time}`));

      // Auto-book if enabled and any matching slots exist
      if (restaurant.auto_book && filtered.length > 0) {
        const authToken = authTokenMap.get(restaurant.user_id);
        if (authToken) {
          const best = pickBestSlot(filtered, restaurant.preferred_time);
          if (best?.bookingToken) {
            try {
              const details = await getBookingDetails(
                authToken, best.bookingToken, best.date,
                restaurant.party_sizes?.[0] ?? restaurant.party_size
              );
              const result = await bookSlot(authToken, details.bookToken, details.paymentMethodId);
              if (result.success) {
                console.log(`[resy-check] AUTO-BOOKED ${restaurant.name} at ${best.displayTime} on ${best.date}`);
                await db.from('restaurants').update({ auto_book: false }).eq('id', restaurant.id);
                await db.from('activity_log').insert({
                  user_id: restaurant.user_id, restaurant_id: restaurant.id, type: 'system',
                  message: `Auto-booked <strong>${restaurant.name}</strong> at ${best.displayTime} on ${best.date}`,
                });
                const ntfyTopic = settingsMap.get(restaurant.user_id)?.ntfy_topic;
                if (ntfyTopic) {
                  await fetch(`https://ntfy.sh/${encodeURIComponent(ntfyTopic)}`, {
                    method: 'POST',
                    headers: { Title: `Booked! ${restaurant.name}`, Priority: 'high', Tags: 'white_check_mark' },
                    body: `${best.displayTime} on ${best.date} for ${restaurant.party_sizes?.[0] ?? restaurant.party_size} guests`,
                  });
                }
              } else if (result.authExpired) {
                console.error(`[resy-check] auth expired for user ${restaurant.user_id}`);
                await handleAuthExpired(restaurant.user_id, 'resy');
              } else {
                console.error(`[resy-check] booking failed for ${restaurant.name}: ${result.error}`);
                await db.from('activity_log').insert({
                  user_id: restaurant.user_id, restaurant_id: restaurant.id, type: 'system',
                  message: `Auto-book failed for <strong>${restaurant.name}</strong>: ${result.error}. Will retry next check.`,
                });
                const ntfyTopic = settingsMap.get(restaurant.user_id)?.ntfy_topic;
                if (ntfyTopic) {
                  await fetch(`https://ntfy.sh/${encodeURIComponent(ntfyTopic)}`, {
                    method: 'POST',
                    headers: { Title: `Auto-book failed: ${restaurant.name}`, Priority: 'default', Tags: 'warning' },
                    body: `${result.error}. Will retry next check.`,
                  });
                }
              }
            } catch (err) {
              if (err.authExpired) {
                await handleAuthExpired(restaurant.user_id, 'resy');
              } else {
                console.error(`[resy-check] booking error for ${restaurant.name}: ${err.message}`);
                await db.from('activity_log').insert({
                  user_id: restaurant.user_id, restaurant_id: restaurant.id, type: 'system',
                  message: `Auto-book error for <strong>${restaurant.name}</strong>: ${err.message}. Will retry next check.`,
                });
              }
            }
          }
        }
      }

      // Don't overwrite with empty if we got throttled — preserve previous data
      if (throttled && filtered.length === 0) {
        await db.from('restaurants').update({ last_checked: now }).eq('id', restaurant.id);
      } else {
        await db.from('restaurants')
          .update({ available_slots: filtered, last_checked: now, slots_updated_at: now })
          .eq('id', restaurant.id);
      }

      // Write to activity_log so platform health reflects GH Actions status
      const checkMsg = hadError
        ? `Checked <strong>${restaurant.name}</strong> — ${filtered.length} slot(s) available, ${newSlots.length} new (prev: ${(restaurant.available_slots ?? []).length}) [err: ${throttled ? 'throttled' : 'partial'}]`
        : `Checked <strong>${restaurant.name}</strong> — ${filtered.length} slot(s) available, ${newSlots.length} new (prev: ${(restaurant.available_slots ?? []).length})`;
      const { error: logErr } = await db.from('activity_log').insert({
        user_id: restaurant.user_id,
        restaurant_id: restaurant.id,
        type: 'check',
        message: checkMsg,
      });
      if (logErr) console.error(`[resy-check] activity_log insert failed: ${logErr.message}`);

      // Send ntfy for new slots (even without auto-book)
      if (newSlots.length > 0 && !restaurant.auto_book) {
        const ntfyTopic = settingsMap.get(restaurant.user_id)?.ntfy_topic;
        if (ntfyTopic) {
          const timeList = [...new Set(newSlots.map(s => s.displayTime))].join(', ');
          const dateList = [...new Set(newSlots.map(s => s.date))].join(', ');
          await fetch(`https://ntfy.sh/${encodeURIComponent(ntfyTopic)}`, {
            method: 'POST',
            headers: { Title: `${restaurant.name}`, Priority: settingsMap.get(restaurant.user_id)?.ntfy_priority ?? 'default', Tags: 'fork_and_knife' },
            body: `${timeList} on ${dateList}`,
          });
        }
      }
    }
    console.log(`[resy-check] ${venue.name} — ${rawSlots.length} slot(s)${hadError ? ' (with errors)' : ''} → ${venue.restaurants.length} row(s)`);
    checked++;
  }

  await closeBrowser();
  console.log(`[resy-check] done — checked ${checked} venue(s)`);
}

main().catch((err) => {
  console.error('[resy-check] fatal:', err);
  closeBrowser().catch(() => {});
  process.exit(1);
});
