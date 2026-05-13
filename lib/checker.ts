import { db } from './db';
import { findResyAvailability } from './resy';

import { findSevenRoomsAvailability } from './sevenrooms';
import { findTockAvailability } from './tock';
import { sendNotification } from './ntfy';
import {
  isSlotInWindow,
  isCurrentTimeInActiveHours,
  isCurrentTimeInQuietHours,
  getDateRange,
} from './time-filter';
import type { CheckResult, Slot } from './types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Core check loop for a single user.
 * Loads their settings + active restaurants, checks each one, fires notifications.
 */
export async function checkUserWatchlist(userId: string, force = false): Promise<CheckResult[]> {
  // Load settings
  const { data: settings, error: settingsErr } = await db
    .from('user_settings')
    .select('user_id, monitoring_enabled, timezone, active_hours_start, active_hours_end, resy_api_key, day_range, days_of_week, earliest_time, latest_time, quiet_hours_start, quiet_hours_end, ntfy_topic, ntfy_priority')
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
  const tz: string = settings.timezone ?? 'America/New_York';
  if (!force && !isCurrentTimeInActiveHours(settings.active_hours_start, settings.active_hours_end, now, tz)) {
    throw new Error(`Outside active hours (${settings.active_hours_start}–${settings.active_hours_end}). Current server time: ${currentTime}`);
  }

  // Load active restaurants
  const { data: restaurants, error: restErr } = await db
    .from('restaurants')
    .select('id, name, platform, venue_id, venue_slug, venue_city, party_size, party_sizes, available_slots, earliest_time, latest_time, day_range, date_start, date_end')
    .eq('user_id', userId)
    .eq('active', true);

  if (restErr) throw new Error(`Failed to load restaurants: ${restErr.message}`);
  if (!restaurants?.length) throw new Error(`No active restaurants found on your watchlist.`);

  const apiKey: string = process.env.RESY_API_KEY ?? settings.resy_api_key ?? '';
  const dates = getDateRange(settings.day_range, settings.days_of_week, tz);

  const withTimeout = <T>(p: Promise<T>): Promise<T> =>
    Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), 12000))]);

  const results: CheckResult[] = await Promise.all(
    restaurants.map(async (restaurant) => {
      await sleep(Math.random() * 500);
      const checkedAt = new Date();
      try {
        // Build dedup set from previously stored slots for this restaurant
        const prevSlots: Slot[] = restaurant.available_slots ?? [];
        const prevSlotKeys = new Set(prevSlots.map((s: Slot) => `${s.date}:${s.time}`));

        // Support multiple party sizes; fall back to single party_size
        const sizes: number[] =
          Array.isArray(restaurant.party_sizes) && restaurant.party_sizes.length > 0
            ? (restaurant.party_sizes as number[])
            : [restaurant.party_size];
        const city: string = (restaurant.venue_city as string | null) ?? 'ny';

        const effectiveEarliest = restaurant.earliest_time ?? settings.earliest_time;
        const effectiveLatest = restaurant.latest_time ?? settings.latest_time;
        let effectiveDates: string[];
        if (restaurant.date_start && restaurant.date_end) {
          effectiveDates = [];
          const start = new Date(`${restaurant.date_start}T00:00:00`);
          const end = new Date(`${restaurant.date_end}T00:00:00`);
          for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            effectiveDates.push(d.toISOString().slice(0, 10));
          }
        } else if (restaurant.day_range != null) {
          effectiveDates = getDateRange(restaurant.day_range, settings.days_of_week, tz);
        } else {
          effectiveDates = dates;
        }

        const combos = effectiveDates.flatMap(date => sizes.map(size => ({ date, size })));

        let fetchError = '';
        // OpenTable availability is populated by the local Playwright checker —
        // skip the API call and use whatever is already in available_slots.
        const slotsByDate = restaurant.platform === 'opentable'
          ? [prevSlots]
          : await Promise.all(
              combos.map(async ({ date, size }) => {
                let slots: Slot[] = [];
                try {
                  if (restaurant.platform === 'resy') {
                    if (!apiKey) return [];
                    slots = await withTimeout(findResyAvailability(apiKey, restaurant.venue_id, date, size));
                  } else if (restaurant.platform === 'sevenrooms') {
                    slots = await withTimeout(findSevenRoomsAvailability(
                      restaurant.venue_id, date, size
                    ));
                  } else if (restaurant.platform === 'tock') {
                    slots = await withTimeout(findTockAvailability(
                      restaurant.venue_id, date, effectiveEarliest, size
                    ));
                  }
                } catch (err) {
                  if (!fetchError) fetchError = `${date}/${size}: ${err instanceof Error ? err.message : String(err)}`;
                }
                return slots;
              })
            );

        // Collect all in-window slots and find which are new (not previously notified)
        const allSlotsInWindow: Slot[] = [];
        const newSlots: Slot[] = [];

        for (const slots of slotsByDate) {
          for (const slot of slots) {
            if (!isSlotInWindow(slot.time, effectiveEarliest, effectiveLatest)) continue;
            allSlotsInWindow.push(slot);
            if (!prevSlotKeys.has(`${slot.date}:${slot.time}`)) {
              newSlots.push(slot);
            }
          }
        }

        // Save ALL current slots for display + dedup on next run
        const { error: updateErr } = await db.from('restaurants').update({
          last_checked: checkedAt.toISOString(),
          available_slots: allSlotsInWindow,
          slots_updated_at: checkedAt.toISOString(),
        }).eq('id', restaurant.id);

        if (updateErr) {
          console.error(`[checker] failed to save available_slots for ${restaurant.id}:`, updateErr.message);
        }

        let checkMsg = `Checked <strong>${restaurant.name}</strong> — ${allSlotsInWindow.length} slot(s) available, ${newSlots.length} new (prev: ${prevSlots.length})`;
        if (fetchError) {
          checkMsg += ` [err: ${fetchError}]`;
        }

        await db.from('activity_log').insert({
          user_id: userId,
          restaurant_id: restaurant.id,
          type: 'check',
          message: checkMsg,
        });

        if (newSlots.length > 0) {
          const timeList = [...new Set(newSlots.map((s) => s.displayTime))].join(', ');
          const dateList = [...new Set(newSlots.map((s) => s.date))].join(', ');
          const foundMsg = `🍽 <strong>${restaurant.name}</strong> — ${timeList} on ${dateList}`;

          const inQuiet = isCurrentTimeInQuietHours(settings.quiet_hours_start, settings.quiet_hours_end, now, tz);

          // Link directly to the first new slot's date/time for instant booking
          const firstSlot = newSlots[0];
          const slug = restaurant.venue_slug ?? restaurant.venue_id;
          const primarySize = sizes[0];
          const bookingUrl = restaurant.platform === 'resy'
            ? `https://resy.com/cities/${city}/venues/${slug}?date=${firstSlot.date}&seats=${primarySize}`
            : restaurant.platform === 'opentable'
            ? `https://www.opentable.com/r/${slug}?covers=${primarySize}&dateTime=${firstSlot.date}T${firstSlot.time}:00`
            : restaurant.platform === 'sevenrooms'
            ? `https://www.sevenrooms.com/reservations/${slug}?date=${firstSlot.date}&party_size=${primarySize}`
            : `https://www.exploretock.com/${slug}?date=${firstSlot.date}&size=${primarySize}&time=${firstSlot.time}`;

          await Promise.all([
            db.from('activity_log').insert({ user_id: userId, restaurant_id: restaurant.id, type: 'found', message: foundMsg }),
            !inQuiet && settings.ntfy_topic
              ? sendNotification(
                  settings.ntfy_topic,
                  `Table available at ${restaurant.name}`,
                  `${timeList} on ${dateList} for ${restaurant.party_size} guests`,
                  settings.ntfy_priority,
                  bookingUrl,
                ).then(() => db.from('activity_log').insert({ user_id: userId, restaurant_id: restaurant.id, type: 'notify', message: `Notification sent for <strong>${restaurant.name}</strong>` }))
              : Promise.resolve(),
          ]);
        }

        return { restaurantId: restaurant.id, restaurantName: restaurant.name, platform: restaurant.platform, slots: allSlotsInWindow, checkedAt };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[checker] error for restaurant ${restaurant.id}:`, msg);
        await db.from('activity_log').insert({
          user_id: userId, restaurant_id: restaurant.id, type: 'system',
          message: `Error checking <strong>${restaurant.name}</strong>: ${msg}`,
        });
        return { restaurantId: restaurant.id, restaurantName: restaurant.name, platform: restaurant.platform, slots: [], checkedAt };
      }
    })
  );

  return results;
}
