import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, EmptyState } from '@/components/ui';
import { relativeTime } from '@/lib/format';
import { fetchConversations } from '@/services/chat';
import { colors, fonts, radius, spacing, type } from '@/theme';
import type { Conversation } from '@/types';

import { t } from '@/i18n';
export default function Inbox() {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Conversation[]>([]);

  useFocusEffect(
    useCallback(() => {
      fetchConversations().then(setItems).catch(() => {});
    }, []),
  );

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.xl, paddingBottom: spacing.huge }}
      data={items}
      keyExtractor={(c) => c.id}
      ListHeaderComponent={
        <View style={{ marginBottom: spacing.xl, gap: spacing.xs }}>
          <Text style={type.h1}>{t('Messages')}</Text>
          <Text style={type.body}>{t('Coordonnez vos cueillettes et vos échanges.')}</Text>
        </View>
      }
      ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
      ListEmptyComponent={<EmptyState icon="chatbubbles-outline" title={t('Aucune conversation')} body={t('Vos échanges avec les Cookers et les Eaters apparaîtront ici.')} />}
      renderItem={({ item }) => (
        <Pressable onPress={() => router.push({ pathname: '/chat/[id]', params: { id: item.id } })} style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}>
          <View>
            <Avatar uri={item.other.avatarUrl} name={item.other.displayName} size={52} />
            {item.mealPhoto && <Image source={{ uri: item.mealPhoto }} style={styles.mealThumb} />}
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[type.bodyStrong, { flex: 1 }]} numberOfLines={1}>
                {item.other.displayName}
              </Text>
              <Text style={type.caption}>{relativeTime(item.lastMessageAt)}</Text>
            </View>
            <Text style={[type.caption, { color: colors.forest }]} numberOfLines={1}>
              {item.mealTitle}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Text style={[type.body, { flex: 1, fontSize: 14 }, item.unread > 0 && { color: colors.ink, fontFamily: fonts.semibold }]} numberOfLines={1}>
                {item.lastMessage}
              </Text>
              {item.unread > 0 && (
                <View style={styles.unread}>
                  <Text style={styles.unreadText}>{item.unread}</Text>
                </View>
              )}
            </View>
          </View>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'center', backgroundColor: colors.surface, padding: spacing.md, borderRadius: radius.lg },
  mealThumb: { position: 'absolute', right: -4, bottom: -4, width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: colors.surface },
  unread: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.tomato, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  unreadText: { color: colors.onDark, fontFamily: fonts.bold, fontSize: 11 },
});
