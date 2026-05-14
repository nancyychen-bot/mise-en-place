'use client';

import { useState, useEffect } from 'react';
import type { Platform } from '@/lib/types';

interface PlatformStatus {
  status: 'ok' | 'error' | 'idle';
  lastChecked: string | null;
  error?: string;
}

const PLATFORM_LABELS: Record<Platform, string> = {
  resy: 'Resy',
  opentable: 'OpenTable',
  sevenrooms: 'SevenRooms',
  tock: 'Tock',
};

const ALL_PLATFORMS: Platform[] = ['resy', 'opentable', 'sevenrooms', 'tock'];

function dotColor(status: string): string {
  if (status === 'ok') return 'var(--tag-green)';
  if (status === 'error') return 'var(--tag-red)';
  return 'var(--text-muted)';
}

export default function PlatformHealth() {
  const [health, setHealth] = useState<Record<string, PlatformStatus> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchHealth() {
      try {
        const res = await fetch('/api/platform-health');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setHealth(data);
      } catch {
        // silently ignore fetch errors
      }
    }

    fetchHealth();
    const interval = setInterval(fetchHealth, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (!health) return null;

  return (
    <div
      style={{
        width: '100%',
        borderBottom: '1px solid var(--border-hair)',
        padding: '16px 0',
        marginBottom: '24px',
        display: 'flex',
        gap: '20px',
        alignItems: 'center',
        flexWrap: 'wrap',
      }}
    >
      {ALL_PLATFORMS.map((platform) => {
        const entry = health[platform];
        const status = entry?.status ?? 'idle';

        return (
          <div
            key={platform}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
            title={
              status === 'error' && entry?.error
                ? `Error: ${entry.error}`
                : status === 'idle'
                  ? 'No active restaurants'
                  : entry?.lastChecked
                    ? `Last checked: ${new Date(entry.lastChecked).toLocaleString()}`
                    : ''
            }
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: dotColor(status),
                display: 'inline-block',
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: '10px',
                fontWeight: 600,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-family-sans)',
              }}
            >
              {PLATFORM_LABELS[platform]}
            </span>
          </div>
        );
      })}
    </div>
  );
}
