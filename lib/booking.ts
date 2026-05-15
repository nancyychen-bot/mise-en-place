import type { Slot } from './types';

export function pickBestSlot(slots: Slot[], preferredTime: string | null): Slot | null {
  if (slots.length === 0) return null;
  if (!preferredTime) return slots.sort((a, b) => a.time.localeCompare(b.time))[0];

  return slots.reduce((best, slot) => {
    const bestDiff = Math.abs(timeToMinutes(best.time) - timeToMinutes(preferredTime));
    const slotDiff = Math.abs(timeToMinutes(slot.time) - timeToMinutes(preferredTime));
    return slotDiff < bestDiff ? slot : best;
  });
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}
