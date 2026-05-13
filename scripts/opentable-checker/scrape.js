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
  await dateSelector.click();
  await page.waitForTimeout(500);

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
    await dayButton.click({ timeout: 3000 });
  } catch {
    const clicked = await page.evaluate((d) => {
      for (const btn of document.querySelectorAll('.rdp-day button, .rdp button, [role="gridcell"] button')) {
        if (btn.textContent.trim() === String(d) && !btn.disabled) { btn.click(); return true; }
      }
      for (const btn of document.querySelectorAll('button')) {
        if (btn.textContent.trim() === String(d) && btn.closest('.rdp, [class*="calendar" i]')) { btn.click(); return true; }
      }
      return false;
    }, day);
    if (!clicked) {
      await page.locator(`button:has-text("${day}")`).first().click({ timeout: 3000 });
    }
  }
  await page.waitForTimeout(500);
}

export async function scrapeOpenTable(restaurantId, date, partySize) {
  const ctx = await launchBrowser();
  const page = await ctx.newPage();

  try {
    const url = `https://www.opentable.com/booking/restref/availability?rid=${restaurantId}&restRef=${restaurantId}&partySize=${partySize}&date=${date}&time=19%3A00%3A00&lang=en-US`;

    let response;
    try {
      response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (navErr) {
      if (navErr.message.includes('ERR_HTTP2_PROTOCOL_ERROR')) return [];
      throw navErr;
    }

    if (response && response.status() >= 400) return [];

    try { await page.waitForLoadState('networkidle', { timeout: 20000 }); } catch {}
    await page.waitForTimeout(2000);

    try { await setDate(page, date); } catch {}
    try { await page.selectOption('#party-size-picker', String(partySize)); } catch {}

    const findTableBtn = page.getByRole('button', { name: /find a table/i });
    if (await findTableBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await findTableBtn.click();
      await page.waitForTimeout(5000);
    }

    const noAvailability = await page.evaluate(() => {
      const text = document.body.innerText;
      return text.includes('no availability') || text.includes('No availability');
    });
    if (noAvailability) return [];

    const slots = await page.evaluate(() => {
      const timeRegex = /^\s*(\d{1,2}:\d{2}\s*(?:AM|PM))\s*$/i;
      const results = [];
      for (const btn of document.querySelectorAll('button')) {
        if (btn.closest('select')) continue;
        const match = btn.textContent.trim().match(timeRegex);
        if (match) results.push(match[1].trim());
      }
      return results;
    });

    const parsed = [];
    const seen = new Set();
    for (const raw of slots) {
      const displayTime = raw.replace(/\s+/g, ' ').trim();
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
  } catch (err) {
    try { await page.screenshot({ path: '/tmp/opentable-debug.png' }); } catch {}
    throw err;
  } finally {
    await page.close();
  }
}
