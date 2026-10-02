/**
 * Notifications sur le téléphone pour les nouveaux messages et les étapes des commandes.
 * Bêta : notifications LOCALES, déclenchées par le temps réel tant que l'app est ouverte ou récemment en arrière-plan.
 * Les notifications « app fermée » demandent un service de push (Firebase Cloud Messaging) : étape suivante.
 * Respecte la préférence « Nouveaux messages et commandes » (Paramètres) et ne notifie pas la conversation ouverte.
 */
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';
import { t } from '@/i18n';
import { useApp } from '@/store/app';
import type { Message } from '@/types';

let handlerSet = false;
let activeConversation: string | null = null;

/** Conversation affichée à l'écran : ses messages ne déclenchent pas de notification. */
export function setActiveConversation(id: string | null) {
  activeConversation = id;
}

async function setup(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  if (!handlerSet) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
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

/** À l'ouverture de la session : demande l'autorisation (une fois) et ouvre la conversation quand on touche une notification. */
export function startNotifications(): () => void {
  if (Platform.OS === 'web') return () => {};
  setup().catch(() => {});
  const sub = Notifications.addNotificationResponseReceivedListener((r) => {
    const id = r.notification.request.content.data?.conversationId;
    if (typeof id === 'string') router.push({ pathname: '/chat/[id]', params: { id } });
  });
  return () => sub.remove();
}

/** Nouveau message reçu (temps réel) : notification locale, sauf si c'est le mien ou la conversation ouverte. */
export async function notifyMessage(m: Message, from?: string) {
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
