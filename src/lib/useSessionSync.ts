/**
 * Synchronisations de fond tant que l'utilisateur est dans l'app (onglets) :
 *  - position : rafraîchie à l'ouverture si la permission est déjà accordée (sans redemander) ;
 *  - messages non lus : au démarrage, au retour au premier plan, à chaque nouveau message (Realtime) et chaque minute ;
 *  - notification sur le téléphone à chaque nouveau message ou étape de commande (voir notifications.ts).
 */
import * as Location from 'expo-location';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { notifyMessage, startNotifications } from '@/lib/notifications';
import { refreshUnread, subscribeToMyMessages } from '@/services/chat';
import { DEMO_MODE } from '@/lib/config';
import { requireSupabase } from '@/lib/supabase';
import { useApp } from '@/store/app';

export function useSessionSync() {
  const userId = useApp((s) => s.user?.id);
  const lang = useApp((s) => s.lang);

  // Langue du compte (serveur) : les notifications envoyées app fermée sont rédigées dans cette langue.
  useEffect(() => {
    if (!userId || DEMO_MODE) return;
    requireSupabase()
      .from('profiles')
      .update({ locale: lang === 'en' ? 'en-CA' : 'fr-CA' })
      .eq('id', userId)
      .then(
        () => undefined,
        () => undefined,
      );
  }, [userId, lang]);

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
    const stopNotifications = startNotifications();
    const unsubscribe = subscribeToMyMessages((m) => {
      refreshUnread()
        .then((list) => notifyMessage(m, list.find((c) => c.id === m.conversationId)?.other.displayName))
        .catch(() => {});
    });
    const appState = AppState.addEventListener('change', (s) => s === 'active' && load());
    const timer = setInterval(load, 60_000);
    return () => {
      unsubscribe();
      stopNotifications();
      appState.remove();
      clearInterval(timer);
    };
  }, [userId]);
}
