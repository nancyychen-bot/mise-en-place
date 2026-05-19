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

function isInQuietHours(settings) {
  if (!settings?.quiet_hours_start || !settings?.quiet_hours_end) return false;
  const tz = settings.timezone ?? 'America/New_York';
  const now = new Date();
  let current;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz,
    }).formatToParts(now);
    const h = parts.find(p => p.type === 'hour')?.value ?? '00';
    const m = parts.find(p => p.type === 'minute')?.value ?? '00';
    current = `${h === '24' ? '00' : h}:${m}`;
  } catch { current = `${String(now.getUTCHours()).padStart(2,'0')}:${String(now.getUTCMinutes()).padStart(2,'0')}`; }
  const { quiet_hours_start: start, quiet_hours_end: end } = settings;
  return start <= end ? (current >= start && current < end) : (current >= start || current < end);
}

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

async function bookOpenTableSlot(page, restaurant, slot) {
  const rid = restaurant.venue_id;
  const partySize = restaurant.party_sizes?.[0] ?? restaurant.party_size;
  const timeParam = encodeURIComponent(`${slot.time}:00`);

  // Step 1: Navigate to the availability page at the slot's time
  const availUrl = `https://www.opentable.com/booking/restref/availability?rid=${rid}&restRef=${rid}&partySize=${partySize}&date=${slot.date}&time=${timeParam}&lang=en-US`;
  console.log(`[check] navigating to booking page`);
  await page.goto(availUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);

  // Step 2: Click "Find a table"
  const findBtn = page.locator('[data-test="dtpPicker-submit"]');
  if (await findBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await findBtn.click();
    await page.waitForTimeout(5000);
  }

  // Step 3: Find and click the matching time slot button
  const slotBtn = page.locator(`button[aria-label*="Reserve table"][aria-label*="${slot.displayTime}"][aria-label*="${slot.date.split('-').slice(1).join('/')}"]`).first();
  let clicked = false;
  if (await slotBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await slotBtn.click();
    clicked = true;
  } else {
    // Fallback: find by text
    const allBtns = await page.locator('button').all();
    for (const btn of allBtns) {
      const label = await btn.getAttribute('aria-label').catch(() => '') ?? '';
      const text = await btn.textContent().catch(() => '') ?? '';
      if ((label.includes(slot.displayTime) || text.includes(slot.displayTime)) && label.includes('Reserve')) {
        await btn.click();
        clicked = true;
        break;
      }
    }
  }

  if (!clicked) {
    return { success: false, error: `no_slot_button_for_${slot.displayTime}` };
  }
  await page.waitForTimeout(2000);

  // Step 4: Select "Standard" seating if prompted
  const standardBtn = page.locator('button:has-text("Standard")');
  if (await standardBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await standardBtn.click();
    await page.waitForTimeout(5000);
  } else {
    await page.waitForTimeout(3000);
  }

  // Step 5: Verify we're on the details page
  const pageUrl = page.url();
  if (!pageUrl.includes('details')) {
    return { success: false, error: `not_on_details_page: ${pageUrl.slice(0, 100)}` };
  }
  console.log(`[check] on booking details page, slot held`);

  // Step 6: Intercept the make-reservation request to capture the result
  let bookingResult = null;
  page.on('response', async (response) => {
    if (response.url().includes('make-reservation')) {
      try {
        bookingResult = { status: response.status(), body: await response.text() };
      } catch {}
    }
  });

  // Step 7: Click "Complete reservation" — the form auto-fills saved card for logged-in users
  const completeBtn = page.locator('button:has-text("Complete reservation")');
  if (!await completeBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    return { success: false, error: 'no_complete_button' };
  }
  console.log(`[check] clicking Complete reservation`);
  await completeBtn.click();
  await page.waitForTimeout(8000);

  // Step 8: Check result
  if (bookingResult) {
    console.log(`[check] make-reservation: status=${bookingResult.status}`);
    if (bookingResult.status >= 200 && bookingResult.status < 300) {
      return { success: true, confirmationId: 'confirmed' };
    }
    return { success: false, error: `book_http_${bookingResult.status}: ${bookingResult.body?.slice(0, 300) ?? ''}` };
  }

  // Fallback: check if page shows confirmation
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 1000));
  if (/confirmed|reservation.*complete|you're all set/i.test(bodyText)) {
    return { success: true, confirmationId: 'confirmed' };
  }

  return { success: false, error: `unknown_state: ${bodyText.slice(0, 200)}` };
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
    .select('user_id, earliest_time, latest_time, day_range, days_of_week, timezone, monitoring_enabled, ntfy_topic, ntfy_priority, quiet_hours_start, quiet_hours_end')
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
        const best = pickBestSlot(allSlots, restaurant.preferred_time);
        if (best) {
          console.log(`[check] best slot for ${restaurant.name}: ${best.displayTime} on ${best.date}`);
          try {
            const ctx = await launchBrowser();
            await ctx.addCookies([{
              name: 'authCke',
              value: userSettings.opentable_session,
              domain: '.opentable.com',
              path: '/',
              secure: true,
            }]);
            const bookingPage = await ctx.newPage();
            const result = await bookOpenTableSlot(bookingPage, restaurant, best);
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

    await db.from('activity_log').insert({
      user_id: restaurant.user_id,
      restaurant_id: restaurant.id,
      type: 'check',
      message: `Checked <strong>${restaurant.name}</strong> — ${allSlots.length} slot(s) available, ${newSlots.length} new (prev: ${(restaurant.available_slots ?? []).length})`,
    });

    if (newSlots.length > 0) {
      const userSettings = settingsMap.get(restaurant.user_id);
      const ntfyTopic = userSettings?.ntfy_topic;
      if (ntfyTopic && !isInQuietHours(userSettings)) {
        const timeList = [...new Set(newSlots.map(s => s.displayTime))].join(', ');
        const dateList = [...new Set(newSlots.map(s => s.date))].join(', ');
        const rid = restaurant.venue_id;
        const size = sizes[0];
        const bookingUrl = `https://www.opentable.com/restref/client/?rid=${rid}&covers=${size}&datetime=${newSlots[0].date}T${newSlots[0].time}`;
        await fetch(`https://ntfy.sh/${encodeURIComponent(ntfyTopic)}`, {
          method: 'POST',
          headers: {
            Title: `${restaurant.name}`,
            Priority: settingsMap.get(restaurant.user_id)?.ntfy_priority ?? 'default',
            Tags: 'fork_and_knife',
            Click: bookingUrl,
          },
          body: `${timeList} on ${dateList}`,
        }).catch(() => {});
      }

      await db.from('activity_log').insert({
        user_id: restaurant.user_id,
        restaurant_id: restaurant.id,
        type: 'found',
        message: `🍽 <strong>${restaurant.name}</strong> — ${[...new Set(newSlots.map(s => s.displayTime))].join(', ')} on ${[...new Set(newSlots.map(s => s.date))].join(', ')}`,
      });
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
