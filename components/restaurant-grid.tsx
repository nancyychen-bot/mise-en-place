'use client';

import type { Restaurant, Slot } from '@/lib/types';
import RestaurantCard from './restaurant-card';

interface RestaurantGridProps {
  restaurants: Restaurant[];
  slotMap?: Record<string, Slot[]>;
  onToggle: (id: string, active: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onVenueIdFixed?: (id: string, newVenueId: string) => void;
  onUpdate?: (id: string, updates: Partial<Restaurant>) => void;
}

export default function RestaurantGrid({
  restaurants,
  slotMap = {},
  onToggle,
  onDelete,
  onVenueIdFixed,
  onUpdate,
}: RestaurantGridProps) {
  return (
    <div
      style={{
        gap: '0',
        borderTop: '1px solid var(--border-hair)',
        borderLeft: '1px solid var(--border-hair)',
      }}
      className="grid grid-cols-1 min-[720px]:grid-cols-2"
    >
      {restaurants.map((r) => (
        <RestaurantCard
          key={r.id}
          restaurant={r}
          slots={slotMap[r.id] ?? []}
          onToggle={onToggle}
          onDelete={onDelete}
          onVenueIdFixed={onVenueIdFixed}
          onUpdate={onUpdate}
        />
      ))}
    </div>
  );
}
