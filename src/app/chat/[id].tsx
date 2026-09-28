import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OrderActions } from '@/components/OrderActions';
import { Avatar, IconButton } from '@/components/ui';
import { DEMO_USER_ID } from '@/data/mock';
import { fetchConversations, fetchMessages, markConversationRead, sendMessage, subscribeToConversation } from '@/services/chat';
import { useApp } from '@/store/app';
import { colors, fonts, radius, spacing, type } from '@/theme';
import type { Conversation, Message } from '@/types';

const QUICK_REPLIES = ['Je suis en route 🚶', 'Je suis arrivé·e !', 'Merci, c’était délicieux 🙏'];

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const me = useApp((s) => s.user?.id) ?? DEMO_USER_ID;
  const [conv, setConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const listRef = useRef<FlatList<Message>>(null);

  useEffect(() => {
    fetchConversations().then((all) => setConv(all.find((c) => c.id === id) ?? null));
    fetchMessages(id).then(setMessages);
    markConversationRead(id).catch(() => {});
    return subscribeToConversation(id, (m) => setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m])));
  }, [id]);

  const send = async (text: string) => {
    if (!text.trim()) return;
    setDraft('');
    const m = await sendMessage(id, me, text);
    setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <IconButton icon="chevron-back" onPress={() => router.back()} accessibilityLabel="Retour" />
        {conv && <Avatar uri={conv.other.avatarUrl} name={conv.other.displayName} size={40} verified={conv.other.isVerified} />}
        <View style={{ flex: 1 }}>
          <Text style={type.bodyStrong}>{conv?.other.displayName ?? 'Conversation'}</Text>
          <Text style={type.caption} numberOfLines={1}>
            {conv?.mealTitle}
          </Text>
        </View>
      </View>

      {conv?.orderId && <OrderActions orderId={conv.orderId} me={me} refreshKey={messages.length} />}

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
              <Text style={[styles.time, mine && { color: 'rgba(255,255,255,0.7)' }]}>
                {new Date(item.createdAt).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          );
        }}
      />

      <View style={{ flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, flexWrap: 'wrap' }}>
        {QUICK_REPLIES.map((q) => (
          <Pressable key={q} style={styles.quick} onPress={() => send(q)}>
            <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: colors.forest }}>{q}</Text>
          </Pressable>
        ))}
      </View>
      <View style={[styles.composer, { paddingBottom: insets.bottom + spacing.sm }]}>
        <TextInput value={draft} onChangeText={setDraft} placeholder="Écrire un message…" placeholderTextColor={colors.muted} style={styles.input} multiline maxLength={2000} />
        <Pressable style={[styles.send, !draft.trim() && { opacity: 0.4 }]} onPress={() => send(draft)} disabled={!draft.trim()} accessibilityLabel="Envoyer">
          <Ionicons name="arrow-up" size={20} color={colors.onDark} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
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
});
