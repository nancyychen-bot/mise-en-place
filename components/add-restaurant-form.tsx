'use client';

import { useState } from 'react';
import type { Restaurant, Platform } from '@/lib/types';
import { BtnPrimary, BtnSecondary } from './buttons';

interface Suggestion {
  name: string;
  platform: Platform;
  venueIdOrUrl: string;
  partySizes: number[];
}

const SUGGESTIONS: Suggestion[] = [
  { name: "Four Horsemen", platform: "resy", venueIdOrUrl: "https://resy.com/cities/ny/venues/four-horsemen", partySizes: [2] },
  { name: "Theodora", platform: "resy", venueIdOrUrl: "https://resy.com/cities/ny/venues/theodora", partySizes: [2] },
  { name: "Atomix", platform: "resy", venueIdOrUrl: "https://resy.com/cities/ny/venues/atomix", partySizes: [2] },
  { name: "Bistrot Ha", platform: "resy", venueIdOrUrl: "https://resy.com/cities/ny/venues/bistrot-ha", partySizes: [2] },
  { name: "I Cavallini", platform: "resy", venueIdOrUrl: "https://resy.com/cities/ny/venues/i-cavallini", partySizes: [2] },
  { name: "Le Veau d'Or", platform: "opentable", venueIdOrUrl: "220387", partySizes: [2] },
  { name: "Bridges", platform: "resy", venueIdOrUrl: "https://resy.com/cities/ny/venues/bridges", partySizes: [2] },
  { name: "Sunn's", platform: "opentable", venueIdOrUrl: "1428529", partySizes: [2] },
  { name: "Red Hook Tavern", platform: "opentable", venueIdOrUrl: "1048522", partySizes: [2] },
  { name: "Thai Diner", platform: "resy", venueIdOrUrl: "49453", partySizes: [2] },
  { name: "I Sodi", platform: "resy", venueIdOrUrl: "443", partySizes: [2] },
];

interface AddRestaurantFormProps {
  onAdd: (restaurant: Restaurant) => void;
  onCheckNow?: () => void;
  checking?: boolean;
  checkMsg?: string | null;
}

