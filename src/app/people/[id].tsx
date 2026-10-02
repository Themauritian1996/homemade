/**
 * Page d'un voisin : notes par critère (Cooker et Eater), avis révélés, plats en ligne compatibles avec MON profil santé,
 * et ajout aux voisins favoris (après une première transaction).
 */
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MealCard } from '@/components/MealCard';
import { Avatar, Badge, Card, Chip, EmptyState, ScreenHeader, Stars } from '@/components/ui';
import { criterionLabel, REVIEW_CRITERIA } from '@/data/reviewCriteria';
import { t } from '@/i18n';
import { friendlyError } from '@/lib/errors';
import { formatRating, relativeTime } from '@/lib/format';
import { fetchPersonPage, fetchReviews, ReviewRole, toggleFavoritePerson } from '@/services/people';
import { useApp } from '@/store/app';
import { colors, createStyles, fonts, radius, spacing, type } from '@/theme';
import type { PersonPage, Review, ReviewSummary } from '@/types';

export default function PersonScreen() {
  const { id, role: initialRole } = useLocalSearchParams<{ id: string; role?: string }>();
  const insets = useSafeAreaInsets();
  const me = useApp((s) => s.user?.id);
  const [page, setPage] = useState<PersonPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<ReviewRole>(initialRole === 'eater' ? 'eater' : 'cooker');
  const [reviews, setReviews] = useState<Review[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchPersonPage(id)
      .then(setPage)
      .catch((e) => Alert.alert(t('Chargement impossible'), friendlyError(e)))
      .finally(() => setLoading(false));
  }, [id]);
  const loadReviews = useCallback(() => {
    fetchReviews(id, role)
      .then(setReviews)
      .catch(() => setReviews([]));
  }, [id, role]);
  useEffect(loadReviews, [loadReviews]);

  if (loading || !page) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader title={t('Profil')} />
        {loading ? <ActivityIndicator color={colors.forest} style={{ marginTop: spacing.huge }} /> : <EmptyState icon="person-outline" title={t('Profil introuvable')} body="" />}
      </View>
    );
  }

  const p = page.profile;
  const summary = role === 'cooker' ? page.cookerSummary : page.eaterSummary;
  const isMe = me === p.id;

  const toggleFav = async () => {
    setBusy(true);
    try {
      const on = await toggleFavoritePerson(p.id);
      setPage({ ...page, isFavorite: on });
    } catch (e) {
      Alert.alert(t('Action impossible'), friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader
        title={p.displayName}
        subtitle={[p.neighborhood, t('membre depuis {year}', { year: new Date(p.memberSince).getFullYear() })].filter(Boolean).join(' · ')}
      />
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingTop: spacing.sm, gap: spacing.xl, paddingBottom: insets.bottom + spacing.huge }}>
        <View style={styles.head}>
          <Avatar uri={p.avatarUrl} name={p.displayName} size={72} verified={p.isVerified} />
          <View style={{ flex: 1, gap: spacing.xs }}>
            {!!p.bio && <Text style={type.body}>{p.bio}</Text>}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              {p.badges.map((b) => (
                <Badge key={b} label={t(b)} tone="forest" icon="ribbon-outline" />
              ))}
            </View>
          </View>
        </View>

        {!isMe && page.tradedWith && (
          <Pressable onPress={toggleFav} disabled={busy} style={[styles.fav, page.isFavorite && styles.favOn]} accessibilityRole="button">
            <Ionicons name={page.isFavorite ? 'star' : 'star-outline'} size={20} color={page.isFavorite ? colors.saffron : colors.forest} />
            <Text style={[type.bodyStrong, { flex: 1 }]}>{page.isFavorite ? t('Dans mes voisins favoris') : t('Ajouter à mes voisins favoris')}</Text>
            {busy && <ActivityIndicator color={colors.forest} />}
          </Pressable>
        )}

        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Chip label={t('Comme Cooker · {n}', { n: page.cookerSummary.count })} selected={role === 'cooker'} onPress={() => setRole('cooker')} icon="restaurant-outline" />
          <Chip label={t('Comme Eater · {n}', { n: page.eaterSummary.count })} selected={role === 'eater'} onPress={() => setRole('eater')} icon="happy-outline" />
        </View>

        <SummaryCard role={role} summary={summary} />

        <View style={{ gap: spacing.md }}>
          <Text style={type.h2}>{t('Avis')}</Text>
          {reviews.length === 0 ? (
            <Text style={type.caption}>{t('Pas encore d’avis publié. Les avis apparaissent quand les deux parties ont noté (ou après 7 jours).')}</Text>
          ) : (
            reviews.map((r) => <ReviewItem key={r.id} review={r} role={role} />)
          )}
        </View>

        {page.meals.length > 0 && (
          <View style={{ gap: spacing.md }}>
            <Text style={type.h2}>{t('Ses plats en ce moment')}</Text>
            {page.meals.map((m) => (
              <MealCard key={m.id} meal={m} variant="compact" />
            ))}
          </View>
        )}
        {!isMe && (
          <Pressable onPress={() => router.push('/report')} style={styles.report} accessibilityRole="button">
            <Ionicons name="flag-outline" size={16} color={colors.muted} />
            <Text style={type.caption}>{t('Signaler un problème avec ce membre')}</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

function SummaryCard({ role, summary }: { role: ReviewRole; summary: ReviewSummary }) {
  const max = Math.max(1, ...Object.values(summary.distribution ?? {}));
  return (
    <Card style={{ paddingVertical: spacing.lg, gap: spacing.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
        <View style={{ alignItems: 'center', minWidth: 84 }}>
          <Text style={[type.hero, { fontSize: 40, lineHeight: 46 }]}>{formatRating(summary.average)}</Text>
          <Stars value={summary.average ?? 0} size={14} />
          <Text style={type.caption}>{t('{n} avis', { n: summary.count })}</Text>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          {[5, 4, 3, 2, 1].map((s) => {
            const n = summary.distribution?.[String(s)] ?? 0;
            return (
              <View key={s} style={styles.distRow}>
                <Text style={[type.caption, { width: 12 }]}>{s}</Text>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${(n / max) * 100}%` }]} />
                </View>
                <Text style={[type.caption, { width: 22, textAlign: 'right' }]}>{n}</Text>
              </View>
            );
          })}
        </View>
      </View>
      <View style={{ gap: spacing.sm }}>
        {REVIEW_CRITERIA[role].map((c) => {
          const v = summary.criteria?.[c.id];
          return (
            <View key={c.id} style={styles.critRow}>
              <Text style={[type.body, { flex: 1 }]}>{t(c.label)}</Text>
              {v != null ? (
                <>
                  <Stars value={Number(v)} size={13} />
                  <Text style={[type.caption, { width: 30, textAlign: 'right', fontFamily: fonts.semibold, color: colors.ink }]}>{formatRating(Number(v))}</Text>
                </>
              ) : (
                <Text style={type.caption}>—</Text>
              )}
            </View>
          );
        })}
      </View>
      {Object.keys(summary.tags ?? {}).length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
          {Object.entries(summary.tags).map(([tag, n]) => (
            <Badge key={tag} label={`${t(tag)} · ${n}`} tone="neutral" />
          ))}
        </View>
      )}
    </Card>
  );
}

function ReviewItem({ review, role }: { review: Review; role: ReviewRole }) {
  const subs = Object.entries(review.subScores ?? {});
  return (
    <Card style={{ paddingVertical: spacing.lg, gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Avatar uri={review.author.avatarUrl} name={review.author.displayName} size={32} />
        <View style={{ flex: 1 }}>
          <Text style={type.bodyStrong}>{review.author.displayName}</Text>
          <Text style={type.caption}>{relativeTime(review.createdAt)}</Text>
        </View>
        <Stars value={review.rating} size={14} />
      </View>
      {!!review.comment && <Text style={type.body}>{review.comment}</Text>}
      {subs.length > 0 && (
        <Text style={type.caption}>{subs.map(([k, v]) => `${t(criterionLabel(role, k))} ${v}/5`).join(' · ')}</Text>
      )}
      {review.tags.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
          {review.tags.map((tag) => (
            <Badge key={tag} label={t(tag)} tone="forest" />
          ))}
        </View>
      )}
    </Card>
  );
}

const styles = createStyles(() => ({
  head: { flexDirection: 'row', gap: spacing.lg, alignItems: 'center' },
  fav: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  favOn: { backgroundColor: colors.saffronSoft, borderColor: colors.saffron },
  distRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  track: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.saffron },
  critRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 28 },
  report: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', justifyContent: 'center', padding: spacing.md },
}));
