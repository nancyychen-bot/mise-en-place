'use client';

import { useState, useEffect, useCallback } from 'react';
import { BtnSecondary } from '@/components/buttons';

interface LogItem {
  id: string;
  restaurant_id: string | null;
  type: string;
  message: string;
  created_at: string;
}

const TAG_COLORS: Record<string, string> = {
  check: 'var(--text-muted)',
  found: 'var(--tag-green)',
  notify: 'var(--tag-orange)',
  system: 'var(--tag-blue)',
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export default function ActivityPage() {
  const [items, setItems] = useState<LogItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  const loadItems = useCallback(async (cursor?: string) => {
    const url = cursor ? `/api/activity?cursor=${encodeURIComponent(cursor)}` : '/api/activity';
    const res = await fetch(url);
    const data = await res.json();
    return data as { items: LogItem[]; nextCursor: string | null };
  }, []);

  useEffect(() => {
    loadItems().then(({ items: i, nextCursor: nc }) => {
      setItems(i);
      setNextCursor(nc);
      setLoading(false);
    });
  }, [loadItems]);

  async function loadMore() {
    if (!nextCursor) return;
    const { items: more, nextCursor: nc } = await loadItems(nextCursor);
    setItems((prev) => [...prev, ...more]);
    setNextCursor(nc);
  }

  async function handleCheckNow() {
    setChecking(true);
    await fetch('/api/check-now', { method: 'POST' });
    // Reload log
    const { items: i, nextCursor: nc } = await loadItems();
    setItems(i);
    setNextCursor(nc);
    setChecking(false);
  }

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 40px 80px' }}>
      {/* Section header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: '24px',
          paddingBottom: '16px',
          borderBottom: '2px solid var(--border)',
        }}
      >
        <h2
          style={{
            fontFamily: 'var(--font-family-serif)',
            fontWeight: 900,
            fontSize: '32px',
            letterSpacing: '-0.01em',
          }}
        >
          Activity Log
        </h2>
        <BtnSecondary small onClick={handleCheckNow} disabled={checking}>
          {checking ? (
            <>
              <span
                style={{
                  display: 'inline-block',
                  width: '10px',
                  height: '10px',
                  border: '2px solid currentColor',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }}
              />
              Checking…
            </>
          ) : (
            'Run Check Now'
          )}
        </BtnSecondary>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Loading…</p>
      ) : items.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', fontStyle: 'italic' }}>
          No activity yet. Click &ldquo;Run Check Now&rdquo; to start.
        </p>
      ) : (
        <>
          {items.map((item) => (
            <div
              key={item.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '60px 60px 1fr',
                gap: '12px',
                padding: '14px 0',
                borderBottom: '1px solid var(--border-hair)',
                alignItems: 'start',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-family-mono)',
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                  letterSpacing: '0.02em',
                  paddingTop: '1px',
                }}
              >
                {formatTime(item.created_at)}
              </span>

              <span
                style={{
                  fontSize: '9px',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--bg)',
                  background: TAG_COLORS[item.type] ?? 'var(--text-muted)',
                  padding: '3px 6px',
                  textAlign: 'center',
                  alignSelf: 'start',
                  whiteSpace: 'nowrap',
                  display: 'inline-block',
                }}
              >
                {item.type}
              </span>

              <span
                style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.5 }}
                dangerouslySetInnerHTML={{ __html: item.message }}
              />
            </div>
          ))}

          {nextCursor && (
            <div style={{ marginTop: '24px', textAlign: 'center' }}>
              <BtnSecondary small onClick={loadMore}>
                Load More
              </BtnSecondary>
            </div>
          )}
        </>
      )}
    </div>
  );
}
