import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import WatchlistClient from './watchlist-client';

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');

  const [{ data: restaurants }, { data: settings }] = await Promise.all([
    db.from('restaurants').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    db.from('user_settings').select('*').eq('user_id', user.id).single(),
  ]);

  const defaultSettings = {
    userId: user.id,
    earliestTime: settings?.earliest_time ?? '18:00',
    latestTime: settings?.latest_time ?? '20:00',
    dayRange: settings?.day_range ?? 14,
    daysOfWeek: settings?.days_of_week ?? 'all',
    checkIntervalMin: settings?.check_interval_min ?? 5,
    monitoringEnabled: settings?.monitoring_enabled ?? true,
    activeHoursStart: settings?.active_hours_start ?? '08:00',
    activeHoursEnd: settings?.active_hours_end ?? '22:00',
    quietHoursStart: settings?.quiet_hours_start ?? '22:00',
    quietHoursEnd: settings?.quiet_hours_end ?? '07:00',
    ntfyTopic: settings?.ntfy_topic ?? null,
    ntfyPriority: settings?.ntfy_priority ?? 'default',
    resyApiKey: null,
    resyAuthToken: settings?.resy_auth_token ? '••••••' : null,
    opentableSession: settings?.opentable_session ? '••••••' : null,
    sevenroomsAuthToken: settings?.sevenrooms_auth_token ? '••••••' : null,
    tokenExpired: (settings?.token_expired as Record<string, boolean>) ?? {},
  };

  // Build initial slot map from persisted available_slots
  const initialSlotMap: Record<string, unknown[]> = {};
  for (const r of restaurants ?? []) {
    if (Array.isArray(r.available_slots) && r.available_slots.length > 0) {
      initialSlotMap[r.id] = r.available_slots;
    }
  }

  return (
    <WatchlistClient
      initialRestaurants={restaurants ?? []}
      initialSlotMap={initialSlotMap}
      settings={defaultSettings}
      slotsFoundToday={(restaurants ?? []).reduce((sum, r) => sum + (Array.isArray(r.available_slots) ? r.available_slots.length : 0), 0)}
    />
  );
}
