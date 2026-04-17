'use client';

import { useState } from 'react';
import type { Restaurant, UserSettings, Slot } from '@/lib/types';
import StatusBar from '@/components/status-bar';
import PreferencesBar from '@/components/preferences-bar';
import AddRestaurantForm from '@/components/add-restaurant-form';
import RestaurantGrid from '@/components/restaurant-grid';

interface WatchlistClientProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialRestaurants: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialSlotMap?: Record<string, any[]>;
  settings: UserSettings;
  slotsFoundToday: number;
}

// Normalize DB snake_case to our camelCase Restaurant interface
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeRestaurant(r: any): Restaurant {
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    platform: r.platform,
    venueId: r.venue_id,
    venueSlug: r.venue_slug ?? null,
    partySize: r.party_size,
    active: r.active,
    lastChecked: r.last_checked ? new Date(r.last_checked) : null,
    createdAt: new Date(r.created_at),
  };
}

export default function WatchlistClient({
  initialRestaurants,
  initialSlotMap = {},
  settings,
  slotsFoundToday,
}: WatchlistClientProps) {
  const [restaurants, setRestaurants] = useState<Restaurant[]>(
    initialRestaurants.map(normalizeRestaurant)
  );

  function handleAdd(raw: Restaurant) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setRestaurants((prev) => [normalizeRestaurant(raw as any), ...prev]);
  }

  async function handleToggle(id: string, active: boolean) {
    const res = await fetch(`/api/restaurants/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active }),
    });
    if (res.ok) {
      setRestaurants((prev) =>
        prev.map((r) => (r.id === id ? { ...r, active } : r))
      );
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/restaurants/${id}`, { method: 'DELETE' });
    if (res.ok || res.status === 204) {
      setRestaurants((prev) => prev.filter((r) => r.id !== id));
    }
  }

  function handleVenueIdFixed(id: string, newVenueId: string) {
    setRestaurants((prev) =>
      prev.map((r) => (r.id === id ? { ...r, venueId: newVenueId } : r))
    );
  }

  const [checking, setChecking] = useState(false);
  const [checkMsg, setCheckMsg] = useState<string | null>(null);
  const [slotMap, setSlotMap] = useState<Record<string, Slot[]>>(initialSlotMap as Record<string, Slot[]>);

  async function handleCheckNow() {
    setChecking(true);
    setCheckMsg(null);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);
      const res = await fetch('/api/check-now', { method: 'POST', signal: controller.signal });
      clearTimeout(timeout);
      const data = await res.json();
      if (res.ok && Array.isArray(data)) {
        // Build slotMap from results and update last_checked timestamps
        const map: Record<string, Slot[]> = {};
        const now = new Date();
        data.forEach((r: { restaurantId: string; slots: Slot[] }) => {
          map[r.restaurantId] = r.slots;
        });
        setSlotMap(map);
        setRestaurants((prev) =>
          prev.map((r) => ({ ...r, lastChecked: now }))
        );
        const totalSlots = data.reduce((sum: number, r: { slots: Slot[] }) => sum + r.slots.length, 0);
        setCheckMsg(totalSlots > 0 ? `Found ${totalSlots} slot(s)!` : 'Check complete — no new slots in your window.');
      } else {
        setCheckMsg((data as { error?: string }).error ?? 'Something went wrong.');
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        setCheckMsg('Check is taking too long — it may still complete in the background.');
      } else {
        setCheckMsg('Network error.');
      }
    } finally {
      setChecking(false);
    }
  }

  const isEmpty = restaurants.length === 0;

  return (
    <div
      style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '32px 40px 80px',
      }}
    >
      <StatusBar
        watchingCount={restaurants.filter((r) => r.active).length}
        slotsFoundCount={slotsFoundToday}
        settings={settings}
      />

      <PreferencesBar settings={settings} />

      <AddRestaurantForm
        onAdd={handleAdd}
        onCheckNow={handleCheckNow}
        checking={checking}
        checkMsg={checkMsg}
      />

      {isEmpty ? (
        <div
          style={{
            border: '1px solid var(--border-light)',
            padding: '60px 40px',
            textAlign: 'center',
            background: 'var(--bg-muted)',
          }}
        >
          <p
            style={{
              fontFamily: 'var(--font-family-serif)',
              fontWeight: 700,
              fontSize: '24px',
              marginBottom: '8px',
              color: 'var(--text)',
            }}
          >
            You haven&rsquo;t added any restaurants yet.
          </p>
          <p
            style={{
              fontSize: '14px',
              color: 'var(--text-secondary)',
              marginBottom: '0',
            }}
          >
            Use the suggestions above to add one of NYC&rsquo;s hardest tables.
          </p>
        </div>
      ) : (
        <RestaurantGrid
          restaurants={restaurants}
          slotMap={slotMap}
          onToggle={handleToggle}
          onDelete={handleDelete}
          onVenueIdFixed={handleVenueIdFixed}
        />
      )}
    </div>
  );
}
