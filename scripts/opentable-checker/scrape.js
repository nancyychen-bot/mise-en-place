import { chromium } from 'playwright';
import { mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let context = null;

/**
 * Launch a shared headed Chrome instance via persistent context.
 *
 * OpenTable uses Akamai TLS fingerprinting that blocks headless browsers
 * and Playwright's bundled Chromium. The only working combination is:
 * - channel: 'chrome' (system-installed Google Chrome)
 * - headless: false (headed mode — window appears briefly)
 * - ignoreDefaultArgs: ['--enable-automation'] (hide automation flag)
 * - launchPersistentContext (more realistic browser profile)
 */
export async function launchBrowser() {
  if (!context || !context.browser()?.isConnected()) {
    const userDataDir = mkdtempSync(join(tmpdir(), 'ot-chrome-'));
    context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chrome',
      headless: false,
      args: ['--disable-blink-features=AutomationControlled'],
      viewport: { width: 1280, height: 800 },
      locale: 'en-US',
      timezoneId: 'America/New_York',
      ignoreDefaultArgs: ['--enable-automation'],
    });
  }
  return context;
}

/**
 * Close the shared browser context.
 */
export async function closeBrowser() {
  if (context) {
    await context.close().catch(() => {});
    context = null;
  }
}

/**
 * Convert 12-hour time string (e.g. "7:00 PM") to 24-hour format ("19:00").
 */
function to24h(timeStr) {
  const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return null;
  let [, hours, minutes, period] = match;
  hours = parseInt(hours, 10);
  if (period.toUpperCase() === 'PM' && hours !== 12) hours += 12;
  if (period.toUpperCase() === 'AM' && hours === 12) hours = 0;
  return `${String(hours).padStart(2, '0')}:${minutes}`;
}

/**
 * Parse a YYYY-MM-DD date string into its components.
 */
function parseDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return { year, month, day };
}

/**
 * Get the month name for a 1-based month number.
 */
function monthName(month) {
  return [
    '', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ][month];
}

/**
 * Set the date on the OpenTable booking widget by interacting with its
 * React Day Picker calendar.
 */
async function setDate(page, targetDate) {
  const { year, month, day } = parseDate(targetDate);
  const targetMonthYear = `${monthName(month)} ${year}`;

  // Click the date selector to open the calendar
  const dateSelector = page.locator('[aria-label="Date selector"]');
  await dateSelector.click();
  await page.waitForTimeout(500);

  // Navigate to the correct month using the calendar's next/prev buttons
  for (let attempts = 0; attempts < 24; attempts++) {
    const caption = await page.locator('.rdp-caption').textContent().catch(() => '');
    if (caption.includes(targetMonthYear)) break;

    // Determine direction: are we going forward or backward?
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
      // Click next month
      const nextBtn = page.locator('.rdp-nav_button_next, [aria-label*="next" i], [aria-label*="Next" i]').first();
      await nextBtn.click();
    } else {
      // Click previous month
      const prevBtn = page.locator('.rdp-nav_button_previous, [aria-label*="previous" i], [aria-label*="Previous" i]').first();
      await prevBtn.click();
    }
    await page.waitForTimeout(300);
  }

  // Click on the target day number
  // The calendar has day buttons — find the one matching our day
  const dayButton = page.locator(`.rdp-day:not(.rdp-day_outside) >> text="${day}"`).first();
  const fallbackDayButton = page.locator(`button:has-text("${day}")`).filter({
    has: page.locator(':scope:not([disabled])'),
  });

  try {
    await dayButton.click({ timeout: 3000 });
  } catch {
    // Fallback: find buttons with exact day text within the calendar
    const clicked = await page.evaluate((d) => {
      const buttons = document.querySelectorAll('.rdp-day button, .rdp button, [role="gridcell"] button');
      for (const btn of buttons) {
        if (btn.textContent.trim() === String(d) && !btn.disabled) {
          btn.click();
          return true;
        }
      }
      // Broader fallback
      const allBtns = document.querySelectorAll('button');
      for (const btn of allBtns) {
        const text = btn.textContent.trim();
        if (text === String(d) && btn.closest('.rdp, [class*="calendar" i], [class*="Calendar"]')) {
          btn.click();
          return true;
        }
      }
      return false;
    }, day);
    if (!clicked) {
      // Last resort: just click the numbered button
      await fallbackDayButton.first().click({ timeout: 3000 });
    }
  }

  await page.waitForTimeout(500);
}

