'use client';

import { useState } from 'react';
import type { Restaurant, Slot } from '@/lib/types';
import PlatformTag from './platform-tag';

interface RestaurantCardProps {
  restaurant: Restaurant;
  slots?: Slot[];
  onToggle: (id: string, active: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onVenueIdFixed?: (id: string, newVenueId: string) => void;
}

function getBookingUrl(restaurant: Restaurant, slot?: Slot): string {
  const slug = restaurant.venueSlug ?? restaurant.venueId;
  if (restaurant.platform === 'resy') {
    const base = `https://resy.com/cities/ny/venues/${slug}`;
    return slot ? `${base}?date=${slot.date}&seats=${restaurant.partySize}` : base;
  } else if (restaurant.platform === 'opentable') {
    const base = `https://www.opentable.com/r/${slug}`;
    return slot
      ? `${base}?covers=${restaurant.partySize}&dateTime=${slot.date}T${slot.time}:00`
      : base;
  } else if (restaurant.platform === 'sevenrooms') {
    const base = `https://www.sevenrooms.com/reservations/${slug}`;
    return slot
      ? `${base}?date=${slot.date}&party_size=${restaurant.partySize}`
      : base;
  } else {
    // tock
    const base = `https://www.exploretock.com/${slug}`;
    return slot
      ? `${base}?date=${slot.date}&size=${restaurant.partySize}&time=${slot.time}`
      : base;
  }
}

function formatRelativeTime(date: Date | null): string {
  if (!date) return 'Never';
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function RestaurantCard({
  restaurant,
  slots = [],
  onToggle,
  onDelete,
  onVenueIdFixed,
}: RestaurantCardProps) {
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [fixingId, setFixingId] = useState(false);
  const [idInput, setIdInput] = useState('');
  const [idError, setIdError] = useState('');
  const hasSlots = slots.length > 0;
  const needsId = restaurant.platform === 'opentable' && !/^\d+$/.test(restaurant.venueId);

  async function handleToggle() {
    setToggling(true);
    try {
      await onToggle(restaurant.id, !restaurant.active);
    } finally {
      setToggling(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Remove ${restaurant.name} from your watchlist?`)) return;
    setDeleting(true);
    try {
      await onDelete(restaurant.id);
    } finally {
      setDeleting(false);
    }
  }

  async function handleFixId() {
    const numericId = idInput.trim();
    if (!/^\d+$/.test(numericId)) { setIdError('Enter a numeric ID only'); return; }
    setIdError('');
    setFixingId(true);
    try {
      const res = await fetch('/api/admin/fix-venue-ids', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [restaurant.venueId]: numericId }),
      });
      if (res.ok) {
        onVenueIdFixed?.(restaurant.id, numericId);
        setIdInput('');
      } else {
        setIdError('Save failed');
      }
    } catch {
      setIdError('Network error');
    } finally {
      setFixingId(false);
    }
  }

  return (
    <div
      style={{
        background: hasSlots
          ? 'var(--green-light)'
          : 'var(--bg)',
        padding: '24px 24px 20px',
        borderRight: '1px solid var(--border-hair)',
        borderBottom: '1px solid var(--border-hair)',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        minHeight: '200px',
        transition: 'background 0.15s',
        opacity: restaurant.active ? 1 : 0.55,
      }}
    >
      {/* Card controls */}
      <div
        style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          display: 'flex',
          gap: '4px',
          alignItems: 'center',
        }}
      >
        {/* Toggle */}
        <button
          onClick={handleToggle}
          disabled={toggling}
          aria-label={restaurant.active ? 'Pause monitoring' : 'Resume monitoring'}
          style={{
            width: '32px',
            height: '18px',
            borderRadius: '9px',
            border: restaurant.active
              ? '1px solid var(--tag-green)'
              : '1px solid var(--border)',
            background: restaurant.active ? 'var(--tag-green)' : 'var(--bg)',
            cursor: 'pointer',
            position: 'relative',
            transition: 'all 0.2s',
            padding: 0,
          }}
        >
          <span
            style={{
              position: 'absolute',
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              background: restaurant.active ? 'var(--bg)' : 'var(--text)',
              top: '2px',
              left: restaurant.active ? '16px' : '2px',
              transition: 'all 0.2s',
            }}
          />
        </button>

        {/* Delete */}
        <button
          onClick={handleDelete}
          disabled={deleting}
          aria-label={`Remove ${restaurant.name}`}
          style={{
            border: 'none',
            background: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'color 0.15s',
          }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.color = 'var(--tag-red)')
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)')
          }
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <line x1="2" y1="2" x2="12" y2="12" stroke="currentColor" strokeWidth="1.5" />
            <line x1="12" y1="2" x2="2" y2="12" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      </div>

      <PlatformTag platform={restaurant.platform} />

      <h3
        style={{
          fontFamily: 'var(--font-family-serif)',
          fontWeight: 700,
          fontSize: '24px',
          lineHeight: 1.1,
          letterSpacing: '-0.01em',
          color: 'var(--text)',
          marginBottom: '10px',
          wordBreak: 'break-word',
          paddingRight: '60px',
        }}
      >
        {restaurant.name}
      </h3>

      <p
        style={{
          fontSize: '11px',
          letterSpacing: '0.04em',
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          marginBottom: '12px',
          fontWeight: 500,
        }}
      >
        {restaurant.partySize} guests · ID {restaurant.venueId} · Checked{' '}
        {formatRelativeTime(restaurant.lastChecked)}
      </p>

      {needsId && (
        <div style={{ marginBottom: '12px' }}>
          <p style={{ fontSize: '11px', color: 'var(--tag-red)', fontWeight: 600, marginBottom: '6px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            ⚠ Numeric ID needed to check availability
          </p>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Paste numeric ID (e.g. 55048)"
              value={idInput}
              onChange={(e) => setIdInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleFixId()}
              style={{
                fontSize: '12px',
                padding: '5px 8px',
                border: '1px solid var(--border-light)',
                background: 'var(--bg)',
                color: 'var(--text)',
                fontFamily: 'var(--font-family-mono)',
                outline: 'none',
                width: '180px',
              }}
            />
            <button
              onClick={handleFixId}
              disabled={fixingId}
              style={{
                fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em',
                textTransform: 'uppercase', padding: '5px 10px',
                background: 'var(--text)', color: 'var(--bg)',
                border: 'none', cursor: 'pointer', fontFamily: 'var(--font-family-sans)',
              }}
            >
              {fixingId ? 'Saving…' : 'Save'}
            </button>
          </div>
          {idError && <p style={{ fontSize: '11px', color: 'var(--tag-red)', marginTop: '4px' }}>{idError}</p>}
          <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
            {restaurant.platform === 'opentable' ? (
              <>Find it: <a href={`view-source:https://www.opentable.com/r/${restaurant.venueSlug ?? restaurant.venueId}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-secondary)', textDecoration: 'underline' }}>View page source</a> → search for <strong>&ldquo;rid&rdquo;</strong></>
            ) : (
              <>Find it: open the Resy page → View Page Source → search for <strong>&ldquo;rid&rdquo;</strong></>
            )}
          </p>
        </div>
      )}

      {hasSlots ? (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '6px',
            marginTop: 'auto',
            paddingTop: '12px',
          }}
        >
          {slots.map((slot) => (
            <a
              key={`${slot.date}-${slot.time}`}
              href={getBookingUrl(restaurant, slot)}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontFamily: 'var(--font-family-mono)',
                fontSize: '12px',
                fontWeight: 500,
                padding: '5px 10px',
                background: 'var(--tag-green)',
                color: 'var(--bg)',
                letterSpacing: '0.02em',
                animation: 'slotIn 0.3s ease-out',
                textDecoration: 'none',
                cursor: 'pointer',
              }}
            >
              {slot.date.slice(5).replace('-', '/')} {slot.displayTime}
            </a>
            ))}
        </div>
      ) : (
        <p
          style={{
            marginTop: 'auto',
            paddingTop: '12px',
            fontSize: '11px',
            color: 'var(--text-muted)',
            letterSpacing: '0.04em',
            fontStyle: 'italic',
          }}
        >
          No slots in your window
        </p>
      )}
    </div>
  );
}
