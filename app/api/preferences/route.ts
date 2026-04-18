import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET() {
  const user = await requireUser().catch(() => null);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await db
    .from('user_settings')
    .select(
      'user_id, ntfy_topic, ntfy_priority, monitoring_enabled, earliest_time, latest_time, day_range, days_of_week, check_interval_min, active_hours_start, active_hours_end, quiet_hours_start, quiet_hours_end'
    )
    .eq('user_id', user.id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    userId: data.user_id,
    ntfyTopic: data.ntfy_topic,
    ntfyPriority: data.ntfy_priority,
    monitoringEnabled: data.monitoring_enabled,
    earliestTime: data.earliest_time,
    latestTime: data.latest_time,
    dayRange: data.day_range,
    daysOfWeek: data.days_of_week,
    checkIntervalMin: data.check_interval_min,
    activeHoursStart: data.active_hours_start,
    activeHoursEnd: data.active_hours_end,
    quietHoursStart: data.quiet_hours_start,
    quietHoursEnd: data.quiet_hours_end,
  });
}

const PatchSchema = z.object({
  earliestTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  latestTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  dayRange: z.number().int().min(1).max(60).optional(),
  daysOfWeek: z.enum(['all', 'weekdays', 'weekends', 'sat', 'fri-sun']).optional(),
  checkIntervalMin: z.number().int().min(5).max(60).optional(),
  activeHoursStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  activeHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  monitoringEnabled: z.boolean().optional(),
});

export async function PATCH(req: NextRequest) {
  const user = await requireUser().catch(() => null);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 422 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const d = parsed.data;
  if (d.earliestTime !== undefined) updates.earliest_time = d.earliestTime;
  if (d.latestTime !== undefined) updates.latest_time = d.latestTime;
  if (d.dayRange !== undefined) updates.day_range = d.dayRange;
  if (d.daysOfWeek !== undefined) updates.days_of_week = d.daysOfWeek;
  if (d.checkIntervalMin !== undefined) updates.check_interval_min = d.checkIntervalMin;
  if (d.activeHoursStart !== undefined) updates.active_hours_start = d.activeHoursStart;
  if (d.activeHoursEnd !== undefined) updates.active_hours_end = d.activeHoursEnd;
  if (d.quietHoursStart !== undefined) updates.quiet_hours_start = d.quietHoursStart;
  if (d.quietHoursEnd !== undefined) updates.quiet_hours_end = d.quietHoursEnd;
  if (d.monitoringEnabled !== undefined) updates.monitoring_enabled = d.monitoringEnabled;

  const { data, error } = await db
    .from('user_settings')
    .update(updates)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    userId: data.user_id,
    ntfyTopic: data.ntfy_topic,
    ntfyPriority: data.ntfy_priority,
    monitoringEnabled: data.monitoring_enabled,
    earliestTime: data.earliest_time,
    latestTime: data.latest_time,
    dayRange: data.day_range,
    daysOfWeek: data.days_of_week,
    checkIntervalMin: data.check_interval_min,
    activeHoursStart: data.active_hours_start,
    activeHoursEnd: data.active_hours_end,
    quietHoursStart: data.quiet_hours_start,
    quietHoursEnd: data.quiet_hours_end,
  });
}
