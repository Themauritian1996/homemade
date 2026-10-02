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
  /** Plats mis de côté (❤︎) sur ce téléphone. */
  favorites: string[];
  /** Messages non lus (toutes conversations) : pastille de l'onglet Messages. Non persisté. */
  unread: number;
  /** Langue de l'interface (français par défaut, Charte de la langue française). Conservée à la déconnexion. */
  lang: 'fr' | 'en';
  /** Dernier courriel utilisé pour se connecter : pré-rempli à la prochaine connexion. Conservé à la déconnexion. */
  lastEmail: string;
  /** Apparence : selon le téléphone (auto), claire ou sombre. Conservée à la déconnexion. */
  themeMode: 'auto' | 'light' | 'dark';
  setLang: (lang: 'fr' | 'en') => void;
  setThemeMode: (mode: 'auto' | 'light' | 'dark') => void;
  /** Notifications de messages et de commandes (copie locale de la préférence du compte). */
  notifyMessages: boolean;
  setNotifyMessages: (v: boolean) => void;
  setLastEmail: (email: string) => void;
  setUnread: (n: number) => void;
  setUser: (u: SessionUser | null) => void;
  setOnboarded: (v: boolean) => void;
  setHealth: (h: HealthProfile) => void;
  setFilters: (f: Partial<FeedFilters>) => void;
  resetFilters: () => void;
  setLocation: (p: GeoPoint, real: boolean) => void;
  toggleFavorite: (mealId: string) => void;
  /** Déconnexion : rien du compte précédent ne doit fuiter vers le suivant (profil santé, onboarding, favoris). */
  resetSession: () => void;
}

const EMPTY_HEALTH: HealthProfile = { allergens: [], diets: [], strictTraces: false };

export const useApp = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      onboarded: false,
      health: EMPTY_HEALTH,
      filters: DEFAULT_FILTERS,
      location: { latitude: config.defaultRegion.latitude, longitude: config.defaultRegion.longitude },
      hasRealLocation: false,
      favorites: [],
      unread: 0,
      lang: 'fr',
      lastEmail: '',
      themeMode: 'auto',
      setLang: (lang) => set({ lang }),
      setThemeMode: (themeMode) => set({ themeMode }),
      notifyMessages: true,
      setNotifyMessages: (notifyMessages) => set({ notifyMessages }),
      setLastEmail: (lastEmail) => set({ lastEmail }),
      setUnread: (unread) => set({ unread }),
      setUser: (user) => set({ user }),
      setOnboarded: (onboarded) => set({ onboarded }),
      setHealth: (health) => set({ health }),
      setFilters: (f) => set((s) => ({ filters: { ...s.filters, ...f } })),
      resetFilters: () => set({ filters: DEFAULT_FILTERS }),
      setLocation: (location, hasRealLocation) => set({ location, hasRealLocation }),
      toggleFavorite: (id) => set((s) => ({ favorites: s.favorites.includes(id) ? s.favorites.filter((x) => x !== id) : [id, ...s.favorites].slice(0, 100) })),
      resetSession: () => set({ user: null, onboarded: false, health: EMPTY_HEALTH, favorites: [], unread: 0 }),
    }),
    {
      name: 'homemade-app',
      storage: createJSONStorage(() => AsyncStorage),
      // La session Supabase est gérée par supabase-js ; on ne persiste ici que les préférences locales.
      partialize: (s) => ({ onboarded: s.onboarded, health: s.health, filters: s.filters, user: s.user, favorites: s.favorites, lang: s.lang, lastEmail: s.lastEmail, themeMode: s.themeMode, notifyMessages: s.notifyMessages }),
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
