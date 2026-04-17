import { db } from './db';
import { findResyAvailability } from './resy';
import { findOpenTableAvailability } from './opentable';
import { sendNotification } from './ntfy';
import {
  isSlotInWindow,
  isCurrentTimeInActiveHours,
  isCurrentTimeInQuietHours,
  getDateRange,
} from './time-filter';
import type { CheckResult, Slot } from './types';

// Simple in-memory dedup cache: key = `userId:restaurantId:date:time`
// Prevents re-notifying about the same slot within 15 minutes.
const notifiedCache = new Map<string, number>();
const DEDUP_MS = 15 * 60 * 1000;

function purgeStaleCacheEntries() {
  const now = Date.now();
  for (const [key, ts] of notifiedCache) {
    if (now - ts > DEDUP_MS) notifiedCache.delete(key);
  }
}

/**
 * Core check loop for a single user.
 * Loads their settings + active restaurants, checks each one, fires notifications.
 */
export async function checkUserWatchlist(userId: string): Promise<CheckResult[]> {
  purgeStaleCacheEntries();

  // Load settings
  const { data: settings, error: settingsErr } = await db
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (settingsErr || !settings) {
    throw new Error(`No settings found for user. Please save your account settings first.`);
  }

  if (!settings.monitoring_enabled) {
    throw new Error(`Monitoring is disabled. Enable it in your Account settings.`);
  }

  const now = new Date();
  const currentTime = now.toUTCString();
  if (!isCurrentTimeInActiveHours(settings.active_hours_start, settings.active_hours_end, now)) {
    throw new Error(`Outside active hours (${settings.active_hours_start}–${settings.active_hours_end}). Current server time: ${currentTime}`);
  }

  // Load active restaurants
  const { data: restaurants, error: restErr } = await db
    .from('restaurants')
    .select('*')
    .eq('user_id', userId)
    .eq('active', true);

  if (restErr) throw new Error(`Failed to load restaurants: ${restErr.message}`);
  if (!restaurants?.length) throw new Error(`No active restaurants found on your watchlist.`);

  const apiKey: string = settings.resy_api_key ?? '';
  const dates = getDateRange(settings.day_range, settings.days_of_week);
  const results: CheckResult[] = [];

  for (const restaurant of restaurants) {
    const checkedAt = new Date();
    const foundSlots: Slot[] = [];

    try {
      const slotsByDate = await Promise.all(
        dates.map(async (date) => {
          if (restaurant.platform === 'resy') {
            if (!apiKey) return [];
            return findResyAvailability(apiKey, restaurant.venue_id, date, restaurant.party_size).catch(() => []);
          } else if (restaurant.platform === 'opentable') {
            return findOpenTableAvailability(
              restaurant.venue_id,
              date,
              settings.earliest_time,
              restaurant.party_size
            ).catch(() => []);
          }
          return [];
        })
      );

      for (const slots of slotsByDate) {
        const inWindow = slots.filter((s: Slot) =>
          isSlotInWindow(s.time, settings.earliest_time, settings.latest_time)
        );
        for (const slot of inWindow) {
          const cacheKey = `${userId}:${restaurant.id}:${slot.date}:${slot.time}`;
          if (!notifiedCache.has(cacheKey)) {
            foundSlots.push(slot);
            notifiedCache.set(cacheKey, Date.now());
          }
        }
      }

      // Log check
      await db.from('activity_log').insert({
        user_id: userId,
        restaurant_id: restaurant.id,
        type: 'check',
        message: `Checked <strong>${restaurant.name}</strong> — ${foundSlots.length} new slot(s) found`,
      });

      // Update last_checked
      await db
        .from('restaurants')
        .update({ last_checked: checkedAt.toISOString() })
        .eq('id', restaurant.id);

      if (foundSlots.length > 0) {
        // Log found
        const timeList = [...new Set(foundSlots.map((s) => s.displayTime))].join(', ');
        const dateList = [...new Set(foundSlots.map((s) => s.date))].join(', ');
        const foundMsg = `🍽 <strong>${restaurant.name}</strong> — ${timeList} on ${dateList}`;
        await db.from('activity_log').insert({
          user_id: userId,
          restaurant_id: restaurant.id,
          type: 'found',
          message: foundMsg,
        });

        // Send notification unless in quiet hours
        const inQuiet = isCurrentTimeInQuietHours(
          settings.quiet_hours_start,
          settings.quiet_hours_end,
          now
        );

        if (!inQuiet && settings.ntfy_topic) {
          const platform = restaurant.platform;
          const bookingUrl =
            platform === 'resy'
              ? `https://resy.com`
              : `https://www.opentable.com`;

          await sendNotification(
            settings.ntfy_topic,
            `Table available at ${restaurant.name}`,
            `${timeList} on ${dateList} for ${restaurant.party_size} guests`,
            settings.ntfy_priority,
            bookingUrl
          );

          await db.from('activity_log').insert({
            user_id: userId,
            restaurant_id: restaurant.id,
            type: 'notify',
            message: `Notification sent for <strong>${restaurant.name}</strong>`,
          });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[checker] error for restaurant ${restaurant.id}:`, msg);

      await db.from('activity_log').insert({
        user_id: userId,
        restaurant_id: restaurant.id,
        type: 'system',
        message: `Error checking <strong>${restaurant.name}</strong>: ${msg}`,
      });
    }

    results.push({
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      platform: restaurant.platform,
      slots: foundSlots,
      checkedAt,
    });
  }

  return results;
}
