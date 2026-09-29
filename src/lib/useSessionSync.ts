/**
 * Synchronisations de fond tant que l'utilisateur est dans l'app (onglets) :
 *  - position : rafraîchie à l'ouverture si la permission est déjà accordée (sans redemander) ;
 *  - messages non lus : au démarrage, au retour au premier plan, à chaque nouveau message (Realtime) et chaque minute.
 */
import * as Location from 'expo-location';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { refreshUnread, subscribeToMyMessages } from '@/services/chat';
import { useApp } from '@/store/app';

export function useSessionSync() {
  const userId = useApp((s) => s.user?.id);

  useEffect(() => {
    let alive = true;
    (async () => {
      const perm = await Location.getForegroundPermissionsAsync();
      if (perm.status !== 'granted') return;
      const pos = (await Location.getLastKnownPositionAsync()) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      if (alive && pos) useApp.getState().setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }, true);
    })().catch(() => {});
    return () => {
      alive = false;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const load = () => {
      refreshUnread().catch(() => {});
    };
    load();
    const unsubscribe = subscribeToMyMessages(load);
    const appState = AppState.addEventListener('change', (s) => s === 'active' && load());
    const timer = setInterval(load, 60_000);
    return () => {
      unsubscribe();
      appState.remove();
      clearInterval(timer);
    };
  }, [userId]);
}
