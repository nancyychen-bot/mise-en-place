import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createClient } from '@supabase/supabase-js';
import { launchBrowser, closeBrowser, scrapeOpenTableMultiDate } from './scrape.js';

// ── Load .env manually ──────────────────────────────────────────────
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
  // No .env file — env vars come from GitHub Actions secrets or system env
}

// ── Supabase client ─────────────────────────────────────────────────
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error('[check] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  process.exit(1);
}
const db = createClient(supabaseUrl, supabaseKey);

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Generate YYYY-MM-DD strings for the next `days` days from today in the
 * given timezone.
 */
function getDateRange(days, timezone = 'America/New_York') {
  const result = [];
  const now = new Date();
  const todayStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const today = new Date(`${todayStr}T00:00:00`);

  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    result.push(d.toISOString().slice(0, 10));
  }
  return result;
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

function parseOtCsrfToken(cookieValue) {
  const params = new URLSearchParams(cookieValue);
  return params.get('atk') ?? cookieValue;
}

async function bookOpenTableSlot(page, restaurant, slot, authCookie, userInfo) {
  const rid = restaurant.venue_id;
  const partySize = restaurant.party_sizes?.[0] ?? restaurant.party_size;
  const dateTime = `${slot.date}T${slot.time}`;
  const csrfToken = parseOtCsrfToken(authCookie);

  // If scraper didn't capture tokens, load the availability page at the slot's
  // exact time and intercept the tokens from the page's own API calls
  if (!slot.slotHash || !slot.slotAvailabilityToken) {
    console.log(`[check] no tokens from scraper for ${slot.time}, loading page at slot time...`);
    const timeParam = encodeURIComponent(`${slot.time}:00`);
    const tokenUrl = `https://www.opentable.com/booking/restref/availability?rid=${rid}&restRef=${rid}&partySize=${partySize}&date=${slot.date}&time=${timeParam}&lang=en-US`;

    const captured = {};
    const handler = async (response) => {
      const rUrl = response.url();
      if (!rUrl.includes('availability') && !rUrl.includes('gql')) return;
      try {
        const ct = response.headers()['content-type'] ?? '';
        if (!ct.includes('json')) return;
        const json = await response.json();
        // Determine base time from request URL
        let baseMin = 19 * 60;
        try {
          const reqUrl = response.request().url();
          const tm = reqUrl.match(/time=(\d{2})%3A(\d{2})/);
          if (tm) baseMin = parseInt(tm[1]) * 60 + parseInt(tm[2]);
        } catch {}
        const avail = json?.data?.availability;
        if (!Array.isArray(avail)) return;
        for (const r of avail) {
          for (const day of r?.availabilityDays ?? []) {
            for (const s of day?.slots ?? []) {
              if (!s.isAvailable || !s.slotHash) continue;
              const totalMin = baseMin + (s.timeOffsetMinutes ?? 0);
              const h = Math.floor(totalMin / 60);
              const m = totalMin % 60;
              const t = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
              if (t === slot.time) {
                captured.slotHash = s.slotHash;
                captured.slotAvailabilityToken = s.slotAvailabilityToken;
              }
            }
          }
        }
      } catch {}
    };

    page.on('response', handler);
    await page.goto(tokenUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
    await page.waitForTimeout(2000);
    page.removeListener('response', handler);

    if (captured.slotHash) {
      slot.slotHash = captured.slotHash;
      slot.slotAvailabilityToken = captured.slotAvailabilityToken;
    }
    console.log(`[check] after page load: hash=${slot.slotHash ? 'YES' : 'NONE'}, token=${slot.slotAvailabilityToken ? 'YES' : 'NONE'}`);
  }

  if (!slot.slotHash || !slot.slotAvailabilityToken) {
    return { success: false, error: 'no_slot_tokens' };
  }

  const bookRes = await page.evaluate(
    async ({ url, body, csrfToken }) => {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify(body),
      });
      return { status: res.status, body: await res.text() };
    },
    {
      url: 'https://www.opentable.com/dapi/booking/make-reservation',
      body: {
        restaurantId: Number(rid),
        slotAvailabilityToken: slot.slotAvailabilityToken,
        slotHash: slot.slotHash,
        isModify: false,
        reservationDateTime: dateTime,
        partySize,
        firstName: userInfo.firstName || 'Guest',
        lastName: userInfo.lastName || '',
        email: userInfo.email || '',
        phoneNumber: userInfo.phone || '',
        phoneNumberCountryId: 'US',
        country: 'US',
        reservationType: 'Standard',
        reservationAttribute: 'default',
        diningAreaId: 1,
        pointsType: 'Standard',
        points: 100,
        optInEmailRestaurant: false,
      },
      csrfToken,
    }
  );

  if (bookRes.status === 401 || bookRes.status === 403) {
    return { success: false, error: 'auth_expired', authExpired: true };
  }

  let bookData;
  try { bookData = JSON.parse(bookRes.body); } catch {}

  if (bookRes.status >= 400) {
    return { success: false, error: `book_http_${bookRes.status}: ${bookRes.body.slice(0, 300)}` };
  }

  const confirmationNumber = bookData?.confirmationNumber ?? bookData?.reservation?.confirmationNumber ?? 'confirmed';
  return { success: true, confirmationId: String(confirmationNumber) };
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log(`[check] starting at ${new Date().toISOString()}`);

  // 1. Load ALL active OpenTable restaurants across all users
  const { data: restaurants, error: restErr } = await db
    .from('restaurants')
    .select('id, user_id, name, venue_id, party_size, party_sizes, earliest_time, latest_time, day_range, date_start, date_end, auto_book, preferred_time, available_slots')
    .eq('platform', 'opentable')
    .eq('active', true);

  if (restErr) {
    console.error('[check] failed to load restaurants:', restErr.message);
    process.exit(1);
  }
  if (!restaurants || restaurants.length === 0) {
    console.log('[check] no active OpenTable restaurants found');
    process.exit(0);
  }

  console.log(`[check] found ${restaurants.length} active OpenTable restaurant(s)`);

  // 2. Collect unique user IDs and load their settings
  const userIds = [...new Set(restaurants.map((r) => r.user_id))];
  const { data: allSettings, error: settingsErr } = await db
    .from('user_settings')
    .select('user_id, earliest_time, latest_time, day_range, days_of_week, timezone, monitoring_enabled, ntfy_topic, ntfy_priority')
    .in('user_id', userIds);

  if (settingsErr) {
    console.error('[check] failed to load user settings:', settingsErr.message);
    process.exit(1);
  }

  const settingsMap = new Map();
  for (const s of allSettings ?? []) {
    settingsMap.set(s.user_id, s);
  }

  // 3. Launch browser
  try {
    await launchBrowser();
    console.log('[check] browser launched');
  } catch (err) {
    console.error('[check] failed to launch browser:', err.message);
    process.exit(1);
  }

  // 4. Scrape each unique venue_id + size combo once, then distribute results
  // Cache key: "venueId:size" → Map<date, slots>
  const scrapeCache = new Map();

  let checked = 0;
  for (const restaurant of restaurants) {
    const settings = settingsMap.get(restaurant.user_id);
    if (!settings) {
      console.log(`[check] skipping ${restaurant.name} — no user settings`);
      continue;
    }
    if (!settings.monitoring_enabled) {
      console.log(`[check] skipping ${restaurant.name} — monitoring disabled`);
      continue;
    }

    const tz = settings.timezone ?? 'America/New_York';
    const effectiveEarliest = restaurant.earliest_time || settings.earliest_time;
    const effectiveLatest = restaurant.latest_time || settings.latest_time;
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
      const dayRange = Math.min(restaurant.day_range ?? settings.day_range ?? 14, 3);
      dates = getDateRange(dayRange, tz);
    }

    const allSlots = [];

    for (const size of sizes) {
      const cacheKey = `${restaurant.venue_id}:${size}:${dates.join(',')}`;

      if (!scrapeCache.has(cacheKey)) {
        try {
          const result = await scrapeOpenTableMultiDate(restaurant.venue_id, dates, size);
          scrapeCache.set(cacheKey, result);
          console.log(`[check] scraped ${restaurant.name} (size ${size}) — cached`);
        } catch (err) {
          console.error(`[check] error scraping ${restaurant.name} size=${size}:`, err.message);
          scrapeCache.set(cacheKey, new Map());
        }
      } else {
        console.log(`[check] ${restaurant.name} (size ${size}) — using cached results`);
      }

      const slotsByDate = scrapeCache.get(cacheKey);
      for (const [date, slots] of slotsByDate) {
        for (const slot of slots) {
          if (effectiveEarliest && slot.time < effectiveEarliest) continue;
          if (effectiveLatest && slot.time > effectiveLatest) continue;
          allSlots.push({
            date, time: slot.time, displayTime: slot.displayTime,
            slotHash: slot.slotHash, slotAvailabilityToken: slot.slotAvailabilityToken,
          });
        }
      }
    }

    // Detect new slots
    const prevKeys = new Set(
      (restaurant.available_slots ?? []).map(s => `${s.date}:${s.time}`)
    );
    const newSlots = allSlots.filter(s => !prevKeys.has(`${s.date}:${s.time}`));

    // Auto-book if enabled and any matching slots exist
    if (restaurant.auto_book && allSlots.length > 0) {
      const { data: userSettings } = await db
        .from('user_settings')
        .select('opentable_session, token_expired, ntfy_topic')
        .eq('user_id', restaurant.user_id)
        .single();

      if (userSettings?.opentable_session && !userSettings.token_expired?.opentable) {
        // Prefer slots with booking tokens; fall back to best without
        const slotsWithTokens = allSlots.filter(s => s.slotHash && s.slotAvailabilityToken);
        const best = pickBestSlot(slotsWithTokens.length > 0 ? slotsWithTokens : allSlots, restaurant.preferred_time);
        if (best) {
          console.log(`[check] best slot for ${restaurant.name}: ${best.time} on ${best.date}, hash=${best.slotHash ? 'YES' : 'NONE'}, token=${best.slotAvailabilityToken ? 'YES' : 'NONE'} (${slotsWithTokens.length} slots with tokens)`);
          try {
            // Load user profile for reservation details
            const { data: userProfile } = await db
              .from('users')
              .select('email, display_name')
              .eq('id', restaurant.user_id)
              .single();
            const nameParts = (userProfile?.display_name ?? '').split(' ');
            const userInfo = {
              firstName: nameParts[0] || 'Guest',
              lastName: nameParts.slice(1).join(' ') || '',
              email: userProfile?.email || '',
              phone: '',
            };

            const ctx = await launchBrowser();
            await ctx.addCookies([{
              name: 'authCke',
              value: userSettings.opentable_session,
              domain: '.opentable.com',
              path: '/',
            }]);
            const bookingPage = await ctx.newPage();
            await bookingPage.goto('https://www.opentable.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
            await bookingPage.waitForTimeout(2000);
            const result = await bookOpenTableSlot(bookingPage, restaurant, best, userSettings.opentable_session, userInfo);
            await bookingPage.close().catch(() => {});
            if (result.success) {
              console.log(`[check] AUTO-BOOKED ${restaurant.name} at ${best.displayTime} on ${best.date} (${result.confirmationId})`);
              await db.from('restaurants').update({ auto_book: false }).eq('id', restaurant.id);
              await db.from('activity_log').insert({
                user_id: restaurant.user_id, restaurant_id: restaurant.id, type: 'system',
                message: `Auto-booked <strong>${restaurant.name}</strong> at ${best.displayTime} on ${best.date}`,
              });
              if (userSettings.ntfy_topic) {
                await fetch(`https://ntfy.sh/${encodeURIComponent(userSettings.ntfy_topic)}`, {
                  method: 'POST',
                  headers: { Title: `Booked! ${restaurant.name}`, Priority: 'high', Tags: 'white_check_mark' },
                  body: `${best.displayTime} on ${best.date}`,
                });
              }
            } else if (result.authExpired) {
              console.error(`[check] auth expired for user ${restaurant.user_id}`);
              await handleAuthExpired(restaurant.user_id, 'opentable');
            } else {
              console.error(`[check] booking failed for ${restaurant.name}: ${result.error}`);
              await db.from('activity_log').insert({
                user_id: restaurant.user_id, restaurant_id: restaurant.id, type: 'system',
                message: `Auto-book failed for <strong>${restaurant.name}</strong>: ${result.error}. Will retry next check.`,
              });
            }
          } catch (err) {
            console.error(`[check] OpenTable booking error: ${err.message}`);
            await db.from('activity_log').insert({
              user_id: restaurant.user_id, restaurant_id: restaurant.id, type: 'system',
              message: `Auto-book error for <strong>${restaurant.name}</strong>: ${err.message}. Will retry next check.`,
            });
          }
        }
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
      console.error(`[check] failed to update ${restaurant.name}:`, updateErr.message);
    } else {
      console.log(`[check] ${restaurant.name} — ${allSlots.length} slot(s) in window, ${newSlots.length} new`);
    }
    checked++;
  }

  await closeBrowser();
  console.log(`[check] done — checked ${checked} restaurant(s)`);
}

main().catch((err) => {
  console.error('[check] fatal error:', err);
  closeBrowser().catch(() => {});
  process.exit(1);
});
