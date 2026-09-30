/** Aide et sécurité alimentaire : fonctionnement, règles d'hygiène, allergènes, que faire en cas de problème. */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, ScreenHeader } from '@/components/ui';
import { colors, radius, spacing, type } from '@/theme';

import { t } from '@/i18n';
type IconName = React.ComponentProps<typeof Ionicons>['name'];

const TOPICS: { icon: IconName; title: string; body: string[] }[] = [
  {
    icon: 'sparkles-outline',
    title: 'Comment ça marche ?',
    body: [
      'Un seul compte pour manger (Eater) et cuisiner (Cooker).',
      'Homemade réunit des voisins qui aiment cuisiner et d’autres qui aiment bien manger : plats du jour, meal preps de la semaine, recettes de famille.',
      'Découvrir et Carte montrent les plats autour de vous, déjà adaptés à vos préférences alimentaires.',
      'Pour échanger : ouvrez un plat, touchez « Échanger » et proposez un de vos plats publiés. Le Cooker accepte ou refuse dans Messages.',
      'Une fois l’échange accepté, l’adresse exacte devient visible : coordonnez l’heure dans le chat, puis confirmez « J’ai récupéré » et laissez un avis.',
    ],
  },
  {
    icon: 'shield-checkmark-outline',
    title: 'Préférences et allergies : comment ça marche ?',
    body: [
      'Vos allergies sont vérifiées sur nos serveurs : un plat qui contient (ou peut contenir, pour une allergie) l’un de vos allergènes n’apparaît jamais dans votre fil ni sur la carte.',
      'Chaque Cooker valide lui-même la liste des ingrédients et des allergènes avant publication. L’IA ne fait que proposer.',
      'Une cuisine maison n’est jamais un environnement sans allergènes. En cas d’allergie sévère, confirmez toujours avec le Cooker dans le chat avant de manger.',
    ],
  },
  {
    icon: 'hand-left-outline',
    title: 'Règles d’hygiène pour les Cookers',
    body: [
      'Lavez-vous les mains, portez les cheveux attachés, cuisinez sur des surfaces propres.',
      'Refroidissez rapidement les plats (moins de 2 h à température ambiante) et gardez-les au réfrigérateur (4 °C ou moins) jusqu’à la cueillette.',
      'Utilisez des contenants propres et fermés ; indiquez la date de préparation.',
      'Déclarez tous les ingrédients, y compris sauces, bouillons et produits achetés (scannez leur étiquette !), et les risques de traces.',
      'Ne partagez pas un plat préparé par une personne malade, ni un plat dont vous doutez.',
    ],
  },
  {
    icon: 'thermometer-outline',
    title: 'Conseils pour les Eaters',
    body: [
      'Récupérez le plat à l’heure convenue et mettez-le au froid dès votre retour.',
      'Réchauffez-le jusqu’à ce qu’il soit bien chaud au cœur (74 °C) et consommez-le dans les 24 h.',
      'En cas de doute sur l’odeur ou l’aspect, ne le mangez pas.',
    ],
  },
  {
    icon: 'alert-circle-outline',
    title: 'Un problème ?',
    body: [
      'Réaction allergique grave : appelez le 911 immédiatement. Info-Santé : 811.',
      'Signalez ensuite le plat (bouton « Signaler » sur la page du plat) : un signalement d’incident allergène ou d’hygiène le retire immédiatement de l’app.',
      'Pour un bogue ou une idée, utilisez « Donner mon avis sur la bêta » dans votre profil.',
    ],
  },
];

export default function Help() {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState<number | null>(1);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={t('Aide et sécurité')} />
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingTop: spacing.sm, gap: spacing.md, paddingBottom: insets.bottom + spacing.huge }}>
        {TOPICS.map((topic, i) => (
          <View key={topic.title} style={styles.topic}>
            <Pressable
              onPress={() => setOpen(open === i ? null : i)}
              style={styles.topicHead}
              accessibilityRole="button"
              accessibilityState={{ expanded: open === i }}
            >
              <View style={styles.icon}>
                <Ionicons name={topic.icon} size={18} color={colors.forest} />
              </View>
              <Text style={[type.h3, { flex: 1 }]}>{t(topic.title)}</Text>
              <Ionicons name={open === i ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
            </Pressable>
            {open === i && (
              <View style={{ gap: spacing.sm, paddingTop: spacing.sm }}>
                {topic.body.map((b) => (
                  <View key={b} style={{ flexDirection: 'row', gap: spacing.sm }}>
                    <Text style={type.body}>•</Text>
                    <Text style={[type.body, { flex: 1 }]}>{t(b)}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        ))}
        <View style={styles.emergency}>
          <Ionicons name="call" size={20} color={colors.danger} />
          <Text style={[type.bodyStrong, { flex: 1, color: colors.danger }]}>{t('Urgence : 911 · Info-Santé : 811')}</Text>
          <Button title="811" size="md" variant="danger" onPress={() => Linking.openURL('tel:811')} />
        </View>
        <Button title={t('Donner mon avis sur la bêta')} variant="secondary" icon="chatbox-ellipses-outline" onPress={() => router.push('/feedback')} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  topic: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg },
  topicHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 },
  icon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.sage, alignItems: 'center', justifyContent: 'center' },
  emergency: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.dangerSoft, borderRadius: radius.lg, padding: spacing.lg },
});
