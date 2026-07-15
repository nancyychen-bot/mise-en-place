import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Resend } from 'resend';

const RequestSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Valid email is required'),
  source: z.string().min(1, 'This field is required').max(500),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 422 }
    );
  }

  const { name, email, source } = parsed.data;

  const resend = new Resend(process.env.RESEND_API_KEY);

  const { error } = await resend.emails.send({
    from: process.env.EMAIL_FROM!,
    to: 'nancy@nancychen.xyz',
    subject: `Mise en Place — Invite code request from ${name}`,
    text: [
      `Name: ${name}`,
      `Email: ${email}`,
      `Where they heard about this: ${source}`,
      '',
      `— Sent from Mise en Place signup`,
    ].join('\n'),
  });

  if (error) {
    console.error('Failed to send invite request email:', error);
    return NextResponse.json(
      { error: 'Failed to send request. Please try again.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