/**
 * Scrape OpenTable availability for a given restaurant, date, and party size.
 *
 * @param {string} restaurantId - OpenTable restaurant ID
 * @param {string} date - Date in YYYY-MM-DD format
 * @param {number} partySize - Number of guests
 * @returns {Array<{time: string, displayTime: string}>} Available time slots
 */
export async function scrapeOpenTable(restaurantId, date, partySize) {
  const ctx = await launchBrowser();
  const page = await ctx.newPage();

  try {
    const url = `https://www.opentable.com/booking/restref/availability?rid=${restaurantId}&restRef=${restaurantId}&partySize=${partySize}&date=${date}&time=19%3A00%3A00&lang=en-US`;

    let response;
    try {
      response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
    } catch (navErr) {
      if (navErr.message.includes('ERR_HTTP2_PROTOCOL_ERROR')) {
        return [];
      }
      throw navErr;
    }

    if (response && response.status() >= 400) {
      return [];
    }

    // Wait for React to hydrate
    try {
      await page.waitForLoadState('networkidle', { timeout: 20000 });
    } catch (_) {
      // Continue even if networkidle times out
    }
    await page.waitForTimeout(2000);

    // Set the correct date on the form (URL param is ignored by OpenTable)
    try {
      await setDate(page, date);
    } catch (dateErr) {
      // If date setting fails, continue with whatever date is shown
    }

    // Set the party size if needed
    try {
      await page.selectOption('#party-size-picker', String(partySize));
    } catch (_) {
      // Ignore — URL param usually sets this correctly
    }

    // Click "Find a table" to trigger the availability search
    const findTableBtn = page.getByRole('button', { name: /find a table/i });
    const hasFindTable = await findTableBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasFindTable) {
      await findTableBtn.click();
      // Wait for results to load
      await page.waitForTimeout(5000);
    }

    // Check if the page says "no availability" for this day
    const noAvailability = await page.evaluate(() => {
      const text = document.body.innerText;
      return text.includes('no availability') || text.includes('No availability');
    });

    if (noAvailability) {
      // The page may show future suggestions, but those are for different dates
      return [];
    }

    // Extract time slot buttons.
    // These are button elements whose text content matches a time pattern,
    // excluding the time picker dropdown options.
    const slots = await page.evaluate(() => {
      const timeRegex = /^\s*(\d{1,2}:\d{2}\s*(?:AM|PM))\s*$/i;
      const results = [];
      const buttons = document.querySelectorAll('button');
      for (const btn of buttons) {
        // Skip buttons inside select elements (time picker)
        if (btn.closest('select')) continue;
        const text = btn.textContent.trim();
        const match = text.match(timeRegex);
        if (match) {
          results.push(match[1].trim());
        }
      }
      return results;
    });

    // Parse into structured results
    const parsed = [];
    const seen = new Set();
    for (const raw of slots) {
      const displayTime = raw.replace(/\s+/g, ' ').trim();
      const time24 = null; // will compute below
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

    // Sort by 24h time
    parsed.sort((a, b) => a.time.localeCompare(b.time));

    return parsed;
  } catch (err) {
    try {
      await page.screenshot({ path: '/tmp/opentable-debug.png' });
    } catch (_) {
      // Ignore screenshot errors
    }
    throw err;
  } finally {
    await page.close();
  }
}
