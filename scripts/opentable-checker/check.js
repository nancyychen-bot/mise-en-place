import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createClient } from '@supabase/supabase-js';
import { launchBrowser, closeBrowser, scrapeOpenTable } from './scrape.js';

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

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log(`[check] starting at ${new Date().toISOString()}`);

  // 1. Load ALL active OpenTable restaurants across all users
  const { data: restaurants, error: restErr } = await db
    .from('restaurants')
    .select('id, user_id, name, venue_id, party_size, party_sizes, earliest_time, latest_time, day_range')
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
    .select('user_id, earliest_time, latest_time, day_range, days_of_week, timezone, monitoring_enabled')
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

  // 4. Check each restaurant
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
    const dayRange = Math.min(restaurant.day_range ?? settings.day_range ?? 14, 5);
    const sizes = Array.isArray(restaurant.party_sizes) && restaurant.party_sizes.length > 0
      ? restaurant.party_sizes
      : [restaurant.party_size];
    const dates = getDateRange(dayRange, tz);

    const allSlots = [];

    for (const date of dates) {
      for (const size of sizes) {
        try {
          const slots = await scrapeOpenTable(restaurant.venue_id, date, size);
          for (const slot of slots) {
            // Filter by time window
            if (effectiveEarliest && slot.time < effectiveEarliest) continue;
            if (effectiveLatest && slot.time > effectiveLatest) continue;
            allSlots.push({ date, time: slot.time, displayTime: slot.displayTime });
          }
        } catch (err) {
          console.error(`[check] error scraping ${restaurant.name} date=${date} size=${size}:`, err.message);
          // Continue to next combo
        }
      }
    }

    // 5. Write results to Supabase
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
      console.log(`[check] ${restaurant.name} — ${allSlots.length} slot(s) found`);
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
