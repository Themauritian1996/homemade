import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { config } from '@/lib/config';
import { DEFAULT_FILTERS, FeedFilters, GeoPoint, HealthProfile } from '@/types';

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
}

interface AppState {
  user: SessionUser | null;
  onboarded: boolean;
  health: HealthProfile;
  filters: FeedFilters;
  location: GeoPoint;
  hasRealLocation: boolean;
  setUser: (u: SessionUser | null) => void;
  setOnboarded: (v: boolean) => void;
  setHealth: (h: HealthProfile) => void;
  setFilters: (f: Partial<FeedFilters>) => void;
  resetFilters: () => void;
  setLocation: (p: GeoPoint, real: boolean) => void;
}

export const useApp = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      onboarded: false,
      health: { allergens: [], diets: [], strictTraces: false },
      filters: DEFAULT_FILTERS,
      location: { latitude: config.defaultRegion.latitude, longitude: config.defaultRegion.longitude },
      hasRealLocation: false,
      setUser: (user) => set({ user }),
      setOnboarded: (onboarded) => set({ onboarded }),
      setHealth: (health) => set({ health }),
      setFilters: (f) => set((s) => ({ filters: { ...s.filters, ...f } })),
      resetFilters: () => set({ filters: DEFAULT_FILTERS }),
      setLocation: (location, hasRealLocation) => set({ location, hasRealLocation }),
    }),
    {
      name: 'homemade-app',
      storage: createJSONStorage(() => AsyncStorage),
      // La session Supabase est gérée par supabase-js ; on ne persiste ici que les préférences locales.
      partialize: (s) => ({ onboarded: s.onboarded, health: s.health, filters: s.filters, user: s.user }),
    },
  ),
);

export const activeFilterCount = (f: FeedFilters) =>
  (f.radiusKm !== DEFAULT_FILTERS.radiusKm ? 1 : 0) +
  f.cuisines.length +
  f.diets.length +
  (f.maxPriceCents != null ? 1 : 0) +
  (f.mode !== 'all' ? 1 : 0);

/** Vrai une fois l'état persistant relu (AsyncStorage est asynchrone) : évite de router avant de connaître la session. */
export function useHydrated() {
  const [hydrated, setHydrated] = useState(() => useApp.persist.hasHydrated());
  useEffect(() => {
    const unsub = useApp.persist.onFinishHydration(() => setHydrated(true));
    setHydrated(useApp.persist.hasHydrated());
    return unsub;
  }, []);
  return hydrated;
}
