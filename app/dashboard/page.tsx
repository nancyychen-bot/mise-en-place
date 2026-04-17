import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import WatchlistClient from './watchlist-client';

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');

  const [{ data: restaurants }, { data: settings }, { data: activity }] = await Promise.all([
    db.from('restaurants').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    db.from('user_settings').select('*').eq('user_id', user.id).single(),
    db
      .from('activity_log')
      .select('id')
      .eq('user_id', user.id)
      .eq('type', 'found')
      .gte('created_at', new Date(new Date().getTime() - 24 * 60 * 60 * 1000).toISOString()),
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
      slotsFoundToday={activity?.length ?? 0}
    />
  );
}
