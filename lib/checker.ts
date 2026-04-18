import { db } from './db';
import { findResyAvailability } from './resy';
import { findOpenTableAvailability } from './opentable';
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

/**
 * Core check loop for a single user.
 * Loads their settings + active restaurants, checks each one, fires notifications.
 */
export async function checkUserWatchlist(userId: string): Promise<CheckResult[]> {
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
  const tz: string = settings.timezone ?? 'America/New_York';
  if (!isCurrentTimeInActiveHours(settings.active_hours_start, settings.active_hours_end, now, tz)) {
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

  const apiKey: string = process.env.RESY_API_KEY ?? settings.resy_api_key ?? '';
  const dates = getDateRange(settings.day_range, settings.days_of_week);

  // Check all restaurants in parallel
  const results = await Promise.all(
    restaurants.map(async (restaurant) => {
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

        // Check all dates × party sizes in parallel with a 6s per-call timeout
        const slotsByDate = await Promise.all(
          dates.flatMap(date =>
            sizes.map(async (size) => {
              const withTimeout = <T>(p: Promise<T>): Promise<T> =>
                Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), 6000))]);

              if (restaurant.platform === 'resy') {
                if (!apiKey) return [];
                return withTimeout(findResyAvailability(apiKey, restaurant.venue_id, date, size)).catch(() => []);
              } else if (restaurant.platform === 'opentable') {
                return withTimeout(findOpenTableAvailability(
                  restaurant.venue_id, date, settings.earliest_time, size
                )).catch(() => []);
              } else if (restaurant.platform === 'sevenrooms') {
                return withTimeout(findSevenRoomsAvailability(
                  restaurant.venue_id, date, size
                )).catch(() => []);
              } else if (restaurant.platform === 'tock') {
                return withTimeout(findTockAvailability(
                  restaurant.venue_id, date, settings.earliest_time, size
                )).catch(() => []);
              }
              return [];
            })
          )
        );

        // Collect all in-window slots and find which are new (not previously notified)
        const allSlotsInWindow: Slot[] = [];
        const newSlots: Slot[] = [];

        for (const slots of slotsByDate) {
          for (const slot of slots) {
            if (!isSlotInWindow(slot.time, settings.earliest_time, settings.latest_time)) continue;
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

        await db.from('activity_log').insert({
          user_id: userId,
          restaurant_id: restaurant.id,
          type: 'check',
          message: `Checked <strong>${restaurant.name}</strong> — ${allSlotsInWindow.length} slot(s) available, ${newSlots.length} new (prev: ${prevSlots.length})`,
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
