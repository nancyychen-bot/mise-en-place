import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const maxDuration = 30;

async function handler(req: NextRequest) {
  const auth = req.headers.get('authorization');
  const secret = process.env.CRON_SECRET;

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Keep last 7 days of activity logs
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { error, count } = await db
    .from('activity_log')
    .delete({ count: 'exact' })
    .lt('created_at', cutoff);

  if (error) {
    console.error('[cleanup] failed to prune activity_log:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log(`[cleanup] pruned ${count} activity_log rows older than ${cutoff}`);
  return NextResponse.json({ deleted: count });
}

export { handler as GET, handler as POST };
