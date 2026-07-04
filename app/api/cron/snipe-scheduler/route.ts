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

  const userIds = [...new Set(restaurants.map((r) => r.user_id))];
  const { data: allSettings } = await db
    .from('user_settings')
    .select('user_id, resy_auth_token, opentable_session, token_expired')
    .in('user_id', userIds);
  const settingsMap = new Map((allSettings ?? []).map((s) => [s.user_id, s]));

  const tz = 'America/New_York';
  const nowET = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
  const nowMinutes = nowET.getHours() * 60 + nowET.getMinutes();
  const todayET = new Date(nowET);
  todayET.setHours(0, 0, 0, 0);

  const triggered: string[] = [];

  for (const r of restaurants) {
    if (r.platform !== 'opentable' && r.platform !== 'resy') continue;

    const settings = settingsMap.get(r.user_id);
    const hasToken = r.platform === 'resy'
      ? !!settings?.resy_auth_token
      : !!settings?.opentable_session;
    if (!hasToken || settings?.token_expired?.[r.platform]) continue;

    const [rh, rm] = (r.release_time as string).split(':').map(Number);
    const releaseMinutes = rh * 60 + rm;

    // Trigger if release is within -5 to +9 minutes of now.
    // The [-5, +9] window spans exactly 15 minutes, tiling the 15-min cron
    // (ticks at :11/:26/:41/:56) with no gaps and no double dispatch.
    // GH Actions takes ~4 min to spin up, then polls for 15 min.
    let diff = releaseMinutes - nowMinutes;
    // Handle midnight wraparound (e.g., now=23:56, release=00:00 → diff should be +4)
    let crossesMidnight = false;
    if (diff > 720) diff -= 1440;
    if (diff < -720) { diff += 1440; crossesMidnight = true; }
    if (diff < -5 || diff > 9) continue;

    // Target date = today + release_days_ahead
    // If we're before midnight checking a post-midnight release, use tomorrow as base
    const baseDate = new Date(todayET);
    if (crossesMidnight) baseDate.setDate(baseDate.getDate() + 1);
    const targetDate = new Date(baseDate);
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
      ? { venue: r.venue_id, date: targetDateStr, time: preferredTime, party: String(partySize), city: (r.venue_city as string) ?? 'ny', restaurant_id: String(r.id) }
      : { rid: r.venue_id, date: targetDateStr, time: preferredTime, party: String(partySize), restaurant_id: String(r.id) };

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
      await db.from('activity_log').insert({
        user_id: r.user_id,
        restaurant_id: r.id,
        type: 'system',
        message: `Snipe dispatch FAILED for <strong>${r.name}</strong> — GitHub API ${dispatchRes.status}. Check GITHUB_TOKEN.`,
      });
      if (process.env.OWNER_NTFY_TOPIC) {
        await fetch(`https://ntfy.sh/${encodeURIComponent(process.env.OWNER_NTFY_TOPIC)}`, {
          method: 'POST',
          headers: { Title: `Snipe dispatch failed: ${r.name}`, Priority: 'high', Tags: 'rotating_light' },
          body: `GitHub API returned ${dispatchRes.status} — likely an expired GITHUB_TOKEN. ${errText.slice(0, 200)}`,
        }).catch(() => {});
      }
    }
  }

  return NextResponse.json({ checked: restaurants.length, triggered });
}

export { GET as POST };
