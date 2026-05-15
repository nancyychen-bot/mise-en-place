import { chromium } from 'playwright';
import { mkdtempSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { platform } from 'process';

let context = null;

function isMac() {
  return platform === 'darwin';
}

export async function launchBrowser() {
  if (!context || !context.browser()?.isConnected()) {
    const userDataDir = mkdtempSync(join(tmpdir(), 'ot-chrome-'));

    if (isMac()) {
      // macOS: must use system Chrome in headed mode (OpenTable blocks bundled Chromium)
      context = await chromium.launchPersistentContext(userDataDir, {
        channel: 'chrome',
        headless: false,
        args: ['--disable-blink-features=AutomationControlled'],
        viewport: { width: 1280, height: 800 },
        locale: 'en-US',
        timezoneId: 'America/New_York',
        ignoreDefaultArgs: ['--enable-automation'],
      });
    } else {
      // Linux (GitHub Actions): use bundled Chromium, headed mode behind xvfb virtual display
      context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--disable-gpu',
          '--no-sandbox',
        ],
        viewport: { width: 1280, height: 800 },
        locale: 'en-US',
        timezoneId: 'America/New_York',
        ignoreDefaultArgs: ['--enable-automation'],
      });
    }
  }
  return context;
}

export async function closeBrowser() {
  if (context) {
    await context.close().catch(() => {});
    context = null;
  }
}

function parseDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return { year, month, day };
}

function monthName(month) {
  return [
    '', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ][month];
}

async function setDate(page, targetDate) {
  const { year, month, day } = parseDate(targetDate);
  const targetMonthYear = `${monthName(month)} ${year}`;

  const dateSelector = page.locator('[aria-label="Date selector"]');
  const hasDateSelector = await dateSelector.isVisible({ timeout: 3000 }).catch(() => false);
  if (!hasDateSelector) throw new Error('no date selector found');
  await dateSelector.click();
  await page.waitForTimeout(800);

  for (let attempts = 0; attempts < 24; attempts++) {
    const caption = await page.locator('.rdp-caption').textContent().catch(() => '');
    if (caption.includes(targetMonthYear)) break;

    const captionMatch = caption.match(/(\w+)\s+(\d{4})/);
    if (!captionMatch) break;
    const currentMonth = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ].indexOf(captionMatch[1]) + 1;
    const currentYear = parseInt(captionMatch[2], 10);
    const currentTotal = currentYear * 12 + currentMonth;
    const targetTotal = year * 12 + month;

    if (targetTotal > currentTotal) {
      await page.locator('.rdp-nav_button_next, [aria-label*="next" i], [aria-label*="Next" i]').first().click();
    } else {
      await page.locator('.rdp-nav_button_previous, [aria-label*="previous" i], [aria-label*="Previous" i]').first().click();
    }
    await page.waitForTimeout(300);
  }

  const dayButton = page.locator(`.rdp-day:not(.rdp-day_outside) >> text="${day}"`).first();
  try {
    await dayButton.click({ timeout: 5000 });
  } catch {
    const clicked = await page.evaluate((d) => {
      // Try calendar-specific buttons first
      for (const btn of document.querySelectorAll('.rdp-day, .rdp-day button, .rdp button, [role="gridcell"], [role="gridcell"] button, td button')) {
        const text = (btn.textContent || '').trim();
        if (text === String(d) && !btn.disabled && !btn.closest('.rdp-day_outside')) { btn.click(); return true; }
      }
      return false;
    }, day);
    if (!clicked) {
      console.error(`[scrape] could not click day ${day} in calendar`);
    }
  }
  await page.waitForTimeout(500);
}

function extractSlots() {
  const timeRegex = /^\s*(\d{1,2}:\d{2}\s*(?:AM|PM))\s*$/i;
  const results = [];
  for (const btn of document.querySelectorAll('button')) {
    if (btn.closest('select')) continue;
    const match = btn.textContent.trim().match(timeRegex);
    if (match) results.push(match[1].trim());
  }
  return results;
}

function parseSlots(raw) {
  const parsed = [];
  const seen = new Set();
  for (const r of raw) {
    const displayTime = r.replace(/\s+/g, ' ').trim();
    const match = displayTime.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!match) continue;
    let [, hours, minutes, period] = match;
    hours = parseInt(hours, 10);
    if (period.toUpperCase() === 'PM' && hours !== 12) hours += 12;
    if (period.toUpperCase() === 'AM' && hours === 12) hours = 0;
    const t24 = `${String(hours).padStart(2, '0')}:${minutes}`;
    if (seen.has(t24)) continue;
    seen.add(t24);
    parsed.push({ time: t24, displayTime });
  }
  parsed.sort((a, b) => a.time.localeCompare(b.time));
  return parsed;
}

/**
 * Scrape OpenTable availability for multiple dates in a single page session.
 * Loads the page once, then flips through dates via the calendar picker.
 *
 * @returns {Map<string, Array<{time, displayTime}>>} date → slots
 */
