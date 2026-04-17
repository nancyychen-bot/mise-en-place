'use client';

import { useState } from 'react';
import type { Restaurant, UserSettings } from '@/lib/types';
import StatusBar from '@/components/status-bar';
import PreferencesBar from '@/components/preferences-bar';
import AddRestaurantForm from '@/components/add-restaurant-form';
import RestaurantGrid from '@/components/restaurant-grid';

interface WatchlistClientProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialRestaurants: any[];
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
    partySize: r.party_size,
    active: r.active,
    lastChecked: r.last_checked ? new Date(r.last_checked) : null,
    createdAt: new Date(r.created_at),
  };
}

export default function WatchlistClient({
  initialRestaurants,
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

      <AddRestaurantForm onAdd={handleAdd} />

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
          onToggle={handleToggle}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
