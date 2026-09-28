import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui';
import { DEMO_MODE } from '@/lib/config';
import { colors, fonts, spacing, type } from '@/theme';

const HERO = 'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=1200&q=80&auto=format&fit=crop';

export default function Welcome() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.forest }}>
      <Image source={{ uri: HERO }} style={StyleSheet.absoluteFill} contentFit="cover" transition={400} />
      <LinearGradient colors={['rgba(31,58,46,0.15)', 'rgba(31,58,46,0.55)', colors.forest]} locations={[0, 0.45, 0.8]} style={StyleSheet.absoluteFill} />
      <View style={[styles.content, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xl }]}>
        <Text style={styles.logo}>
          homemade<Text style={{ color: colors.tomato }}>.</Text>
        </Text>
        <View style={{ flex: 1 }} />
        <Text style={styles.kicker}>FAIT MAISON · PRÈS DE CHEZ VOUS</Text>
        <Text style={styles.title}>
          Des vrais repas,{'\n'}
          <Text style={{ fontFamily: fonts.displayItalic, color: '#F6C9B9' }}>cuisinés par vos voisins.</Text>
        </Text>
        <Text style={styles.subtitle}>Achetez ou échangez des plats maison sains. Moins de gaspillage, plus de saveurs — filtrés selon vos allergies.</Text>
        <View style={{ gap: spacing.md, marginTop: spacing.xxl }}>
          <Button title="Créer un compte" variant="accent" onPress={() => router.push('/sign-up')} />
          <Button title="J'ai déjà un compte" variant="secondary" onPress={() => router.push('/sign-in')} />
        </View>
        {DEMO_MODE && <Text style={styles.demo}>Mode démo — aucune donnée n'est envoyée. Configurez Supabase pour activer les vrais comptes.</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, paddingHorizontal: spacing.xxl },
  logo: { fontFamily: fonts.display, fontSize: 26, color: colors.onDark, letterSpacing: -0.5 },
  kicker: { ...type.label, color: 'rgba(255,255,255,0.75)', marginBottom: spacing.md },
  title: { ...type.hero, color: colors.onDark, fontSize: 38, lineHeight: 44 },
  subtitle: { ...type.body, color: 'rgba(255,255,255,0.85)', marginTop: spacing.md, fontSize: 16, lineHeight: 24 },
  demo: { ...type.caption, color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginTop: spacing.lg },
});
