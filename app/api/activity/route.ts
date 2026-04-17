import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';

const PAGE_SIZE = 50;

export async function GET(req: NextRequest) {
  const user = await requireUser().catch(() => null);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const cursor = req.nextUrl.searchParams.get('cursor');

  let query = db
    .from('activity_log')
    .select('id, restaurant_id, type, message, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE + 1);

  // Cursor-based pagination: use created_at as cursor
  if (cursor) {
    query = query.lt('created_at', cursor);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const items = data ?? [];
  const hasMore = items.length > PAGE_SIZE;
  const page = hasMore ? items.slice(0, PAGE_SIZE) : items;
  const nextCursor = hasMore ? page[page.length - 1].created_at : null;

  return NextResponse.json({ items: page, nextCursor });
}