export async function scrapeOpenTableMultiDate(restaurantId, dates, partySize) {
  const ctx = await launchBrowser();
  const page = await ctx.newPage();
  const results = new Map();
  const slotTokens = new Map(); // "date:time" → { slotHash, slotAvailabilityToken }

  // Intercept network responses to capture slot tokens from availability API
  page.on('response', async (response) => {
    const url = response.url();
    if (!url.includes('availability') && !url.includes('gql') && !url.includes('dapi')) return;
    try {
      const contentType = response.headers()['content-type'] ?? '';
      if (!contentType.includes('json')) return;
      const json = await response.json();
      console.log(`[scrape] intercepted ${url.slice(0, 80)} — keys: ${Object.keys(json?.data ?? json).join(',').slice(0, 100)}`);
      // Handle GraphQL availability response
      const restaurants = json?.data?.restaurantsAvailability ?? json?.data?.availability ?? [];
      for (const r of Array.isArray(restaurants) ? restaurants : [restaurants]) {
        for (const day of r?.availabilityDays ?? []) {
          for (const s of day?.slots ?? []) {
            if (!s.isAvailable) continue;
            const dt = s.dateTime ?? s.time ?? '';
            const dateStr = dt.slice(0, 10);
            const timeStr = dt.slice(11, 16);
            if (dateStr && timeStr && (s.slotHash || s.slotAvailabilityToken)) {
              slotTokens.set(`${dateStr}:${timeStr}`, {
                slotHash: s.slotHash,
                slotAvailabilityToken: s.slotAvailabilityToken,
              });
            }
          }
        }
        // Also check flat slots array
        for (const s of r?.timeslots ?? r?.slots ?? []) {
          const dt = s.dateTime ?? s.time ?? '';
          const dateStr = dt.slice(0, 10);
          const timeStr = dt.slice(11, 16);
          if (dateStr && timeStr && (s.slotHash || s.slotAvailabilityToken)) {
            slotTokens.set(`${dateStr}:${timeStr}`, {
              slotHash: s.slotHash,
              slotAvailabilityToken: s.slotAvailabilityToken,
            });
          }
        }
      }
    } catch {}
  });

  try {
    const firstDate = dates[0];
    const url = `https://www.opentable.com/booking/restref/availability?rid=${restaurantId}&restRef=${restaurantId}&partySize=${partySize}&date=${firstDate}&time=19%3A00%3A00&lang=en-US`;

    let response;
    try {
      response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (navErr) {
      if (navErr.message.includes('ERR_HTTP2_PROTOCOL_ERROR')) return results;
      throw navErr;
    }
    if (response && response.status() >= 400) return results;

    try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
    await page.waitForTimeout(1500);

    for (const date of dates) {
      try {
        // Reload page with date in URL (OpenTable may or may not respect it)
        const dateUrl = `https://www.opentable.com/booking/restref/availability?rid=${restaurantId}&restRef=${restaurantId}&partySize=${partySize}&date=${date}&time=19%3A00%3A00&lang=en-US`;
        await page.goto(dateUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        try { await page.waitForLoadState('networkidle', { timeout: 10000 }); } catch {}
        await page.waitForTimeout(2000);

        // Navigate the calendar to the correct date (URL param is often ignored)
        try {
          await setDate(page, date);
        } catch (calErr) {
          console.error(`[scrape] calendar nav failed for ${date}:`, calErr.message);
        }

        try { await page.selectOption('#party-size-picker', String(partySize)); } catch {}

        const findTableBtn = page.getByRole('button', { name: /find a table/i });
        const hasFindTable = await findTableBtn.isVisible({ timeout: 5000 }).catch(() => false);
        if (hasFindTable) {
          await findTableBtn.click();
          await page.waitForTimeout(4000);
        }

        const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 300));
        const noAvail = bodyText.includes('no availability') || bodyText.includes('No availability');

        if (noAvail) {
          console.log(`[scrape] ${date}: no availability`);
          results.set(date, []);
        } else {
          const raw = await page.evaluate(extractSlots);
          const parsed = parseSlots(raw);
          console.log(`[scrape] ${date}: ${parsed.length} slot(s) — ${parsed.map(s => s.displayTime).join(', ')}`);
          results.set(date, parsed);
        }
      } catch (err) {
        console.error(`[scrape] error on ${date}:`, err.message);
        results.set(date, []);
      }
    }

    // Attach slot tokens to results
    for (const [date, slots] of results) {
      for (const slot of slots) {
        const key = `${date}:${slot.time}`;
        const tokens = slotTokens.get(key);
        if (tokens) {
          slot.slotHash = tokens.slotHash;
          slot.slotAvailabilityToken = tokens.slotAvailabilityToken;
        }
      }
    }

    return results;
  } catch (err) {
    try { await page.screenshot({ path: '/tmp/opentable-debug.png' }); } catch {}
    throw err;
  } finally {
    await page.close();
  }
}
