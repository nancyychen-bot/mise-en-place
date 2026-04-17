import type { NtfyPriority } from './types';

/**
 * Sends a push notification via ntfy.sh.
 * Never throws — log and swallow so a notification failure can't crash the checker.
 */
export async function sendNotification(
  topic: string,
  title: string,
  message: string,
  priority: NtfyPriority = 'default',
  clickUrl?: string
): Promise<void> {
  try {
    const headers: Record<string, string> = {
      Title: title,
      Priority: priority,
      Tags: 'fork_and_knife',
      'Content-Type': 'text/plain',
    };

    if (clickUrl) {
      headers['Click'] = clickUrl;
    }

    const res = await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
      method: 'POST',
      headers,
      body: message,
    });

    if (!res.ok) {
      console.error(`[ntfy] send failed: ${res.status} ${await res.text()}`);
    }
  } catch (err) {
    console.error('[ntfy] send error:', err);
  }
}
