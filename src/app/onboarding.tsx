import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import React, { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HealthEditor } from '@/components/HealthEditor';
import { Button } from '@/components/ui';
import { friendlyError } from '@/lib/errors';
import { saveHealthProfile } from '@/services/profile';
import { useApp } from '@/store/app';
import { colors, radius, spacing, type } from '@/theme';

import { t } from '@/i18n';
const VALUES = [
  { emoji: '🤝', title: 'Une communauté de voisins', body: 'Cuisinez pour les autres, goûtez leur cuisine, créez des liens.' },
  { emoji: '🥗', title: 'Manger sain, simplement', body: 'Du fait maison plutôt que du restaurant, à prix de voisin.' },
  { emoji: '♻️', title: 'Zéro gaspillage', body: 'Chaque portion partagée est un repas sauvé.' },
];

export default function Onboarding() {
  const insets = useSafeAreaInsets();
  const { health, setHealth, setOnboarded, setLocation, user } = useApp();
  const [draft, setDraft] = useState(health);
  const [saving, setSaving] = useState(false);

  const finish = async () => {
    setSaving(true);
    try {
      // Fail-closed : le filtrage se fait sur le serveur. Sans profil enregistré, on ne continue pas.
      await saveHealthProfile(draft);
    } catch (e) {
      setSaving(false);
      Alert.alert(t('Préférences non enregistrées'), t('{0}\n\nRéessayez : vos préférences doivent être enregistrées pour adapter votre fil.', { 0: friendlyError(e) }));
      return;
    }
    setHealth(draft);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }, true);
      }
    } catch {
      // Position facultative : le fil reste centré sur la position par défaut, modifiable depuis la carte.
    } finally {
      setSaving(false);
      setOnboarded(true);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.xxl, paddingHorizontal: spacing.xxl, paddingBottom: 140 }}>
        <Text style={type.label}>{t('Bienvenue à la table')}</Text>
        <Text style={[type.h1, { marginTop: spacing.sm }]}>{t('Bienvenue {name} !', { name: user?.displayName ?? '' })}</Text>
        <Text style={[type.body, { marginTop: spacing.sm }]}>{t('Ici, des voisins qui aiment cuisiner partagent leurs plats avec ceux qui aiment bien manger : meal preps, recettes du monde, plats santé, desserts…')}</Text>
        <View style={{ gap: spacing.sm, marginTop: spacing.lg, marginBottom: spacing.xxl }}>
          {VALUES.map((v) => (
            <View key={v.title} style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 18 }}>{v.emoji}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={type.bodyStrong}>{t(v.title)}</Text>
                <Text style={type.caption}>{t(v.body)}</Text>
              </View>
            </View>
          ))}
        </View>
        <Text style={type.h3}>{t('Vos préférences alimentaires')}</Text>
        <Text style={[type.caption, { marginTop: 4, marginBottom: spacing.lg }]}>{t('Régime, allergie ou intolérance ? Indiquez-le : votre fil s\'adapte automatiquement. Rien à signaler ? Continuez simplement.')}</Text>
        <HealthEditor value={draft} onChange={setDraft} />
        <View
          style={{
            flexDirection: 'row',
            gap: spacing.sm,
            marginTop: spacing.xxl,
            backgroundColor: colors.surface,
            padding: spacing.lg,
            borderRadius: radius.lg,
          }}
        >
          <Ionicons name="location-outline" size={18} color={colors.forest} />
          <Text style={[type.caption, { flex: 1 }]}>{t('À l\'étape suivante, nous demanderons votre position pour afficher les plats près de chez vous. Elle n\'est jamais montrée aux autres membres.')}</Text>
        </View>
      </ScrollView>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.xxl, paddingBottom: insets.bottom + spacing.lg, backgroundColor: colors.bg, gap: spacing.sm }}>
        <Button title={draft.allergens.length || draft.diets.length ? t('Enregistrer et continuer') : t('Continuer')} onPress={finish} loading={saving} />
      </View>
    </View>
  );
}
