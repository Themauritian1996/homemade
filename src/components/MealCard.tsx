import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { cuisineById } from '@/data/allergens';
import { formatDistance, formatPrice, timeLeft } from '@/lib/format';
import { colors, fonts, radius, shadow, spacing, type } from '@/theme';
import type { Meal } from '@/types';
import { Avatar, RatingPill } from './ui';

import { t, tr } from '@/i18n';
export function MealCard({ meal, variant = 'full' }: { meal: Meal; variant?: 'full' | 'compact' }) {
  const cuisine = cuisineById(meal.cuisine);
  const lowStock = meal.portionsLeft <= 1;
  const open = () => router.push({ pathname: '/meal/[id]', params: { id: meal.id } });

  if (variant === 'compact') {
    return (
      <Pressable onPress={open} style={({ pressed }) => [styles.compact, pressed && { opacity: 0.9 }]}>
        <Image source={{ uri: meal.photos[0] }} style={styles.compactImg} contentFit="cover" transition={250} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={type.h3} numberOfLines={1}>
            {meal.title}
          </Text>
          <Text style={type.caption} numberOfLines={1}>
            {meal.cooker.displayName} · {formatDistance(meal.distanceKm)}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Text style={[type.price, { fontSize: 15 }]}>{formatPrice(meal.priceCents)}</Text>
            <RatingPill rating={meal.cooker.cookerRating} count={meal.cooker.cookerRatingCount} compact />
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable onPress={open} style={({ pressed }) => [styles.card, pressed && { transform: [{ scale: 0.99 }] }]}>
      <View>
        <Image source={{ uri: meal.photos[0] }} style={styles.image} contentFit="cover" transition={300} />
        <LinearGradient colors={['rgba(0,0,0,0.35)', 'transparent', 'transparent', 'rgba(0,0,0,0.55)']} style={StyleSheet.absoluteFill} />
        <View style={styles.topRow}>
          <View style={styles.glass}>
            <Text style={styles.glassText}>
              {cuisine.emoji} {tr(cuisine)}
            </Text>
          </View>
          {meal.mode !== 'sale' && (
            <View style={[styles.glass, { backgroundColor: 'rgba(31,58,46,0.85)' }]}>
              <Ionicons name="swap-horizontal" size={12} color={colors.onDark} />
              <Text style={styles.glassText}>{meal.mode === 'swap' ? t('Échange') : t('Achat ou échange')}</Text>
            </View>
          )}
        </View>
        <View style={styles.bottomRow}>
          <View style={styles.pricePill}>
            <Text style={styles.priceText}>{formatPrice(meal.priceCents)}</Text>
          </View>
          <View style={styles.timePill}>
            <Ionicons name="time-outline" size={12} color={colors.onDark} />
            <Text style={styles.glassText}>{timeLeft(meal.availableUntil)}</Text>
          </View>
        </View>
      </View>
      <View style={styles.body}>
        <Text style={type.h3} numberOfLines={1}>
          {meal.title}
        </Text>
        <View style={styles.metaRow}>
          <Avatar uri={meal.cooker.avatarUrl} name={meal.cooker.displayName} size={24} verified={meal.cooker.isVerified} />
          <Text style={[type.caption, { color: colors.inkSoft, flexShrink: 1 }]} numberOfLines={1}>
            {meal.cooker.displayName}
          </Text>
          <RatingPill rating={meal.cooker.cookerRating} count={meal.cooker.cookerRatingCount} />
          <View style={{ flex: 1 }} />
          <Ionicons name="location-outline" size={13} color={colors.muted} />
          <Text style={type.caption}>{formatDistance(meal.distanceKm)}</Text>
        </View>
        {lowStock && (
          <Text style={[type.caption, { color: colors.tomato, fontFamily: fonts.semibold }]}>{t('Plus que')}{' '}{meal.portionsLeft}{' '}{t('portion — faites vite !')}</Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, overflow: 'hidden', ...shadow.card },
  image: { width: '100%', aspectRatio: 16 / 10, backgroundColor: colors.surfaceAlt },
  topRow: { position: 'absolute', top: spacing.md, left: spacing.md, right: spacing.md, flexDirection: 'row', gap: spacing.sm },
  bottomRow: {
    position: 'absolute',
    bottom: spacing.md,
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  glass: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(27,26,23,0.45)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  glassText: { color: colors.onDark, fontFamily: fonts.semibold, fontSize: 12 },
  pricePill: { backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill },
  priceText: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  timePill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5 },
  body: { padding: spacing.lg, gap: spacing.sm },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  compact: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.sm,
    alignItems: 'center',
    ...shadow.card,
  },
  compactImg: { width: 76, height: 76, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
});
