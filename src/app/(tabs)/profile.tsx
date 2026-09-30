import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, Badge, Card, Divider, ListRow } from '@/components/ui';
import { allergenById } from '@/data/allergens';
import { DEMO_MODE } from '@/lib/config';
import { formatRating } from '@/lib/format';
import { appVersion } from '@/services/account';
import { signOut } from '@/services/auth';
import { fetchMyProfile } from '@/services/profile';
import type { PublicProfile } from '@/types';
import { useApp } from '@/store/app';
import { colors, fonts, radius, shadow, spacing, type } from '@/theme';

import { t, tr } from '@/i18n';
type IconName = React.ComponentProps<typeof Ionicons>['name'];


export default function Profile() {
  const insets = useSafeAreaInsets();
  const { user, health, favorites } = useApp();
  // En production : chargé via `profiles` (agrégats de notes maintenus par trigger).
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (user) fetchMyProfile(user.id).then(setProfile).catch(() => {});
    }, [user]),
  );
  const p: PublicProfile = profile ?? {
    id: user?.id ?? '',
    displayName: user?.displayName ?? t('Moi'),
    cookerRating: null,
    cookerRatingCount: 0,
    eaterRating: null,
    eaterRatingCount: 0,
    badges: [],
    isVerified: false,
    memberSince: new Date().toISOString(),
  };

  const confirmSignOut = () =>
    Alert.alert(t('Se déconnecter ?'), t('Vous pourrez vous reconnecter avec votre courriel et votre mot de passe.'), [
      { text: t('Annuler'), style: 'cancel' },
      { text: t('Se déconnecter'), style: 'destructive', onPress: () => signOut() },
    ]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingTop: insets.top + spacing.md, padding: spacing.xl, gap: spacing.xl, paddingBottom: spacing.huge }}
    >
      <Pressable style={styles.header} onPress={() => router.push('/settings')} accessibilityRole="button" accessibilityLabel={t('Modifier mon profil')}>
        <Avatar name={p.displayName} uri={p.avatarUrl} size={72} verified={p.isVerified} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={type.h2}>{p.displayName}</Text>
          <Text style={type.caption}>
            {p.neighborhood ? `${p.neighborhood} · ` : ''}{t('membre depuis')}{' '}{new Date(p.memberSince).getFullYear()}
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' }}>
            {p.badges.map((b) => (
              <Badge key={b} label={t(b)} tone="forest" icon="ribbon-outline" />
            ))}
          </View>
        </View>
        <Ionicons name="create-outline" size={20} color={colors.muted} />
      </Pressable>

      {/* Réputation bidirectionnelle : une note Cooker ET une note Eater */}
      <View style={styles.stats}>
        <Stat label={t('Note Cooker')} value={formatRating(p.cookerRating)} sub={t('{n} avis', { n: p.cookerRatingCount })} icon="restaurant" />
        <View style={styles.statDivider} />
        <Stat label={t('Note Eater')} value={formatRating(p.eaterRating)} sub={t('{n} avis', { n: p.eaterRatingCount })} icon="happy" />
        <View style={styles.statDivider} />
        <Stat label={t('Repas sauvés')} value={String(p.mealsShared ?? 0)} sub={t('portions partagées')} icon="leaf" />
      </View>

      <Card>
        <ListRow
          icon="shield-checkmark-outline"
          title={t('Préférences alimentaires')}
          subtitle={health.allergens.length ? health.allergens.map((a) => tr(allergenById(a.code))).join(', ') : t('Régimes, allergies : votre fil s’adapte')}
          onPress={() => router.push('/health')}
        />
        <Divider />
        <ListRow
          icon="storefront-outline"
          title={t('Mes plats')}
          subtitle={t('Annonces en ligne, portions restantes, retrait')}
          onPress={() => router.push('/my-meals')}
        />
        <Divider />
        <ListRow icon="receipt-outline" title={t('Mes commandes et échanges')} subtitle={t('Conversations, avis à laisser')} onPress={() => router.push('/inbox')} />
        <Divider />
        <ListRow
          icon="heart-outline"
          title={t('Mes favoris')}
          subtitle={favorites.length ? t('{0} plat(s) mis de côté', { 0: favorites.length }) : t('Touchez ♡ sur un plat pour le retrouver ici')}
          onPress={() => router.push('/favorites')}
        />
        <Divider />
        <ListRow icon="card-outline" title={t('Paiements et adresse')} subtitle={t('Vendre, acheter, adresse de cueillette privée')} onPress={() => router.push('/settings')} />
      </Card>

      <Pressable onPress={() => router.push('/invite')} style={({ pressed }) => [styles.invite, pressed && { opacity: 0.9 }]}>
        <View style={styles.inviteIcon}>
          <Ionicons name="gift-outline" size={22} color={colors.tomato} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[type.bodyStrong, { color: colors.onDark }]}>{t('Invitez vos voisins')}</Text>
          <Text style={[type.caption, { color: 'rgba(255,255,255,0.8)' }]}>{t('Plus il y a de Cookers autour de vous, plus le fil est appétissant.')}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.onDark} />
      </Pressable>

      <Card>
        <ListRow
          icon="settings-outline"
          title={t('Paramètres')}
          subtitle={t('Profil public, rayon, notifications, données (Loi 25)')}
          onPress={() => router.push('/settings')}
        />
        <Divider />
        <ListRow icon="help-buoy-outline" title={t('Aide et sécurité alimentaire')} onPress={() => router.push('/help')} />
        <Divider />
        <ListRow
          icon="chatbox-ellipses-outline"
          title={t('Donner mon avis sur la bêta')}
          subtitle={t('Un bogue, une idée ? On lit tout.')}
          onPress={() => router.push('/feedback')}
        />
      </Card>

      <Pressable onPress={confirmSignOut} style={styles.logout} accessibilityRole="button">
        <Ionicons name="log-out-outline" size={18} color={colors.danger} />
        <Text style={{ fontFamily: fonts.semibold, color: colors.danger }}>{t('Se déconnecter')}</Text>
      </Pressable>
      <Text style={[type.caption, { textAlign: 'center' }]}>{t('Homemade bêta · v')}{appVersion()}
        {DEMO_MODE ? t(' · mode démo') : ''}
      </Text>
    </ScrollView>
  );
}

function Stat({ label, value, sub, icon }: { label: string; value: string; sub: string; icon: IconName }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2, paddingHorizontal: spacing.xs }}>
      <Ionicons name={icon} size={18} color={colors.tomato} />
      <Text style={[type.h2, { fontSize: 22 }]}>{value}</Text>
      <Text style={[type.caption, { fontFamily: fonts.semibold, color: colors.ink, textAlign: 'center' }]}>{label}</Text>
      <Text style={[type.caption, { textAlign: 'center' }]}>{sub}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', gap: spacing.lg, alignItems: 'center' },
  stats: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.xl, paddingVertical: spacing.lg, ...shadow.card },
  statDivider: { width: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  invite: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.forest,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow.card,
  },
  inviteIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  logout: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
});
