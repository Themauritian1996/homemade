import { useCallback, useEffect, useState } from 'react';
import { fetchFeed, FeedResult } from '@/services/meals';
import { useApp } from '@/store/app';

/** Fil de repas partagé par l'onglet Découvrir et la Carte ; se recharge quand filtres/position/profil santé changent. */
export function useFeed() {
  const filters = useApp((s) => s.filters);
  const location = useApp((s) => s.location);
  const health = useApp((s) => s.health);
  const [data, setData] = useState<FeedResult>({ meals: [], hiddenForHealth: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      setData(await fetchFeed(filters, location, health));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [filters, location, health]);

  useEffect(() => {
    load();
  }, [load]);

  return { ...data, loading, error, reload: load };
}
