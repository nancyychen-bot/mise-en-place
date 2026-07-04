import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createClient } from '@supabase/supabase-js';
import { launchBrowser, closeBrowser } from './scrape.js';

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
} catch {}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error('[snipe] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  process.exit(1);
}
const db = createClient(supabaseUrl, supabaseKey);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Args ────────────────────────────────────────────────────────────
// Usage: node snipe.js --rid=220387 --date=2026-06-11 --time=18:30 --party=3

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace('--', '').split('=');
    return [k, v];
  })
);

const RID = args.rid;
const RESTAURANT_ID = args.restaurant || null;
const TARGET_DATE = args.date;
const TARGET_TIME = args.time;
const PARTY_SIZE = parseInt(args.party || '2', 10);
const POLL_INTERVAL = parseInt(args.interval || '15', 10) * 1000;
const MAX_DURATION = parseInt(args.duration || '10', 10) * 60 * 1000;

if (!RID || !TARGET_DATE || !TARGET_TIME) {
  console.error('[snipe] Required: --rid=<id> --date=YYYY-MM-DD --time=HH:MM');
  console.error('[snipe] Optional: --party=N --interval=15 --duration=10');
  process.exit(1);
}

function fmt12h(t) {
  const [h, m] = t.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

const DISPLAY_TIME = fmt12h(TARGET_TIME);

// ── Booking flow (same as check.js) ─────────────────────────────────

async function attemptBooking(page) {
  const timeParam = encodeURIComponent(`${TARGET_TIME}:00`);
  const availUrl = `https://www.opentable.com/booking/restref/availability?rid=${RID}&restRef=${RID}&partySize=${PARTY_SIZE}&date=${TARGET_DATE}&time=${timeParam}&lang=en-US`;

  await page.goto(availUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  const findBtn = page.locator('[data-test="dtpPicker-submit"]');
  if (await findBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await findBtn.click();
    await page.waitForTimeout(4000);
  }

  // Look for the target slot
  const allBtns = await page.locator('button').all();
  let clicked = false;
  for (const btn of allBtns) {
    const label = await btn.getAttribute('aria-label').catch(() => '') ?? '';
    if (label.includes(DISPLAY_TIME) && label.includes('Reserve')) {
      await btn.click();
      clicked = true;
      break;
    }
  }

  if (!clicked) return { found: false };

  await page.waitForTimeout(2000);

  // Select Standard seating if prompted
  const standardBtn = page.locator('button:has-text("Standard")');
  if (await standardBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await standardBtn.click();
    await page.waitForTimeout(5000);
  } else {
    await page.waitForTimeout(3000);
  }

  if (!page.url().includes('details')) {
    return { found: true, booked: false, error: 'not_on_details_page' };
  }

  // Intercept booking result
  let bookingResult = null;
  page.on('response', async (response) => {
    if (response.url().includes('make-reservation')) {
      try {
        bookingResult = { status: response.status(), body: await response.text() };
      } catch {}
    }
  });

  const completeBtn = page.locator('button:has-text("Complete reservation")');
  if (!await completeBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    return { found: true, booked: false, error: 'no_complete_button' };
  }

  await completeBtn.click();
  await page.waitForTimeout(8000);

  if (bookingResult && bookingResult.status >= 200 && bookingResult.status < 300) {
    return { found: true, booked: true };
  }

  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 500));
  if (/confirmed|you're all set/i.test(bodyText)) {
    return { found: true, booked: true };
  }

  return { found: true, booked: false, error: bookingResult?.body?.slice(0, 200) ?? bodyText.slice(0, 200) };
}

// ── Main loop ───────────────────────────────────────────────────────

async function main() {
  console.log(`[snipe] Target: RID ${RID}, ${TARGET_DATE} at ${DISPLAY_TIME}, party ${PARTY_SIZE}`);
  console.log(`[snipe] Polling every ${POLL_INTERVAL / 1000}s for up to ${MAX_DURATION / 60000} min`);

  // Load auth cookie — prefer the exact row (venue_id can be shared across users)
  let query = db
    .from('restaurants')
    .select('id, user_id, name')
    .eq('platform', 'opentable');
  query = RESTAURANT_ID ? query.eq('id', RESTAURANT_ID) : query.eq('venue_id', RID);
  const { data: restaurants } = await query.limit(1);

  const restaurantRow = restaurants?.[0];
  const userId = restaurantRow?.user_id;
  const restaurantName = restaurantRow?.name ?? `RID ${RID}`;
  if (!userId) {
    console.error(`[snipe] No restaurant found with ${RESTAURANT_ID ? `id=${RESTAURANT_ID}` : `venue_id=${RID}`}`);
    process.exit(1);
  }

  const { data: settings } = await db
    .from('user_settings')
    .select('opentable_session, ntfy_topic')
    .eq('user_id', userId)
    .single();

  if (!settings?.opentable_session) {
    console.error('[snipe] No OpenTable session token found');
    process.exit(1);
  }

  const ctx = await launchBrowser();
  await ctx.addCookies([{
    name: 'authCke',
    value: settings.opentable_session,
    domain: '.opentable.com',
    path: '/',
    secure: true,
  }]);

  const startTime = Date.now();
  let attempt = 0;

  while (Date.now() - startTime < MAX_DURATION) {
    attempt++;
    const page = await ctx.newPage();

    try {
      console.log(`[snipe] attempt ${attempt} at ${new Date().toISOString()}`);
      const result = await attemptBooking(page);

      if (result.booked) {
        console.log(`[snipe] BOOKED! ${DISPLAY_TIME} on ${TARGET_DATE}`);

        // Send notification
        if (settings.ntfy_topic) {
          await fetch(`https://ntfy.sh/${encodeURIComponent(settings.ntfy_topic)}`, {
            method: 'POST',
            headers: { Title: `Sniped! ${restaurantName}`, Priority: 'max', Tags: 'tada' },
            body: `${DISPLAY_TIME} on ${TARGET_DATE} for ${PARTY_SIZE} guests`,
          });
        }

        // Log and disable auto-book
        await db.from('activity_log').insert({
          user_id: userId, type: 'system',
          message: `Sniped <strong>${restaurantName}</strong> at ${DISPLAY_TIME} on ${TARGET_DATE}`,
        });
        await db.from('restaurants')
          .update({ auto_book: false })
          .eq('id', restaurantRow.id);

        await page.close();
        break;
      }

      if (result.found) {
        console.log(`[snipe] slot found but booking failed: ${result.error}`);
      } else {
        console.log(`[snipe] no slot yet`);
      }
    } catch (err) {
      console.error(`[snipe] error: ${err.message}`);
    }

    await page.close();
    await sleep(POLL_INTERVAL);
  }

  await closeBrowser();
  const duration = Math.round((Date.now() - startTime) / 1000);
  console.log(`[snipe] done — ${attempt} attempts over ${duration}s`);

  if (settings?.ntfy_topic) {
    await fetch(`https://ntfy.sh/${encodeURIComponent(settings.ntfy_topic)}`, {
      method: 'POST',
      headers: { Title: `Snipe finished: ${restaurantName}`, Priority: 'low', Tags: 'mag' },
      body: `${attempt} attempts over ${Math.round(duration / 60)} min — no availability found for ${DISPLAY_TIME} on ${TARGET_DATE}`,
    }).catch(() => {});
  }
}

main().catch((err) => {
  console.error('[snipe] fatal:', err);
  closeBrowser().catch(() => {});
  process.exit(1);
});
