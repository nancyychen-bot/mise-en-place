import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isCurrentTimeInActiveHours } from '@/lib/time-filter';

export const dynamic = 'force-dynamic';

async function handler() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL;

  // Always run the snipe scheduler (releases happen at any hour, including midnight)
  const snipeResult = appUrl
    ? await fetch(`https://${appUrl.replace(/^https?:\/\//, '')}/api/cron/snipe-scheduler`)
        .then((r) => r.json())
        .catch(() => ({ error: 'fetch failed' }))
    : { skipped: 'no app url' };

  // Only dispatch checkers if at least one user is in their active hours
  const { data: settings } = await db
    .from('user_settings')
    .select('active_hours_start, active_hours_end, timezone, monitoring_enabled')
    .eq('monitoring_enabled', true);

  const now = new Date();
  const anyActive = (settings ?? []).some((s) =>
    isCurrentTimeInActiveHours(s.active_hours_start, s.active_hours_end, now, s.timezone ?? 'America/New_York')
  );

  if (!anyActive) {
    return NextResponse.json({ skipped: 'outside active hours', snipe: snipeResult });
  }

  const ghToken = process.env.GITHUB_TOKEN;
  if (!ghToken) {
    return NextResponse.json({ error: 'GITHUB_TOKEN not set', snipe: snipeResult }, { status: 500 });
  }

  const workflows = ['resy-checker.yml', 'opentable-checker.yml'];
  const results: Record<string, number> = {};

  await Promise.all(
    workflows.map(async (workflow) => {
      const res = await fetch(
        `https://api.github.com/repos/nancyychen-bot/mise-en-place/actions/workflows/${workflow}/dispatches`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${ghToken}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
          body: JSON.stringify({ ref: 'main' }),
        }
      );
      results[workflow] = res.status;
      if (!res.ok && res.status !== 204) {
        const text = await res.text().catch(() => '');
        console.error(`[dispatch-checkers] ${workflow} failed: ${res.status} ${text}`);
      }
    })
  );

  return NextResponse.json({ dispatched: results, snipe: snipeResult });
}

export { handler as GET, handler as POST, handler as HEAD };