export default function AddRestaurantForm({ onAdd, onCheckNow, checking, checkMsg }: AddRestaurantFormProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [platform, setPlatform] = useState<Platform>('resy');
  const [venueIdOrUrl, setVenueIdOrUrl] = useState('');
  const [partySizes, setPartySizes] = useState<number[]>([2]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function togglePartySize(n: number) {
    setPartySizes((prev) =>
      prev.includes(n) ? (prev.length > 1 ? prev.filter((s) => s !== n) : prev) : [...prev, n].sort((a, b) => a - b)
    );
  }

  function prefill(s: Suggestion) {
    setOpen(true);
    setName(s.name);
    setPlatform(s.platform);
    setVenueIdOrUrl(s.venueIdOrUrl);
    setPartySizes(s.partySizes);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/restaurants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, platform, venueIdOrUrl, partySizes }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to add restaurant');
        return;
      }

      onAdd(data);
      setOpen(false);
      setName('');
      setVenueIdOrUrl('');
      setPlatform('resy');
      setPartySizes([2]);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '10px',
    fontWeight: 600,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: 'var(--text-secondary)',
    marginBottom: '6px',
  };

  return (
    <div>
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
          Your Watchlist
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {onCheckNow && (
            <BtnSecondary small onClick={onCheckNow} disabled={checking}>
              {checking ? 'Checking…' : 'Check Now'}
            </BtnSecondary>
          )}
          <BtnPrimary small onClick={() => setOpen((o) => !o)}>
            {open ? '— Cancel' : '+ Add Restaurant'}
          </BtnPrimary>
        </div>
      </div>
      {checkMsg && (
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>{checkMsg}</p>
      )}

      {/* Slide-down form */}
      {open && (
        <div
          style={{
            border: '1px solid var(--border)',
            padding: '32px',
            marginBottom: '32px',
            background: 'var(--bg-muted)',
            animation: 'slideIn 0.3s ease-out',
          }}
        >
          <p
            style={{
              fontFamily: 'var(--font-family-serif)',
              fontWeight: 700,
              fontSize: '22px',
              marginBottom: '4px',
            }}
          >
            Add a Restaurant
          </p>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px' }}>
            Paste a Resy, OpenTable, SevenRooms, or Tock URL and we&apos;ll extract the venue automatically.
          </p>

          <form onSubmit={handleSubmit}>
            {/* Row 1: Name (full width) */}
            <div style={{ marginBottom: '16px' }}>
              <label htmlFor="r-name" style={labelStyle}>
                Restaurant Name
              </label>
              <input
                id="r-name"
                type="text"
                required
                className="form-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Don Angie"
              />
            </div>

            {/* Row 2: Platform / Venue / Party size */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '16px',
                marginBottom: '20px',
              }}
              className="max-[720px]:grid-cols-1"
            >
              <div>
                <label htmlFor="r-platform" style={labelStyle}>
                  Platform
                </label>
                <select
                  id="r-platform"
                  className="form-select"
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value as Platform)}
                >
                  <option value="resy">Resy</option>
                  <option value="opentable">OpenTable</option>
                  <option value="sevenrooms">SevenRooms</option>
                  <option value="tock">Tock</option>
                </select>
              </div>

              <div>
                <label htmlFor="r-venue" style={labelStyle}>
                  Venue URL or ID
                </label>
                <input
                  id="r-venue"
                  type="text"
                  required
                  className="form-input"
                  value={venueIdOrUrl}
                  onChange={(e) => setVenueIdOrUrl(e.target.value)}
                  placeholder={
                    platform === 'opentable'
                      ? 'Numeric RID (e.g. 55048)'
                      : platform === 'sevenrooms'
                      ? 'sevenrooms.com/reservations/… or slug'
                      : platform === 'tock'
                      ? 'exploretock.com/… or slug'
                      : 'resy.com/cities/ny/… or venue ID'
                  }
                />
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  {platform === 'opentable'
                    ? <>Due to OpenTable&apos;s system, you have to enter the numeric ID directly. To find it: open the restaurant page, right-click and open &ldquo;View Page Source&rdquo;, then CTRL-F search for &ldquo;rid&rdquo; and copy and paste that numeric ID. I know it&apos;s annoying, but blame OpenTable!</>
                    : platform === 'sevenrooms'
                    ? <>Paste the full SevenRooms URL &mdash; we&apos;ll extract the venue slug automatically.</>
                    : platform === 'tock'
                    ? <>Paste the full Tock URL &mdash; we&apos;ll extract the venue slug automatically.</>
                    : <>Paste the full URL &mdash; we&apos;ll extract the ID automatically.</>}
                </p>
              </div>

              <div>
                <label style={labelStyle}>Party Size</label>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => togglePartySize(n)}
                      style={{
                        width: '36px', height: '36px', fontSize: '13px', fontWeight: 600,
                        border: '1px solid var(--border)',
                        background: partySizes.includes(n) ? 'var(--text)' : 'var(--bg)',
                        color: partySizes.includes(n) ? 'var(--bg)' : 'var(--text)',
                        cursor: 'pointer', fontFamily: 'var(--font-family-sans)',
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Select all sizes you want to monitor
                </p>
              </div>
            </div>

            {error && (
              <p
                style={{
                  fontSize: '13px',
                  color: 'var(--tag-red)',
                  background: 'var(--red-light)',
                  padding: '10px 14px',
                  borderLeft: '3px solid var(--tag-red)',
                  marginBottom: '16px',
                }}
              >
                {error}
              </p>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <BtnSecondary small type="button" onClick={() => setOpen(false)}>
                Cancel
              </BtnSecondary>
              <BtnPrimary small type="submit" disabled={loading}>
                {loading ? 'Adding…' : 'Add to Watchlist'}
              </BtnPrimary>
            </div>
          </form>
        </div>
      )}

      {/* Suggestions (shown when no open form and implicitly when empty) */}
      {!open && (
        <div
          style={{
            background: 'var(--bg-muted)',
            border: '1px solid var(--border-light)',
            padding: '20px 24px',
            marginBottom: '24px',
            display: 'flex',
            gap: '12px',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
            }}
          >
            Quick add:
          </span>
          {SUGGESTIONS.map((s) => (
            <button
              key={s.name}
              onClick={() => prefill(s)}
              style={{
                border: '1px solid var(--border-light)',
                background: 'var(--bg)',
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: 500,
                color: 'var(--text)',
                cursor: 'pointer',
                fontFamily: 'var(--font-family-sans)',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'var(--text)';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--bg)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg)';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)';
              }}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
