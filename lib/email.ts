import { Resend } from 'resend';
import type { NtfyPriority } from './types';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.EMAIL_FROM ?? 'Mise en Place <notifications@mise-en-place.app>';

/**
 * Sends a slot-found email notification via Resend.
 * Never throws — log and swallow so a notification failure can't crash the checker.
 */
export async function sendEmailNotification(
  to: string,
  restaurantName: string,
  timeList: string,
  dateList: string,
  partySize: number,
  bookingUrl: string,
): Promise<void> {
  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to,
      subject: `Table available at ${restaurantName}`,
      html: `
        <p>A reservation slot just opened up!</p>
        <p><strong>${restaurantName}</strong> — ${timeList} on ${dateList} for ${partySize} guest${partySize !== 1 ? 's' : ''}</p>
        <p><a href="${bookingUrl}">Book now</a></p>
        <hr>
        <p style="font-size:12px;color:#888;">You're receiving this because you enabled email notifications in your Mise en Place account settings. <a href="${process.env.NEXT_PUBLIC_APP_URL ?? ''}dashboard/account">Manage notifications</a></p>
      `,
    });

    if (error) {
      console.error('[email] send failed:', error);
    }
  } catch (err) {
    console.error('[email] send error:', err);
  }
}
