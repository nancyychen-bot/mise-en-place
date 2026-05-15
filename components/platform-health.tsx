'use client';

import { useState, useEffect } from 'react';
import type { Platform } from '@/lib/types';

interface PlatformStatus {
  status: 'ok' | 'warning' | 'error' | 'idle';
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
  if (status === 'warning') return 'var(--tag-yellow, #f59e0b)';
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

  const issues = ALL_PLATFORMS.filter((p) => {
    const s = health[p]?.status;
    return s === 'warning' || s === 'error';
  });

  if (issues.length === 0) return null;

  return (
    <div
      style={{
        display: 'flex',
        gap: '16px',
        alignItems: 'center',
        flexWrap: 'wrap',
        padding: '8px 0',
        marginBottom: '8px',
      }}
    >
      {issues.map((platform) => {
        const entry = health[platform];
        const status = entry?.status ?? 'idle';

        return (
          <div
            key={platform}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
            title={entry?.error ? `Error: ${entry.error}` : ''}
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
                fontSize: '11px',
                fontWeight: 500,
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-family-sans)',
              }}
            >
              {PLATFORM_LABELS[platform]} issues — talk to Nancy
            </span>
          </div>
        );
      })}
    </div>
  );
}
