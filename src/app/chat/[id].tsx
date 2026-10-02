import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OrderActions } from '@/components/OrderActions';
import { Avatar, IconButton } from '@/components/ui';
import { DEMO_USER_ID } from '@/data/mock';
import { fetchConversations, fetchMessages, hideConversation, markConversationRead, refreshUnread, sendMessage, subscribeToConversation } from '@/services/chat';
import { friendlyError } from '@/lib/errors';
import { setActiveConversation } from '@/lib/notifications';
import { useApp } from '@/store/app';
import { colors, createStyles, fonts, radius, spacing, type } from '@/theme';
import type { Conversation, Message } from '@/types';

import { locale, t } from '@/i18n';
const QUICK_REPLIES = ['Je suis en route 🚶', 'Je suis arrivé·e !', 'Merci, c’était délicieux 🙏'];

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const me = useApp((s) => s.user?.id) ?? DEMO_USER_ID;
  const [conv, setConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const listRef = useRef<FlatList<Message>>(null);
  const wasClosed = useRef<boolean | null>(null);

  const loadConv = () =>
    fetchConversations()
      .then((all) => setConv(all.find((c) => c.id === id) ?? null))
      .catch(() => {});

  useEffect(() => {
    setActiveConversation(id);
    loadConv();
    fetchMessages(id).then(setMessages);
    const markRead = () =>
      markConversationRead(id)
        .then(refreshUnread)
        .catch(() => {});
    markRead();
    const unsubscribe = subscribeToConversation(id, (m) => {
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      markRead(); // conversation ouverte : le message est lu
    });
    return () => {
      unsubscribe();
      setActiveConversation(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Un message système (remise, annulation…) peut clore la transaction : on relit l'état de la conversation.
  const systemCount = messages.filter((m) => m.kind === 'system').length;
  useEffect(() => {
    if (systemCount) loadConv();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [systemCount]);

  const askDelete = () =>
    Alert.alert(
      t('Supprimer la conversation ?'),
      t('La transaction est terminée. Sinon, la conversation sera effacée automatiquement dans 48 h.'),
      [
        { text: t('Garder'), style: 'cancel' },
        {
          text: t('Supprimer'),
          style: 'destructive',
          onPress: async () => {
            try {
              await hideConversation(id);
              router.back();
            } catch (e) {
              Alert.alert(t('Suppression impossible'), friendlyError(e));
            }
          },
        },
      ],
    );

  // Transaction terminée pendant que la conversation est ouverte : on propose de la supprimer.
  useEffect(() => {
    if (!conv) return;
    const closed = Boolean(conv.closed && conv.orderId);
    if (wasClosed.current === false && closed) askDelete();
    wasClosed.current = closed;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conv?.closed]);

  const send = async (text: string) => {
    if (!text.trim()) return;
    setDraft('');
    let m: Message;
    try {
      m = await sendMessage(id, me, text);
    } catch (e) {
      setDraft(text);
      Alert.alert(t('Message non envoyé'), friendlyError(e));
      return;
    }
    setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <IconButton icon="chevron-back" onPress={() => router.back()} accessibilityLabel={t('Retour')} />
        <Pressable
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
          disabled={!conv}
          onPress={() => conv && router.push({ pathname: '/people/[id]', params: { id: conv.other.id } })}
          accessibilityRole="button"
          accessibilityLabel={t('Voir le profil et les avis')}
        >
          {conv && <Avatar uri={conv.other.avatarUrl} name={conv.other.displayName} size={40} verified={conv.other.isVerified} />}
          <View style={{ flex: 1 }}>
            <Text style={type.bodyStrong}>{conv?.other.displayName ?? t('Conversation')}</Text>
            <Text style={type.caption} numberOfLines={1}>
              {conv?.mealTitle}
            </Text>
          </View>
        </Pressable>
        {conv?.closed && <IconButton icon="trash-outline" onPress={askDelete} accessibilityLabel={t('Supprimer la conversation')} />}
      </View>

      {conv?.orderId && <OrderActions orderId={conv.orderId} me={me} refreshKey={messages.length} />}
      {conv?.closed && conv.orderId && (
        <Pressable style={styles.closed} onPress={askDelete} accessibilityRole="button">
          <Ionicons name="time-outline" size={16} color={colors.muted} />
          <Text style={[type.caption, { flex: 1 }]}>{t('Transaction terminée : cette conversation sera effacée dans 48 h.')}</Text>
          <Text style={[type.caption, { color: colors.danger, fontFamily: fonts.semibold }]}>{t('Supprimer')}</Text>
        </Pressable>
      )}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item }) => {
          if (item.kind === 'system') {
            return (
              <View style={styles.system}>
                <Text style={[type.caption, { textAlign: 'center' }]}>{item.body}</Text>
              </View>
            );
          }
          const mine = item.senderId === me;
          return (
            <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
              <Text style={[styles.bubbleText, mine && { color: colors.onDark }]}>{item.body}</Text>
              {item.masked && (
                <Text style={[styles.time, { textAlign: 'left' }, mine && { color: 'rgba(255,255,255,0.8)' }]}>
                  {t('🔒 Coordonnées et paiement hors app masqués : l’adresse et le paiement passent par Homemade, pour votre protection.')}
                </Text>
              )}
              <Text style={[styles.time, mine && { color: 'rgba(255,255,255,0.7)' }]}>
                {new Date(item.createdAt).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          );
        }}
      />

      <View style={{ flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, flexWrap: 'wrap' }}>
        {QUICK_REPLIES.map((q) => (
          <Pressable key={q} style={styles.quick} onPress={() => send(t(q))}>
            <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: colors.forest }}>{t(q)}</Text>
          </Pressable>
        ))}
      </View>
      <View style={[styles.composer, { paddingBottom: insets.bottom + spacing.sm }]}>
        <TextInput value={draft} onChangeText={setDraft} placeholder={t('Écrire un message…')} placeholderTextColor={colors.muted} style={styles.input} multiline maxLength={2000} />
        <Pressable style={[styles.send, !draft.trim() && { opacity: 0.4 }]} onPress={() => send(draft)} disabled={!draft.trim()} accessibilityLabel={t('Envoyer')}>
          <Ionicons name="arrow-up" size={20} color={colors.onDark} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = createStyles(() => ({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  closed: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, backgroundColor: colors.surfaceAlt },
  system: { alignSelf: 'center', backgroundColor: colors.surfaceAlt, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, marginVertical: spacing.sm },
  bubble: { maxWidth: '80%', paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: 18, gap: 2 },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.forest, borderBottomRightRadius: 4 },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderBottomLeftRadius: 4 },
  bubbleText: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.ink },
  time: { fontFamily: fonts.regular, fontSize: 10, color: colors.muted, alignSelf: 'flex-end' },
  quick: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  input: { flex: 1, minHeight: 44, maxHeight: 120, backgroundColor: colors.bg, borderRadius: 22, paddingHorizontal: spacing.lg, paddingVertical: 11, fontFamily: fonts.regular, fontSize: 15, color: colors.ink },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.tomato, alignItems: 'center', justifyContent: 'center' },
}));
