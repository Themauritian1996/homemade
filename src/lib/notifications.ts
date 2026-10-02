/**
 * Notifications sur le téléphone pour les nouveaux messages et les étapes des commandes.
 *  - Avec Firebase (APK compilée avec google-services.json) : le téléphone enregistre son jeton FCM sur le serveur, qui
 *    envoie les notifications même quand l'app est fermée (Edge Function `push-notify`).
 *  - Sans Firebase : notifications LOCALES, déclenchées par le temps réel tant que l'app est ouverte ou récemment en
 *    arrière-plan.
 * Respecte la préférence « Nouveaux messages et commandes » (Paramètres) et ne notifie pas la conversation ouverte.
 */
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';
import { t } from '@/i18n';
import { DEMO_MODE } from '@/lib/config';
import { requireSupabase } from '@/lib/supabase';
import { useApp } from '@/store/app';
import type { Message } from '@/types';

let handlerSet = false;
let activeConversation: string | null = null;
/** Jeton FCM enregistré sur le serveur : les notifications viennent alors de Firebase (pas de doublon local). */
let pushToken: string | null = null;

/** Conversation affichée à l'écran : ses messages ne déclenchent pas de notification. */
export function setActiveConversation(id: string | null) {
  activeConversation = id;
}

async function setup(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  if (!handlerSet) {
    Notifications.setNotificationHandler({
      handleNotification: async (n) => {
        const here = n.request.content.data?.conversationId === activeConversation && activeConversation !== null;
        return { shouldShowBanner: !here, shouldShowList: !here, shouldPlaySound: !here, shouldSetBadge: false };
      },
    });
    handlerSet = true;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('messages', {
        name: t('Messages et commandes'),
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 200, 120, 200],
      }).catch(() => {});
    }
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

/** Enregistre le jeton Firebase du téléphone (sans Firebase dans l'APK, l'appel échoue : on reste en local). */
async function registerPushToken() {
  if (DEMO_MODE || Platform.OS === 'web') return;
  try {
    const { data } = await Notifications.getDevicePushTokenAsync();
    if (typeof data !== 'string' || !data) return;
    const { error } = await requireSupabase().rpc('register_push_token', { p_token: data, p_platform: Platform.OS });
    if (!error) pushToken = data;
  } catch {
    pushToken = null;
  }
}

function openConversation(r: Notifications.NotificationResponse | null) {
  const id = r?.notification.request.content.data?.conversationId;
  if (typeof id === 'string') router.push({ pathname: '/chat/[id]', params: { id } });
}

/** À l'ouverture de la session : autorisation (une fois), jeton push, et ouverture de la conversation touchée. */
export function startNotifications(): () => void {
  if (Platform.OS === 'web') return () => {};
  setup()
    .then((granted) => (granted ? registerPushToken() : undefined))
    .catch(() => {});
  // App lancée en touchant une notification (app fermée).
  Notifications.getLastNotificationResponseAsync()
    .then((r) => {
      if (r) {
        openConversation(r);
        Notifications.clearLastNotificationResponseAsync?.().catch(() => {});
      }
    })
    .catch(() => {});
  const sub = Notifications.addNotificationResponseReceivedListener(openConversation);
  return () => sub.remove();
}

/** Déconnexion : ce téléphone ne reçoit plus les notifications du compte. */
export async function stopPushNotifications() {
  if (!pushToken || DEMO_MODE) return;
  const token = pushToken;
  pushToken = null;
  await requireSupabase()
    .rpc('unregister_push_token', { p_token: token })
    .then(
      () => undefined,
      () => undefined,
    );
}

/** Nouveau message reçu (temps réel) : notification locale si Firebase n'est pas actif, sauf mes messages et la conversation ouverte. */
export async function notifyMessage(m: Message, from?: string) {
  if (pushToken) return; // Firebase s'en charge (y compris app ouverte)
  const { user, notifyMessages } = useApp.getState();
  if (!notifyMessages || !user || m.senderId === user.id || m.conversationId === activeConversation) return;
  if (!(await setup())) return;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: m.kind === 'system' ? t('Homemade · votre échange') : from ?? t('Nouveau message'),
      body: m.body,
      data: { conversationId: m.conversationId },
    },
    trigger: Platform.OS === 'android' ? { channelId: 'messages' } : null,
  });
}
