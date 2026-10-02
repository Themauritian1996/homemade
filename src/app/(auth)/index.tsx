import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LanguageToggle } from '@/components/LanguageToggle';
import { Button, Logo } from '@/components/ui';
import { t } from '@/i18n';
import { DEMO_MODE } from '@/lib/config';
import { colors, createStyles, fonts, radius, spacing, type } from '@/theme';

const HERO = 'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=1200&q=80&auto=format&fit=crop';

/** Ce qui rassemble la communauté Homemade. */
const VALUES = [
  { emoji: '🤝', label: 'Communauté' },
  { emoji: '🥗', label: 'Santé' },
  { emoji: '♻️', label: 'Zéro gaspi' },
  { emoji: '🍱', label: 'Meal prep' },
];

export default function Welcome() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.forest }}>
      <Image source={{ uri: HERO }} style={StyleSheet.absoluteFill} contentFit="cover" transition={400} />
      <LinearGradient colors={['rgba(31,58,46,0.15)', 'rgba(31,58,46,0.55)', colors.forest]} locations={[0, 0.45, 0.8]} style={StyleSheet.absoluteFill} />
      <View style={[styles.content, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xl }]}>
        <View style={styles.top}>
          <Logo size={36} light />
          <LanguageToggle dark />
        </View>
        <View style={{ flex: 1 }} />
        <Text style={styles.kicker}>{t('FAIT MAISON · ENTRE VOISINS')}</Text>
        <Text style={styles.title}>
          {t('Des repas maison,')}
          {'\n'}
          <Text style={{ fontFamily: fonts.displayItalic, color: '#F6C9B9' }}>{t('partagés entre voisins.')}</Text>
        </Text>
        <Text style={styles.subtitle}>
          {t('Ceux qui aiment cuisiner partagent leurs plats et leurs meal preps avec ceux qui aiment bien manger. Plus sain, moins de gaspillage, plus de liens.')}
        </Text>
        <View style={styles.values}>
          {VALUES.map((v) => (
            <View key={v.label} style={styles.value}>
              <Text style={{ fontSize: 13 }}>{v.emoji}</Text>
              <Text style={styles.valueText}>{t(v.label)}</Text>
            </View>
          ))}
        </View>
        <View style={{ gap: spacing.md, marginTop: spacing.xxl }}>
          <Button title={t('Créer un compte')} variant="accent" onPress={() => router.push('/sign-up')} />
          <Button title={t('J’ai déjà un compte')} variant="secondary" onPress={() => router.push('/sign-in')} />
        </View>
        {DEMO_MODE && <Text style={styles.demo}>{t('Mode démo — aucune donnée n’est envoyée. Configurez Supabase pour activer les vrais comptes.')}</Text>}
      </View>
    </View>
  );
}

const styles = createStyles(() => ({
  content: { flex: 1, paddingHorizontal: spacing.xxl },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kicker: { ...type.label, color: 'rgba(255,255,255,0.75)', marginBottom: spacing.md },
  title: { ...type.hero, color: colors.onDark, fontSize: 38, lineHeight: 44 },
  subtitle: { ...type.body, color: 'rgba(255,255,255,0.88)', marginTop: spacing.md, fontSize: 16, lineHeight: 24 },
  values: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
  value: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  valueText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.onDark },
  demo: { ...type.caption, color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginTop: spacing.lg },
}));
