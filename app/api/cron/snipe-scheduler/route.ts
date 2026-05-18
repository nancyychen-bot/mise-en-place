import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { data: restaurants, error } = await db
    .from('restaurants')
    .select('id, user_id, name, venue_id, venue_city, platform, party_size, party_sizes, release_days_ahead, release_time, preferred_time, date_start, date_end, earliest_time, day_range')
    .eq('active', true)
    .eq('auto_book', true)
    .not('release_days_ahead', 'is', null)
    .not('release_time', 'is', null);

  if (error || !restaurants?.length) {
    return NextResponse.json({ checked: 0 });
  }

  const tz = 'America/New_York';
  const nowET = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
  const nowMinutes = nowET.getHours() * 60 + nowET.getMinutes();
  const todayET = new Date(nowET);
  todayET.setHours(0, 0, 0, 0);

  const triggered: string[] = [];

  for (const r of restaurants) {
    if (r.platform !== 'opentable' && r.platform !== 'resy') continue;

    const [rh, rm] = (r.release_time as string).split(':').map(Number);
    const releaseMinutes = rh * 60 + rm;

    // Trigger if release is within -5 to +5 minutes of now
    // Narrow window ensures one dispatch per cron tick (cron runs every 15 min)
    // GH Actions takes ~4 min to spin up, then polls for 15 min
    const diff = releaseMinutes - nowMinutes;
    if (diff < -5 || diff > 5) continue;

    // Target date = today + release_days_ahead
    const targetDate = new Date(todayET);
    targetDate.setDate(targetDate.getDate() + (r.release_days_ahead as number));
    const targetDateStr = targetDate.toISOString().slice(0, 10);

    // Check if target date is within the restaurant's date range
    if (r.date_start && targetDateStr < r.date_start) continue;
    if (r.date_end && targetDateStr > r.date_end) continue;
    if (!r.date_start && !r.date_end) {
      const maxDate = new Date(todayET);
      maxDate.setDate(maxDate.getDate() + (r.day_range ?? 14));
      if (targetDate > maxDate) continue;
    }

    const preferredTime = r.preferred_time ?? r.earliest_time ?? '19:00';
    const partySize = Array.isArray(r.party_sizes) && r.party_sizes.length > 0
      ? r.party_sizes[0]
      : r.party_size;

    const ghToken = process.env.GITHUB_TOKEN;
    if (!ghToken) {
      console.error('[snipe-scheduler] GITHUB_TOKEN not set');
      continue;
    }

    const workflow = r.platform === 'resy' ? 'resy-snipe.yml' : 'opentable-snipe.yml';
    const inputs = r.platform === 'resy'
      ? { venue: r.venue_id, date: targetDateStr, time: preferredTime, party: String(partySize), city: (r.venue_city as string) ?? 'ny' }
      : { rid: r.venue_id, date: targetDateStr, time: preferredTime, party: String(partySize) };

    const dispatchRes = await fetch(
      `https://api.github.com/repos/nancyychen-bot/mise-en-place/actions/workflows/${workflow}/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ghToken}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({ ref: 'main', inputs }),
      }
    );

    if (dispatchRes.ok || dispatchRes.status === 204) {
      triggered.push(`${r.name} → ${targetDateStr} at ${preferredTime}`);
      console.log(`[snipe-scheduler] triggered snipe for ${r.name}: ${targetDateStr} at ${preferredTime}`);
      await db.from('activity_log').insert({
        user_id: r.user_id,
        restaurant_id: r.id,
        type: 'system',
        message: `Snipe scheduled for <strong>${r.name}</strong> — ${targetDateStr} at ${preferredTime}`,
      });
    } else {
      const errText = await dispatchRes.text().catch(() => '');
      console.error(`[snipe-scheduler] dispatch failed for ${r.name}: ${dispatchRes.status} ${errText}`);
    }
  }

  return NextResponse.json({ checked: restaurants.length, triggered });
}

export { GET as POST };
