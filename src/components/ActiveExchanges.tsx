/**
 * Accueil : mes échanges et commandes en cours (Cooker comme Eater). Ce qui attend MA réponse passe en premier,
 * avec un badge ; toucher une carte ouvre la conversation.
 */
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { t } from '@/i18n';
import { ActiveExchange, fetchActiveExchanges } from '@/services/orders';
import { useApp } from '@/store/app';
import { colors, createStyles, fonts, radius, shadow, spacing, type } from '@/theme';
import { STATUS_LABEL } from './OrderActions';
import { SectionHeader } from './ui';

export function ActiveExchanges() {
  const [items, setItems] = useState<ActiveExchange[]>([]);
  const unread = useApp((s) => s.unread);
  const load = useCallback(() => {
    fetchActiveExchanges()
      .then(setItems)
      .catch(() => {});
  }, []);
  useFocusEffect(load);
  // Un nouveau message (souvent un changement d'état) : on relit.
  useEffect(load, [load, unread]);

  if (!items.length) return null;
  const waiting = items.filter((i) => i.needsMe).length;
  return (
    <View>
      <SectionHeader
        title={waiting ? t('Vos échanges en cours · {n} à traiter', { n: waiting }) : t('Vos échanges en cours')}
        action={t('Messages')}
        onAction={() => router.navigate('/inbox')}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md, paddingRight: spacing.xl }} style={{ marginHorizontal: -spacing.xl, paddingLeft: spacing.xl }}>
        {items.map((e) => (
          <Pressable
            key={e.orderId}
            style={({ pressed }) => [styles.card, e.needsMe && styles.cardUrgent, pressed && { opacity: 0.9 }]}
            onPress={() =>
              e.conversationId ? router.push({ pathname: '/chat/[id]', params: { id: e.conversationId } }) : router.push({ pathname: '/meal/[id]', params: { id: e.mealId } })
            }
            accessibilityRole="button"
          >
            {e.mealPhoto ? <Image source={{ uri: e.mealPhoto }} style={styles.thumb} contentFit="cover" /> : <View style={styles.thumb} />}
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={type.bodyStrong} numberOfLines={1}>
                {e.mealTitle}
              </Text>
              <Text style={type.caption} numberOfLines={1}>
                {e.kind === 'swap' ? '⇄ ' : ''}
                {e.role === 'cooker' ? t('avec {name}', { name: e.other.displayName }) : t('chez {name}', { name: e.other.displayName })}
              </Text>
              {e.needsMe ? (
                <View style={styles.badge}>
                  <Ionicons name="alert-circle" size={12} color={colors.onDark} />
                  <Text style={styles.badgeText}>{t('À vous de répondre')}</Text>
                </View>
              ) : (
                <Text style={[type.caption, { color: colors.forest }]} numberOfLines={1}>
                  {STATUS_LABEL[e.status] ? t(STATUS_LABEL[e.status]) : e.status}
                </Text>
              )}
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = createStyles(() => ({
  card: { width: 270, flexDirection: 'row', gap: spacing.md, alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.sm, borderWidth: 1, borderColor: colors.border, ...shadow.card },
  cardUrgent: { borderColor: colors.tomato },
  thumb: { width: 64, height: 64, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  badge: { flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: 4, backgroundColor: colors.tomato, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { color: colors.onDark, fontFamily: fonts.semibold, fontSize: 11 },
}));
