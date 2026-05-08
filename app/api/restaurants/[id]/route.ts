import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';

const timeRe = /^\d{2}:\d{2}$/;

const PatchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  active: z.boolean().optional(),
  partySize: z.number().int().min(1).max(20).optional(),
  partySizes: z.array(z.number().int().min(1).max(20)).min(1).optional(),
  earliestTime: z.string().regex(timeRe).nullable().optional(),
  latestTime: z.string().regex(timeRe).nullable().optional(),
  dayRange: z.number().int().min(1).max(60).nullable().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await requireUser().catch(() => null);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

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

  const updates: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.active !== undefined) updates.active = parsed.data.active;
  if (parsed.data.partySize !== undefined) updates.party_size = parsed.data.partySize;
  if (parsed.data.partySizes !== undefined) {
    updates.party_sizes = parsed.data.partySizes;
    updates.party_size = parsed.data.partySizes[0]; // keep legacy in sync
  }
  if (parsed.data.earliestTime !== undefined) updates.earliest_time = parsed.data.earliestTime;
  if (parsed.data.latestTime !== undefined) updates.latest_time = parsed.data.latestTime;
  if (parsed.data.dayRange !== undefined) updates.day_range = parsed.data.dayRange;

  const { data, error } = await db
    .from('restaurants')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id) // ensure ownership
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await requireUser().catch(() => null);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const { error } = await db
    .from('restaurants')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return new NextResponse(null, { status: 204 });
}
