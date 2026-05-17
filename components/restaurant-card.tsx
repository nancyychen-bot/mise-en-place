'use client';

import { useState } from 'react';
import type { Restaurant, Slot, Platform } from '@/lib/types';
import { fmt12h } from '@/lib/time-filter';
import PlatformTag from './platform-tag';

interface RestaurantCardProps {
  restaurant: Restaurant;
  slots?: Slot[];
  onToggle: (id: string, active: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onVenueIdFixed?: (id: string, newVenueId: string) => void;
  onUpdate?: (id: string, updates: Partial<Restaurant>) => void;
  onValidateAutoBook?: (platform: Platform) => boolean;
}

function getBookingUrl(restaurant: Restaurant, slot?: Slot): string {
  const slug = restaurant.venueSlug ?? restaurant.venueId;
  const primarySize = restaurant.partySizes?.[0] ?? restaurant.partySize;
  if (restaurant.platform === 'resy') {
    const city = restaurant.venueCity ?? 'ny';
    const base = `https://resy.com/cities/${city}/venues/${slug}`;
    return slot ? `${base}?date=${slot.date}&seats=${primarySize}` : base;
  } else if (restaurant.platform === 'opentable') {
    if (/^\d+$/.test(slug)) {
      const base = `https://www.opentable.com/booking/restref/availability?rid=${slug}&restRef=${slug}`;
      return slot
        ? `${base}&partySize=${primarySize}&date=${slot.date}&time=${encodeURIComponent(slot.time + ':00')}`
        : base;
    }
    const base = `https://www.opentable.com/r/${slug}`;
    return slot
      ? `${base}?covers=${primarySize}&dateTime=${slot.date}T${slot.time}:00`
      : base;
  } else if (restaurant.platform === 'sevenrooms') {
    const base = `https://www.sevenrooms.com/reservations/${slug}`;
    return slot
      ? `${base}?date=${slot.date}&party_size=${primarySize}`
      : base;
  } else {
    const base = `https://www.exploretock.com/${slug}`;
    return slot
      ? `${base}?date=${slot.date}&size=${primarySize}&time=${slot.time}`
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

const btnIcon: React.CSSProperties = {
  border: 'none',
  background: 'none',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  padding: '4px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'color 0.15s',
};

const timeInputStyle: React.CSSProperties = {
  fontSize: '12px',
  padding: '5px 8px',
  border: '1px solid var(--border)',
  background: 'var(--bg-muted)',
  color: 'var(--text)',
  fontFamily: 'var(--font-family-mono)',
  outline: 'none',
};

export default function RestaurantCard({
  restaurant,
  slots = [],
  onToggle,
  onDelete,
  onVenueIdFixed,
  onUpdate,
  onValidateAutoBook,
}: RestaurantCardProps) {
  const [hovered, setHovered] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [fixingId, setFixingId] = useState(false);
  const [idInput, setIdInput] = useState('');
  const [idError, setIdError] = useState('');

  const [editing, setEditing] = useState(false);
  const currentSizes = restaurant.partySizes ?? [restaurant.partySize];
  const [editName, setEditName] = useState(restaurant.name);
  const [editSizes, setEditSizes] = useState<number[]>(currentSizes);
  const [editEarliest, setEditEarliest] = useState(restaurant.earliestTime ?? '');
  const [editLatest, setEditLatest] = useState(restaurant.latestTime ?? '');
  const [editDateStart, setEditDateStart] = useState(restaurant.dateStart ?? '');
  const [editDateEnd, setEditDateEnd] = useState(restaurant.dateEnd ?? '');
  const [editAutoBook, setEditAutoBook] = useState(restaurant.autoBook ?? false);
  const [editPreferredTime, setEditPreferredTime] = useState(restaurant.preferredTime ?? '');
  const [editReleaseDays, setEditReleaseDays] = useState<string>(String(restaurant.releaseDaysAhead ?? ''));
  const [editReleaseTime, setEditReleaseTime] = useState(restaurant.releaseTime ?? '');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const hasSlots = slots.length > 0;
  const needsId = restaurant.platform === 'opentable' && !/^\d+$/.test(restaurant.venueId);

  const sizeLabel = currentSizes.length === 1
    ? `${currentSizes[0]} ${currentSizes[0] === 1 ? 'guest' : 'guests'}`
    : `${currentSizes.join(' & ')} guests`;

  function handleEditToggle() {
    setEditing((e) => !e);
    setEditName(restaurant.name);
    setEditSizes(currentSizes);
    setEditEarliest(restaurant.earliestTime ?? '');
    setEditLatest(restaurant.latestTime ?? '');
    setEditDateStart(restaurant.dateStart ?? '');
    setEditDateEnd(restaurant.dateEnd ?? '');
    setEditAutoBook(restaurant.autoBook ?? false);
    setEditPreferredTime(restaurant.preferredTime ?? '');
    setEditReleaseDays(String(restaurant.releaseDaysAhead ?? ''));
    setEditReleaseTime(restaurant.releaseTime ?? '');
  }

  function toggleEditSize(n: number) {
    setEditSizes((prev) =>
      prev.includes(n) ? (prev.length > 1 ? prev.filter((s) => s !== n) : prev) : [...prev, n].sort((a, b) => a - b)
    );
  }

  async function handleSave() {
    setSaveError('');
    if (editAutoBook && editReleaseDays && !editReleaseTime) {
      setSaveError('Release time is required when auto-book is on');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/restaurants/${restaurant.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          partySizes: editSizes,
          earliestTime: editEarliest || null,
          latestTime: editLatest || null,
          dateStart: editDateStart || null,
          dateEnd: editDateEnd || null,
          autoBook: editAutoBook,
          preferredTime: editPreferredTime || null,
          releaseDaysAhead: editReleaseDays ? parseInt(editReleaseDays) : null,
          releaseTime: editReleaseTime || null,
        }),
      });
      if (res.ok) {
        onUpdate?.(restaurant.id, {
          name: editName.trim(),
          partySizes: editSizes,
          partySize: editSizes[0],
          earliestTime: editEarliest || null,
          latestTime: editLatest || null,
          dateStart: editDateStart || null,
          dateEnd: editDateEnd || null,
          autoBook: editAutoBook,
          preferredTime: editPreferredTime || null,
          releaseDaysAhead: editReleaseDays ? parseInt(editReleaseDays) : null,
          releaseTime: editReleaseTime || null,
        });
        setEditing(false);
      }
    } finally {
      setSaving(false);
    }
  }

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
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hasSlots ? 'var(--green-light)' : 'var(--bg)',
        padding: '24px 24px 20px',
        borderRight: '1px solid var(--border-hair)',
        borderBottom: '1px solid var(--border-hair)',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        minHeight: '200px',
        transition: 'background 0.15s, transform 0.15s, box-shadow 0.15s',
        opacity: restaurant.active ? 1 : 0.55,
        animation: 'fadeIn 0.3s ease-out',
        transform: hovered ? 'translateY(-1px)' : '',
        boxShadow: hovered ? '0 2px 8px rgba(0,0,0,0.06)' : '',
      }}
    >
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
        <span style={{ fontSize: '9px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
          customize
        </span>
        <button
          onClick={handleEditToggle}
          aria-label="Edit restaurant"
          style={btnIcon}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = 'var(--text)')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)')}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M9 2L11 4L4 11H2V9L9 2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
          </svg>
        </button>

        <button
          onClick={handleToggle}
          disabled={toggling}
          aria-label={restaurant.active ? 'Pause monitoring' : 'Resume monitoring'}
          style={{
            width: '44px', height: '26px', borderRadius: '13px',
            border: restaurant.active ? '1px solid var(--tag-green)' : '1px solid var(--border)',
            background: restaurant.active ? 'var(--tag-green)' : 'var(--bg)',
            cursor: 'pointer', position: 'relative', transition: 'all 0.2s', padding: 0,
          }}
        >
          <span
            style={{
              position: 'absolute', width: '18px', height: '18px', borderRadius: '50%',
              background: restaurant.active ? 'var(--bg)' : 'var(--text)',
              top: '3px', left: restaurant.active ? '22px' : '3px', transition: 'all 0.2s',
            }}
          />
        </button>

        <button
          onClick={handleDelete}
          disabled={deleting}
          aria-label={`Remove ${restaurant.name}`}
          style={btnIcon}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = 'var(--tag-red)')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)')}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <line x1="2" y1="2" x2="12" y2="12" stroke="currentColor" strokeWidth="1.5" />
            <line x1="12" y1="2" x2="2" y2="12" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      </div>

      <PlatformTag platform={restaurant.platform} />

      {editing ? (
        <div style={{ paddingRight: '80px', marginBottom: '12px' }}>
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            style={{
              fontFamily: 'var(--font-family-serif)', fontWeight: 700, fontSize: '22px',
              letterSpacing: '-0.01em', color: 'var(--text)', background: 'var(--bg-muted)',
              border: '1px solid var(--border)', padding: '4px 8px', width: '100%',
              marginBottom: '10px', outline: 'none',
            }}
          />
          <p style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '6px' }}>
            Party Sizes
          </p>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '10px' }}>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => toggleEditSize(n)}
                style={{
                  width: '30px', height: '30px', fontSize: '12px', fontWeight: 600,
                  border: '1px solid var(--border)',
                  background: editSizes.includes(n) ? 'var(--text)' : 'var(--bg)',
                  color: editSizes.includes(n) ? 'var(--bg)' : 'var(--text)',
                  cursor: 'pointer', fontFamily: 'var(--font-family-sans)',
                }}
              >
                {n}
              </button>
            ))}
          </div>
          <p style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '6px' }}>
            Time Window <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: '0' }}>(leave blank for global)</span>
          </p>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '10px' }}>
            <input
              type="time"
              value={editEarliest}
              onChange={(e) => setEditEarliest(e.target.value)}
              style={timeInputStyle}
            />
            <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>–</span>
            <input
              type="time"
              value={editLatest}
              onChange={(e) => setEditLatest(e.target.value)}
              style={timeInputStyle}
            />
            {(editEarliest || editLatest) && (
              <button
                type="button"
                onClick={() => { setEditEarliest(''); setEditLatest(''); }}
                style={{
                  fontSize: '10px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
                  padding: '4px 8px', background: 'none', color: 'var(--text-muted)',
                  border: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'var(--font-family-sans)',
                }}
              >
                Clear
              </button>
            )}
          </div>
          <p style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '6px' }}>
            Date Range <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: '0' }}>(leave blank for global)</span>
          </p>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '10px' }}>
            <input
              type="date"
              value={editDateStart}
              onChange={(e) => setEditDateStart(e.target.value)}
              style={timeInputStyle}
            />
            <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>–</span>
            <input
              type="date"
              value={editDateEnd}
              onChange={(e) => setEditDateEnd(e.target.value)}
              style={timeInputStyle}
            />
            {(editDateStart || editDateEnd) && (
              <button
                type="button"
                onClick={() => { setEditDateStart(''); setEditDateEnd(''); }}
                style={{
                  fontSize: '10px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
                  padding: '4px 8px', background: 'none', color: 'var(--text-muted)',
                  border: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'var(--font-family-sans)',
                }}
              >
                Clear
              </button>
            )}
          </div>
          {restaurant.platform !== 'tock' && restaurant.platform !== 'sevenrooms' && (
            <>
              <p style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '6px' }}>
                Auto-Book
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <button
                  type="button"
                  onClick={() => {
                    if (!editAutoBook) {
                      if (!onValidateAutoBook?.(restaurant.platform)) return;
                    }
                    setEditAutoBook(!editAutoBook);
                  }}
                  style={{
                    width: '44px', height: '26px', borderRadius: '13px',
                    border: editAutoBook ? '1px solid var(--tag-green)' : '1px solid var(--border)',
                    background: editAutoBook ? 'var(--tag-green)' : 'var(--bg)',
                    cursor: 'pointer', position: 'relative', transition: 'all 0.2s', padding: 0,
                  }}
                >
                  <span
                    style={{
                      position: 'absolute', width: '18px', height: '18px', borderRadius: '50%',
                      background: editAutoBook ? 'var(--bg)' : 'var(--text)',
                      top: '3px', left: editAutoBook ? '22px' : '3px', transition: 'all 0.2s',
                    }}
                  />
                </button>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {editAutoBook ? 'Will auto-book best slot' : 'Notify only'}
                </span>
              </div>
              {editAutoBook && (
                <>
                  <p style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '6px' }}>
                    Preferred Time <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: '0' }}>(books closest match)</span>
                  </p>
                  <input
                    type="time"
                    value={editPreferredTime}
                    onChange={(e) => setEditPreferredTime(e.target.value)}
                    style={{ ...timeInputStyle, marginBottom: '10px' }}
                  />
                </>
              )}
              <p style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '6px' }}>
                Release Schedule <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: '0' }}>(when new reservations drop)</span>
              </p>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '10px' }}>
                <input
                  type="number"
                  min="1"
                  max="90"
                  value={editReleaseDays}
                  onChange={(e) => setEditReleaseDays(e.target.value)}
                  placeholder="14"
                  style={{ ...timeInputStyle, width: '60px' }}
                />
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>days ahead at</span>
                <input
                  type="time"
                  value={editReleaseTime}
                  onChange={(e) => setEditReleaseTime(e.target.value)}
                  style={timeInputStyle}
                />
              </div>
            </>
          )}
          {saveError && (
            <p style={{ fontSize: '11px', color: 'var(--tag-red)', fontWeight: 600, marginBottom: '6px' }}>
              {saveError}
            </p>
          )}
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={handleSave}
              disabled={saving || !editName.trim()}
              style={{
                fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                padding: '5px 12px', background: 'var(--text)', color: 'var(--bg)',
                border: 'none', cursor: 'pointer', fontFamily: 'var(--font-family-sans)',
              }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => setEditing(false)}
              style={{
                fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
                padding: '5px 12px', background: 'none', color: 'var(--text-secondary)',
                border: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'var(--font-family-sans)',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <h3
            style={{
              fontFamily: 'var(--font-family-serif)', fontWeight: 700, fontSize: '24px',
              lineHeight: 1.1, letterSpacing: '-0.01em', color: 'var(--text)',
              marginBottom: '10px', wordBreak: 'break-word', paddingRight: '80px',
            }}
          >
            {restaurant.name}
          </h3>
          <p
            style={{
              fontSize: '11px', letterSpacing: '0.04em', color: 'var(--text-muted)',
              textTransform: 'uppercase', marginBottom: '4px', fontWeight: 500,
            }}
          >
            {sizeLabel} · ID {restaurant.venueId} · Checked{' '}
            {formatRelativeTime(restaurant.lastChecked)}
          </p>
          {(() => {
            const parts: string[] = [];
            if (restaurant.earliestTime && restaurant.latestTime) {
              parts.push(`${fmt12h(restaurant.earliestTime)}–${fmt12h(restaurant.latestTime)}`);
            }
            if (restaurant.dateStart && restaurant.dateEnd) {
              parts.push(`${restaurant.dateStart.slice(5).replace('-', '/')}–${restaurant.dateEnd.slice(5).replace('-', '/')}`);
            }
            if (restaurant.autoBook) {
              parts.push(`Auto-book ${restaurant.preferredTime ? fmt12h(restaurant.preferredTime) : 'earliest'}`);
            }
            if (restaurant.releaseDaysAhead && restaurant.releaseTime) {
              parts.push(`Releases ${restaurant.releaseDaysAhead}d at ${fmt12h(restaurant.releaseTime)}`);
            }
            return parts.length > 0 ? (
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '12px', fontWeight: 500 }}>
                {parts.join(' · ')}
              </p>
            ) : <div style={{ marginBottom: '12px' }} />;
          })()}
        </>
      )}

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
                fontSize: '12px', padding: '5px 8px', border: '1px solid var(--border-light)',
                background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-family-mono)',
                outline: 'none', width: '180px',
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
            <>Find it: <a href={`view-source:https://www.opentable.com/r/${restaurant.venueSlug ?? restaurant.venueId}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-secondary)', textDecoration: 'underline' }}>View page source</a> → search for <strong>&ldquo;rid&rdquo;</strong></>
          </p>
        </div>
      )}

      {hasSlots ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: 'auto', paddingTop: '12px' }}>
          {slots.map((slot) => (
            <a
              key={`${slot.date}-${slot.time}`}
              href={getBookingUrl(restaurant, slot)}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontFamily: 'var(--font-family-mono)', fontSize: '12px', fontWeight: 500,
                padding: '5px 10px', background: 'var(--tag-green)', color: 'var(--bg)',
                letterSpacing: '0.02em', animation: 'slotIn 0.3s ease-out',
                textDecoration: 'none', cursor: 'pointer',
              }}
            >
              {slot.date.slice(5).replace('-', '/')} {slot.displayTime}
            </a>
          ))}
        </div>
      ) : (
        <p style={{ marginTop: 'auto', paddingTop: '12px', fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-muted)', opacity: 0.4, animation: 'slotIn 1.5s ease-in-out infinite alternate', flexShrink: 0 }} />
          Watching for openings
        </p>
      )}
    </div>
  );
}
