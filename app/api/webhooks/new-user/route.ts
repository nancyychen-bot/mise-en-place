import { NextResponse } from 'next/server';
import { sendNotification } from '@/lib/ntfy';

export async function POST(req: Request) {
  const secret = process.env.WEBHOOK_SECRET;
  if (secret) {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const body = await req.json();
  const email: string = body?.record?.email ?? 'unknown';
  const createdAt: string = body?.record?.created_at ?? new Date().toISOString();

  const topic = process.env.OWNER_NTFY_TOPIC;
  if (topic) {
    await sendNotification(topic, 'New user signed up', `${email} joined at ${new Date(createdAt).toLocaleString('en-US', { timeZone: 'America/New_York' })}`);
  }

  return NextResponse.json({ ok: true });
}
