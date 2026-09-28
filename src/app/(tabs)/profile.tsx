import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, Badge, Divider } from '@/components/ui';
import { allergenById } from '@/data/allergens';
import { demoProfile } from '@/data/mock';
import { DEMO_MODE } from '@/lib/config';
import { formatRating } from '@/lib/format';
import { signOut } from '@/services/auth';
import { startPayoutOnboarding } from '@/services/profile';
import { useApp } from '@/store/app';
import { colors, fonts, radius, shadow, spacing, type } from '@/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export default function Profile() {
  const insets = useSafeAreaInsets();
  const { user, health } = useApp();
  // En production : chargé via `profiles` (agrégats de notes maintenus par trigger).
  const p = { ...demoProfile, displayName: user?.displayName ?? demoProfile.displayName };

  const openPayouts = async () => {
    try {
      const url = await startPayoutOnboarding();
      if (url) await Linking.openURL(url);
      else Alert.alert('Mode démo', 'Configurez Supabase et Stripe pour activer les paiements Cooker.');
    } catch (e) {
      Alert.alert('Paiements indisponibles', e instanceof Error ? e.message : 'Réessayez plus tard.');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ paddingTop: insets.top + spacing.md, padding: spacing.xl, gap: spacing.xl, paddingBottom: spacing.huge }}>
      <View style={styles.header}>
        <Avatar name={p.displayName} uri={p.avatarUrl} size={72} verified={p.isVerified} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={type.h2}>{p.displayName}</Text>
          <Text style={type.caption}>
            {p.neighborhood} · membre depuis {new Date(p.memberSince).getFullYear()}
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' }}>
            {p.badges.map((b) => (
              <Badge key={b} label={b} tone="forest" icon="ribbon-outline" />
            ))}
          </View>
        </View>
      </View>

      {/* Réputation bidirectionnelle : une note Cooker ET une note Eater */}
      <View style={styles.stats}>
        <Stat label="Note Cooker" value={formatRating(p.cookerRating)} sub={`${p.cookerRatingCount} avis`} icon="restaurant" />
        <View style={styles.statDivider} />
        <Stat label="Note Eater" value={formatRating(p.eaterRating)} sub={`${p.eaterRatingCount} avis`} icon="happy" />
        <View style={styles.statDivider} />
        <Stat label="Repas sauvés" value="43" sub="≈ 18 kg" icon="leaf" />
      </View>

      <View style={styles.card}>
        <Row icon="shield-checkmark-outline" title="Profil santé" subtitle={health.allergens.length ? health.allergens.map((a) => allergenById(a.code).fr).join(', ') : 'Aucune allergie déclarée'} onPress={() => router.push('/health')} />
        <Divider />
        <Row icon="receipt-outline" title="Mes commandes et échanges" subtitle="Historique, avis à laisser" onPress={() => router.push('/inbox')} />
        <Divider />
        <Row icon="storefront-outline" title="Espace Cooker" subtitle="Mes plats publiés, revenus" onPress={() => router.push('/publish')} />
        <Divider />
        <Row icon="card-outline" title="Recevoir des paiements" subtitle="Activer la vente · virements Stripe" onPress={openPayouts} />
      </View>

      <View style={styles.card}>
        <Row icon="notifications-outline" title="Notifications" />
        <Divider />
        <Row icon="lock-closed-outline" title="Confidentialité et données (Loi 25)" subtitle="Exporter ou supprimer mes données" />
        <Divider />
        <Row icon="help-buoy-outline" title="Aide et sécurité alimentaire" />
      </View>

      <Pressable onPress={signOut} style={styles.logout}>
        <Ionicons name="log-out-outline" size={18} color={colors.danger} />
        <Text style={{ fontFamily: fonts.semibold, color: colors.danger }}>Se déconnecter</Text>
      </Pressable>
      {DEMO_MODE && <Text style={[type.caption, { textAlign: 'center' }]}>Mode démo · Homemade v1.0.0</Text>}
    </ScrollView>
  );
}

function Stat({ label, value, sub, icon }: { label: string; value: string; sub: string; icon: IconName }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <Ionicons name={icon} size={18} color={colors.tomato} />
      <Text style={[type.h2, { fontSize: 22 }]}>{value}</Text>
      <Text style={[type.caption, { fontFamily: fonts.semibold, color: colors.ink }]}>{label}</Text>
      <Text style={type.caption}>{sub}</Text>
    </View>
  );
}

function Row({ icon, title, subtitle, onPress }: { icon: IconName; title: string; subtitle?: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={18} color={colors.forest} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={type.bodyStrong}>{title}</Text>
        {subtitle && (
          <Text style={type.caption} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', gap: spacing.lg, alignItems: 'center' },
  stats: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.xl, paddingVertical: spacing.lg, ...shadow.card },
  statDivider: { width: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, paddingHorizontal: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.lg },
  rowIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.sage, alignItems: 'center', justifyContent: 'center' },
  logout: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
});
